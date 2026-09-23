*&---------------------------------------------------------------------*
*& ZMMR_LABEL_JSON - candidate source for SAP DEV activation/review
*& Export Raw SAP Snapshot v2 to a user-selected local JSON file.
*& Export-only path; no delivery or label calculation.
*& This repository copy has NOT been syntax-checked in SAP DEV.
*&---------------------------------------------------------------------*
REPORT ZMMR_LABEL_JSON.

TABLES: MCH1,
        MCHB.

TYPES: BEGIN OF ty_batch_key,
         matnr TYPE mch1-matnr,
         charg TYPE mch1-charg,
       END OF ty_batch_key,
       ty_batch_keys TYPE STANDARD TABLE OF ty_batch_key WITH DEFAULT KEY.

TYPES: BEGIN OF ty_characteristic,
         name       TYPE string,
         value      TYPE string,
         value_type TYPE string,
         unit       TYPE string,
         source     TYPE string,
       END OF ty_characteristic,
       ty_characteristics TYPE STANDARD TABLE OF ty_characteristic
         WITH DEFAULT KEY.

TYPES: BEGIN OF ty_provenance,
         source_function TYPE string,
         input_material  TYPE string,
         input_batch     TYPE string,
         internal_source TYPE string,
       END OF ty_provenance.

TYPES: BEGIN OF ty_business_context,
         material_number           TYPE string,
         material_description      TYPE string,
         batch_number              TYPE string,
         roll_number               TYPE string,
         sales_order               TYPE string,
         sales_order_item          TYPE string,
         customer_text             TYPE string,
         customer_name             TYPE string,
         customer_order_number     TYPE string,
         customer_material_number  TYPE string,
         production_date           TYPE string,
         production_date_provenance TYPE ty_provenance,
       END OF ty_business_context.

TYPES: BEGIN OF ty_item,
         item_sequence    TYPE i,
         label_code       TYPE string,
         copies           TYPE i,
         characteristics  TYPE ty_characteristics,
         business_context TYPE ty_business_context,
       END OF ty_item,
       ty_items TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY.

TYPES: BEGIN OF ty_source_metadata,
         werks            TYPE string,
         sap_user         TYPE string,
         system_id        TYPE string,
         transaction_code TYPE string,
       END OF ty_source_metadata.

TYPES: BEGIN OF ty_payload,
         contract_schema_version TYPE string,
         producer_namespace      TYPE string,
         request_id              TYPE string,
         printer_id              TYPE string,
         items                   TYPE ty_items,
         source_metadata         TYPE ty_source_metadata,
       END OF ty_payload.

TYPES: BEGIN OF ty_so,
         vbeln TYPE mska-vbeln,
         posnr TYPE mska-posnr,
       END OF ty_so.

DATA: gt_keys    TYPE ty_batch_keys,
      gs_payload TYPE ty_payload.

" INPUT FOLLOWS ZMMR_LABELROL_WINDOWS: BATCH RANGE PLUS COPIES.
" THE REPORT RESOLVES MATERIAL FROM MCH1 FOR EACH SELECTED BATCH.
SELECT-OPTIONS: P_CHARG FOR MCHB-CHARG.
PARAMETERS: V_COPIES(3) DEFAULT '1'.

START-OF-SELECTION.
  PERFORM VALIDATE_PARAMETERS.
  PERFORM GET_BATCH_KEYS.
  IF GT_KEYS[] IS INITIAL.
    MESSAGE 'DATA BATCH TIDAK DITEMUKAN' TYPE 'S' DISPLAY LIKE 'E'.
    EXIT.
  ENDIF.
  PERFORM BUILD_PAYLOAD.
  PERFORM SAVE_JSON_TO_PC.

