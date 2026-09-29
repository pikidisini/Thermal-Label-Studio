import base64
import json

import pytest

import engine.barcode_generator as generator


def _spec(template: str) -> str:
    raw = json.dumps({"version": 1, "template": template}).encode()
    return base64.b64encode(raw).decode()


def _svg(kind: str, spec: str) -> str:
    return f'<svg xmlns="http://www.w3.org/2000/svg"><image x="0" y="0" width="100" height="40" data-is-barcode="true" data-barcode-type="{kind}" data-payload-spec="{spec}"/></svg>'


def test_composite_payload_is_resolved_exactly_for_barcode_and_qr(monkeypatch):
    barcode_values = []
    qr_values = []
    monkeypatch.setattr(generator, "create_barcode_svg_group", lambda code_value, **kwargs: (barcode_values.append(code_value) or generator.ET.Element("g")))
    monkeypatch.setattr(generator, "create_qr_svg_group", lambda payload, **kwargs: (qr_values.append(payload) or generator.ET.Element("g")))
    data = {"fields": {"batch": "B1", "roll": "R2"}, "codes": {}}
    generator.inject_barcodes_and_qr(_svg("code128", _spec("batch: {{batch}}|roll: {{roll}}")), data)
    generator.inject_barcodes_and_qr(_svg("qrcode", _spec("batch: {{batch}}\nroll: {{roll}}")), data)
    assert barcode_values == ["batch: B1|roll: R2"]
    assert qr_values == ["batch: B1\nroll: R2"]


def test_missing_or_malformed_spec_strict_raises_and_tolerant_removes():
    data = {"fields": {}, "codes": {}}
    with pytest.raises(ValueError):
        generator.inject_barcodes_and_qr(_svg("qrcode", _spec("{{missing}}")), data)
    tolerant = generator.inject_barcodes_and_qr(_svg("qrcode", _spec("{{missing}}")), data, fail_closed_empty_codes=True)
    assert "<image" not in tolerant
    with pytest.raises(ValueError):
        generator.inject_barcodes_and_qr(_svg("qrcode", "not-base64"), data)


def test_toolbar_shape_is_detected_and_1d_newline_is_rejected():
    svg = _svg("code128", _spec("A\nB"))
    with pytest.raises(ValueError, match="one printable line"):
        generator.inject_barcodes_and_qr(svg, {"fields": {}, "codes": {}})
