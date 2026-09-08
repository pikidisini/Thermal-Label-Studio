"""
Print Service for dispatching raw printer commands via TCP/IP Socket and Windows Print Spooler.
"""

from __future__ import annotations

import copy
import re
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from ..models.schemas import (
    PrintBatchRequest,
    PrintBatchResponse,
    PrintResponse,
    PrintSpoolerRequest,
    PrintTcpRequest,
)
from .template_service import TemplateService

# Import engine modules
from engine.printer_sender import (
    send_tcp_raw,
    send_windows_spooler_raw,
    list_windows_printers,
    PrinterCommunicationError,
)
from engine.processor import process_label


class PrintService:
    @classmethod
    def list_available_printers(cls) -> List[str]:
        """Lists available Windows Spooler printers."""
        return list_windows_printers()

    @classmethod
    def _generate_command_if_needed(
        cls,
        format_name: str,
        raw_command: Optional[str],
        data: Optional[Union[dict, object]],
        template_id: Optional[str],
        template_svg: Optional[str],
        dpi: float,
        rotation: int,
    ) -> bytes:
        """Helper to get command bytes, generating them if not provided directly."""
        if raw_command:
            return raw_command.encode("utf-8") if isinstance(raw_command, str) else raw_command

        if not data:
            raise ValueError("Must provide either 'raw_command' or 'data' for rendering.")

        # Resolve template
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            if template_svg:
                tmpl_file = temp_path / "template.svg"
                tmpl_file.write_text(template_svg, encoding="utf-8")
                tmpl_source = tmpl_file
            elif template_id:
                resolved = TemplateService.get_template_path(template_id)
                if not resolved:
                    raise ValueError(f"Template '{template_id}' not found.")
                tmpl_source = resolved
            else:
                raise ValueError("Must provide template_id or template_svg.")

            payload_dict = data.model_dump() if hasattr(data, "model_dump") else data
            if isinstance(payload_dict, dict):
                if "fields" not in payload_dict and "codes" not in payload_dict:
                    contract_data = {"fields": payload_dict, "codes": {}}
                else:
                    contract_data = payload_dict
            else:
                contract_data = {"fields": {}, "codes": {}}

            # Render specifically to target format
            rendered = process_label(
                json_source=contract_data,
                template_source=tmpl_source,
                out_dir=temp_path,
                formats=[format_name],
                dpi=dpi,
                rotation=rotation,
            )

            out_file = rendered.get(format_name.lower())
            if not out_file or not out_file.exists():
                raise RuntimeError(f"Failed to generate {format_name} command.")

            return out_file.read_bytes()

    @classmethod
    def print_to_tcp(cls, req: PrintTcpRequest) -> PrintResponse:
        """Sends printer commands to a network thermal printer on Port 9100."""
        command_bytes = cls._generate_command_if_needed(
            format_name=req.printer_format,
            raw_command=req.raw_command,
            data=req.data,
            template_id=req.template_id,
            template_svg=req.template_svg,
            dpi=req.dpi,
            rotation=req.rotation,
        )

        bytes_sent = send_tcp_raw(
            host=req.host,
            port=req.port,
            data=command_bytes,
            timeout=req.timeout,
        )

        return PrintResponse(
            success=True,
            message=f"Successfully transmitted {bytes_sent} bytes to {req.host}:{req.port}",
            bytes_sent=bytes_sent,
            target=f"{req.host}:{req.port}",
            printer_format=req.printer_format.upper(),
        )

    @classmethod
    def print_to_spooler(cls, req: PrintSpoolerRequest) -> PrintResponse:
        """Sends raw command bytes to a local or mapped Windows Print Spooler."""
        command_bytes = cls._generate_command_if_needed(
            format_name=req.printer_format,
            raw_command=req.raw_command,
            data=req.data,
            template_id=req.template_id,
            template_svg=req.template_svg,
            dpi=req.dpi,
            rotation=req.rotation,
        )

        bytes_sent = send_windows_spooler_raw(
            printer_name=req.printer_name,
            data=command_bytes,
            doc_name="JSON_Thermal_Label_Print",
        )

        return PrintResponse(
            success=True,
            message=f"Successfully sent {bytes_sent} raw bytes to printer '{req.printer_name}'",
            bytes_sent=bytes_sent,
            target=req.printer_name,
            printer_format=req.printer_format.upper(),
        )

    @classmethod
    def process_batch_print(cls, req: PrintBatchRequest) -> PrintBatchResponse:
        """Processes a batch printing request with multiple copies, auto-increment, or record array."""
        start_time = time.perf_counter()
        job_id = uuid.uuid4().hex[:12]

        # 1. Resolve records to print
        records: List[Dict[str, Any]] = []
        if req.records and len(req.records) > 0:
            records = list(req.records)
        elif req.data:
            base_data = dict(req.data)
            copies = max(1, req.copies)

            if req.increment_config and copies > 1:
                cfg = req.increment_config
                field_name = cfg.field_name
                start_val = cfg.start_value
                step = cfg.step
                pad = cfg.pad_digits

                # Determine if string has trailing number (e.g. "ROL-001" -> prefix "ROL-", num 1)
                str_val = str(start_val)
                match = re.search(r"^(.*?)(\d+)$", str_val)

                for i in range(copies):
                    rec = copy.deepcopy(base_data)
                    if "fields" not in rec:
                        rec["fields"] = {}

                    if match:
                        prefix = match.group(1)
                        orig_digits = match.group(2)
                        num = int(orig_digits) + (i * step)
                        pad_len = pad or len(orig_digits)
                        new_val_str = f"{prefix}{num:0{pad_len}d}"
                    else:
                        try:
                            num = int(start_val) + (i * step)
                            new_val_str = f"{num:0{pad}d}" if pad else str(num)
                        except ValueError:
                            new_val_str = f"{start_val}_{i + 1}"

                    rec["fields"][field_name] = new_val_str
                    # Also update codes if matching code exists
                    if "codes" in rec and field_name in rec["codes"]:
                        rec["codes"][field_name] = new_val_str

                    records.append(rec)
            else:
                # Multiple copies without increment
                records = [base_data] * copies
        else:
            raise ValueError("Must provide either 'records' list or 'data' contract with copies count.")

        if not records:
            raise ValueError("No records generated for batch printing.")

        # 2. Resolve template
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            if req.template_svg:
                tmpl_file = temp_path / "template.svg"
                tmpl_file.write_text(req.template_svg, encoding="utf-8")
                tmpl_source = tmpl_file
            elif req.template_id:
                resolved = TemplateService.get_template_path(req.template_id)
                if not resolved:
                    raise ValueError(f"Template '{req.template_id}' not found.")
                tmpl_source = resolved
            else:
                tmpl_source = TemplateService.get_template_path("label_roll_80x200")
                if not tmpl_source:
                    available = TemplateService.list_templates()
                    if not available:
                        raise ValueError("No templates available.")
                    tmpl_source = TemplateService.get_template_path(available[0].id)

            # Pre-scan template tokens and ensure defaults exist for all records
            tmpl_tokens = set()
            try:
                svg_content = tmpl_source.read_text(encoding="utf-8")
                tmpl_tokens = set(re.findall(r"\{\{\s*([a-zA-Z0-9_\-]+)\s*\}\}", svg_content))
            except Exception:
                pass

            for rec in records:
                if "fields" not in rec or not isinstance(rec["fields"], dict):
                    rec["fields"] = {}
                if "codes" not in rec or not isinstance(rec["codes"], dict):
                    rec["codes"] = {}
                for tok in tmpl_tokens:
                    if tok not in rec["fields"] and tok not in rec["codes"]:
                        rec["fields"][tok] = ""

            format_name = req.printer_format.lower()
            combined_command_bytes = bytearray()

            # Optimization: If all records are identical, render once and repeat bytes
            if len(records) > 1 and all(records[i] == records[0] for i in range(1, len(records))):
                sub_dir = temp_path / "item_0"
                sub_dir.mkdir(parents=True, exist_ok=True)
                rendered = process_label(
                    json_source=records[0],
                    template_source=tmpl_source,
                    out_dir=sub_dir,
                    formats=[format_name],
                    dpi=req.dpi,
                    rotation=req.rotation,
                )
                single_bytes = rendered[format_name].read_bytes()
                combined_command_bytes = bytearray(single_bytes * len(records))
            else:
                for idx, rec in enumerate(records):
                    sub_dir = temp_path / f"item_{idx}"
                    sub_dir.mkdir(parents=True, exist_ok=True)

                    rendered = process_label(
                        json_source=rec,
                        template_source=tmpl_source,
                        out_dir=sub_dir,
                        formats=[format_name],
                        dpi=req.dpi,
                        rotation=req.rotation,
                    )
                    cmd_file = rendered.get(format_name)
                    if not cmd_file or not cmd_file.exists():
                        raise RuntimeError(f"Failed rendering item {idx} to {format_name}.")
                    combined_command_bytes.extend(cmd_file.read_bytes())
                    # Ensure newline separation if text-based format
                    if format_name in ["zpl", "tspl", "ipl"] and not combined_command_bytes.endswith(b"\n"):
                        combined_command_bytes.extend(b"\n")

            # 3. Dispatch
            bytes_sent = 0
            target_str = "DRY_RUN"
            message = f"Batch dry-run generated {len(records)} labels successfully."

            if not req.dry_run:
                if req.method == "raw_tcp":
                    if not req.host:
                        raise ValueError("Host IP is required for raw_tcp printing.")
                    target_str = f"{req.host}:{req.port}"
                    bytes_sent = send_tcp_raw(
                        host=req.host,
                        port=req.port,
                        data=bytes(combined_command_bytes),
                        timeout=req.timeout,
                    )
                    message = f"Batch transmitted {len(records)} labels ({bytes_sent} bytes) to {target_str}"
                elif req.method == "spooler":
                    if not req.printer_name:
                        raise ValueError("Printer name is required for Windows Spooler printing.")
                    target_str = req.printer_name
                    bytes_sent = send_windows_spooler_raw(
                        printer_name=req.printer_name,
                        data=bytes(combined_command_bytes),
                        doc_name=f"BATCH_{job_id}",
                    )
                    message = f"Batch sent {len(records)} labels ({bytes_sent} bytes) to spooler '{req.printer_name}'"

            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return PrintBatchResponse(
                success=True,
                job_id=job_id,
                message=message,
                total_labels=len(records),
                bytes_sent=bytes_sent,
                target=target_str,
                printer_format=format_name.upper(),
                elapsed_ms=elapsed_ms,
            )

