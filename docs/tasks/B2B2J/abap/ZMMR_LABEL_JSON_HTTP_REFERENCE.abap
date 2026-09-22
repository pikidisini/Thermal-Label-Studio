*&---------------------------------------------------------------------*
*&  Report     :  ZMMR_LABEL_JSON_HTTP_REFERENCE
*&  Desc       :  Non-Executable Interface Design — Raw SAP Label Snapshot
*&  Appl. Area :  PPIC / Packaging / Label Simulation (B2B2J Replan)
*&  Author     :  Principal AI Engineer / Staff Full-Stack Engineer
*&  Notice     :  NON-EXECUTABLE INTERFACE DESIGN ONLY.
*&                SUPERSEDES the earlier narrow HTTP-adapter design attempt.
*&                Mendefinisikan tipe data kontrak snapshot fakta mentah SAP
*&                dan interface seam tanpa implementasi transport aktif.
*&                Zero hardcoded URLs, IPs, credentials, or physical routes.
*&---------------------------------------------------------------------*
REPORT ZMMR_LABEL_JSON_HTTP_REFERENCE MESSAGE-ID 00.

*======================================================================*
* 1. DEFINISI STRUKTUR DATA KONTRAK RAW SAP (1.0-RAW SPECIFICATION)    *
*======================================================================*

TYPES: BEGIN OF TY_RAW_MEASUREMENTS,
         THICKNESS_MICRON   TYPE P DECIMALS 2,
         WIDTH_MM           TYPE P DECIMALS 2,
         LENGTH_METERS      TYPE P DECIMALS 2,
         NET_WEIGHT_KG      TYPE P DECIMALS 2,
         CORE_DIAMETER_INCH TYPE P DECIMALS 2,
       END OF TY_RAW_MEASUREMENTS.

TYPES: BEGIN OF TY_RAW_SURFACE_TREATMENT,
         INSIDE             TYPE STRING,
         OUTSIDE            TYPE STRING,
       END OF TY_RAW_SURFACE_TREATMENT.

TYPES: BEGIN OF TY_RAW_SPLICES,
         SPLICE_1_METERS    TYPE P DECIMALS 2,
         SPLICE_2_METERS    TYPE P DECIMALS 2,
       END OF TY_RAW_SPLICES.

TYPES: BEGIN OF TY_RAW_SALES_ORDER,
         SALES_ORDER          TYPE STRING,
         SALES_ORDER_ITEM     TYPE STRING,
         CUSTOMER_PART_NUMBER TYPE STRING,
       END OF TY_RAW_SALES_ORDER.

TYPES: BEGIN OF TY_RAW_BUSINESS_FACTS,
         BATCH_NUMBER         TYPE STRING,
         MATERIAL_NUMBER      TYPE STRING,
         MATERIAL_DESCRIPTION TYPE STRING,
         ROLL_NUMBER          TYPE STRING,
         FILM_TYPE_CODE       TYPE STRING,
         FILM_TYPE_TEXT       TYPE STRING,
         QUALITY_GRADE        TYPE STRING,
         PRODUCTION_DATE      TYPE D, " SAP_RESOLVED_TRANSITIONAL: via Z_GET_PRODUCTION_DATE
         EXPIRY_DATE          TYPE D, " Target: APPLICATION_DERIVED_TARGET (Legacy caller formula: production_date + ZZEXPIREDLIVE)
         MEASUREMENTS         TYPE TY_RAW_MEASUREMENTS,
         SURFACE_TREATMENT    TYPE TY_RAW_SURFACE_TREATMENT,
         SPLICES              TYPE TY_RAW_SPLICES,
         SALES_ORDER_REF      TYPE TY_RAW_SALES_ORDER,
       END OF TY_RAW_BUSINESS_FACTS.

TYPES: BEGIN OF TY_RAW_LABEL_ITEM,
         ITEM_SEQUENCE      TYPE I,
         LABEL_CODE         TYPE STRING, " Selektor bisnis ZZLABEL (misal 'REDACTED_STANDARD_LABEL_CODE')
         COPIES             TYPE I,      " Wajib 1 pada fase simulasi
         RAW_BUSINESS_FACTS TYPE TY_RAW_BUSINESS_FACTS,
       END OF TY_RAW_LABEL_ITEM.

TYPES: TY_T_RAW_LABEL_ITEMS TYPE STANDARD TABLE OF TY_RAW_LABEL_ITEM WITH DEFAULT KEY.

TYPES: BEGIN OF TY_RAW_SOURCE_PROVENANCE,
         SYSTEM_ID          TYPE STRING,
         MANDT              TYPE STRING,
         PLANT              TYPE STRING,
         STORAGE_LOCATION   TYPE STRING,
         SAP_USER           TYPE STRING, " Audit metadata terbatas (Dilarang render ke label/UI)
         TRANSACTION_CODE   TYPE STRING,
         SNAPSHOT_TIMESTAMP TYPE STRING,
       END OF TY_RAW_SOURCE_PROVENANCE.

TYPES: BEGIN OF TY_RAW_BATCH_SNAPSHOT,
         CONTRACT_SCHEMA_VERSION TYPE STRING, " Tetap '1.0-raw'
         PRODUCER_NAMESPACE      TYPE STRING, " 'SAP_PPIC'
         REQUEST_ID              TYPE STRING, " Stable business ID
         SOURCE_PROVENANCE       TYPE TY_RAW_SOURCE_PROVENANCE,
         ITEMS                   TYPE TY_T_RAW_LABEL_ITEMS,
       END OF TY_RAW_BATCH_SNAPSHOT.

*======================================================================*
* 2. INTERFACE SEAMS (ARSITEKTUR ABAP TERISOLASI)                      *
*======================================================================*

*----------------------------------------------------------------------*
* 2.1. Collector Seam: Ekstraksi Fakta Mentah SAP (Tanpa Konversi)     *
*----------------------------------------------------------------------*
INTERFACE ZIF_RAW_LABEL_COLLECTOR.
  METHODS:
    COLLECT_BATCH_FACTS
      IMPORTING
        IT_CHARG          TYPE STANDARD TABLE
        IV_WERKS          TYPE WERKS_D
        IV_LGORT          TYPE LGORT_D
      RETURNING
        VALUE(RT_ITEMS)   TYPE TY_T_RAW_LABEL_ITEMS
      RAISING
        CX_STATIC_CHECK.
ENDINTERFACE.

*----------------------------------------------------------------------*
* 2.2. Dispatcher Seam: Pengiriman Terproteksi (Internal Resolution)   *
*----------------------------------------------------------------------*
INTERFACE ZIF_RAW_LABEL_DISPATCHER.
  METHODS:
    DISPATCH_SNAPSHOT
      IMPORTING
        IS_SNAPSHOT       TYPE TY_RAW_BATCH_SNAPSHOT
      EXPORTING
        EV_HTTP_STATUS    TYPE I
        EV_BATCH_ID       TYPE STRING
        EV_OUTCOME_CODE   TYPE STRING
      RAISING
        CX_STATIC_CHECK.
ENDINTERFACE.

*======================================================================*
* 3. FAIL-CLOSED EXECUTION GUARD                                       *
*======================================================================*

START-OF-SELECTION.
  " Program ini sengaja dirancang sebagai NON-EXECUTABLE INTERFACE DESIGN
  " untuk fase perencanaan review B2B2J.
  " Seluruh eksekusi langsung dihentikan secara fail-closed.
  MESSAGE 'ZMMR_LABEL_JSON_HTTP_REFERENCE adalah artefak non-executable interface design untuk B2B2J replan.' TYPE 'E'.
