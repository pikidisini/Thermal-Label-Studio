"""Static, non-scannable symbol placeholder in the authored image rectangle."""
from xml.etree import ElementTree as ET

from app.svg_safety import SVG_NS
from .text import fixed


def replace_symbol_image(owner, image, metrics):
    x, y, width, height = (float(image.get(key, '0')) for key in ('x', 'y', 'width', 'height'))
    # Keep the image's own transform/presentation as well as its owner hierarchy.
    group = ET.Element(f'{{{SVG_NS}}}g', {
        key: value for key, value in image.attrib.items()
        if key not in {'x', 'y', 'width', 'height', 'href',
                       '{http://www.w3.org/1999/xlink}href', 'preserveAspectRatio'}
    })
    stroke = min(width, height) / 100
    ET.SubElement(group, f'{{{SVG_NS}}}rect', {
        'x': fixed(x + stroke / 2), 'y': fixed(y + stroke / 2),
        'width': fixed(width - stroke), 'height': fixed(height - stroke),
        'style': f'fill:white;stroke:black;stroke-width:{fixed(stroke)};fill-opacity:1;stroke-opacity:1',
    })
    _, advances, _ = metrics.advances(' N/A ', 1, 'normal', 'normal')
    size = min(height * .4, width * .8 / sum(advances))
    label = ET.SubElement(group, f'{{{SVG_NS}}}text', {
        'x': fixed(x + width / 2), 'y': fixed(y + height / 2),
        'style': f'fill:black;stroke:none;font-family:{metrics.profile.family};font-size:{fixed(size)};font-weight:normal;font-style:normal;letter-spacing:0;text-anchor:middle;dominant-baseline:central;fill-opacity:1',
    })
    label.text = ' N/A '
    owner.remove(image)
    owner.append(group)
