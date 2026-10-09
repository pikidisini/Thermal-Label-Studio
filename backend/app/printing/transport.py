"""Single-attempt TCP RAW transport for the server-owned numeric target."""
import ipaddress
import socket
from app.config import PrinterTarget

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
        with socket.socket(family, socket.SOCK_STREAM) as connection:
            connection.settimeout(CONNECT_TIMEOUT_SECONDS)
            destination = ((self.target.host, self.target.port, 0, 0) if address.version == 6
                           else (self.target.host, self.target.port))
            connection.connect(destination)
            connection.settimeout(WRITE_TIMEOUT_SECONDS)
            connection.sendall(payload)
