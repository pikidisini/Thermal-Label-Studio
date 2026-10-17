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

@pytest.mark.parametrize('attribute', ['style', 'fill', 'stroke', 'clip-path', 'filter', 'mask', 'cursor', 'marker-start'])
@pytest.mark.parametrize('value', [r'u\72l(https://example.invalid/a)', 'u/**/rl(https://example.invalid/a)', 'url(https://example.invalid/a)/*hidden*/', 'u&#x7f;rl(https://example.invalid/a)'])
def test_css_obfuscated_resource_syntax_rejects_without_fetch(attribute, value):
    value = 'fill:' + value if attribute == 'style' else value
    svg = f'<svg xmlns="http://www.w3.org/2000/svg"><rect {attribute}="{value}"/></svg>'
    with pytest.raises(ValueError, match='unsafe_svg'):
        validate_safe_svg(svg)


def test_css_subset_retains_local_references_and_authored_literal_backslashes():
    svg = r'<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="G"/></defs><rect style="fill:url(#G);stroke:rgb(0,0,0)"/><text data-note="literal\72">literal\72</text></svg>'
    result = validate_safe_svg(svg)
    assert 'fill:url(#G)' in result
    assert r'literal\72' in result
