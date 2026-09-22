*&---------------------------------------------------------------------*
*&  Report     :  ZMMR_LABEL_JSON
*&  Desc       :  Generate Label Data to JSON for Python/SVG Printing
*&  Appl. Area :  Label
*&  Created by :  Fiqih
*&  Created on :  21.11.2025
*&---------------------------------------------------------------------*
REPORT ZMMR_LABEL_JSON.

TABLES: MCHB.

TYPES: BEGIN OF TY_ITAB,
        LABEL TYPE STRING,
        LDESC TYPE STRING,
        PACK TYPE STRING,
        CODE TYPE STRING.
        INCLUDE STRUCTURE ZLABEL_WINDOWS.
TYPES: END OF TY_ITAB.

DATA: BEGIN OF IT_CHARG OCCURS 0,
        CHARG LIKE MCHB-CHARG,
        MATNR LIKE MCHB-MATNR,
END OF IT_CHARG.

DATA: ITAB TYPE TABLE OF TY_ITAB WITH HEADER LINE,
      IT_MAP LIKE ZMAP_LABEL OCCURS 0 WITH HEADER LINE,
      V_TAB TYPE API_VALI OCCURS 0 WITH HEADER LINE.

DATA: V_POSTDATE LIKE SY-DATUM,
      V_EXPDATE LIKE SY-DATUM,
      V_MESSAGE(50),
      V_TEMP(20),
      V_ERR(1),
      MSG(50).

DATA: V_DEF_INCH      TYPE P DECIMALS 5 VALUE '0.03937',
      V_DEF_FEET      TYPE P DECIMALS 2 VALUE '3.28',
      V_DEF_LBS       TYPE P DECIMALS 4 VALUE '2.2046',
      V_DEF_GAU       TYPE P DECIMALS 4 VALUE '4'.

DATA: TOCHAR          TYPE P DECIMALS 0,
      TOCHAR1         TYPE P DECIMALS 3,
      TOCHAR2         TYPE P DECIMALS 2,
      TOCHAR3(10)     TYPE C ,
      TOSTRG          TYPE STRING.

" Struktur Data Sederhana untuk Output JSON
TYPES: BEGIN OF TY_OUTPUT,
         BATCH_NO   TYPE STRING,
         MAT_DESC   TYPE STRING,
         LABEL      TYPE STRING.
        INCLUDE STRUCTURE ZLABEL_WINDOWS. " Data mentah untuk dienkripsi Python
TYPES: END OF TY_OUTPUT.

DATA: IT_OUTPUT TYPE TABLE OF TY_OUTPUT.

DATA: WA_OUTPUT TYPE TY_OUTPUT.

DATA: IT_TEMPZCODE TYPE TABLE OF STRING WITH HEADER LINE.

" Parameter Path (Sesuaikan dengan server Anda)
PARAMETERS: P_PATH TYPE STRING LOWER CASE DEFAULT 'C:\tslabel\json\'.
SELECT-OPTIONS: P_CHARG FOR MCHB-CHARG.
PARAMETERS: V_COPIES(3) DEFAULT '1',
            V_CHARG    LIKE MCHB-CHARG  NO-DISPLAY,
            V_EXIDV    LIKE MCHB-MATNR  NO-DISPLAY,
            V_MATNR    LIKE MARA-MATNR  NO-DISPLAY,
            V_WERKS    LIKE VBDPL-WERKS NO-DISPLAY,
            V_MAGRV    LIKE VEKP-MAGRV  NO-DISPLAY,
            V_TOTRL(4) NO-DISPLAY,
            V_TOTBX(4) NO-DISPLAY,
            V_DATDD(2) NO-DISPLAY,
            V_DATMM(2) NO-DISPLAY,
            V_DATYY(1) NO-DISPLAY,
            V_TMWGHT   NO-DISPLAY TYPE P DECIMALS 2.

" ... (Definisi Data Logika Bisnis Lama Tetap Disini: IT_CHARG, V_TAB, dll) ...
" ... (Biarkan variabel seperti V_DEF_INCH, dll tetap ada) ...

START-OF-SELECTION.
  " 1. Panggil Logika Bisnis Lama (Gunakan FORM lama Anda)
  PERFORM GET_DATA_MAIN.

  " 2. Mapping Data Lama ke Struktur JSON Baru
  PERFORM PREPARE_JSON_DATA.

  " 3. Tulis File JSON
  PERFORM WRITE_JSON_FILES.

END-OF-SELECTION.

