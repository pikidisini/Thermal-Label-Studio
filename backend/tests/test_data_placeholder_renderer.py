import pytest

from engine.renderer import OrphanTokenError, inject_data, validate_no_orphan_tokens


def test_data_placeholder_escapes_xml_and_preserves_tspan_layout():
    svg = '<svg><text x="10" data-placeholder="name"><tspan dy="0">Literal</tspan><tspan dy="12">Old</tspan></text></svg>'
    rendered = inject_data(svg, {"fields": {"name": "A&B <x>"}, "codes": {}})
    assert 'data-placeholder=' not in rendered
    assert '<tspan dy="0">A&amp;B &lt;x&gt;</tspan>' in rendered
    assert '<tspan dy="12"></tspan>' in rendered
    validate_no_orphan_tokens(rendered)


def test_missing_data_placeholder_fails_closed():
    svg = '<svg><text data-placeholder="missing">Visible fallback</text></svg>'
    rendered = inject_data(svg, {"fields": {}, "codes": {}})
    with pytest.raises(OrphanTokenError) as exc:
        validate_no_orphan_tokens(rendered)
    assert exc.value.orphan_tokens == ["missing"]


def test_null_data_placeholder_renders_empty_and_legacy_token_still_works():
    svg = '<svg><text data-placeholder="empty">Literal</text><text>{{legacy}}</text></svg>'
    rendered = inject_data(svg, {"fields": {"empty": None, "legacy": "old-compatible"}, "codes": {}})
    assert '<text></text>' in rendered
    assert 'old-compatible' in rendered
    validate_no_orphan_tokens(rendered)
