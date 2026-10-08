from xml.etree import ElementTree as ET

import pytest

from app.svg_safety import validate_safe_svg


@pytest.mark.parametrize("prefix", ["xlink", "ns1", "stored"])
def test_image_xlink_source_survives_canonicalization_with_fabric_prefix(prefix):
    source = f'''<svg xmlns="http://www.w3.org/2000/svg"
        xmlns:{prefix}="http://www.w3.org/1999/xlink">
        <image width="162" height="44" {prefix}:href="data:image/png;base64,AAAA"/>
        </svg>'''
    result = validate_safe_svg(source)
    assert 'xlink:href="data:image/png;base64,AAAA"' in result
    image = next(iter(ET.fromstring(result)))
    assert image.attrib["{http://www.w3.org/1999/xlink}href"] == "data:image/png;base64,AAAA"
    assert validate_safe_svg(result) == result


@pytest.mark.parametrize("href", ["https://example.com/image.png", "javascript:alert(1)"])
def test_namespace_normalization_does_not_allow_external_or_executable_images(href):
    source = f'''<svg xmlns="http://www.w3.org/2000/svg"
        xmlns:ns1="http://www.w3.org/1999/xlink"><image ns1:href="{href}"/></svg>'''
    with pytest.raises(ValueError, match="unsafe_svg"):
        validate_safe_svg(source)
