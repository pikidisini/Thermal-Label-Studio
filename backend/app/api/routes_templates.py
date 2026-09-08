"""
API Routes for Template Management and Extraction.
"""

from __future__ import annotations

from typing import List
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from ..models.schemas import SaveTemplateRequest, TemplateDetail, TemplateSummary
from ..services.template_service import TemplateService

router = APIRouter(prefix="/templates", tags=["Templates"])


@router.get("", response_model=List[TemplateSummary], summary="List all templates")
def list_templates() -> List[TemplateSummary]:
    """Returns a list of all available built-in and uploaded SVG label templates."""
    return TemplateService.list_templates()


@router.post("", response_model=TemplateDetail, summary="Save or create a custom SVG template")
def save_template(req: SaveTemplateRequest) -> TemplateDetail:
    """Saves a custom SVG template from editor JSON payload."""
    if not req.svg_content or not req.svg_content.strip().startswith("<") or "<svg" not in req.svg_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provided content is not a valid SVG document.",
        )
    return TemplateService.save_custom_template(req.template_id, req.svg_content)


@router.get("/{template_id}", response_model=TemplateDetail, summary="Get template details and tokens")
def get_template(template_id: str) -> TemplateDetail:
    """Retrieves full template metadata, dimensions, text placeholders {{...}}, barcode fields, and raw SVG."""
    detail = TemplateService.get_template_detail(template_id)
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with ID '{template_id}' not found.",
        )
    return detail


@router.post("/upload", response_model=TemplateDetail, summary="Upload a custom SVG template")
async def upload_template(
    file: UploadFile = File(..., description="SVG template file"),
    template_name: str = Form(..., description="Friendly name / ID for the template"),
) -> TemplateDetail:
    """Uploads and parses a new custom SVG template."""
    if not file.filename.lower().endswith(".svg"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have an .svg extension.",
        )

    content_bytes = await file.read()
    try:
        svg_content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File could not be decoded as UTF-8 text.",
        )

    if not svg_content.strip().startswith("<") or "<svg" not in svg_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not appear to be a valid SVG document.",
        )

    return TemplateService.save_custom_template(template_name, svg_content)


@router.post("/parse-raw", response_model=TemplateDetail, summary="Parse raw SVG string")
def parse_raw_svg(svg_content: str) -> TemplateDetail:
    """Parses raw SVG content on the fly and returns extracted tokens, barcodes, and QR fields."""
    return TemplateService.parse_svg_string(svg_content, template_id="raw_parsed")
