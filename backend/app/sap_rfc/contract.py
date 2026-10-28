"""Prepare typed parameters and map sample responses without contacting SAP."""
from datetime import datetime
from decimal import Decimal, InvalidOperation
import json
import math
import re

class ContractError(ValueError):
    pass

class MissingInputError(ContractError):
    pass

class StatusError(ContractError):
    pass


def _parameter_string(value):
    if type(value) is not str or len(value) > 4096:
        raise ValueError()
    return value


def _parameter_integer(value):
    if type(value) is bool or not str(value).lstrip('-').isdigit():
        raise ValueError()
    integer = int(value)
    if not -(2**31) <= integer < 2**31:
        raise ValueError()
    return integer


def _parameter_decimal(value):
    if type(value) is bool:
        raise ValueError()
    number = Decimal(str(value))
    if not number.is_finite() or len(str(value)) > 128:
        raise ValueError()
    return str(number)


def _parameter_date(value):
    if type(value) is not str or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value, flags=re.ASCII):
        raise ValueError()
    return datetime.strptime(value, '%Y-%m-%d').strftime('%Y%m%d')


def _parameter_boolean(value):
    if type(value) is bool:
        return 'X' if value else ''
    if value not in ('true', 'false'):
        raise ValueError()
    return 'X' if value == 'true' else ''


def _parameter_string_list(value):
    if type(value) is str:
        value = value.splitlines()
    if type(value) is not list or not 1 <= len(value) <= 100:
        raise ValueError()
    if any(type(item) is not str or not item or len(item) > 256 for item in value):
        raise ValueError()
    return value


_PARAMETER_READERS = {
    'string': _parameter_string,
    'integer': _parameter_integer,
    'decimal': _parameter_decimal,
    'date': _parameter_date,
    'boolean': _parameter_boolean,
    'string_list': _parameter_string_list,
}


def parameter_value(parameter, value):
    if value is None or value == '':
        if parameter.required:
            raise MissingInputError('Required input is missing.')
        return None
    reader = _PARAMETER_READERS.get(parameter.kind)
    if reader is None:
        raise ContractError('Unsupported input type.')
    try:
        return reader(value)
    except (ValueError, TypeError, InvalidOperation, OverflowError):
        raise ContractError('Input does not match its configured type.') from None



def prepare(operation, values):
    allowed = {p.name for p in operation.parameters if p.source == 'operator'}
    if set(values) - allowed: raise ContractError('Unknown or constant input cannot be overridden.')
    result = {}
    for parameter in operation.parameters:
        value = parameter.constant if parameter.source == 'constant' else values.get(parameter.name)
        typed = parameter_value(parameter, value)
        if typed is not None: result[parameter.name] = typed
    return result


def at_path(value, path):
    for segment in path.split('.') if path else []:
        if type(value) is not dict or segment not in value:
            raise ContractError('A configured response field is missing.')
        value = value[segment]
    return value


def _validate_mapped_field(field, required):
    if (field is None or field == '') and required:
        raise ContractError('Required response field is null or empty.')
    if type(field) not in (str, int, float, bool, type(None)):
        raise ContractError('Label fields must be scalar values.')
    if type(field) is float and not math.isfinite(field):
        raise ContractError('Invalid number.')


def _mapped_row(operation, row):
    if type(row) is not dict:
        raise ContractError('Expected response structures.')
    item = {}
    for mapping in operation.mappings:
        try:
            field = at_path(row, mapping.source)
        except ContractError:
            if mapping.required:
                raise
            continue
        _validate_mapped_field(field, mapping.required)
        item[mapping.target] = field
    return item


def _mapped_response(operation, response):
    try:
        if len(json.dumps(response, allow_nan=False).encode('utf-8')) > 65536:
            raise ContractError('Sample response exceeds its limit.')
    except (ValueError, TypeError, RecursionError):
        raise ContractError('Invalid sample JSON response.') from None
    value = at_path(response, operation.result_path)
    rows = value if operation.result_kind == 'table' else [value]
    if type(rows) is not list or not 1 <= len(rows) <= 100:
        raise ContractError('Expected a nonempty response with at most 100 rows.')
    mapped = []
    for row in rows:
        mapped.append(_mapped_row(operation, row))
    return mapped


def _response_label_json(operation, response, limit):
    from app.label_data import decode_json, LabelDataItem
    status = at_path(response, operation.status_path)
    if type(status) is not str or status.strip() != operation.success_value:
        raise StatusError('SAP returned an unsuccessful status.')
    message = at_path(response, operation.message_path)
    if type(message) is not str or len(message) > 1024:
        raise ContractError('Invalid SAP status message.')
    raw = at_path(response, operation.json_path)
    if type(raw) is not str:
        raise ContractError('Expected JSON text in the RFC export.')
    payload = decode_json(raw.encode('utf-8'), limit=min(limit, 2 * 1024 * 1024))
    if type(payload) is not dict or set(payload) != {'label_code', 'data'}:
        raise ContractError('Expected label_code and data in the JSON payload.')
    item = LabelDataItem.model_validate({'item_id': 'SAMPLE', 'label_code': payload['label_code'], 'copies': 1, 'data': payload['data']})
    return {'rows': [item.data], 'items': [{'label_code': item.label_code, 'data': item.data}]}


def _response_direct(operation, response):
    from app.label_data.validation import fields
    value = at_path(response, operation.result_path)
    rows = value if operation.result_kind == 'table' else [value]
    if type(rows) is not list or not 1 <= len(rows) <= 100:
        raise ContractError('Expected response rows.')
    for row in rows:
        fields(row)
    return {'rows': rows}


def process_response(operation, response, *, limit=65536):
    """Preserve canonical label data; only explicit mapping mode renames fields."""
    try:
        if len(json.dumps(response, allow_nan=False).encode('utf-8')) > limit:
            raise ContractError('Sample response exceeds its limit.')
        if operation.response_mode == 'label_json':
            return _response_label_json(operation, response, limit)
        if operation.response_mode == 'direct':
            return _response_direct(operation, response)
        return {'rows': _mapped_response(operation, response)}
    except ContractError:
        raise
    except (ValueError, TypeError, RecursionError):
        raise ContractError('RFC response does not match the label data contract.') from None


def map_response(operation, response):
    return process_response(operation, response)['rows']
