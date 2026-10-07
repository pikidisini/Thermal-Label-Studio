import hashlib

import pytest
from pydantic import ValidationError

from app.labels.layout_contract import (
    MAX_LAYOUT_SVG_BYTES,
    LayoutDraft,
    LayoutStatus,
    create_layout_version,
)


def draft(**changes) -> LayoutDraft:
    values = {
        "label_code": "roll_80x200",
        "title": "Roll 80 x 200",
        "svg": '<svg xmlns="http://www.w3.org/2000/svg"/>',
        "width_mm": 80.0,
        "height_mm": 200.0,
        "dpi": 203.2,
    }
    values.update(changes)
    return LayoutDraft(**values)


def test_version_metadata_hashes_exact_svg_and_owns_its_object_key():
    source = draft(svg='<svg xmlns="http://www.w3.org/2000/svg"><text>one</text></svg>')

    version = create_layout_version(source, version=3, status=LayoutStatus.PUBLISHED)

    assert version.model_dump() == {
        "label_code": "roll_80x200",
        "version": 3,
        "title": "Roll 80 x 200",
        "width_mm": 80.0,
        "height_mm": 200.0,
        "dpi": 203.2,
        "status": LayoutStatus.PUBLISHED,
        "svg_sha256": hashlib.sha256(source.svg.encode("utf-8")).hexdigest(),
    }
    assert version.object_key == "layouts/roll_80x200/v3/layout.svg"


@pytest.mark.parametrize("code", ["", " ", "a/b", "..", "layout.v1", "x" * 129])
def test_draft_rejects_unsafe_layout_codes(code):
    with pytest.raises(ValidationError):
        draft(label_code=code)


@pytest.mark.parametrize("title", ["", "   ", "\t"])
def test_draft_rejects_blank_title(title):
    with pytest.raises(ValidationError):
        draft(title=title)


def test_draft_rejects_svg_that_exceeds_the_byte_limit_even_when_character_count_is_smaller():
    with pytest.raises(ValidationError):
        draft(svg="é" * ((MAX_LAYOUT_SVG_BYTES // 2) + 1))


@pytest.mark.parametrize("version", [0, -1, True, "1"])
def test_server_assigned_version_must_be_a_positive_integer(version):
    with pytest.raises(ValueError):
        create_layout_version(draft(), version=version)


def test_version_metadata_is_immutable_and_does_not_retain_svg_content():
    version = create_layout_version(draft(), version=1)
    assert "svg" not in version.model_dump()
    with pytest.raises(ValidationError):
        version.title = "changed"
