from io import BytesIO
from pathlib import Path

from PIL import Image
import pytest

from app.protocols.ipl.errors import IplError
from app.protocols.ipl.decoder import decode_png
from app.protocols.ipl.encoder import encode_png


def source(width, height, color=255, dpi=203.2):
    stream = BytesIO()
    image = Image.new("1", (width, height), color)
    image.save(stream, format="PNG", dpi=(dpi, dpi))
    return stream.getvalue()


@pytest.mark.parametrize("color", [0, 255])
def test_solid_nonmultiple_six_height_has_white_padding(color):
    png = source(3, 7, color)
    payload = encode_png(png, 3, 7, 203.2)
    assert (b"<DEL>" in payload) == (color == 0)
    with Image.open(BytesIO(decode_png(payload, 3, 7, 203.2))) as decoded:
        assert decoded.tobytes() == Image.open(BytesIO(png)).tobytes()


def test_physical_sample_decodes_independently_with_origin():
    path = Path(__file__).parents[2] / "docs/print_guide/IPL/examples/bitmap-readable.ipl"
    payload = path.read_bytes()
    with Image.open(BytesIO(decode_png(payload, 240, 200, 203.2))) as decoded:
        assert decoded.getpixel((0, 0)) == 255
        assert decoded.getpixel((40, 40)) == 0
        assert decoded.getpixel((199, 135)) == 0
        # Compare all physical-sample pixels against the preserved preview.
        with Image.open(path.with_name("bitmap-preview-4x.png")) as preview:
            expected = preview.convert("1").resize((160, 96), Image.Resampling.NEAREST)
            assert decoded.crop((40, 40, 200, 136)).tobytes() == expected.tobytes()


def test_origin_scale_and_white_background():
    payload = encode_png(source(2, 2, 0), 2, 2, 203.2)
    payload = payload.replace(b"o0,0;f0;c64;h1;w1;", b"o3,4;f0;c64;h2;w3;")
    with Image.open(BytesIO(decode_png(payload, 12, 12, 203.2))) as image:
        assert image.getpixel((3, 4)) == 0 and image.getpixel((8, 7)) == 0
        assert image.getpixel((2, 4)) == 255 and image.getpixel((9, 7)) == 255


@pytest.mark.parametrize("before,after", [
    (b"<ESC>C", b"<ESC>c"), (b"x2;", b"x800;"),
    (b"u0,C;", b"u1,C;"), (b"u0,C;", b"u0,;"),
    (b"u0,C;", b"u0,<DEL>;"), (b"u0,C;", b"u0,\x7f;"),
    (b"c64;", b"c63;"), (b"f0;", b"f1;"),
    (b"h1;", b"h0;"), (b"w1;", b"w11;"), (b"o0,0;", b"o1,0;"),
    (b"<RS>1", b"<RS>0"), (b"<US>1", b"<US>2"),
    (b"E90;F90,TLS;", b"E0;F0,TLS;"),
    (b"G64,TLS;", b"G64,123;"), (b"G64,TLS;", b"G64,TOOLONGXX;"),
    (b"<ESC>E90", b"<ESC>E89"), (b"<ETB><ETX>", b"<ETB>"),
])
def test_malformed_or_unsupported_payload_fails_closed(before, after):
    payload = encode_png(source(2, 2, 0), 2, 2, 203.2)
    assert before in payload
    with pytest.raises(IplError):
        decode_png(payload.replace(before, after), 2, 2, 203.2)


@pytest.mark.parametrize("suffix", [b"junk", b"<STX><ETB><ETX>", b"\x00"])
def test_trailing_data_or_duplicate_print_rejected(suffix):
    with pytest.raises(IplError):
        decode_png(encode_png(source(2, 2), 2, 2, 203.2) + suffix, 2, 2, 203.2)


def test_tiling_crosses_both_axes_and_preserves_arbitrary_editor_dpi():
    image = Image.new("1", (801, 801), 255)
    for pixel in [(0, 0), (798, 798), (799, 799), (800, 1), (1, 800)]:
        image.putpixel(pixel, 0)
    stream = BytesIO()
    image.save(stream, format="PNG", dpi=(144, 144))
    payload = encode_png(stream.getvalue(), 801, 801, 144)
    assert payload.count(b"<STX>G") == 4
    assert b"o799,799;" in payload
    with Image.open(BytesIO(decode_png(payload, 801, 801, 144))) as decoded:
        assert decoded.tobytes() == image.tobytes()



@pytest.mark.parametrize("copies", [1, 3, 999])
def test_quantity_is_native_rs_command_without_duplicate_canvas_or_print(copies):
    png = source(3, 7, 0)
    payload = encode_png(png, 3, 7, 203.2, copies=copies)
    assert payload.count(b"<STX><RS>") == payload.count(b"<STX><ETB>") == 1
    assert f"<RS>{copies}".encode() in payload and b"<US>1" in payload
    baseline = encode_png(png, 3, 7, 203.2)
    assert payload.replace(f"<RS>{copies}".encode(), b"<RS>1") == baseline
    with Image.open(BytesIO(decode_png(payload, 3, 7, 203.2))) as decoded:
        assert decoded.size == (3, 7) and decoded.tobytes() == Image.open(BytesIO(png)).tobytes()

@pytest.mark.parametrize("copies", [0, -1, 1000, True, 1.5, "3", None])
def test_encoder_rejects_invalid_quantity(copies):
    with pytest.raises(IplError): encode_png(source(2, 2), 2, 2, 203.2, copies=copies)

@pytest.mark.parametrize("quantity", [b"0", b"1000", b"-1", b"1.5", b"01", b""])
def test_decoder_rejects_invalid_quantity(quantity):
    payload = encode_png(source(2, 2), 2, 2, 203.2).replace(b"<RS>1", b"<RS>" + quantity)
    with pytest.raises(IplError): decode_png(payload, 2, 2, 203.2)