*&---------------------------------------------------------------------*
*&      Form  PREPARE_JSON_DATA
*&---------------------------------------------------------------------*
FORM PREPARE_JSON_DATA.
  LOOP AT ITAB. " ITAB adalah tabel dari logika lama
    CLEAR WA_OUTPUT.

    " Pindahkan field yang dibutuhkan saja
    WA_OUTPUT-BATCH_NO   = ITAB-VBATCH.
    WA_OUTPUT-MAT_DESC   = ITAB-LDESC.
    WA_OUTPUT-LABEL      = ITAB-LABEL.

    " Mapping Data ZLABEL_WINDOWS (Copy paste field-nya)
    WA_OUTPUT-VIMAGE        = ITAB-VIMAGE.
    WA_OUTPUT-VHEADER       = ITAB-VHEADER.
    WA_OUTPUT-VVBELN        = ITAB-VVBELN.
    WA_OUTPUT-VPOSNR        = ITAB-VPOSNR.
    WA_OUTPUT-VSONUM_ITEM   = ITAB-VSONUM_ITEM.
    WA_OUTPUT-VGRADE        = ITAB-VGRADE.
    WA_OUTPUT-VTYPE         = ITAB-VTYPE.
    WA_OUTPUT-VCORE         = ITAB-VCORE.
    WA_OUTPUT-VROLL         = ITAB-VROLL.
    WA_OUTPUT-VNWEIGHT      = ITAB-VNWEIGHT.
    WA_OUTPUT-VTHICK        = ITAB-VTHICK.
    WA_OUTPUT-VWIDTH        = ITAB-VWIDTH.
    WA_OUTPUT-VLENGTH       = ITAB-VLENGTH.
    WA_OUTPUT-VLBS          = ITAB-VLBS.
    WA_OUTPUT-VGAUGE        = ITAB-VGAUGE.
    WA_OUTPUT-VINCHI        = ITAB-VINCHI.
    WA_OUTPUT-VFEET         = ITAB-VFEET.
    WA_OUTPUT-VINSIDE       = ITAB-VINSIDE.
    WA_OUTPUT-VOUTSIDE      = ITAB-VOUTSIDE.
    WA_OUTPUT-VLIVE         = ITAB-VLIVE.
    WA_OUTPUT-VPOSTDATE     = ITAB-VPOSTDATE.
    WA_OUTPUT-VEXPDATE      = ITAB-VEXPDATE.
    WA_OUTPUT-VPARTNO       = ITAB-VPARTNO.
    WA_OUTPUT-VSPLICE1      = ITAB-VSPLICE1.
    WA_OUTPUT-VSPLICE2      = ITAB-VSPLICE2.
    WA_OUTPUT-VSPFEET1      = ITAB-VSPFEET1.
    WA_OUTPUT-VSPFEET2      = ITAB-VSPFEET2.
    WA_OUTPUT-VTOTROL       = ITAB-VTOTROL.
    WA_OUTPUT-VTOTBOX       = ITAB-VTOTBOX.

    " Data Barcode (Ambil value mentahnya)
    WA_OUTPUT-VBARCODETRIAS = ITAB-VBARCODETRIAS.
    WA_OUTPUT-VBARCODECUST  = ITAB-VBARCODECUST.

    " Bersihkan karakter pengganggu JSON (Kutip Dua)
    " Lakukan ini untuk field deskripsi yang mungkin mengandung text aneh
    REPLACE ALL OCCURRENCES OF '"' IN WA_OUTPUT-MAT_DESC WITH ' '.
    REPLACE ALL OCCURRENCES OF '"' IN WA_OUTPUT-VHEADER WITH ' '.

    PERFORM SANITIZE_JSON_STRUCT CHANGING WA_OUTPUT.

    APPEND WA_OUTPUT TO IT_OUTPUT.
  ENDLOOP.
ENDFORM.                    "PREPARE_JSON_DATA