FORM VALIDATE_PARAMETERS.
  DATA LV_COPIES TYPE I.

  IF P_CHARG[] IS INITIAL.
    MESSAGE 'BATCH (CHARG) WAJIB DIISI' TYPE 'E'.
  ENDIF.
  IF V_COPIES IS INITIAL OR V_COPIES CN '0123456789'.
    MESSAGE 'COPIES HARUS BERUPA ANGKA BULAT' TYPE 'E'.
  ENDIF.
  LV_COPIES = V_COPIES.
  IF LV_COPIES < 1 OR LV_COPIES > 100.
    MESSAGE 'COPIES HARUS ANTARA 1 DAN 100' TYPE 'E'.
  ENDIF.
ENDFORM.

FORM GET_BATCH_KEYS.
  DATA: LT_MCH1          TYPE STANDARD TABLE OF TY_BATCH_KEY WITH DEFAULT KEY,
        LS_MCH1          TYPE TY_BATCH_KEY,
        LV_PREV_CHARG    TYPE MCH1-CHARG,
        LV_AMBIGUOUS_MSG TYPE STRING.

  REFRESH GT_KEYS.

  " Select all batches matching the SELECT-OPTIONS criteria (supports ranges, BT, EQ, CP, etc.)
  SELECT CHARG MATNR
    FROM MCH1
    INTO TABLE LT_MCH1
    WHERE CHARG IN P_CHARG.

  IF SY-SUBRC <> 0 OR LT_MCH1[] IS INITIAL.
    RETURN.
  ENDIF.

  " Sort and eliminate duplicate material-batch pairs
  SORT LT_MCH1 BY CHARG MATNR.
  DELETE ADJACENT DUPLICATES FROM LT_MCH1 COMPARING CHARG MATNR.

  " Detect ambiguous batch assignment across multiple materials (fail-closed)
  CLEAR LV_PREV_CHARG.
  LOOP AT LT_MCH1 INTO LS_MCH1.
    IF LS_MCH1-CHARG = LV_PREV_CHARG.
      CONCATENATE 'Batch ambigu terdeteksi pada multiple material: ' LS_MCH1-CHARG
        INTO LV_AMBIGUOUS_MSG.
      MESSAGE LV_AMBIGUOUS_MSG TYPE 'E'.
    ENDIF.
    LV_PREV_CHARG = LS_MCH1-CHARG.
  ENDLOOP.

  GT_KEYS[] = LT_MCH1[].
ENDFORM.

FORM BUILD_PAYLOAD.
  DATA: LS_KEY    TYPE TY_BATCH_KEY,
        LS_ITEM   TYPE TY_ITEM,
        LV_SEQ    TYPE I,
        LV_UUID   TYPE SYSUUID_C32.

  CLEAR gs_payload.
  gs_payload-contract_schema_version = '2.0-raw'.
  gs_payload-producer_namespace = 'SAP_PPIC'.

  " Prevent sub-second request_id collision with unique 32-character execution UUID (fail-closed)
  TRY.
      LV_UUID = CL_SYSTEM_UUID=>CREATE_UUID_C32_STATIC( ).
    CATCH CX_UUID_ERROR.
      MESSAGE 'Gagal menghasilkan UUID unik untuk request_id' TYPE 'E'.
  ENDTRY.

  CONCATENATE 'SAP' SY-SYSID SY-DATUM SY-UZEIT LV_UUID
    INTO gs_payload-request_id SEPARATED BY '-'.
  gs_payload-printer_id = 'PILOT-PRINTER-01'.
  gs_payload-source_metadata-sap_user = sy-uname.
  gs_payload-source_metadata-system_id = sy-sysid.
  gs_payload-source_metadata-transaction_code = sy-tcode.

  LOOP AT GT_KEYS INTO LS_KEY.
    CLEAR LS_ITEM.
    LS_ITEM-COPIES = 1.
    LS_ITEM-BUSINESS_CONTEXT-MATERIAL_NUMBER = LS_KEY-MATNR.
    LS_ITEM-BUSINESS_CONTEXT-BATCH_NUMBER = LS_KEY-CHARG.

    PERFORM READ_CHARACTERISTICS USING LS_KEY
      CHANGING LS_ITEM-LABEL_CODE LS_ITEM-CHARACTERISTICS
               LS_ITEM-BUSINESS_CONTEXT-ROLL_NUMBER.
    PERFORM READ_BUSINESS_CONTEXT USING LS_KEY
      CHANGING LS_ITEM-BUSINESS_CONTEXT.

    " RAW SNAPSHOT V2 PERMITS COPIES=1 ONLY. EXPAND IDENTICAL COPIES
    " INTO SEPARATE, ORDERED ITEMS AS ZMMR_LABELROL_WINDOWS DOES.
    DO V_COPIES TIMES.
      IF LV_SEQ >= 100.
        MESSAGE 'JUMLAH ITEM JSON MAKSIMUM 100' TYPE 'E'.
      ENDIF.
      LV_SEQ = LV_SEQ + 1.
      LS_ITEM-ITEM_SEQUENCE = LV_SEQ.
      APPEND LS_ITEM TO GS_PAYLOAD-ITEMS.
    ENDDO.
  ENDLOOP.
