"""Single-attempt Ethernet and Windows RAW spool transports."""
import ctypes
import ipaddress
import os
import socket


class BeforeSendError(RuntimeError):
    pass


def ethernet(printer, payload):
    address = ipaddress.ip_address(printer['host'])
    family = socket.AF_INET6 if address.version == 6 else socket.AF_INET
    try:
        connection = socket.socket(family, socket.SOCK_STREAM)
    except OSError:
        raise BeforeSendError() from None
    with connection:
        try:
            connection.settimeout(3)
            connection.connect((str(address), printer['port']))
        except OSError:
            raise BeforeSendError() from None
        connection.settimeout(10)
        connection.sendall(payload)


def windows_raw(printer, payload):
    """USB uses an installed Windows queue supporting RAW printer language."""
    if os.name != 'nt':
        raise BeforeSendError()
    from ctypes import wintypes as w
    spool = ctypes.WinDLL('winspool.drv', use_last_error=True)
    class Document(ctypes.Structure):
        _fields_ = [('name', w.LPWSTR), ('output', w.LPWSTR), ('datatype', w.LPWSTR)]
    spool.OpenPrinterW.argtypes = [w.LPWSTR, ctypes.POINTER(w.HANDLE), ctypes.c_void_p]
    spool.OpenPrinterW.restype = w.BOOL
    spool.StartDocPrinterW.argtypes = [w.HANDLE, w.DWORD, ctypes.c_void_p]
    spool.StartDocPrinterW.restype = w.DWORD
    spool.StartPagePrinter.argtypes = [w.HANDLE]
    spool.StartPagePrinter.restype = w.BOOL
    spool.WritePrinter.argtypes = [w.HANDLE, ctypes.c_void_p, w.DWORD, ctypes.POINTER(w.DWORD)]
    spool.WritePrinter.restype = w.BOOL
    for name in ('EndPagePrinter', 'EndDocPrinter', 'ClosePrinter'):
        getattr(spool, name).argtypes = [w.HANDLE]
        getattr(spool, name).restype = w.BOOL
    handle = w.HANDLE()
    if not spool.OpenPrinterW(printer['queue'], ctypes.byref(handle), None):
        raise BeforeSendError()
    try:
        document = Document('Thermal Label Studio', None, 'RAW')
        if not spool.StartDocPrinterW(handle, 1, ctypes.byref(document)):
            raise BeforeSendError()
        # Once a spool document exists, any failure is conservatively uncertain.
        if not spool.StartPagePrinter(handle):
            raise RuntimeError()
        written = w.DWORD()
        buffer = ctypes.create_string_buffer(payload)
        if not spool.WritePrinter(handle, buffer, len(payload), ctypes.byref(written)) or written.value != len(payload):
            raise RuntimeError()
        if not spool.EndPagePrinter(handle) or not spool.EndDocPrinter(handle):
            raise RuntimeError()
    finally:
        spool.ClosePrinter(handle)


def submit(printer, payload):
    if printer['connection'] == 'USB':
        windows_raw(printer, payload)
    else:
        ethernet(printer, payload)