*&---------------------------------------------------------------------*
*&      Form  WRITE_JSON_FILES
*&---------------------------------------------------------------------*
*&---------------------------------------------------------------------*
*&      Form  WRITE_JSON_FILES (LOCAL PC VERSION)
*&---------------------------------------------------------------------*
FORM WRITE_JSON_FILES.
  DATA: LV_JSON_STRING TYPE STRING,
        LV_FILENAME    TYPE STRING,
        LV_FULLPATH    TYPE STRING.

  " Tabel penampung untuk GUI_DOWNLOAD
  DATA: LT_DOWNLOAD_DATA TYPE TABLE OF STRING.

  " Definisi Karakter Enter (Baris Baru)
  DATA: LV_CRLF TYPE STRING.
  LV_CRLF = CL_ABAP_CHAR_UTILITIES=>CR_LF.

  LOOP AT IT_OUTPUT INTO WA_OUTPUT.

    CLEAR LV_JSON_STRING.

    " 1. Susun JSON Manual
    CONCATENATE
      '{'                                                 LV_CRLF
      '  "BATCH_NO": "'      WA_OUTPUT-BATCH_NO      '",' LV_CRLF
      '  "MAT_DESC": "'      WA_OUTPUT-MAT_DESC      '",' LV_CRLF
      '  "LABEL_TYPE": "'    WA_OUTPUT-LABEL         '",' LV_CRLF

      '  "VIMAGE": "'        WA_OUTPUT-VIMAGE        '",' LV_CRLF
      '  "VHEADER": "'       WA_OUTPUT-VHEADER       '",' LV_CRLF
      '  "VVBELN": "'        WA_OUTPUT-VVBELN        '",' LV_CRLF
      '  "VPOSNR": "'        WA_OUTPUT-VPOSNR        '",' LV_CRLF
      '  "VSONUM_ITEM": "'   WA_OUTPUT-VSONUM_ITEM   '",' LV_CRLF
      '  "VGRADE": "'        WA_OUTPUT-VGRADE        '",' LV_CRLF
      '  "VTYPE": "'         WA_OUTPUT-VTYPE         '",' LV_CRLF
      '  "VCORE": "'         WA_OUTPUT-VCORE         '",' LV_CRLF
      '  "VROLL": "'         WA_OUTPUT-VROLL         '",' LV_CRLF
      '  "VNWEIGHT": "'      WA_OUTPUT-VNWEIGHT      '",' LV_CRLF
      '  "VTHICK": "'        WA_OUTPUT-VTHICK        '",' LV_CRLF
      '  "VWIDTH": "'        WA_OUTPUT-VWIDTH        '",' LV_CRLF
      '  "VLENGTH": "'       WA_OUTPUT-VLENGTH       '",' LV_CRLF
      '  "VLBS": "'          WA_OUTPUT-VLBS          '",' LV_CRLF
      '  "VGAUGE": "'        WA_OUTPUT-VGAUGE        '",' LV_CRLF
      '  "VINCHI": "'        WA_OUTPUT-VINCHI        '",' LV_CRLF
      '  "VFEET": "'         WA_OUTPUT-VFEET         '",' LV_CRLF
      '  "VINSIDE": "'       WA_OUTPUT-VINSIDE       '",' LV_CRLF
      '  "VOUTSIDE": "'      WA_OUTPUT-VOUTSIDE      '",' LV_CRLF
      '  "VLIVE": "'         WA_OUTPUT-VLIVE         '",' LV_CRLF
      '  "VPOSTDATE": "'     WA_OUTPUT-VPOSTDATE     '",' LV_CRLF
      '  "VEXPDATE": "'      WA_OUTPUT-VEXPDATE      '",' LV_CRLF
      '  "VPARTNO": "'       WA_OUTPUT-VPARTNO       '",' LV_CRLF
      '  "VSPLICE1": "'      WA_OUTPUT-VSPLICE1      '",' LV_CRLF
      '  "VSPLICE2": "'      WA_OUTPUT-VSPLICE2      '",' LV_CRLF
      '  "VSPFEET1": "'      WA_OUTPUT-VSPFEET1      '",' LV_CRLF
      '  "VSPFEET2": "'      WA_OUTPUT-VSPFEET2      '",' LV_CRLF
      '  "VTOTROL": "'       WA_OUTPUT-VTOTROL       '",' LV_CRLF
      '  "VTOTBOX": "'       WA_OUTPUT-VTOTBOX       '",' LV_CRLF
      '  "VBARCODETRIAS": "' WA_OUTPUT-VBARCODETRIAS '",' LV_CRLF
      '  "VBARCODECUST": "'  WA_OUTPUT-VBARCODECUST  '"'  LV_CRLF
      '}'
    INTO LV_JSON_STRING.

    " 2. Masukkan string JSON ke dalam Tabel Internal (Syarat GUI_DOWNLOAD)
    REFRESH LT_DOWNLOAD_DATA.
    APPEND LV_JSON_STRING TO LT_DOWNLOAD_DATA.

    " 3. Tentukan Nama File & Path Lokal
    " Misal P_PATH diisi 'C:\Temp\' di layar seleksi
    CONCATENATE WA_OUTPUT-BATCH_NO '.json' INTO LV_FILENAME.

    IF P_PATH CS '\'.
      CONCATENATE P_PATH LV_FILENAME INTO LV_FULLPATH.
    ELSE.
      CONCATENATE P_PATH '\' LV_FILENAME INTO LV_FULLPATH.
    ENDIF.

    " 4. Download ke PC Lokal (Gunakan Class Frontend Services)
    CALL METHOD CL_GUI_FRONTEND_SERVICES=>GUI_DOWNLOAD
      EXPORTING
        FILENAME                = LV_FULLPATH
        FILETYPE                = 'ASC'      " Mode ASCII (Teks)
        CODEPAGE                = '4110'     " UTF-8 Encoding (Penting agar simbol/spasi aman)
      CHANGING
        DATA_TAB                = LT_DOWNLOAD_DATA
      EXCEPTIONS
        FILE_WRITE_ERROR        = 1
        NO_BATCH                = 2
        GUI_REFUSE_FILETRANSFER = 3
        INVALID_TYPE            = 4
        NO_AUTHORITY            = 5
        UNKNOWN_ERROR           = 6
        HEADER_NOT_ALLOWED      = 7
        SEPARATOR_NOT_ALLOWED   = 8
        FILESIZE_NOT_ALLOWED    = 9
        HEADER_TOO_LONG         = 10
        DP_ERROR_CREATE         = 11
        DP_ERROR_SEND           = 12
        DP_ERROR_WRITE          = 13
        UNKNOWN_DP_ERROR        = 14
        ACCESS_DENIED           = 15
        DP_OUT_OF_MEMORY        = 16
        DISK_FULL               = 17
        DP_TIMEOUT              = 18
        FILE_NOT_FOUND          = 19
        DATAPROVIDER_EXCEPTION  = 20
        CONTROL_FLUSH_ERROR     = 21
        NOT_SUPPORTED_BY_GUI    = 22
        ERROR_NO_GUI            = 23
        OTHERS                  = 24.

    IF SY-SUBRC EQ 0.
      WRITE: / 'Saved to Local PC:', LV_FULLPATH.
    ELSE.
      WRITE: / 'Error saving to PC:', LV_FULLPATH, 'RC:', SY-SUBRC.
    ENDIF.

  ENDLOOP.
