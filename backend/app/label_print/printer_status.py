"""Bounded IPL ENQ status only; never send print/reset/configuration commands.

Reference: Honeywell IPL Command Reference, Status Enquiry; ITE Programmer's
Reference, Printer Status Query Responses. Standard DC1 is ambiguous between
ready/printing/skipping; US is ambiguous between label path/ribbon faults.
"""
import ipaddress
import socket
from time import monotonic
from datetime import datetime, timezone

# Honeywell Standard Protocol response bytes. Do not interpret arbitrary ASCII
# or XON/XOFF flow control as an unambiguous physical READY or completed job.
RESPONSES = {
    0x11: ('RESPONDING', 'ready_or_printing'),
    0x1D: ('ATTENTION', 'buffer_full'),
    0x13: ('ATTENTION', 'paused_offline_or_buffer_full'),
    0x0E: ('ATTENTION', 'printhead_test_failed'),
    0x1F: ('ATTENTION', 'label_path_open_or_ribbon_fault'),
    0x19: ('ATTENTION', 'media_out'),
    0x0F: ('ATTENTION', 'printhead_hot'),
    0x08: ('ATTENTION', 'takeup_reel_full'),
    0x1C: ('ATTENTION', 'label_at_strip_pin'),
    0x04: ('ATTENTION', 'rfid_write_error'),
    0x0B: ('ATTENTION', 'rfid_read_error'),
    0x06: ('RESPONDING', 'rfid_write_ok'),
}


def query_ipl_status(target):
    """One connection, one ENQ, at most 16 response bytes; no retry or fallback."""
    state, reason = 'UNREACHABLE', 'connection_failed'
    connected = False
    try:
        address = ipaddress.ip_address(target.host)
        family = socket.AF_INET6 if address.version == 6 else socket.AF_INET
        with socket.socket(family, socket.SOCK_STREAM) as connection:
            connection.settimeout(3)
            destination = (target.host, target.port, 0, 0) if address.version == 6 else (target.host, target.port)
            connection.connect(destination)
            connected = True
            deadline = monotonic() + 3
            connection.sendall(b'\x05')
            connection.settimeout(max(0.001, deadline - monotonic()))
            data = connection.recv(16)
            # Accept a raw one-byte response or STX/code/ETX, including fragmented
            # framing. Never wait indefinitely or expose arbitrary device text.
            while data.startswith(b'\x02') and len(data) < 3:
                if monotonic() >= deadline: raise TimeoutError()
                connection.settimeout(max(0.001, deadline - monotonic()))
                chunk = connection.recv(3 - len(data))
                if not chunk: break
                data += chunk
            data = data.strip(b'\r\n')
            if len(data) == 3 and data[:1] == b'\x02' and data[-1:] == b'\x03':
                data = data[1:2]
            state, reason = RESPONSES.get(data[0], ('UNAVAILABLE', 'unrecognized_response')) if len(data) == 1 else ('UNAVAILABLE', 'unrecognized_response')
    except (OSError, ValueError):
        state, reason = ('UNAVAILABLE', 'no_status_response') if connected else ('UNREACHABLE', 'connection_failed')
    return {'state': state, 'reason': reason, 'checked_at': datetime.now(timezone.utc).isoformat(),
            'method': 'IPL_ENQ', 'confirmed': False}
