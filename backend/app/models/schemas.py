"""
Pydantic Models for Label Engine REST API.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field, model_validator


class DataContractMetadata(BaseModel):
    generated_at: Optional[str] = Field(default=None, description="ISO timestamp")
    source_system: Optional[str] = Field(default="SAP_ECC_PRD", description="Source ERP system")


class DataContractPayload(BaseModel):
    contract_version: str = Field(default="1.1", description="Contract specification version")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Metadata dictionary")
    fields: Dict[str, Any] = Field(default_factory=dict, description="Text fields mapping")
    codes: Dict[str, Any] = Field(default_factory=dict, description="Barcode and QR codes mapping")


class RenderRequest(BaseModel):
    data: Dict[str, Any] = Field(
        ...,
        description="JSON contract containing fields and codes",
        json_schema_extra={
            "example": {
                "contract_version": "1.1",
                "metadata": {"source_system": "SAP_ECC_PRD"},
                "fields": {
                    "material_number": "RM-ST-00129",
                    "material_description": "Cold Rolled Steel Coil 1.2mm x 1200mm",
                    "batch_number": "B260819001",
                    "gross_weight": "2,450.50 KG",
                    "net_weight": "2,430.00 KG",
                    "production_date": "19.08.2026",
                    "operator_id": "OP-9821",
                },
                "codes": {
                    "barcode_batch": "B260819001",
                    "qr_traceability": "https://trace.company.com/label?batch=B260819001&mat=RM-ST-00129",
                },
            }
        },
    )
    template_id: Optional[str] = Field(
        default="label_roll_80x200",
        description="ID/filename of the template (or provide template_svg directly)"
    )
    template_svg: Optional[str] = Field(
        default=None,
        description="Inline SVG template string if not using template_id"
    )
    formats: List[Literal["all", "png", "bmp", "pdf", "zpl", "tspl", "ipl", "svg"]] = Field(
        default=["png", "pdf", "zpl", "tspl", "ipl"],
        description="Target formats to render ('all', 'png', 'bmp', 'pdf', 'zpl', 'tspl', 'ipl', 'svg')"
    )
    dpi: float = Field(default=203.2, gt=0, description="Printhead resolution DPI")
    rotation: Literal[0, 90, 180, 270] = Field(default=0, description="Clockwise rotation")
    binarization_threshold: Optional[int] = Field(
        default=None, ge=0, le=255,
        description="Monochrome 1-bit threshold [0..255] (null = auto Otsu)"
    )
    width_mm: float = Field(default=200.0, gt=0, description="Physical width in mm")
    height_mm: float = Field(default=80.0, gt=0, description="Physical height in mm")

    @model_validator(mode="after")
    def validate_template_and_dimensions(self) -> "RenderRequest":
        if not self.template_svg and not self.template_id:
            raise ValueError("Must provide either 'template_id' or 'template_svg'.")
        if not self.formats:
            raise ValueError("At least one render format is required.")
        return self


class RenderResponse(BaseModel):
    success: bool
    job_id: str
    message: str
    elapsed_ms: float
    rendered_formats: List[str]
    files: Dict[str, str] = Field(description="Format to file download URL mapping")
    raw_preview_text: Optional[Dict[str, str]] = Field(
        default=None,
        description="Raw code payloads (e.g. ZPL string) if generated"
    )


class PreviewRequest(BaseModel):
    data: Dict[str, Any]
    template_id: Optional[str] = "label_roll_80x200"
    template_svg: Optional[str] = None
    preview_type: Literal["png", "monochrome_1bit", "svg"] = Field(default="png", description="Preview output type")
    dpi: float = Field(default=203.2, gt=0)
    rotation: Literal[0, 90, 180, 270] = 0
    binarization_threshold: Optional[int] = Field(default=None, ge=0, le=255)
    width_mm: float = Field(default=200.0, gt=0)
    height_mm: float = Field(default=80.0, gt=0)

    @model_validator(mode="after")
    def validate_template(self) -> "PreviewRequest":
        if not self.template_svg and not self.template_id:
            raise ValueError("Must provide either 'template_id' or 'template_svg'.")
        return self


class RawSvgRequest(BaseModel):
    svg_content: str = Field(..., min_length=1, description="Raw SVG document to inspect")


class PrintTcpRequest(BaseModel):
    host: str = Field(..., description="Target printer IP address or hostname", json_schema_extra={"example": "192.168.1.150"})
    port: int = Field(default=9100, description="Target raw printer port (default: 9100)")
    timeout: float = Field(default=10.0, description="Connection timeout in seconds")
    printer_format: str = Field(default="zpl", description="Target language ('zpl', 'tspl', 'ipl')")
    
    # Either provide raw_command or data + template
    raw_command: Optional[str] = Field(default=None, description="Direct raw printer command bytes/text to send")
    data: Optional[Dict[str, Any]] = Field(default=None)
    template_id: Optional[str] = Field(default="label_roll_80x200")
    template_svg: Optional[str] = Field(default=None)
    dpi: float = 203.2
    rotation: int = 0


class PrintSpoolerRequest(BaseModel):
    printer_name: str = Field(..., description="Windows Spooler printer name (e.g. 'ZDesigner ZT411-203dpi ZPL')")
    printer_format: str = Field(default="zpl", description="Target language ('zpl', 'tspl', 'ipl')")
    
    # Either provide raw_command or data + template
    raw_command: Optional[str] = Field(default=None)
    data: Optional[Dict[str, Any]] = Field(default=None)
    template_id: Optional[str] = Field(default="label_roll_80x200")
    template_svg: Optional[str] = Field(default=None)
    dpi: float = 203.2
    rotation: int = 0


class PrintResponse(BaseModel):
    success: bool
    message: str
    bytes_sent: int
    target: str
    printer_format: str


class TemplateSummary(BaseModel):
    id: str
    name: str
    filename: str
    is_builtin: bool
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None


class TemplateDetail(BaseModel):
    id: str
    name: str
    filename: str
    is_builtin: bool
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    view_box: Optional[str] = None
    tokens: List[str] = Field(description="Dynamic text tokens like {{material_number}}")
    barcode_fields: List[str] = Field(description="Fields bound to 1D barcodes (data-barcode)")
    qr_fields: List[str] = Field(description="Fields bound to QR codes (data-qr)")
    raw_svg: str
    svg_content: Optional[str] = Field(default=None, description="Alias for raw_svg")


class SaveTemplateRequest(BaseModel):
    template_id: str = Field(..., description="Template identifier or name")
    svg_content: str = Field(..., description="Raw SVG string content")
    width_mm: Optional[float] = Field(default=200.0, description="Physical width in mm")
    height_mm: Optional[float] = Field(default=80.0, description="Physical height in mm")


class ValidationRequest(BaseModel):
    data: Dict[str, Any]
    template_id: Optional[str] = "label_roll_80x200"
    template_svg: Optional[str] = None


class ValidationResponse(BaseModel):
    is_valid: bool
    orphan_tokens: List[str] = Field(description="Tokens present in template but missing in JSON")
    missing_codes: List[str] = Field(description="Barcode/QR codes required but missing in JSON")
    matched_fields: List[str] = Field(description="Fields successfully satisfied")
    extra_fields: List[str] = Field(description="Fields in JSON not used in template")
    errors: List[str] = Field(default_factory=list, description="Error messages if invalid")
    width_mm: Optional[float] = Field(default=200.0, description="Label width in mm")
    height_mm: Optional[float] = Field(default=80.0, description="Label height in mm")
    width_px: Optional[int] = Field(default=1600, description="Pixel width at default DPI")
    height_px: Optional[int] = Field(default=640, description="Pixel height at default DPI")


class SapPrinterTarget(BaseModel):
    type: Literal["tcp", "spooler"] = Field(
        default="tcp",
        description="Printer connection type ('tcp' or 'spooler')",
    )
    host: Optional[str] = Field(
        default=None,
        description="Target printer IP address or hostname for TCP direct socket",
        json_schema_extra={"example": "192.168.1.150"},
    )
    port: int = Field(
        default=9100,
        description="Raw TCP printer port (default: 9100)",
    )
    printer_name: Optional[str] = Field(
        default=None,
        description="Windows Spooler printer name (e.g. 'ZDesigner ZT411-203dpi ZPL')",
    )
    printer_format: str = Field(
        default="zpl",
        description="Target printer command language ('zpl', 'tspl', 'ipl')",
    )
    timeout: float = Field(
        default=10.0,
        description="Socket connection timeout in seconds",
    )


class SapPrintRequest(BaseModel):
    # SAP input accepts either a nested contract or the real root-level contract.
    contract_version: Optional[str] = Field(default=None, description="SAP contract version")
    label_type: Optional[str] = Field(default=None, description="Root-level label type metadata")
    label_code: Optional[str] = Field(default=None, description="Root-level label code metadata")
    data: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Nested label data contract dictionary",
    )
    source: Optional[Dict[str, Any]] = Field(
        default=None,
        description="SAP source metadata (plant, material, batch, label_type, etc.)",
    )
    fields: Optional[Dict[str, Any]] = Field(
        default=None,
        description="SAP label dynamic text fields",
    )
    rules: Optional[Dict[str, Any]] = Field(
        default=None,
        description="SAP business rules flags",
    )
    codes: Optional[Dict[str, Any]] = Field(
        default=None,
        description="SAP barcodes and QR code payloads",
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional metadata dictionary",
    )
    printer: Optional[SapPrinterTarget] = Field(
        default=None,
        description="Target physical printer configuration (TCP or Windows Spooler)",
    )
    template_id: Optional[str] = Field(
        default=None,
        description="Template ID (auto-resolved from material/label_type if omitted)",
    )
    template_svg: Optional[str] = Field(
        default=None,
        description="Optional custom inline SVG template override",
    )
    dpi: float = Field(
        default=203.2,
        description="Printhead resolution DPI",
    )
    rotation: int = Field(
        default=0,
        description="Clockwise rotation (0, 90, 180, 270)",
    )
    dry_run: bool = Field(
        default=False,
        description="If True, renders label but does not transmit to physical printer",
    )
    model_config = {"extra": "allow"}


class SapPrintResponse(BaseModel):
    success: bool
    job_id: str
    message: str
    template_id: str
    printer_target: Optional[str] = None
    printer_format: str
    bytes_sent: int = 0
    preview_url: Optional[str] = None
    zpl_command: Optional[str] = Field(
        default=None,
        description="Raw printer command text if format is text-based (e.g. ZPL)",
    )


class BatchIncrementConfig(BaseModel):
    field_name: str = Field(
        default="roll_no",
        description="Field name to increment (e.g. 'roll_no', 'batch_number', 'box_no')",
    )
    start_value: Union[int, str] = Field(
        default=1,
        description="Initial numeric value or alphanumeric string with trailing number (e.g. 1 or 'ROL-001')",
    )
    step: int = Field(
        default=1,
        description="Value increment per label copy (default: 1)",
    )
    pad_digits: Optional[int] = Field(
        default=None,
        description="Zero-padding length (e.g. 3 for '001', '002')",
    )


class PrintBatchRequest(BaseModel):
    method: Literal["raw_tcp", "spooler"] = Field(
        default="raw_tcp",
        description="Dispatch method: 'raw_tcp' (Port 9100) or 'spooler' (Windows)",
    )
    host: Optional[str] = Field(
        default=None,
        description="Printer IP address or hostname for TCP direct socket",
        json_schema_extra={"example": "192.168.1.150"},
    )
    port: int = Field(
        default=9100,
        description="Raw TCP printer port (default: 9100)",
    )
    printer_name: Optional[str] = Field(
        default=None,
        description="Windows Spooler printer name if method is 'spooler'",
    )
    printer_format: str = Field(
        default="zpl",
        description="Target printer command language ('zpl', 'tspl', 'ipl')",
    )
    timeout: float = Field(
        default=15.0,
        description="Socket connection timeout in seconds",
    )
    template_id: Optional[str] = Field(
        default="label_roll_80x200",
        description="Template ID to use for rendering",
    )
    template_svg: Optional[str] = Field(
        default=None,
        description="Optional custom inline SVG template override",
    )
    dpi: float = Field(
        default=203.2,
        description="Printhead resolution DPI",
    )
    rotation: int = Field(
        default=0,
        description="Clockwise rotation (0, 90, 180, 270)",
    )
    copies: int = Field(
        default=1,
        description="Total copies to print when using base data + increment config",
    )
    increment_config: Optional[BatchIncrementConfig] = Field(
        default=None,
        description="Auto-increment rules for sequence numbers across copies",
    )
    data: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Base label contract data when using copies / increment_config",
    )
    records: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Explicit array of data records (e.g. imported from CSV or SAP batch)",
    )
    dry_run: bool = Field(
        default=False,
        description="If True, processes batch without transmitting to physical printer",
    )


class PrintBatchResponse(BaseModel):
    success: bool
    job_id: str
    message: str
    total_labels: int
    bytes_sent: int = 0
    target: str
    printer_format: str
    elapsed_ms: float
