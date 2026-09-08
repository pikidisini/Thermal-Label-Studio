"""
JSON Contract Dotted Path Utilities and Binding Helpers.
Provides clean, decoupled utilities for path-based access, updating, and type validation
for SAP Pure Data Contract v1.1 JSON structures.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union


def get_json_value_at_path(json_data: Dict[str, Any], path: str) -> Any:
    """
    Retrieves a value from nested JSON contract dictionary using a dotted path.
    
    Examples:
        path = "fields.brand" -> returns json_data["fields"]["brand"]
        path = "codes.batch_barcode" -> returns json_data["codes"]["batch_barcode"]
        path = "source.matnr" -> returns json_data["source"]["matnr"]
    """
    if not isinstance(json_data, dict) or not path:
        return None

    # Strip optional prefix if present
    normalized_path = path.strip()
    keys = normalized_path.split(".")
    current: Any = json_data

    for key in keys:
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return None

    return current


def set_json_value_at_path(json_data: Dict[str, Any], path: str, new_value: Any) -> bool:
    """
    Updates a leaf value in a nested JSON contract dictionary using a dotted path.
    Creates intermediate dictionaries if necessary.
    
    Returns:
        True if the update was successful, False otherwise.
    """
    if not isinstance(json_data, dict) or not path:
        return False

    keys = path.strip().split(".")
    current = json_data

    for key in keys[:-1]:
        if key not in current or not isinstance(current[key], dict):
            current[key] = {}
        current = current[key]

    current[keys[-1]] = new_value
    return True


def validate_json_value_type(old_value: Any, new_value: Any) -> bool:
    """
    Validates type compatibility when editing a JSON contract value.
    Allows string conversions for numeric/string pure data fields.
    """
    if old_value is None:
        return True
    if isinstance(old_value, str):
        return True  # All string representations are acceptable for pure data contract v1.1
    if isinstance(old_value, bool):
        if isinstance(new_value, bool):
            return True
        return str(new_value).lower() in ("true", "false", "1", "0")
    if isinstance(old_value, int):
        try:
            int(str(new_value))
            return True
        except ValueError:
            return False
    if isinstance(old_value, float):
        try:
            float(str(new_value).replace(",", "."))
            return True
        except ValueError:
            return False
    return True
