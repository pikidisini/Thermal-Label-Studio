"""
API Routes for Data Contract Inspection and Template Compatibility Validation.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status

from ..auth.dependencies import get_current_user, verify_csrf_token
from ..config import DATA_SAMPLES_DIR
from ..models.schemas import ValidationRequest, ValidationResponse
from ..services.template_service import TemplateService

from engine.renderer import load_json_contract

router = APIRouter(prefix="/inspect", tags=["Inspect & Validation"], dependencies=[Depends(get_current_user)])


@router.get("/sample-contract", summary="Get sample SAP JSON Contract v1.1")
@router.get("/sample", summary="Get sample SAP JSON Contract v1.1 alias")
def get_sample_contract() -> Dict[str, Any]:
    """Returns the sample JSON data contract payload for demonstration and testing."""
    sample_file = DATA_SAMPLES_DIR / "sample_roll.json"
    if sample_file.exists():
        return json.loads(sample_file.read_text(encoding="utf-8"))

    # Fallback default contract
    return {
        "contract_version": "1.1",
        "metadata": {
            "generated_at": "2026-08-19T10:00:00Z",
            "source_system": "SAP_ECC_PRD"
        },
        "fields": {
            "material_number": "RM-ST-00129",
            "material_description": "Cold Rolled Steel Coil 1.2mm x 1200mm",
            "batch_number": "B260819001",
            "gross_weight": "2,450.50 KG",
            "net_weight": "2,430.00 KG",
            "production_date": "19.08.2026",
            "operator_id": "OP-9821"
        },
        "codes": {
            "barcode_batch": "B260819001",
            "qr_traceability": "https://trace.company.com/label?batch=B260819001&mat=RM-ST-00129"
        }
    }


@router.post("/validate", response_model=ValidationResponse, dependencies=[Depends(verify_csrf_token)], summary="Validate JSON contract against template")
def validate_contract_compatibility(req: ValidationRequest) -> ValidationResponse:
    """
    Validates whether a JSON data contract satisfies all required placeholders
    in an SVG template without running full rasterization.
    """
    # 1. Resolve template
    if req.template_svg:
        detail = TemplateService.parse_svg_string(req.template_svg)
    elif req.template_id:
        detail = TemplateService.get_template_detail(req.template_id)
        if not detail:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Template '{req.template_id}' not found.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide template_id or template_svg.",
        )

    # 2. Parse contract
    payload_dict = req.data.model_dump() if hasattr(req.data, "model_dump") else req.data
    if isinstance(payload_dict, dict):
        if "fields" in payload_dict and isinstance(payload_dict["fields"], dict):
            contract_data = payload_dict
        else:
            contract_data = {"fields": payload_dict, "codes": {}}
    else:
        contract_data = {"fields": {}, "codes": {}}

    json_fields = contract_data.get("fields", {})
    json_codes = contract_data.get("codes", {})

    all_available_keys = set(json_fields.keys()).union(set(json_codes.keys()))

    # Check orphan tokens in template
    orphan_tokens = [tok for tok in detail.tokens if tok not in all_available_keys]
    matched_fields = [tok for tok in detail.tokens if tok in all_available_keys]
    extra_fields = [k for k in all_available_keys if k not in detail.tokens and k not in detail.barcode_fields and k not in detail.qr_fields]

    # Check missing codes
    missing_codes = []
    for bc in detail.barcode_fields:
        if bc not in json_codes and bc not in json_fields:
            missing_codes.append(f"Barcode field '{bc}' missing")
    for qr in detail.qr_fields:
        if qr not in json_codes and qr not in json_fields:
            missing_codes.append(f"QR field '{qr}' missing")

    errors = []
    if orphan_tokens:
        errors.append(f"Missing values for template tokens: {', '.join(orphan_tokens)}")
    if missing_codes:
        errors.extend(missing_codes)

    w_mm = detail.width_mm or 200.0
    h_mm = detail.height_mm or 80.0
    w_px = int(round((w_mm / 25.4) * 203.2))
    h_px = int(round((h_mm / 25.4) * 203.2))
    is_valid = len(errors) == 0

    return ValidationResponse(
        is_valid=is_valid,
        orphan_tokens=orphan_tokens,
        missing_codes=missing_codes,
        matched_fields=matched_fields,
        extra_fields=extra_fields,
        errors=errors,
        width_mm=w_mm,
        height_mm=h_mm,
        width_px=w_px,
        height_px=h_px,
    )