ENDFORM.

FORM read_characteristics
  USING is_key TYPE ty_batch_key
  CHANGING cv_label_code TYPE string
           ct_characteristics TYPE ty_characteristics
           cv_roll_number TYPE string.

  DATA: lt_values TYPE STANDARD TABLE OF api_vali WITH DEFAULT KEY,
        ls_value  TYPE api_vali,
        ls_char   TYPE ty_characteristic,
        lt_names  TYPE STANDARD TABLE OF string WITH DEFAULT KEY,
        lv_name   TYPE string,
        lv_map    TYPE zmap_label-code,
        lv_count  TYPE i.

  CALL FUNCTION 'QC01_BATCH_VALUES_READ'
    EXPORTING
      i_val_matnr  = is_key-matnr
      i_val_charge = is_key-charg
    TABLES
      t_val_tab    = lt_values
    EXCEPTIONS
      no_class       = 1
      internal_error = 2
      no_values      = 3
      no_chars       = 4
      OTHERS         = 5.
  IF sy-subrc <> 0.
    MESSAGE 'Karakteristik batch gagal dibaca' TYPE 'E'.
  ENDIF.

  LOOP AT lt_values INTO ls_value.
    CLEAR ls_char.
    ls_char-name = ls_value-atnam.
    TRANSLATE ls_char-name TO UPPER CASE.
    IF ls_char-name IS INITIAL.
      MESSAGE 'Nama karakteristik kosong' TYPE 'E'.
    ENDIF.
    FIND REGEX '^[A-Za-z0-9_./-]+$' IN ls_char-name.
    IF sy-subrc <> 0.
      MESSAGE 'Nama karakteristik tidak cocok kontrak v2' TYPE 'E'.
    ENDIF.
    lv_name = ls_char-name.
    READ TABLE lt_names WITH KEY table_line = lv_name
      TRANSPORTING NO FIELDS.
    IF sy-subrc = 0.
      MESSAGE 'Karakteristik duplikat pada batch' TYPE 'E'.
    ENDIF.
    APPEND lv_name TO lt_names.

    " ATWRT is the SAP classification value; do not format or convert it.
    ls_char-value = ls_value-atwrt.
    ls_char-value_type = 'string'.
    ls_char-source = 'batch_classification'.
    APPEND ls_char TO ct_characteristics.

    CASE ls_char-name.
      WHEN 'ZZLABEL'.
        cv_label_code = ls_value-atwrt.
      WHEN 'ZZNOMORROLL'.
        cv_roll_number = ls_value-atwrt.
    ENDCASE.
  ENDLOOP.

  DESCRIBE TABLE ct_characteristics LINES lv_count.
  IF lv_count > 100.
    MESSAGE 'Karakteristik melebihi batas 100 per item' TYPE 'E'.
  ENDIF.
  IF cv_label_code <> 'N001'.
    MESSAGE 'Pilot hanya menerima ZZLABEL N001' TYPE 'E'.
  ENDIF.

  CLEAR lv_map.
  SELECT SINGLE code INTO lv_map FROM zmap_label
    WHERE code = cv_label_code.
  IF sy-subrc <> 0.
    MESSAGE 'N001 belum terdaftar di ZMAP_LABEL' TYPE 'E'.
  ENDIF.
