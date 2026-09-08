"""
Printer Sender Module.
Provides RAW byte transmission to thermal label printers via:
1. Direct TCP Socket (Default Port 9100 - JetDirect / RAW Print Protocol)
2. Windows Print Spooler RAW API (via ctypes winspool.drv)
"""

from __future__ import annotations

import ctypes
import os
import socket
import sys
from typing import List, Optional, Tuple


class PrinterCommunicationError(Exception):
    """Raised when communication with thermal printer fails."""
    pass


def send_tcp_raw(
    host: str,
    port: int = 9100,
    data: bytes = b"",
    timeout: float = 5.0,
) -> int:
    """
    Sends raw printer instructions (ZPL, TSPL, IPL, etc.) directly to a network printer
    via TCP Raw Port (default 9100).
    
    Returns the number of bytes sent.
    """
    if not host:
        raise ValueError("Printer IP/hostname must not be empty.")
    if not data:
        raise ValueError("Data to send must not be empty.")

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(timeout)
            sock.connect((host, port))
            sock.sendall(data)
            return len(data)
    except socket.timeout as e:
        raise PrinterCommunicationError(f"Connection to printer {host}:{port} timed out after {timeout}s: {e}") from e
    except OSError as e:
        raise PrinterCommunicationError(f"Failed to send data to printer {host}:{port} - {e}") from e


# Windows Spooler Ctypes Helper
def _get_winspool_dll():
    if sys.platform == "win32":
        return ctypes.WinDLL("winspool.drv")
    return None


if sys.platform == "win32":
    class DOC_INFO_1(ctypes.Structure):
        _fields_ = [
            ("pDocName", ctypes.c_wchar_p),
            ("pOutputFile", ctypes.c_wchar_p),
            ("pDatatype", ctypes.c_wchar_p),
        ]

    class PRINTER_INFO_4(ctypes.Structure):
        _fields_ = [
            ("pPrinterName", ctypes.c_wchar_p),
            ("pServerName", ctypes.c_wchar_p),
            ("Attributes", ctypes.c_uint32),
        ]


def list_windows_printers() -> List[str]:
    """
    Enumerates installed Windows local and network printer names.
    Uses native Windows winspool.drv API via ctypes.
    """
    if sys.platform != "win32":
        return []

    winspool = _get_winspool_dll()
    if not winspool:
        return []

    PRINTER_ENUM_LOCAL = 0x00000002
    PRINTER_ENUM_CONNECTIONS = 0x00000004
    flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS

    pcbNeeded = ctypes.c_ulong(0)
    pcReturned = ctypes.c_ulong(0)

    # First call to get required buffer size
    winspool.EnumPrintersW(flags, None, 4, None, 0, ctypes.byref(pcbNeeded), ctypes.byref(pcReturned))
    if pcbNeeded.value == 0:
        return []

    buffer = (ctypes.c_byte * pcbNeeded.value)()
    res = winspool.EnumPrintersW(
        flags,
        None,
        4,
        ctypes.cast(buffer, ctypes.c_void_p),
        pcbNeeded.value,
        ctypes.byref(pcbNeeded),
        ctypes.byref(pcReturned),
    )
    if not res:
        return []

    printer_array = ctypes.cast(buffer, ctypes.POINTER(PRINTER_INFO_4))
    printer_names = [printer_array[i].pPrinterName for i in range(pcReturned.value) if printer_array[i].pPrinterName]
    return sorted(printer_names)


def send_windows_spooler_raw(
    printer_name: str,
    data: bytes,
    doc_name: str = "Label Printing Job",
) -> int:
    """
    Sends raw bytes directly to Windows Print Spooler (RAW datatype)
    bypassing graphics GDI drivers.
    """
    if sys.platform != "win32":
        raise NotImplementedError("Windows print spooler is only available on Windows OS.")

    if not printer_name:
        raise ValueError("Printer name must not be empty.")
    if not data:
        raise ValueError("Data to send must not be empty.")

    winspool = _get_winspool_dll()
    if not winspool:
        raise RuntimeError("Failed to load winspool.drv")

    hPrinter = ctypes.c_void_p()

    # OpenPrinter
    if not winspool.OpenPrinterW(printer_name, ctypes.byref(hPrinter), None):
        err = ctypes.GetLastError()
        raise PrinterCommunicationError(f"Cannot open printer '{printer_name}'. Windows error code: {err}")

    try:
        # StartDocPrinter
        doc_info = DOC_INFO_1()
        doc_info.pDocName = doc_name
        doc_info.pOutputFile = None
        doc_info.pDatatype = "RAW"

        job_id = winspool.StartDocPrinterW(hPrinter, 1, ctypes.byref(doc_info))
        if job_id <= 0:
            err = ctypes.GetLastError()
            raise PrinterCommunicationError(f"StartDocPrinter failed for '{printer_name}'. Error: {err}")

        try:
            # StartPagePrinter
            if not winspool.StartPagePrinter(hPrinter):
                err = ctypes.GetLastError()
                raise PrinterCommunicationError(f"StartPagePrinter failed for '{printer_name}'. Error: {err}")

            try:
                # WritePrinter
                bytes_written = ctypes.c_ulong(0)
                if not winspool.WritePrinter(
                    hPrinter,
                    data,
                    len(data),
                    ctypes.byref(bytes_written),
                ):
                    err = ctypes.GetLastError()
                    raise PrinterCommunicationError(f"WritePrinter failed for '{printer_name}'. Error: {err}")
                return bytes_written.value
            finally:
                winspool.EndPagePrinter(hPrinter)
        finally:
            winspool.EndDocPrinter(hPrinter)
    finally:
        winspool.ClosePrinter(hPrinter)