ENDFORM.                    "WRITE_JSON_FILES

*&---------------------------------------------------------------------*
*&      Form  GET_DATA_MAIN
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
FORM GET_DATA_MAIN.

  REFRESH: IT_CHARG.
  "For Roll
  IF P_CHARG[] IS NOT INITIAL.
    LOOP AT P_CHARG.
      SELECT SINGLE CHARG MATNR INTO IT_CHARG FROM MCH1
      WHERE CHARG = P_CHARG-LOW.
      IF SY-SUBRC = 0.
        APPEND IT_CHARG.
      ELSE.
        MESSAGE 'Batch Tidak Ditemukan' TYPE 'I'.
        EXIT.
      ENDIF.
    ENDLOOP.
  ELSE.
    "For HU
    SELECT SINGLE CHARG MATNR INTO IT_CHARG FROM MCH1 WHERE CHARG = V_CHARG.
    IF SY-SUBRC = 0.
      APPEND IT_CHARG.
    ENDIF.
  ENDIF.
  DELETE ADJACENT DUPLICATES FROM IT_CHARG COMPARING CHARG.

  LOOP AT IT_CHARG.

    IF IT_CHARG-CHARG IS NOT INITIAL AND IT_CHARG-MATNR IS NOT INITIAL.
      REFRESH V_TAB.
      CLEAR V_TAB.
      CALL FUNCTION 'QC01_BATCH_VALUES_READ'
        EXPORTING
          I_VAL_MATNR    = IT_CHARG-MATNR
          I_VAL_CHARGE   = IT_CHARG-CHARG
        TABLES
          T_VAL_TAB      = V_TAB
        EXCEPTIONS
          NO_CLASS       = 1
          INTERNAL_ERROR = 2
          NO_VALUES      = 3
          NO_CHARS       = 4
          OTHERS         = 5.
    ENDIF.

    READ TABLE V_TAB WITH KEY ATNAM = 'ZZLABEL'.
    IF SY-SUBRC EQ 0.
      SELECT * INTO CORRESPONDING FIELDS OF TABLE IT_MAP FROM ZMAP_LABEL WHERE CODE = V_TAB-ATWRT.
      IF SY-SUBRC EQ 0.
        READ TABLE IT_MAP INDEX 1.
      ENDIF.
    ENDIF.

    ITAB-VBATCH = IT_CHARG-CHARG.

    "Get Main Characteristic
    LOOP AT V_TAB.
      IF V_TAB-ATNAM = 'ZZCODE'.
        ITAB-VTYPE = V_TAB-ATWTB.
