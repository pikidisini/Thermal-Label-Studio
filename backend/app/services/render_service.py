"""
Render Service interfacing with the core Label Engine processor and rasterizer.
"""

from __future__ import annotations

import io
import json
import os
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
from PIL import Image

from ..config import STORAGE_OUT_DIR, DEFAULT_DPI, DEFAULT_WIDTH_MM, DEFAULT_HEIGHT_MM
from ..models.schemas import RenderRequest, RenderResponse, PreviewRequest
from .template_service import TemplateService

# Import directly from root engine package
from engine.processor import process_label
from engine.renderer import load_json_contract, load_svg_template, inject_data, validate_no_orphan_tokens
from engine.barcode_generator import inject_barcodes_and_qr
from engine.rasterizer import svg_to_png, png_to_1bit_monochrome, rotate_image_cw, calculate_otsu_threshold


class RenderService:
    @classmethod
    def execute_render_job(cls, req: RenderRequest, base_url: str = "") -> RenderResponse:
        """Executes full rendering pipeline and produces output files."""
        start_time = time.perf_counter()
        job_id = uuid.uuid4().hex[:12]
        job_out_dir = STORAGE_OUT_DIR / job_id
        job_out_dir.mkdir(parents=True, exist_ok=True)

        # Resolve Template Source
        temp_template_file: Optional[Path] = None
        if req.template_svg:
            temp_template_file = job_out_dir / "template_custom.svg"
            temp_template_file.write_text(req.template_svg, encoding="utf-8")
            template_path = temp_template_file
        elif req.template_id:
            resolved = TemplateService.get_template_path(req.template_id)
            if not resolved:
                raise ValueError(f"Template '{req.template_id}' not found.")
            template_path = resolved
        else:
            raise ValueError("Must provide either 'template_id' or 'template_svg'.")

        # Normalize JSON data payload (support flat dict or v1.1 contract)
        payload_dict = req.data.model_dump() if hasattr(req.data, "model_dump") else req.data
        if isinstance(payload_dict, dict):
            if "fields" not in payload_dict and "codes" not in payload_dict:
                contract_data = {"fields": payload_dict, "codes": {}}
            else:
                contract_data = payload_dict
        else:
            contract_data = {"fields": {}, "codes": {}}

        # Execute Engine Pipeline
        results = process_label(
            json_source=contract_data,
            template_source=template_path,
            out_dir=job_out_dir,
            formats=req.formats,
            dpi=req.dpi,
            rotation=req.rotation,
            binarization_threshold=req.binarization_threshold,
            width_mm=req.width_mm,
            height_mm=req.height_mm,
        )

        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

        # Build output file links
        files_map: Dict[str, str] = {}
        raw_previews: Dict[str, str] = {}

        for fmt, fpath in results.items():
            rel_url = f"/api/v1/render/download/{job_id}/{fpath.name}"
            files_map[fmt] = f"{base_url.rstrip('/')}{rel_url}" if base_url else rel_url

            # Extract small text code contents (ZPL, TSPL, IPL) for instant preview in UI
            if fmt in ["zpl", "tspl", "ipl"]:
                try:
                    raw_previews[fmt] = fpath.read_text(encoding="utf-8", errors="replace")
                except Exception:
                    pass

        return RenderResponse(
            success=True,
            job_id=job_id,
            message="Rendering completed successfully.",
            elapsed_ms=elapsed_ms,
            rendered_formats=list(results.keys()),
            files=files_map,
            raw_preview_text=raw_previews if raw_previews else None,
        )

    @classmethod
    def generate_preview_image(cls, req: PreviewRequest) -> Tuple[bytes, str]:
        """
        Generates in-memory preview bytes.
        Returns (image_bytes, media_type).
        """
        # Resolve Template
        if req.template_svg:
            svg_content = req.template_svg
        elif req.template_id:
            resolved = TemplateService.get_template_path(req.template_id)
            if not resolved:
                raise ValueError(f"Template '{req.template_id}' not found.")
            svg_content = resolved.read_text(encoding="utf-8")
        else:
            raise ValueError("Must provide either 'template_id' or 'template_svg'.")

        payload_dict = req.data.model_dump() if hasattr(req.data, "model_dump") else req.data
        if isinstance(payload_dict, dict):
            if "fields" not in payload_dict and "codes" not in payload_dict:
                contract_data = {"fields": payload_dict, "codes": {}}
            else:
                contract_data = payload_dict
        else:
            contract_data = {"fields": {}, "codes": {}}

        # 1. Inject Data (Permissive for live preview)
        injected_svg = inject_data(svg_content, contract_data)

        # 2. Inject Barcodes and QR
        final_svg = inject_barcodes_and_qr(injected_svg, contract_data)

        if req.preview_type == "svg":
            return final_svg.encode("utf-8"), "image/svg+xml"

        # Calculate target dimensions
        width_mm = req.width_mm
        height_mm = req.height_mm

        # If request has defaults, check if SVG template defines custom mm width/height
        import re
        w_match = re.search(r'<svg[^>]*\bwidth=["\']([\d.]+)mm["\']', svg_content)
        h_match = re.search(r'<svg[^>]*\bheight=["\']([\d.]+)mm["\']', svg_content)
        if w_match and (req.width_mm == 200.0 or not req.width_mm):
            try:
                width_mm = float(w_match.group(1))
            except ValueError:
                pass
        if h_match and (req.height_mm == 80.0 or not req.height_mm):
            try:
                height_mm = float(h_match.group(1))
            except ValueError:
                pass

        target_w = int(round((width_mm / 25.4) * req.dpi))
        target_h = int(round((height_mm / 25.4) * req.dpi))

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_png = Path(temp_dir) / "preview.png"
            svg_to_png(
                svg_source=final_svg,
                output_png_path=temp_png,
                width_px=target_w,
                height_px=target_h,
                dpi=req.dpi,
            )

            png_img = Image.open(temp_png)

            # Rotation if needed
            if req.rotation in (90, 180, 270):
                png_img = rotate_image_cw(png_img, req.rotation)

            if req.preview_type == "monochrome_1bit":
                thresh = req.binarization_threshold if req.binarization_threshold is not None else calculate_otsu_threshold(png_img)
                mono_img = png_to_1bit_monochrome(png_img, threshold=thresh)
                buf = io.BytesIO()
                mono_img.convert("RGB").save(buf, format="PNG")
                return buf.getvalue(), "image/png"

            # Default standard PNG preview
            buf = io.BytesIO()
            png_img.save(buf, format="PNG")
            return buf.getvalue(), "image/png"

    @classmethod
    def get_job_file(cls, job_id: str, filename: str) -> Optional[Path]:
        """Retrieves path to a rendered file by job ID and filename."""
        target = STORAGE_OUT_DIR / job_id / filename
        if target.exists() and target.is_file():
            return target
        return None
