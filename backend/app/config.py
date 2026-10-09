"""Configuration values only; importing this module has no external effects."""

from dataclasses import dataclass
import os
import ipaddress
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True)
class Settings:
    application_name: str = "Thermal Label Studio"
    api_prefix: str = "/api/v1"
    renderer_path: Path = Path(__file__).resolve().parents[2] / "engine" / "bin" / "resvg.exe"
    fixture_font_path: Path = Path("C:/Windows/Fonts/arial.ttf")
    fixture_font_family: str = "Arial"
    frontend_dist: Path | None = None
    persistence: "PersistenceSettings | None" = None
    printer: "PrinterTarget | None" = None


@dataclass(frozen=True)
class PrinterTarget:
    host: str
    port: int = 9100

    def __post_init__(self):
        try:
            address = ipaddress.ip_address(self.host)
        except ValueError:
            raise ValueError("Printer host must be a numeric IP address.") from None
        if (self.host != self.host.strip() or getattr(address, "scope_id", None)
                or address.is_unspecified or address.is_multicast
                or type(self.port) is not int or not 1 <= self.port <= 65535):
            raise ValueError("Invalid printer target.")


@dataclass(frozen=True)
class PersistenceSettings:
    database_url: str
    minio_endpoint: str
    minio_access_key: str
    minio_secret_key: str
    minio_bucket: str
    minio_secure: bool = False


def _absolute_path(value: str) -> Path:
    path = Path(value)
    if not value or value != value.strip() or not path.is_absolute() or ".." in path.parts:
        raise ValueError("Runtime paths must be absolute and contain no parent traversal.")
    return path


def get_settings(environment: Mapping[str, str] | None = None) -> Settings:
    """Validate only server-owned configuration, without filesystem effects."""
    values = os.environ if environment is None else environment
    defaults = Settings()
    family = values.get("TLS_FIXTURE_FONT_FAMILY", defaults.fixture_font_family)
    if family not in {"Arial", "Liberation Sans"}:
        raise ValueError("Unsupported fixture font family.")
    persistence_keys = (
        "TLS_DATABASE_URL", "TLS_MINIO_ENDPOINT", "TLS_MINIO_ACCESS_KEY",
        "TLS_MINIO_SECRET_KEY", "TLS_MINIO_BUCKET",
    )
    supplied = [key in values for key in persistence_keys]
    if any(supplied) and not all(supplied):
        raise ValueError("All layout persistence settings are required together.")
    persistence = None
    if all(supplied):
        endpoint = values["TLS_MINIO_ENDPOINT"]
        bucket = values["TLS_MINIO_BUCKET"]
        if not endpoint or "://" in endpoint or "/" in endpoint or not bucket:
            raise ValueError("Invalid layout persistence endpoint or bucket.")
        secure_value = values.get("TLS_MINIO_SECURE", "false")
        if secure_value not in {"true", "false"}:
            raise ValueError("TLS_MINIO_SECURE must be true or false.")
        persistence = PersistenceSettings(
            database_url=values["TLS_DATABASE_URL"],
            minio_endpoint=endpoint,
            minio_access_key=values["TLS_MINIO_ACCESS_KEY"],
            minio_secret_key=values["TLS_MINIO_SECRET_KEY"],
            minio_bucket=bucket,
            minio_secure=secure_value == "true",
        )
    printer = None
    printer_host = values.get("TLS_PRINTER_HOST", "")
    printer_port = values.get("TLS_PRINTER_PORT", "9100")
    if not printer_port.isascii() or not printer_port.isdecimal():
        raise ValueError("Invalid printer port.")
    port = int(printer_port)
    if not 1 <= port <= 65535:
        raise ValueError("Invalid printer port.")
    if printer_host:
        printer = PrinterTarget(printer_host, port)
    return Settings(
        renderer_path=_absolute_path(values["TLS_RENDERER_PATH"]) if "TLS_RENDERER_PATH" in values else defaults.renderer_path,
        fixture_font_path=_absolute_path(values["TLS_FIXTURE_FONT_PATH"]) if "TLS_FIXTURE_FONT_PATH" in values else defaults.fixture_font_path,
        fixture_font_family=family,
        frontend_dist=_absolute_path(values["TLS_FRONTEND_DIST"]) if "TLS_FRONTEND_DIST" in values else None,
        persistence=persistence,
        printer=printer,
    )
