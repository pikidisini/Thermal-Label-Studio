"""
SAP Integration Service for Headless Automated Printing.
Receives print requests from SAP ECC/S4HANA (T-Code ZLABEL / ZMMR_LABELROL_JSON),
resolves templates dynamically, renders printer instructions, and dispatches to target printers.
"""

from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from ..config import STORAGE_OUT_DIR
from ..models.schemas import SapPrintRequest, SapPrintResponse
from .template_service import TemplateService

from engine.processor import process_label
from engine.printer_sender import send_tcp_raw, send_windows_spooler_raw

logger = logging.getLogger("label_engine.sap")


class SapService:
    @classmethod
    def resolve_contract_and_template(
        cls, req: SapPrintRequest
    ) -> Tuple[Dict[str, Any], str, Optional[Path]]:
        """
        Normalizes the incoming SAP payload and determines the appropriate label template.
        Returns (contract_data, template_id, template_file_path).
        """
        # 1. Normalize contract data structure
        contract_data: Dict[str, Any] = {}

        if req.data and isinstance(req.data, dict):
            # Payload wrapped in 'data'
            contract_data = dict(req.data)
        else:
            # Root-level SAP contract fields
            contract_data = {
                "schema_version": getattr(req, "schema_version", "1.0"),
                "generated_at": getattr(req, "generated_at", None),
                "source": req.source or {},
                "fields": req.fields or {},
                "rules": req.rules or {},
                "codes": req.codes or {},
                "metadata": req.metadata or {},
            }

        # Ensure 'fields' and 'codes' dictionaries exist
        if "fields" not in contract_data or not isinstance(contract_data["fields"], dict):
            contract_data["fields"] = req.fields or {}
        if "codes" not in contract_data or not isinstance(contract_data["codes"], dict):
            contract_data["codes"] = req.codes or {}

        # Merge source metadata into fields if not present (allows {{material}}, {{batch}}, etc.)
        source_dict = contract_data.get("source") or req.source or {}
        for src_key, src_val in source_dict.items():
            if src_key not in contract_data["fields"] and src_val is not None:
                contract_data["fields"][src_key] = str(src_val)

        # Merge rules into fields as boolean strings if not present (e.g. {{has_splice}})
        rules_dict = contract_data.get("rules") or req.rules or {}
        for r_key, r_val in rules_dict.items():
            if r_key not in contract_data["fields"] and r_val is not None:
                contract_data["fields"][r_key] = str(r_val)

        # 2. Resolve Template
        template_id = req.template_id
        template_file: Optional[Path] = None

        if not template_id:
            # Automatic heuristic resolution from SAP Material prefix or Label Type
            material = str(source_dict.get("material", "")).strip().upper()
            label_type = str(source_dict.get("label_type", "")).strip().lower()

            if material.startswith("SR") or label_type == "roll":
                template_id = "label_roll_80x200"
            else:
                template_id = "label_roll_80x200"

        # Check if template file exists
        if not req.template_svg:
            resolved = TemplateService.get_template_path(template_id)
            if not resolved:
                # Fallback to first available template if specific one is missing
                available = TemplateService.list_templates()
                if available:
                    template_id = available[0].id
                    resolved = TemplateService.get_template_path(template_id)
            template_file = resolved

        # Scan template for required placeholder tokens and ensure defaults are present
        # to avoid orphan token failures due to minor schema variations from SAP
        svg_content: Optional[str] = None
        if req.template_svg:
            svg_content = req.template_svg
        elif template_file and template_file.exists():
            try:
                svg_content = template_file.read_text(encoding="utf-8")
            except Exception as e:
                logger.warning(f"Could not read template file for token scan: {e}")

        if svg_content:
            template_tokens = set(re.findall(r"\{\{\s*([a-zA-Z0-9_\-]+)\s*\}\}", svg_content))
            for tok in template_tokens:
                if tok not in contract_data["fields"] and tok not in contract_data.get("codes", {}):
                    # Smart fallbacks for common synonyms
                    if tok == "base_film" and "type_film" in contract_data["fields"]:
                        contract_data["fields"]["base_film"] = contract_data["fields"]["type_film"]
                    elif tok == "type_film" and "base_film" in contract_data["fields"]:
                        contract_data["fields"]["type_film"] = contract_data["fields"]["base_film"]
                    else:
                        contract_data["fields"][tok] = ""

        return contract_data, template_id or "label_roll_80x200", template_file


    @classmethod
    def handle_sap_print(
        cls, req: SapPrintRequest, base_url: str = ""
    ) -> SapPrintResponse:
        """
        Executes end-to-end headless SAP print request.
        Renders template to target printer instructions and transmits to printer if configured.
        """
        job_id = uuid.uuid4().hex[:12]
        job_out_dir = STORAGE_OUT_DIR / job_id
        job_out_dir.mkdir(parents=True, exist_ok=True)

        contract_data, resolved_template_id, template_path = cls.resolve_contract_and_template(req)

        # Handle custom inline SVG template if provided
        if req.template_svg:
            custom_template_path = job_out_dir / "template_custom.svg"
            custom_template_path.write_text(req.template_svg, encoding="utf-8")
            template_source = custom_template_path
        elif template_path:
            template_source = template_path
        else:
            raise ValueError(f"Template '{resolved_template_id}' could not be resolved.")

        # Determine target printer format
        printer_format = "zpl"
        if req.printer and req.printer.printer_format:
            printer_format = req.printer.printer_format.lower()

        # Render target format + PNG for inspection
        formats_to_render = [printer_format]
        if printer_format != "png":
            formats_to_render.append("png")

        rendered_files = process_label(
            json_source=contract_data,
            template_source=template_source,
            out_dir=job_out_dir,
            formats=formats_to_render,
            dpi=req.dpi,
            rotation=req.rotation,
        )

        # Retrieve rendered command file
        cmd_file = rendered_files.get(printer_format)
        if not cmd_file or not cmd_file.exists():
            raise RuntimeError(f"Failed to generate {printer_format.upper()} printer command file.")

        cmd_bytes = cmd_file.read_bytes()
        zpl_text: Optional[str] = None
        if printer_format in ["zpl", "tspl", "ipl"]:
            try:
                zpl_text = cmd_bytes.decode("utf-8", errors="replace")
            except Exception:
                pass

        # Build preview URL
        preview_url: Optional[str] = None
        png_file = rendered_files.get("png")
        if png_file and png_file.exists():
            rel_url = f"/api/v1/render/download/{job_id}/{png_file.name}"
            preview_url = f"{base_url.rstrip('/')}{rel_url}" if base_url else rel_url

        # Physical Printing Dispatch
        bytes_sent = 0
        printer_target: Optional[str] = None
        message = "Label rendered successfully."

        if req.dry_run:
            message = "Dry-run render successful. No printer transmission."
        elif req.printer:
            target_type = req.printer.type.lower()
            if target_type == "tcp":
                if not req.printer.host:
                    raise ValueError("Printer host IP is required for TCP network printing.")
                printer_target = f"TCP://{req.printer.host}:{req.printer.port}"
                bytes_sent = send_tcp_raw(
                    host=req.printer.host,
                    port=req.printer.port,
                    data=cmd_bytes,
                    timeout=req.printer.timeout,
                )
                message = f"Transmitted {bytes_sent} bytes to {printer_target}"
                logger.info(f"SAP Print Job {job_id}: {message}")

            elif target_type == "spooler":
                if not req.printer.printer_name:
                    raise ValueError("Printer name is required for Windows Spooler printing.")
                printer_target = f"SPOOLER://{req.printer.printer_name}"
                bytes_sent = send_windows_spooler_raw(
                    printer_name=req.printer.printer_name,
                    data=cmd_bytes,
                    doc_name=f"SAP_PRINT_{job_id}",
                )
                message = f"Transmitted {bytes_sent} bytes to printer '{req.printer.printer_name}'"
                logger.info(f"SAP Print Job {job_id}: {message}")
            else:
                raise ValueError(f"Unsupported printer type: {target_type}")

        return SapPrintResponse(
            success=True,
            job_id=job_id,
            message=message,
            template_id=resolved_template_id,
            printer_target=printer_target,
            printer_format=printer_format.upper(),
            bytes_sent=bytes_sent,
            preview_url=preview_url,
            zpl_command=zpl_text,
        )
