"""Immutable output shared by simulation and print sinks."""
from dataclasses import dataclass
from app.engine.bitmap import RenderedLabel

@dataclass(frozen=True)
class PreparedOutput:
    bitmap: RenderedLabel
    payload: bytes
    language: str
    copies: int = 1
