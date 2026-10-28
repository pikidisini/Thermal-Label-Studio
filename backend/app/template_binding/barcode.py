"""Printable Studio linear symbols; exact JsBarcode 3.12.3 code-set policy.

The auto-selection policy is adapted from JsBarcode (MIT, Johan Lindell).
Standard module tables and EAN encoding are provided by python-barcode.
See docs/SYMBOL_GENERATOR_NOTICES.md for attribution and reproduction.
"""
import re
from barcode import EAN13
from barcode.charsets import code128, code39
from .composition import BindingError


def validate_payload(kind, value):
    if not value or len(value) > 512:
        raise BindingError('invalid_symbol_payload')
    if kind == 'code128' and not re.fullmatch(r'[\x20-\x7e]+', value):
        raise BindingError('invalid_symbol_payload')
    if kind == 'code39' and not re.fullmatch(r'[0-9A-Z $%+\-./]+', value):
        raise BindingError('invalid_symbol_payload')
    if kind == 'ean13':
        if not re.fullmatch(r'\d{13}', value, flags=re.ASCII):
            raise BindingError('invalid_symbol_payload')
        check = (10-sum(int(d)*(3 if i%2 else 1) for i,d in enumerate(value[:12]))%10)%10
        if int(value[-1]) != check:
            raise BindingError('invalid_symbol_payload')
    if kind not in ('code128', 'code39', 'ean13'):
        raise BindingError('unsupported_feature')


def _longest_a(value):
    return len(re.match(r'[\x20-\x5f]*', value)[0])


def _pairs(value):
    return len(re.match(r'(?:\d{2})*', value, flags=re.ASCII)[0])


def _code_c(rest, result):
    count = _pairs(rest)
    result.extend(int(rest[i:i+2]) for i in range(0, count, 2))
    rest = rest[count:]
    if not rest:
        return rest, 'C'
    mode = 'A' if _longest_a(rest) >= len(rest) else 'B'
    result.append(101 if mode == 'A' else 100)
    return rest, mode


def _code_ab(rest, mode, result):
    ranges = r'[\x20-\x5f]' if mode == 'A' else r'[\x20-\x7e]'
    match = re.match(r'^(' + ranges + r'+?)((?:[0-9]{2}){2,})([^0-9]|$)', rest)
    if match:
        prefix = match[1]
        result.extend(ord(c)-32 for c in prefix)
        result.append(99)
        return rest[len(prefix):], 'C'
    prefix = re.match(ranges + '+', rest)[0]
    result.extend(ord(c)-32 for c in prefix)
    rest = rest[len(prefix):]
    if rest:
        mode = 'B'  # Remaining printable characters exceed set A.
        result.append(100)
    return rest, mode


def _auto_codes(value):
    # Printable input never needs a control-code SHIFT. Match Studio's
    # preference for C at an initial digit pair and AB's four-digit switch.
    mode = 'C' if _pairs(value) >= 2 else 'B'
    result = [{'A': 103, 'B': 104, 'C': 105}[mode]]
    rest = value
    while rest:
        if mode == 'C':
            rest, mode = _code_c(rest, result)
        else:
            rest, mode = _code_ab(rest, mode, result)
    return result


def modules(kind, value):
    validate_payload(kind,value)
    if kind == 'code128':
        codes = _auto_codes(value)
        check = (codes[0]+sum(i*code for i,code in enumerate(codes[1:],1)))%103
        return ''.join(code128.CODES[c] for c in codes+[check])+code128.STOP+'11'
    if kind == 'code39':
        # JsBarcode's star has a trailing gap. Its last star also includes
        # this gap; python-barcode's native writer omits the final gap.
        star = code39.EDGE+'0'
        return star+''.join(code39.MAP[c][1]+'0' for c in value)+star
    return EAN13(value).build()[0]