*        DATA : V_SEPARATOR TYPE C VALUE '-'.
*        READ TABLE V_TAB WITH KEY ATNAM = 'ZZALIAS'.
*        IF SY-SUBRC = 0.
*          ITAB-VTYPE = V_TAB-ATWRT.
*        ENDIF.
*        CLEAR : V_TEMP.
*        SPLIT ITAB-VTYPE AT V_SEPARATOR INTO TABLE IT_TEMPZCODE.
*        IF LINES( IT_TEMPZCODE ) > 1.
*          DELETE IT_TEMPZCODE INDEX LINES( IT_TEMPZCODE ).
*        ENDIF.
*        LOOP AT IT_TEMPZCODE.
*          IF SY-TABIX EQ 1.
*            CONCATENATE V_TEMP IT_TEMPZCODE INTO V_TEMP.
*          ELSE.
*            CONCATENATE V_TEMP IT_TEMPZCODE INTO V_TEMP SEPARATED BY V_SEPARATOR.
*          ENDIF.
*        ENDLOOP.
*        ITAB-VTYPE = V_TEMP.
      ELSEIF V_TAB-ATNAM = 'ZZTHICKNESS'.
        TOCHAR = V_TAB-ATFLV.
        TOSTRG = TOCHAR.
        ITAB-VTHICK = TOSTRG.
        PERFORM CONV_TO_CHAR USING ITAB-VTHICK.
        PERFORM GET_CONVERSION USING 'THICK' ITAB-VTHICK CHANGING ITAB-VGAUGE.
        PERFORM CONV_TO_CHAR USING ITAB-VGAUGE.

        CONCATENATE ITAB-VTHICK ' mic.  ' INTO ITAB-VTHICK.
        CONCATENATE ITAB-VGAUGE ' ga. ' INTO ITAB-VGAUGE.
      ELSEIF V_TAB-ATNAM = 'ZZWIDTH'.
        TOCHAR = V_TAB-ATFLV.
        TOSTRG = TOCHAR.
        ITAB-VWIDTH = TOSTRG.
        PERFORM CONV_TO_CHAR USING ITAB-VWIDTH.
        PERFORM GET_CONVERSION USING 'WIDTH' ITAB-VWIDTH CHANGING ITAB-VINCHI.
        PERFORM CONV_TO_CHAR USING ITAB-VINCHI.
      ELSEIF V_TAB-ATNAM = 'ZZLENGTH'.
        TOCHAR = V_TAB-ATFLV.
        TOSTRG = TOCHAR.
        ITAB-VLENGTH = TOSTRG.
        PERFORM GET_CONVERSION USING 'LENGTH' ITAB-VLENGTH CHANGING ITAB-VFEET.
        PERFORM SEPARATOR_COMMA USING ITAB-VLENGTH.
        PERFORM SEPARATOR_COMMA USING ITAB-VFEET.
      ELSEIF V_TAB-ATNAM = 'ZZCONVERSIONROLLKG'.
        TOCHAR2 = V_TAB-ATFLV.
        ITAB-VNWEIGHT = TOCHAR2.
        CONDENSE ITAB-VNWEIGHT NO-GAPS.
        PERFORM CONV_TO_CHAR USING ITAB-VNWEIGHT.
        PERFORM GET_CONVERSION USING 'WEIGHT' ITAB-VNWEIGHT CHANGING ITAB-VLBS.
        PERFORM CONV_TO_CHAR USING ITAB-VLBS.
      ELSEIF V_TAB-ATNAM = 'ZZINSIDE'.
        ITAB-VINSIDE = V_TAB-ATWTB.
      ELSEIF V_TAB-ATNAM = 'ZZOUTSIDE'.
        ITAB-VOUTSIDE = V_TAB-ATWTB.
      ELSEIF V_TAB-ATNAM = 'ZZCORE'.
        ITAB-VCORE = V_TAB-ATWTB.
      ELSEIF V_TAB-ATNAM = 'ZZEXPIREDLIVE'.
        ITAB-VLIVE = V_TAB-ATWTB.
      ELSEIF V_TAB-ATNAM = 'ZZNOMORROLL'.
        ITAB-VROLL = V_TAB-ATWTB.
      ELSEIF V_TAB-ATNAM = 'ZZSPLICE-1'.
        ITAB-VSPLICE1 = V_TAB-ATWTB.
        TOCHAR = V_TAB-ATFLV.
        TOSTRG = TOCHAR.
        PERFORM GET_CONVERSION USING 'LENGTH' TOSTRG CHANGING ITAB-VSPFEET1.
        PERFORM SEPARATOR_COMMA USING ITAB-VSPLICE1.
        PERFORM SEPARATOR_COMMA USING ITAB-VSPFEET1.
      ELSEIF V_TAB-ATNAM = 'ZZSPLICE-2'.
        ITAB-VSPLICE2 = V_TAB-ATWTB.
        TOCHAR = V_TAB-ATFLV.
        TOSTRG = TOCHAR.
        PERFORM GET_CONVERSION USING 'LENGTH' TOSTRG CHANGING ITAB-VSPFEET2.
        PERFORM SEPARATOR_COMMA USING ITAB-VSPLICE2.
        PERFORM SEPARATOR_COMMA USING ITAB-VSPFEET2.
      ELSEIF V_TAB-ATNAM = 'ZZLABEL'.
        ITAB-LABEL = V_TAB-ATWRT.
        ITAB-LDESC = V_TAB-ATWTB.
      ELSEIF V_TAB-ATNAM = 'ZZPACKING'.
        ITAB-PACK = V_TAB-ATWRT.
      ENDIF.
    ENDLOOP.

    PERFORM GET_SO.
    PERFORM GET_DATE.
    PERFORM GET_CORE.
    PERFORM GET_MAPPING   USING ITAB-LDESC.
    PERFORM GET_HU        USING V_MAGRV V_WERKS V_EXIDV V_TOTRL V_TOTBX V_TMWGHT V_DATDD V_DATMM V_DATYY.

    DO V_COPIES TIMES.
      APPEND ITAB.
    ENDDO.
    CLEAR: ITAB.
  ENDLOOP.