ENDFORM.

FORM read_business_context
  USING is_key TYPE ty_batch_key
  CHANGING cs_context TYPE ty_business_context.

  DATA: lv_description TYPE makt-maktx,
        lv_pdate       TYPE sy-datum,
        lv_so_count    TYPE i,
        lv_kunnr       TYPE vbak-kunnr,
        lv_name1       TYPE kna1-name1,
        lv_kdmat       TYPE vbap-kdmat,
        lv_bstnk       TYPE vbak-bstnk,
        lv_tdname      TYPE thead-tdname,
        lv_text        TYPE string,
        lt_so          TYPE STANDARD TABLE OF ty_so WITH DEFAULT KEY,
        ls_so          TYPE ty_so,
        lt_lines       TYPE STANDARD TABLE OF tline WITH DEFAULT KEY,
        ls_line        TYPE tline.

  SELECT SINGLE maktx INTO lv_description FROM makt
    WHERE matnr = is_key-matnr AND spras = sy-langu.
  IF sy-subrc = 0.
    cs_context-material_description = lv_description.
  ENDIF.

  " No value is invented if this function cannot resolve a production date.
  CALL FUNCTION 'Z_GET_PRODUCTION_DATE'
    EXPORTING
      matnr = is_key-matnr
      charg = is_key-charg
    IMPORTING
      pdate = lv_pdate
    EXCEPTIONS
      OTHERS = 1.
  IF sy-subrc = 0 AND lv_pdate IS NOT INITIAL.
    CONCATENATE lv_pdate+0(4) '-' lv_pdate+4(2) '-'
      lv_pdate+6(2) INTO cs_context-production_date.
  ENDIF.
  cs_context-production_date_provenance-source_function =
    'Z_GET_PRODUCTION_DATE'.
  cs_context-production_date_provenance-input_material = is_key-matnr.
  cs_context-production_date_provenance-input_batch = is_key-charg.
  cs_context-production_date_provenance-internal_source =
    'OPEN_QUESTION'.

  " More than one eligible SO means no trustworthy single SO for this item.
  SELECT vbeln posnr FROM mska INTO TABLE lt_so UP TO 2 ROWS
    WHERE matnr = is_key-matnr
      AND charg = is_key-charg
      AND ( kalab > 0 OR kains > 0 OR kaspe > 0 ).
  DESCRIBE TABLE lt_so LINES lv_so_count.
  IF lv_so_count > 1.
    MESSAGE 'Batch memiliki lebih dari satu kandidat SO' TYPE 'E'.
  ENDIF.
  IF lv_so_count = 0.
    EXIT.
  ENDIF.

  READ TABLE lt_so INDEX 1 INTO ls_so.
  cs_context-sales_order = ls_so-vbeln.
  cs_context-sales_order_item = ls_so-posnr.

  SELECT SINGLE kdmat INTO lv_kdmat FROM vbap
    WHERE vbeln = ls_so-vbeln AND posnr = ls_so-posnr.
  IF sy-subrc = 0.
    cs_context-customer_material_number = lv_kdmat.
  ENDIF.

  SELECT SINGLE bstnk kunnr INTO (lv_bstnk, lv_kunnr) FROM vbak
    WHERE vbeln = ls_so-vbeln.
  IF sy-subrc = 0.
    cs_context-customer_order_number = lv_bstnk.
    IF lv_kunnr IS NOT INITIAL.
      SELECT SINGLE name1 INTO lv_name1 FROM kna1
        WHERE kunnr = lv_kunnr.
      IF sy-subrc = 0.
        cs_context-customer_name = lv_name1.
      ENDIF.
    ENDIF.
  ENDIF.

  CONCATENATE ls_so-vbeln ls_so-posnr INTO lv_tdname.
  CALL FUNCTION 'READ_TEXT'
    EXPORTING
      client   = sy-mandt
      id       = 'Z001'
      language = sy-langu
      name     = lv_tdname
      object   = 'VBBP'
    TABLES
      lines    = lt_lines
    EXCEPTIONS
      OTHERS   = 1.
  IF sy-subrc = 0.
    LOOP AT lt_lines INTO ls_line.
      IF lv_text IS INITIAL.
        lv_text = ls_line-tdline.
      ELSE.
        CONCATENATE lv_text ls_line-tdline INTO lv_text
          SEPARATED BY space.
      ENDIF.
      IF strlen( lv_text ) > 256.
        MESSAGE 'Customer text melebihi batas kontrak' TYPE 'E'.
      ENDIF.
    ENDLOOP.
    cs_context-customer_text = lv_text.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& ECC 6.0 / SAP_BASIS 7.31 serializer for the explicit v2 contract.
