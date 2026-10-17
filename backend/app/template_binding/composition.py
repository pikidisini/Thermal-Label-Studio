"""Exact scalar/composition resolution, without preview values or side effects."""
import re

from app.label_data.numbers import number_text
from app.label_data.validation import fields, text, reserved_size, MAX_BYTES, LabelDataError
from .metadata import TOKEN, composition


class BindingError(ValueError):
    stage = 'BINDING'

    def __init__(self, code: str):
        self.code = code
        super().__init__('Template binding failed.')


def validate_data(data: dict) -> None:
    try:
        fields(data)
    except LabelDataError:
        raise BindingError('invalid_binding') from None
    if reserved_size(data) > MAX_BYTES:
        raise BindingError('resource_limit')


def scalar(data: dict, key: str) -> str:
    if key not in data:
        return 'N/A'
    value = data[key]
    if value is None or type(value) is str and value == '':
        return ' - '
    if type(value) is bool:
        return 'true' if value else 'false'
    if type(value) in (int, float):
        return number_text(value)
    return value


def unavailable(data: dict, key: str) -> bool:
    """Inspect source facts before substitution; 0/false/spaces remain content."""
    return key not in data or data[key] is None or type(data[key]) is str and data[key] == ''


def resolve_composition(template: str, data: dict, *, text_output: bool = True) -> str:
    validate_data(data)
    # Validate grammar first; no replacement result can become executable syntax.
    composition(template)
    result = TOKEN.sub(lambda match: scalar(data, match[1]), template)
    if text_output:
        validate_resolved_text(result)
    else:
        try:
            text(result)
        except LabelDataError:
            raise BindingError('resource_limit') from None
    return result


def validate_resolved_text(value: str) -> None:
    try:
        text(value)
    except LabelDataError:
        raise BindingError('resource_limit') from None
    # XML 1.0 cannot represent these characters, even through numeric entities.
    if any(ord(c) < 32 and c not in '\t\r\n' or ord(c) in (0xfffe, 0xffff) for c in value):
        raise BindingError('invalid_binding')
    if len(re.split(r'\r?\n', value)) > 100:
        raise BindingError('resource_limit')
