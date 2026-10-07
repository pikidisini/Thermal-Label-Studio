"""Bounded IPL direct graphics from an existing PNG; no rendering or IO."""

from dataclasses import dataclass, field
from io import BytesIO
import math
import re
from typing import Literal, Mapping, Protocol

from PIL import Image

from app.engine.bitmap import RenderedLabel


class PrintInputError(ValueError):
    """Invalid server profile or processed bitmap; no submission attempted."""


class PrintSubmissionError(RuntimeError):
    """Submission failed or is uncertain; no retry or delivery confirmation."""


def _safe_name(value):
    return type(value) is str and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", value) is not None


@dataclass(frozen=True)
class PrinterProfile:
    profile_id: str
    width_px: int
    height_px: int
    dpi: float
    protocol: Literal["IPL"] = "IPL"

    def validate(self):
        if (not _safe_name(self.profile_id) or self.protocol != "IPL"
                or type(self.width_px) is not int or type(self.height_px) is not int
                or not 1 <= self.width_px <= 4096 or not 1 <= self.height_px <= 4096
                or self.width_px * self.height_px > 4_000_000
                or type(self.dpi) not in (int, float) or not math.isfinite(self.dpi)
                or self.dpi not in (203.2, 300, 406.4, 600)):
            raise PrintInputError("Printer profile is invalid.")


class PrinterProfiles:
    """Copied application-owned label catalog; contains no host/device fields."""

    def __init__(self, profiles: Mapping[str, PrinterProfile]):
        try:
            copied = dict(profiles)
            if not copied or len(copied) > 128:
                raise ValueError()
            for code, profile in copied.items():
                if not _safe_name(code) or type(profile) is not PrinterProfile:
                    raise ValueError()
                profile.validate()
        except (TypeError, ValueError):
            raise PrintInputError("Printer catalog is invalid.") from None
        self._profiles = copied

    def resolve(self, label_code: str) -> PrinterProfile:
        if not _safe_name(label_code) or label_code not in self._profiles:
            raise PrintInputError("Approved printer profile is unavailable.")
        profile = self._profiles[label_code]
        profile.validate()
        return profile


def encode_ipl_bitmap(bitmap: RenderedLabel, profile: PrinterProfile) -> bytes:
    """Encode one copy at origin zero, with no scaling/rotation/rethresholding.

    IPL eight-bit Direct Graphics: ESC g0, origin 21 80 40 80, columns
    27 <seven bottom-to-top dots per high-bit byte> 22, terminator 28,
    STX RS 1 ETX quantity, STX ETB ETX print. Black is an asserted dot.
    """
    if type(profile) is not PrinterProfile:
        raise PrintInputError("Printer profile is invalid.")
    profile.validate()
    if (type(bitmap) is not RenderedLabel or not _safe_name(bitmap.label_code)
            or not _safe_name(bitmap.layout_version)
            or type(bitmap.width_px) is not int or type(bitmap.height_px) is not int
            or (bitmap.width_px, bitmap.height_px) != (profile.width_px, profile.height_px)
            or type(bitmap.dpi) not in (int, float) or bitmap.dpi != profile.dpi
            or type(bitmap.bitmap_png) is not bytes or not 1 <= len(bitmap.bitmap_png) <= 1_048_576):
        raise PrintInputError("Processed bitmap is invalid.")
    try:
        with Image.open(BytesIO(bitmap.bitmap_png), formats=("PNG",)) as image:
            if (image.format != "PNG" or image.mode != "1"
                    or image.size != (profile.width_px, profile.height_px)
                    or getattr(image, "n_frames", 1) != 1
                    or "transparency" in image.info):
                raise ValueError()
            dpi = image.info.get("dpi")
            if not isinstance(dpi, tuple) or len(dpi) != 2 or any(
                type(value) not in (int, float) or not math.isfinite(value)
                or abs(value - profile.dpi) > 0.02 for value in dpi
            ):
                raise ValueError()
            image.load()
            raw = image.tobytes()
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError):
        raise PrintInputError("Processed bitmap PNG is invalid.") from None
    stride = (profile.width_px + 7) // 8
    output = bytearray(b"\x1bg0\x21\x80\x40\x80")
    for column in range(profile.width_px):
        output.append(0x27)
        for start in range(0, profile.height_px, 7):
            dots = 0
            for bit in range(min(7, profile.height_px - start)):
                row = profile.height_px - 1 - start - bit
                # Pillow mode 1 packs white as 1; IPL asserts black as 1.
                if not raw[row * stride + column // 8] & (0x80 >> (column % 8)):
                    dots |= 1 << bit
            output.append(0x80 | dots)
        output.append(0x22)
    output.extend(b"\x28\x02\x1e1\x03\x02\x17\x03")
    return bytes(output)


class BitmapTransport(Protocol):
    def submit(self, payload: bytes) -> None:
        """Return after local acceptance, or raise; never report device delivery."""


@dataclass(frozen=True)
class PrintSubmission:
    bitmap: RenderedLabel
    profile_id: str
    payload: bytes
    status: Literal["SUBMITTED"] = field(default="SUBMITTED", init=False)
    confirmed: Literal[False] = field(default=False, init=False)


def submit_processed_bitmap(
    bitmap: RenderedLabel, profiles: PrinterProfiles, transport: BitmapTransport,
) -> PrintSubmission:
    """Controlled entry consumes an existing bitmap and submits exact bytes once.

    Only injected fakes are supplied in this phase. No retry, socket, spooler,
    persistence, destination configuration, or renderer exists here.
    """
    if type(bitmap) is not RenderedLabel or type(profiles) is not PrinterProfiles:
        raise PrintInputError("Processed bitmap or printer catalog is invalid.")
    profile = profiles.resolve(bitmap.label_code)
    payload = encode_ipl_bitmap(bitmap, profile)
    try:
        if transport.submit(payload) is not None:
            raise ValueError()
    except Exception:
        raise PrintSubmissionError("Submission failed or is uncertain; delivery is unconfirmed.") from None
    return PrintSubmission(bitmap, profile.profile_id, payload)
