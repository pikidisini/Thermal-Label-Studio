import base64
import json

from engine.renderer import inject_data, render_svg, validate_no_orphan_tokens
from engine.rasterizer import get_resvg_executable_path, png_to_1bit_monochrome, svg_to_png
from engine.printer_encoders.pdf_encoder import encode_pdf
from PIL import Image
from pypdf import PdfReader


def test_table_cell_data_placeholder_renders_value_and_keeps_unbound_literal():
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg">'
        '<g data-table-spec="eyJ2ZXJzaW9uIjoxfQ==">'
        '<text data-placeholder="batch_number">preview</text>'
        '<text>Fixed literal</text>'
        '</g></svg>'
    )
    rendered = inject_data(svg, {"fields": {"batch_number": "B-42"}, "codes": {}})
    validate_no_orphan_tokens(rendered)
    assert '<text>B-42</text>' in rendered
    assert '<text>Fixed literal</text>' in rendered
    assert 'B-42' in rendered
    assert 'data-placeholder="batch_number"' not in rendered


def test_v2_merged_table_vectors_render_without_cell_binding_or_editor_overlay(tmp_path):
    # Canonical shape emitted by exportFabricToSvg: actual visible vector lines
    # stay as ordinary SVG children, while a bounded table-state payload allows
    # the editor to restore the merged model and pose after import.
    model = {
        "version": 2, "rows": 2, "cols": 2,
        "columnWidthsMm": [30, 30], "rowHeightsMm": [12, 12],
        "regions": [
            {"rowStart": 0, "colStart": 0, "rowSpan": 1, "colSpan": 2},
            {"rowStart": 1, "colStart": 0, "rowSpan": 1, "colSpan": 1},
            {"rowStart": 1, "colStart": 1, "rowSpan": 1, "colSpan": 1},
        ],
        "horizontalEdges": [[{"color": "#000000", "widthMm": 0.5, "style": "solid"}] * 2 for _ in range(3)],
        "verticalEdges": [[{"color": "#000000", "widthMm": 0.5, "style": "solid"}] * 3 for _ in range(2)],
    }
    state = {"version": 1, "tables": [{"index": 0, "model": model, "pxPerMm": 4, "left": 10, "top": 10, "scaleX": 1, "scaleY": 1, "angle": 0, "flipX": False, "flipY": False, "opacity": 1, "id": "v2-table"}]}
    encoded_state = base64.b64encode(json.dumps(state, separators=(",", ":")).encode()).decode()
    encoded_model = base64.b64encode(json.dumps(model, separators=(",", ":")).encode()).decode()
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="80mm" viewBox="0 0 800 320">'
        f'<g transform="translate(40 40)" data-table-spec="{encoded_model}">'
        '<line x1="0" y1="0" x2="240" y2="0" stroke="#000000" stroke-width="2"/>'
        '<line x1="0" y1="48" x2="240" y2="48" stroke="#ff0000" stroke-width="1" stroke-dasharray="4 3"/>'
        '<line x1="0" y1="96" x2="240" y2="96" stroke="#000000" stroke-width="2"/>'
        '<line x1="0" y1="0" x2="0" y2="96" stroke="#000000" stroke-width="2"/>'
        '<line x1="240" y1="0" x2="240" y2="96" stroke="#000000" stroke-width="2"/>'
        '<line x1="120" y1="48" x2="120" y2="96" stroke="#000000" stroke-width="2"/>'
        '</g>'
        f'<metadata id="thermal-table-v2-state">{encoded_state}</metadata></svg>'
    )
    template = tmp_path / "table-v2.svg"
    output = tmp_path / "rendered-table-v2.svg"
    png = tmp_path / "rendered-table-v2.png"
    pdf = tmp_path / "rendered-table-v2.pdf"
    template.write_text(svg, encoding="utf-8")
    rendered = render_svg({"fields": {}, "codes": {}}, template, output)
    validate_no_orphan_tokens(rendered)
    assert 'id="thermal-table-v2-state"' in rendered
    assert encoded_state in rendered
    assert '<line x1="0" y1="48" x2="240" y2="48"' in rendered
    assert '<line x1="120" y1="48" x2="120" y2="96"' in rendered
    assert '#ff0000' in rendered and 'stroke-dasharray="4 3"' in rendered
    assert 'data-placeholder=' not in rendered
    assert 'data-editor-handle' not in rendered
    assert 'R1C1' not in rendered
    assert output.read_text(encoding="utf-8") == rendered
    svg_to_png(rendered, png, width_px=800, height_px=320, dpi=203.2, resvg_path=get_resvg_executable_path())
    assert png.is_file() and png.stat().st_size > 0
    with Image.open(png) as image:
        assert image.size == (800, 320)
        # At renderer scale, the merged cell has no vertical divider above its
        # lower row; the shared edge reappears below the merged region.
        assert image.convert("RGB").getpixel((160, 55)) == (255, 255, 255)
        assert image.convert("RGB").getpixel((160, 100)) != (255, 255, 255)
    encode_pdf(png_to_1bit_monochrome(png), pdf, dpi=203.2, width_mm=100, height_mm=40)
    reader = PdfReader(str(pdf))
    assert len(reader.pages) == 1
    assert float(reader.pages[0].mediabox.width) > 280
    assert float(reader.pages[0].mediabox.height) > 110