ENDFORM.                    "GET_DATA_MAIN

*&---------------------------------------------------------------------*
*&      Form  GET_SO
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
FORM GET_SO.
  DATA: V_TDNAME LIKE THEAD-TDNAME,
        IT_LINES TYPE TLINE OCCURS 0 WITH HEADER LINE.

  SELECT SINGLE VBELN POSNR INTO (ITAB-VVBELN, ITAB-VPOSNR) FROM MSKA
   WHERE MATNR = IT_CHARG-MATNR
     AND CHARG = IT_CHARG-CHARG
     AND ( KALAB > 0 OR KAINS > 0 OR KASPE > 0 ).

  IF IT_MAP-TEXT3 CS 'SOTEXT'.
    CONCATENATE ITAB-VVBELN ITAB-VPOSNR INTO V_TDNAME.

    CALL FUNCTION 'READ_TEXT'
      EXPORTING
        CLIENT                  = SY-MANDT
        ID                      = 'Z001'
        LANGUAGE                = 'E'
        NAME                    = V_TDNAME
        OBJECT                  = 'VBBP'
      TABLES
        LINES                   = IT_LINES
      EXCEPTIONS
        ID                      = 1
        LANGUAGE                = 2
        NAME                    = 3
        NOT_FOUND               = 4
        OBJECT                  = 5
        REFERENCE_CHECK         = 6
        WRONG_ACCESS_TO_ARCHIVE = 7
        OTHERS                  = 8.

    IF SY-SUBRC = 0.
      LOOP AT IT_LINES.
        IF IT_LINES-TDLINE+0(2) = 'L2'.
          ITAB-VFEET = IT_LINES-TDLINE+3(20).
        ELSEIF IT_LINES-TDLINE+0(2) = 'W2'.
          ITAB-VINCHI  = IT_LINES-TDLINE+3(20).
        ELSEIF IT_LINES-TDLINE+0(2) = 'N2'.
          ITAB-VLBS  = IT_LINES-TDLINE+3(20).
        ELSEIF IT_LINES-TDLINE+0(2) = 'T2'.
          ITAB-VGAUGE = IT_LINES-TDLINE+3(20).
        ENDIF.
      ENDLOOP.
    ELSE.
      MESSAGE 'SO item text not found, call the PPIC!' TYPE 'S' DISPLAY LIKE 'E'.
      LEAVE LIST-PROCESSING.
    ENDIF.
  ENDIF.

  IF IT_MAP-TEXT3 CS 'ALL'.
    SELECT SINGLE KDMAT INTO ITAB-VPOINT FROM VBAP WHERE VBELN = ITAB-VVBELN AND POSNR = ITAB-VPOSNR.
    SELECT SINGLE BSTNK INTO ITAB-VPARTNO FROM VBAK WHERE VBELN EQ ITAB-VVBELN.
  ELSE.
    IF IT_MAP-TEXT3 CS 'PONUMBER'.
      SELECT SINGLE KDMAT INTO ITAB-VPOINT FROM VBAP WHERE VBELN = ITAB-VVBELN AND POSNR = ITAB-VPOSNR.
    ENDIF.

    IF IT_MAP-TEXT3 CS 'PARTNO'.
      SELECT SINGLE BSTNK INTO ITAB-VPARTNO FROM VBAK WHERE VBELN EQ ITAB-VVBELN.
    ENDIF.
  ENDIF.

  PERFORM OUTPUT_FORMAT USING ITAB-VVBELN CHANGING ITAB-VVBELN.
  PERFORM OUTPUT_FORMAT USING ITAB-VPOSNR CHANGING ITAB-VPOSNR.

  IF ITAB-VVBELN IS NOT INITIAL AND ITAB-VPOSNR IS NOT INITIAL.
    ITAB-VSONUM_ITEM = ITAB-VVBELN && '/' && ITAB-VPOSNR.
  ENDIF.
ENDFORM.                    "GET_SO

*&---------------------------------------------------------------------*
*&      Form  GET_DATE
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
FORM GET_DATE.
  CLEAR: V_POSTDATE, V_EXPDATE.

  CALL FUNCTION 'Z_GET_PRODUCTION_DATE'
    EXPORTING
      MATNR = IT_CHARG-MATNR
      CHARG = IT_CHARG-CHARG
    IMPORTING
      PDATE = V_POSTDATE.

  V_EXPDATE       = V_POSTDATE + ITAB-VLIVE.
  ITAB-VEXPDATE   = V_EXPDATE(4) && '.' && V_EXPDATE+4(2).
  ITAB-VPOSTDATE  = V_POSTDATE(4) && '.' && V_POSTDATE+4(2).

