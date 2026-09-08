"""
API Routes for Headless SAP Automated Printing.
Receives print requests from SAP ECC / S/4HANA (T-Code ZLABEL / ZMMR_LABELROL_JSON).
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request, status

from ..config import APP_VERSION
from ..models.schemas import SapPrinterTarget, SapPrintRequest, SapPrintResponse
from ..services.sap_service import SapService
from ..services.template_service import TemplateService

router = APIRouter(prefix="/sap", tags=["SAP Integration"])


@router.get("/ping", summary="SAP Heartbeat & Connectivity Probe")
def sap_ping():
    """
    Heartbeat probe endpoint for SAP RFC / HTTP Destinations (SM59).
    Confirms that the Label Printing Engine is online and ready to accept print requests.
    """
    templates = TemplateService.list_templates()
    return {
        "status": "ok",
        "service": "SAP_HEADLESS_LABEL_ENGINE",
        "version": APP_VERSION,
        "available_templates": len(templates),
    }


@router.post("/print", response_model=SapPrintResponse, summary="Headless SAP Print Dispatch")
def sap_print(
    req: SapPrintRequest,
    request: Request,
    printer_ip: Optional[str] = Query(default=None, description="Optional override for target printer IP"),
    printer_port: Optional[int] = Query(default=None, description="Optional override for target printer port"),
    printer_name: Optional[str] = Query(default=None, description="Optional override for target Windows Spooler name"),
    printer_format: Optional[str] = Query(default=None, description="Optional override for printer format (zpl, tspl, ipl)"),
    template_id: Optional[str] = Query(default=None, description="Optional override for template ID"),
    dry_run: Optional[bool] = Query(default=None, description="Optional override for dry-run mode"),
) -> SapPrintResponse:
    """
    Direct endpoint for SAP automated label printing.
    Processes the SAP JSON payload, resolves template, rasterizes, and dispatches to network printer or Windows spooler.
    """
    try:
        # Allow query parameters to populate or override request fields
        if template_id and not req.template_id:
            req.template_id = template_id

        if dry_run is not None:
            req.dry_run = dry_run

        if printer_ip:
            if not req.printer:
                req.printer = SapPrinterTarget(
                    type="tcp",
                    host=printer_ip,
                    port=printer_port or 9100,
                    printer_format=printer_format or "zpl",
                )
            else:
                req.printer.type = "tcp"
                req.printer.host = printer_ip
                if printer_port:
                    req.printer.port = printer_port
                if printer_format:
                    req.printer.printer_format = printer_format
        elif printer_name:
            if not req.printer:
                req.printer = SapPrinterTarget(
                    type="spooler",
                    printer_name=printer_name,
                    printer_format=printer_format or "zpl",
                )
            else:
                req.printer.type = "spooler"
                req.printer.printer_name = printer_name
                if printer_format:
                    req.printer.printer_format = printer_format

        base_url = str(request.base_url)
        return SapService.handle_sap_print(req, base_url=base_url)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"SAP print error: {str(e)}",
        )