*& Do not concatenate unescaped SAP data directly into JSON.
*&---------------------------------------------------------------------*
FORM json_quote
  USING iv_value TYPE csequence
  CHANGING cv_quoted TYPE string.
  DATA lv_escaped TYPE string.

  lv_escaped = iv_value.
  REPLACE ALL OCCURRENCES OF '\' IN lv_escaped WITH '\\'.
  REPLACE ALL OCCURRENCES OF '"' IN lv_escaped WITH '\"'.
  REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>cr_lf
    IN lv_escaped WITH '\n'.
  REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>newline
    IN lv_escaped WITH '\n'.
  REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>horizontal_tab
    IN lv_escaped WITH '\t'.
  " Remaining control characters cannot be safely exported by this pilot.
  FIND REGEX '[[:cntrl:]]' IN lv_escaped.
  IF sy-subrc = 0.
    MESSAGE 'Data memuat karakter kontrol yang tidak aman' TYPE 'E'.
  ENDIF.
  CONCATENATE '"' lv_escaped '"' INTO cv_quoted.
ENDFORM.

FORM append_raw_member
  USING iv_name TYPE csequence
        iv_raw TYPE csequence
  CHANGING cv_object TYPE string.
  DATA: lv_name   TYPE string,
        lv_length TYPE i,
        lv_offset TYPE i.

  PERFORM json_quote USING iv_name CHANGING lv_name.
  lv_length = strlen( cv_object ).
  IF lv_length > 0.
    lv_offset = lv_length - 1.
    IF cv_object+lv_offset(1) <> '{'.
      CONCATENATE cv_object ',' INTO cv_object.
    ENDIF.
  ENDIF.
  CONCATENATE cv_object lv_name ':' iv_raw INTO cv_object.
ENDFORM.

FORM append_string_member
  USING iv_name TYPE csequence
        iv_value TYPE csequence
  CHANGING cv_object TYPE string.
  DATA lv_quoted TYPE string.
  PERFORM json_quote USING iv_value CHANGING lv_quoted.
  PERFORM append_raw_member USING iv_name lv_quoted
    CHANGING cv_object.
ENDFORM.

