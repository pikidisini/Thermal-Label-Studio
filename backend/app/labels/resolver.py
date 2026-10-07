"""Pure in-memory layout registry containing the Phase 7A fixture."""

from dataclasses import dataclass
from typing import Mapping, Protocol


@dataclass(frozen=True)
class LayoutDefinition:
    label_code: str
    version: str
    svg: str | None = None
    width_mm: float | None = None
    height_mm: float | None = None
    dpi: float | None = None
    required_facts: tuple[str, ...] = ()


class UnknownLabelCodeError(Exception):
    """Raised when no active application-owned layout matches a label code."""


class LayoutSource(Protocol):
    """The lookup consumed by acceptance, rendering, and simulation services."""

    def resolve(self, label_code: str) -> LayoutDefinition: ...


class LayoutRegistry:
    """Immutable layout lookup with no storage or network dependency.

    The active acceptance fixture contains identity only. Rendering callers can
    inject a definition with SVG and media; no storage access occurs here.
    """

    def __init__(self, layouts: Mapping[str, LayoutDefinition] | None = None) -> None:
        self._layouts = dict(layouts or {})

    def resolve(self, label_code: str) -> LayoutDefinition:
        layout = self._layouts.get(label_code)
        if layout is None:
            raise UnknownLabelCodeError(label_code)
        return layout


ACTIVE_LAYOUTS = LayoutRegistry(
    {"roll_80x200": LayoutDefinition(label_code="roll_80x200", version="fixture-v1")}
)