ENDFORM.                    "GET_DATE

*&---------------------------------------------------------------------*
*&      Form  GET_CORE
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
FORM GET_CORE.
  DATA: V_CORE_SS(3) TYPE C.

  IF IT_MAP-TEXT5 EQ 'CORE1'.
  ELSEIF IT_MAP-TEXT5 EQ 'CORE2'.
    SPLIT ITAB-VCORE AT '(' INTO ITAB-VCORE V_CORE_SS.
    SHIFT V_CORE_SS BY 1 PLACES RIGHT.
    SHIFT V_CORE_SS LEFT DELETING LEADING SPACE.
    CONCATENATE V_CORE_SS '(' ITAB-VCORE ')' INTO ITAB-VCORE.
  ELSE.
*    SPLIT ITAB-VCORE AT '(' INTO ITAB-VCORE V_CORE_SS.
*    SHIFT V_CORE_SS BY 1 PLACES RIGHT.
*    SHIFT V_CORE_SS LEFT DELETING LEADING SPACE.
*    ITAB-VCORE = V_CORE_SS.
    CONCATENATE ITAB-VCORE 'CORE' INTO ITAB-VCORE.
  ENDIF.

ENDFORM.                    "GET_CORE

*&---------------------------------------------------------------------*
*&      Form  GET_MAPPING
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*      -->DESCRIPTION  text
*----------------------------------------------------------------------*
FORM GET_MAPPING USING DESCRIPTION.
  "Label Kanaoka/Green Express (GE)
  IF DESCRIPTION CS ' GE*'.
    IF IT_MAP-TEXT1 IS NOT INITIAL.
      ITAB-VINSIDE  = IT_MAP-TEXT1.
    ENDIF.
    IF IT_MAP-TEXT2 IS NOT INITIAL.
      ITAB-VOUTSIDE = IT_MAP-TEXT2.
    ENDIF.
  ENDIF.
ENDFORM.                    "CHECK_SPECIAL_TREATMENT

*&---------------------------------------------------------------------*
*&      Form  GET_HU
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*      -->HU_NO      text
*      -->TOT_ROL    text
*      -->TOT_BOX    text
*      -->WEIGHT     text
*      -->DATE       text
*      -->MONTH      text
*      -->YEAR       text
*----------------------------------------------------------------------*
FORM GET_HU USING TYPE PLANT HU_NO TOT_ROL TOT_BOX WEIGHT DATE MONTH YEAR.
  "For HU
  IF TYPE IS NOT INITIAL AND SY-TCODE EQ 'VL74'.
    PERFORM OUTPUT_FORMAT USING HU_NO CHANGING ITAB-VBATCH.

    "Set Weight
    ITAB-VTOTROL  = TOT_ROL.
    ITAB-VTOTBOX  = TOT_BOX.
    ITAB-VNWEIGHT = WEIGHT.
    CONDENSE ITAB-VNWEIGHT.
    PERFORM GET_CONVERSION USING 'WEIGHT' WEIGHT CHANGING ITAB-VLBS.

    "Set File FTP
    IF TYPE EQ 'BOX'.
      "HU Box
      CONCATENATE ITAB-PACK ITAB-LABEL INTO ITAB-LABEL.
    ELSE.
      "HU Pallet
      CONCATENATE 'PL' ITAB-LABEL INTO ITAB-LABEL.
    ENDIF.

    "Set Code HU
    DATA: V_PLANT_CODE(2),
          V_ERDAT(3).

    IF PLANT = '1000'.
      V_PLANT_CODE = 'WR'.
    ELSEIF PLANT = '2000'.
      V_PLANT_CODE = 'KR'.
    ELSEIF PLANT = '3000'.
      V_PLANT_CODE = 'JR'.
    ENDIF.
    CONCATENATE MONTH YEAR INTO V_ERDAT.
    IF TYPE EQ 'BOX'.
      CONCATENATE HU_NO V_PLANT_CODE V_ERDAT INTO ITAB-CODE SEPARATED BY '-'.
    ELSE.
      CONCATENATE HU_NO V_PLANT_CODE V_ERDAT DATE INTO ITAB-CODE SEPARATED BY '-'.
    ENDIF.
  ENDIF.
ENDFORM.                    "GET_HU

