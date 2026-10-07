"""Pure validation boundary; binding, rendering, and transport are not invoked."""

from .models import LabelProcessAccepted, LabelProcessRequest
from .resolver import LayoutDefinition, LayoutSource


class InvalidLabelCodeError(ValueError):
    """Raised if a caller bypasses the request model with a blank label code."""


def validate_label_process_request(
    request: LabelProcessRequest, registry: LayoutSource
) -> LayoutDefinition:
    """Validate a request and resolve its layout before any future processing.

    The wire model rejects blank label codes, and this guard preserves the same
    fail-closed rule for direct service callers. Resolution is intentionally the
    last operation in this foundation. This function does not bind, render,
    encode, persist, or send output.
    """
    if not request.label_code.strip():
        raise InvalidLabelCodeError(request.label_code)
    return registry.resolve(request.label_code)


def accept_label_process_request(
    request: LabelProcessRequest, registry: LayoutSource
) -> LabelProcessAccepted:
    """Accept a resolved fixture request without processing or delivering output."""
    layout = validate_label_process_request(request, registry)
    return LabelProcessAccepted(
        label_code=layout.label_code,
        layout_version=layout.version,
        mode=request.mode,
        item_count=len(request.items),
    )
