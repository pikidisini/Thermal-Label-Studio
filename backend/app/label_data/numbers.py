"""Canonical binary64 number spelling shared by binding and request identity.

Callers admit finite values using the label-data contract before serialization.
This module has no template, storage, rendering or transport dependencies.
"""
from decimal import Decimal


def number_text(value: int | float) -> str:
    """Shortest binary64 decimal with ECMAScript fixed/exponent thresholds."""
    number = float(value)
    if number == 0:
        return '0'
    decimal = Decimal(repr(number))
    if 1e-6 <= abs(number) < 1e21:
        result = format(decimal, 'f')
        return result.rstrip('0').rstrip('.') if '.' in result else result
    sign = '-' if number < 0 else ''
    digits = ''.join(map(str, decimal.copy_abs().as_tuple().digits)).rstrip('0')
    exponent = decimal.copy_abs().adjusted()
    coefficient = digits[0] + ('.' + digits[1:] if len(digits) > 1 else '')
    return f'{sign}{coefficient}e{exponent:+d}'