*&---------------------------------------------------------------------*
*&      Form  GET_CONVERSION
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*      -->MODE          text
*      -->BERFORE_DATA  text
*      -->AFTER_DATA    text
*----------------------------------------------------------------------*
FORM GET_CONVERSION USING MODE BERFORE_DATA CHANGING AFTER_DATA.
  IF MODE EQ 'LENGTH'.
    CLEAR TOCHAR.
    TOCHAR  = BERFORE_DATA * V_DEF_FEET.
    AFTER_DATA = TOCHAR.
  ELSEIF MODE EQ 'WIDTH'.
    CLEAR TOCHAR2.
    TOCHAR2 = BERFORE_DATA * V_DEF_INCH.
    AFTER_DATA = TOCHAR2.
  ELSEIF MODE EQ 'WEIGHT'.
    CLEAR TOCHAR2.
    TOCHAR2 = BERFORE_DATA * V_DEF_LBS.
    AFTER_DATA = TOCHAR2.
  ELSEIF MODE EQ 'THICK'.
    CLEAR TOCHAR.
    TOCHAR = BERFORE_DATA * V_DEF_GAU.
    AFTER_DATA = TOCHAR.
  ENDIF.

  CONDENSE AFTER_DATA.
ENDFORM.                    "GET_CONVERSION

*&---------------------------------------------------------------------*
*&      Form  CONV_TO_CHAR
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*      -->DATA       text
*----------------------------------------------------------------------*
FORM CONV_TO_CHAR USING DATA.
  DATA: V_IN TYPE P DECIMALS 2,
        V_DEC TYPE P DECIMALS 2,
        V_OUT(25).

  CLEAR: V_IN, V_DEC, V_OUT.

  V_IN = DATA.
  V_DEC = FRAC( V_IN ).

  IF V_DEC = 0.
    WRITE V_IN TO V_OUT NO-GROUPING DECIMALS 0.
  ELSE.
    WRITE V_IN TO V_OUT NO-GROUPING DECIMALS 2.
  ENDIF.

  CONDENSE V_OUT NO-GAPS.
  DATA = V_OUT.
ENDFORM.                    "CONV_TO_CHAR

*&---------------------------------------------------------------------*
*&      Form  SEPARATOR_COMMA
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*      -->DATA       text
*----------------------------------------------------------------------*
FORM SEPARATOR_COMMA USING DATA.
  DATA: V_CURR LIKE TCURX-CURRKEY.

  V_CURR = DATA.

  CALL FUNCTION 'SD_CONVERT_CURRENCY_FORMAT'
    EXPORTING
      I_CURRENCY            = V_CURR
    CHANGING
      C_CURRENCY_EXT_FORMAT = DATA
    EXCEPTIONS
      WRONG_FORMAT          = 1
      OTHERS                = 2.

  REPLACE '.00' IN DATA WITH SPACE.
  CONDENSE DATA.
ENDFORM.                    "SEPARATOR_COMMA

*&---------------------------------------------------------------------*
*&      Form  OUTPUT_FORMAT
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*      -->P_INP      text
*      -->P_OUT      text
*----------------------------------------------------------------------*
FORM OUTPUT_FORMAT USING P_INP CHANGING P_OUT.
  CALL FUNCTION 'CONVERSION_EXIT_ALPHA_OUTPUT'
    EXPORTING
      INPUT  = P_INP
    IMPORTING
      OUTPUT = P_OUT.
ENDFORM.                    "OUTPUT_FORMAT
*&---------------------------------------------------------------------*
*&      Form  SANITIZE_JSON_STRUCT
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*      -->CS_STRUCT  text
*----------------------------------------------------------------------*
FORM SANITIZE_JSON_STRUCT CHANGING CS_STRUCT TYPE ANY.
  FIELD-SYMBOLS: <LF_FIELD> TYPE ANY.
  DATA: LV_STRING TYPE STRING.

  " Loop dinamis ke seluruh kolom di dalam struktur WA_OUTPUT
  DO.
    ASSIGN COMPONENT SY-INDEX OF STRUCTURE CS_STRUCT TO <LF_FIELD>.
    IF SY-SUBRC <> 0. EXIT. ENDIF. " Berhenti jika kolom habis

    IF <LF_FIELD> IS ASSIGNED.
      " Pindahkan ke string temp untuk diolah
      LV_STRING = <LF_FIELD>.

      " Langkah 1: Escape Backslash (\) menjadi (\\)
      " Penting: Harus dilakukan pertama agar escape char tidak ter-escape lagi
      REPLACE ALL OCCURRENCES OF '\' IN LV_STRING WITH '\\'.

      " Langkah 2: Escape Double Quote (") menjadi (\")
      REPLACE ALL OCCURRENCES OF '"' IN LV_STRING WITH '\"'.

      " Langkah 3 (Opsional): Hapus Newline/Carriage Return jika ada
      REPLACE ALL OCCURRENCES OF CL_ABAP_CHAR_UTILITIES=>CR_LF IN LV_STRING WITH ' '.
      REPLACE ALL OCCURRENCES OF CL_ABAP_CHAR_UTILITIES=>NEWLINE IN LV_STRING WITH ' '.

      " Kembalikan data bersih ke struktur
      <LF_FIELD> = LV_STRING.
    ENDIF.
  ENDDO.
ENDFORM.                    "SANITIZE_JSON_STRUCT