FORM serialize_payload CHANGING cv_json TYPE string.
  DATA: ls_item    TYPE ty_item,
        ls_char    TYPE ty_characteristic,
        lv_items   TYPE string,
        lv_item    TYPE string,
        lv_chars   TYPE string,
        lv_char    TYPE string,
        lv_context TYPE string,
        lv_prov    TYPE string,
        lv_meta    TYPE string,
        lv_number_c TYPE c LENGTH 12,
        lv_number   TYPE string,
        lv_count   TYPE i.

  cv_json = '{'.
  PERFORM append_string_member USING 'contract_schema_version'
    gs_payload-contract_schema_version CHANGING cv_json.
  PERFORM append_string_member USING 'producer_namespace'
    gs_payload-producer_namespace CHANGING cv_json.
  PERFORM append_string_member USING 'request_id'
    gs_payload-request_id CHANGING cv_json.
  PERFORM append_string_member USING 'printer_id'
    gs_payload-printer_id CHANGING cv_json.

  lv_items = '['.
  LOOP AT gs_payload-items INTO ls_item.
    lv_item = '{'.
    CLEAR: lv_number_c, lv_number.
    WRITE ls_item-item_sequence TO lv_number_c NO-GROUPING.
    CONDENSE lv_number_c NO-GAPS.
    lv_number = lv_number_c.
    PERFORM append_raw_member USING 'item_sequence' lv_number
      CHANGING lv_item.
    PERFORM append_string_member USING 'label_code'
      ls_item-label_code CHANGING lv_item.
    PERFORM append_raw_member USING 'copies' '1' CHANGING lv_item.

    lv_chars = '['.
    LOOP AT ls_item-characteristics INTO ls_char.
      lv_char = '{'.
      PERFORM append_string_member USING 'name' ls_char-name
        CHANGING lv_char.
      PERFORM append_string_member USING 'value' ls_char-value
        CHANGING lv_char.
      PERFORM append_string_member USING 'value_type'
        ls_char-value_type CHANGING lv_char.
      PERFORM append_string_member USING 'unit' ls_char-unit
        CHANGING lv_char.
      PERFORM append_string_member USING 'source' ls_char-source
        CHANGING lv_char.
      CONCATENATE lv_char '}' INTO lv_char.
      IF lv_chars <> '['.
        CONCATENATE lv_chars ',' INTO lv_chars.
      ENDIF.
      CONCATENATE lv_chars lv_char INTO lv_chars.
    ENDLOOP.
    CONCATENATE lv_chars ']' INTO lv_chars.
    PERFORM append_raw_member USING 'characteristics' lv_chars
      CHANGING lv_item.

    lv_context = '{'.
    PERFORM append_string_member USING 'material_number'
      ls_item-business_context-material_number CHANGING lv_context.
    PERFORM append_string_member USING 'material_description'
      ls_item-business_context-material_description
      CHANGING lv_context.
    PERFORM append_string_member USING 'batch_number'
      ls_item-business_context-batch_number CHANGING lv_context.
    PERFORM append_string_member USING 'roll_number'
      ls_item-business_context-roll_number CHANGING lv_context.
    PERFORM append_string_member USING 'sales_order'
      ls_item-business_context-sales_order CHANGING lv_context.
    PERFORM append_string_member USING 'sales_order_item'
      ls_item-business_context-sales_order_item CHANGING lv_context.
    PERFORM append_string_member USING 'customer_text'
      ls_item-business_context-customer_text CHANGING lv_context.
    PERFORM append_string_member USING 'customer_name'
      ls_item-business_context-customer_name CHANGING lv_context.
    PERFORM append_string_member USING 'customer_order_number'
      ls_item-business_context-customer_order_number
      CHANGING lv_context.
    PERFORM append_string_member USING 'customer_material_number'
      ls_item-business_context-customer_material_number
      CHANGING lv_context.
    PERFORM append_string_member USING 'production_date'
      ls_item-business_context-production_date CHANGING lv_context.

    lv_prov = '{'.
    PERFORM append_string_member USING 'source_function'
      ls_item-business_context-production_date_provenance-source_function
      CHANGING lv_prov.
    PERFORM append_string_member USING 'input_material'
      ls_item-business_context-production_date_provenance-input_material
      CHANGING lv_prov.
    PERFORM append_string_member USING 'input_batch'
      ls_item-business_context-production_date_provenance-input_batch
      CHANGING lv_prov.
    PERFORM append_string_member USING 'internal_source'
      ls_item-business_context-production_date_provenance-internal_source
      CHANGING lv_prov.
    CONCATENATE lv_prov '}' INTO lv_prov.
    PERFORM append_raw_member USING 'production_date_provenance'
      lv_prov CHANGING lv_context.
    CONCATENATE lv_context '}' INTO lv_context.
    PERFORM append_raw_member USING 'business_context' lv_context
      CHANGING lv_item.
    CONCATENATE lv_item '}' INTO lv_item.

    IF lv_items <> '['.
      CONCATENATE lv_items ',' INTO lv_items.
    ENDIF.
    CONCATENATE lv_items lv_item INTO lv_items.
    lv_count = lv_count + 1.
  ENDLOOP.
  IF lv_count < 1 OR lv_count > 100.
    MESSAGE 'Jumlah item JSON di luar batas kontrak' TYPE 'E'.
  ENDIF.
  CONCATENATE lv_items ']' INTO lv_items.
  PERFORM append_raw_member USING 'items' lv_items CHANGING cv_json.

  lv_meta = '{'.
  PERFORM append_string_member USING 'werks'
    gs_payload-source_metadata-werks CHANGING lv_meta.
  PERFORM append_string_member USING 'sap_user'
    gs_payload-source_metadata-sap_user CHANGING lv_meta.
  PERFORM append_string_member USING 'system_id'
    gs_payload-source_metadata-system_id CHANGING lv_meta.
  PERFORM append_string_member USING 'transaction_code'
    gs_payload-source_metadata-transaction_code CHANGING lv_meta.
  CONCATENATE lv_meta '}' INTO lv_meta.
  PERFORM append_raw_member USING 'source_metadata' lv_meta
    CHANGING cv_json.
  CONCATENATE cv_json '}' INTO cv_json.
