"""Single-attempt TCP RAW transport for the server-owned numeric target."""
import ipaddress
import socket
from app.config import PrinterTarget
from app.printing.service import PrintBeforeSendError

CONNECT_TIMEOUT_SECONDS = 3
WRITE_TIMEOUT_SECONDS = 10

class TcpRawTransport:
    def __init__(self, target: PrinterTarget):
        self.target = target

    def submit(self, payload: bytes) -> None:
        address = ipaddress.ip_address(self.target.host)
        family = socket.AF_INET6 if address.version == 6 else socket.AF_INET
        # Numeric host and explicit family avoid DNS resolution. No connection
        # retry, read/feedback, spooler or alternate destination exists here.
        try:
            connection = socket.socket(family, socket.SOCK_STREAM)
        except Exception:
            raise PrintBeforeSendError('No payload submission was attempted.') from None
        with connection:
            destination = ((self.target.host, self.target.port, 0, 0) if address.version == 6
                           else (self.target.host, self.target.port))
            try:
                connection.settimeout(CONNECT_TIMEOUT_SECONDS)
                connection.connect(destination)
                connection.settimeout(WRITE_TIMEOUT_SECONDS)
            except Exception:
                raise PrintBeforeSendError('No payload submission was attempted.') from None
            connection.sendall(payload)
