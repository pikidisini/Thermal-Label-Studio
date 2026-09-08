"""
Pure Data Injection Renderer for SVG Label Templates.

Follows Pure Data Contract v1.1:
- Replaces {{field_name}} and {{code_name}} placeholders with literal strings from JSON.
- Fails fast (raises OrphanTokenError) if any unreplaced {{...}} tokens remain.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Set, Union


class RendererError(Exception):
    """Base exception for all renderer errors."""
    pass


class MissingContractFieldError(RendererError):
    """Raised when JSON data violates the v1.1 pure data contract structure."""
    pass


class OrphanTokenError(RendererError):
    """Raised when unreplaced {{...}} placeholders remain in rendered SVG."""

    def __init__(self, orphan_tokens: List[str], message: str | None = None):
        self.orphan_tokens = orphan_tokens
        if message is None:
            message = f"Orphan placeholder tokens found after injection: {orphan_tokens}"
        super().__init__(message)


# Regex pattern to identify double curly-brace placeholders, e.g., {{brand}} or {{ batch_text }}
PLACEHOLDER_PATTERN = re.compile(r"\{\{\s*([a-zA-Z0-9_\-]+)\s*\}\}")


def load_json_contract(source: Union[str, Path, dict]) -> Dict[str, Any]:
    """
    Loads and validates the basic structure of a v1.1 Pure Data Contract JSON.
    
    Accepts a filepath (str/Path) or an already parsed dictionary.
    """
    if isinstance(source, dict):
        data = source
    else:
        path = Path(source)
        if not path.is_file():
            raise FileNotFoundError(f"JSON contract file not found: {path.resolve()}")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

    # Basic structural contract verification
    if not isinstance(data, dict):
        raise MissingContractFieldError("JSON root must be an object.")

    if "fields" not in data or not isinstance(data["fields"], dict):
        raise MissingContractFieldError("JSON must contain a 'fields' dictionary.")

    if "codes" not in data or not isinstance(data["codes"], dict):
        raise MissingContractFieldError("JSON must contain a 'codes' dictionary.")

    return data


def load_svg_template(source: Union[str, Path]) -> str:
    """Reads SVG template file content as string."""
    path = Path(source)
    if not path.is_file():
        raise FileNotFoundError(f"SVG template file not found: {path.resolve()}")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def build_replacement_map(contract_data: Dict[str, Any]) -> Dict[str, str]:
    """
    Builds a unified key-value map from contract 'fields' and 'codes'.
    All values are coerced to string.
    """
    replacements: Dict[str, str] = {}

    # Merge fields
    for k, v in contract_data.get("fields", {}).items():
        replacements[str(k)] = "" if v is None else str(v)

    # Merge codes (codes take precedence or extend)
    for k, v in contract_data.get("codes", {}).items():
        replacements[str(k)] = "" if v is None else str(v)

    return replacements


def inject_data(svg_content: str, contract_data: Dict[str, Any]) -> str:
    """
    Replaces matching {{token}} in the SVG string with values from contract_data.
    Does NOT fail yet on missing keys; validate_no_orphan_tokens handles fail-fast.
    """
    replacements = build_replacement_map(contract_data)

    def _replace_match(match: re.Match) -> str:
        token_name = match.group(1)
        if token_name in replacements:
            val = replacements[token_name]
            # Escape XML entities if necessary (&, <, >) to avoid corrupting SVG XML
            # but preserve already legal quotes if any
            escaped = (
                val.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
            )
            return escaped
        # If token is not in replacements, leave it unchanged for fail-fast checker
        return match.group(0)

    return PLACEHOLDER_PATTERN.sub(_replace_match, svg_content)


def validate_no_orphan_tokens(svg_content: str) -> None:
    """
    Scans the SVG string for any remaining {{...}} tokens.
    Raises OrphanTokenError if any are found.
    """
    matches = PLACEHOLDER_PATTERN.findall(svg_content)
    if matches:
        # Deduplicate while preserving order
        unique_orphans: List[str] = list(dict.fromkeys(matches))
        raise OrphanTokenError(unique_orphans)


def render_svg(
    json_source: Union[str, Path, dict],
    template_source: Union[str, Path],
    output_path: Union[str, Path, None] = None,
) -> str:
    """
    Complete pure data injection pipeline:
    1. Load & validate JSON contract
    2. Load SVG template
    3. Inject data into placeholders
    4. Fail-fast check for orphan tokens
    5. Optionally save result to output_path
    6. Returns the rendered SVG string
    """
    data = load_json_contract(json_source)
    svg_template = load_svg_template(template_source)

    rendered_svg = inject_data(svg_template, data)
    validate_no_orphan_tokens(rendered_svg)

    if output_path is not None:
        out_p = Path(output_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        with open(out_p, "w", encoding="utf-8") as f:
            f.write(rendered_svg)

    return rendered_svg
