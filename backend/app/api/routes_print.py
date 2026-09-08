"""
API Routes for Dispatching Raw Commands to Physical Thermal Printers.
"""

from __future__ import annotations

from typing import List
from fastapi import APIRouter, HTTPException, status

from ..models.schemas import (
    PrintBatchRequest,
    PrintBatchResponse,
    PrintResponse,
    PrintSpoolerRequest,
    PrintTcpRequest,
)
from ..services.print_service import PrintService

router = APIRouter(prefix="/print", tags=["Printing"])


@router.get("/printers", response_model=List[str], summary="List installed Windows spooler printers")
def list_printers() -> List[str]:
    """Lists local and network printers registered in the host Windows Print Spooler."""
    return PrintService.list_available_printers()


@router.post("/tcp", response_model=PrintResponse, summary="Send raw label commands to Network Printer via TCP")
def print_tcp(req: PrintTcpRequest) -> PrintResponse:
    """
    Sends raw thermal commands (ZPL / TSPL / IPL) directly to a network printer IP via raw TCP socket (Port 9100).
    Can render dynamic payload on-the-fly or send pre-rendered raw command text.
    """
    try:
        return PrintService.print_to_tcp(req)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"TCP printing error: {str(e)}",
        )


@router.post("/spooler", response_model=PrintResponse, summary="Send raw label commands to Windows Print Spooler")
def print_spooler(req: PrintSpoolerRequest) -> PrintResponse:
    """
    Sends raw thermal commands directly to a local or mapped Windows Printer Spooler queue using RAW datatype.
    """
    try:
        return PrintService.print_to_spooler(req)
    except NotImplementedError as e:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=str(e),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Spooler error: {str(e)}",
        )


@router.post("/batch", response_model=PrintBatchResponse, summary="Execute mass batch label printing")
def print_batch(req: PrintBatchRequest) -> PrintBatchResponse:
    """
    Dispatches a multi-label batch print job with copies count, auto-increment serial rules,
    or explicit array of data records directly to target printer or spooler.
    """
    try:
        return PrintService.process_batch_print(req)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch printing error: {str(e)}",
        )