ENDFORM.

FORM save_json_to_pc.
  DATA: lv_json      TYPE string,
        lv_filename  TYPE string,
        lv_path      TYPE string,
        lv_fullpath  TYPE string,
        lv_action    TYPE i,
        lt_download  TYPE STANDARD TABLE OF string WITH DEFAULT KEY.

  PERFORM serialize_payload CHANGING lv_json.
  APPEND lv_json TO lt_download.

  CALL METHOD cl_gui_frontend_services=>file_save_dialog
    EXPORTING
      default_extension = 'json'
      default_file_name = 'raw-sap-snapshot.json'
      file_filter       = 'JSON (*.json)|*.json|'
    CHANGING
      filename          = lv_filename
      path              = lv_path
      fullpath          = lv_fullpath
      user_action       = lv_action
    EXCEPTIONS
      OTHERS            = 1.
  IF sy-subrc <> 0.
    MESSAGE 'Dialog penyimpanan file tidak tersedia' TYPE 'E'.
  ENDIF.
  IF lv_action = cl_gui_frontend_services=>action_cancel.
    MESSAGE 'Ekspor dibatalkan pengguna' TYPE 'S'.
    EXIT.
  ENDIF.
  IF lv_fullpath IS INITIAL.
    MESSAGE 'Path file JSON kosong' TYPE 'E'.
  ENDIF.

  CALL METHOD cl_gui_frontend_services=>gui_download
    EXPORTING
      filename = lv_fullpath
      filetype = 'ASC'
      codepage = '4110'
    CHANGING
      data_tab = lt_download
    EXCEPTIONS
      OTHERS   = 1.
  IF sy-subrc <> 0.
    MESSAGE 'Penyimpanan JSON gagal' TYPE 'E'.
  ENDIF.
  MESSAGE 'Raw SAP Snapshot v2 tersimpan di komputer lokal' TYPE 'S'.
ENDFORM.
