"""Bounded Fabric7 uniform-text layout using a trusted server font profile."""
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import math
import re
import unicodedata
from xml.etree import ElementTree as ET

from fontTools.ttLib import TTFont, TTLibError
from fontTools.unicodedata import script
import regex

from app.svg_safety import SVG_NS
from .composition import BindingError
from .models import BindingSpec


@dataclass(frozen=True)
class FontProfile:
    path: Path
    family: str


class TextMetrics:
    """No font names/paths from the document are opened; no fallback/font fetch."""
    def __init__(self, profile: FontProfile):
        self.profile = profile

    @lru_cache(maxsize=4)
    def font(self, weight: str, style: str):
        bold = weight in ('bold', '700')
        italic = style in ('italic', 'oblique')
        if weight not in ('normal', '400', 'bold', '700') or style not in ('normal', 'italic', 'oblique'):
            raise BindingError('unsupported_feature')
        path = self.profile.path
        if bold or italic:
            if path.name.lower() == 'arial.ttf':
                name = 'arialbi.ttf' if bold and italic else 'arialbd.ttf' if bold else 'ariali.ttf'
            elif path.name == 'LiberationSans-Regular.ttf':
                name = 'LiberationSans-BoldItalic.ttf' if bold and italic else 'LiberationSans-Bold.ttf' if bold else 'LiberationSans-Italic.ttf'
            else:
                raise BindingError('unsupported_feature')
            path = path.with_name(name)
        try:
            with TTFont(path, lazy=False) as font:
                family = font['name'].getDebugName(1)
                if family != self.profile.family:
                    raise BindingError('unsupported_feature')
                kern = {}
                if 'kern' in font:
                    for table in font['kern'].kernTables:
                        if table.format == 0 and table.coverage & 1:
                            kern.update(table.kernTable)
                return font.getBestCmap(), dict(font['hmtx'].metrics), kern, font['head'].unitsPerEm
        except (OSError, ValueError, TTLibError):
            raise BindingError('unsupported_feature') from None

    def advances(self, line: str, size: float, weight: str, style: str):
        cmap, hmtx, kern, units = self.font(weight, style)
        graphemes = regex.findall(r'\X', line)
        widths, kerned = [], []
        previous_glyph = None
        for grapheme in graphemes:
            glyphs = []
            # Measure a canonically equivalent single glyph when available,
            # while preserving the original Unicode text in the SVG.
            for character in unicodedata.normalize('NFC', grapheme):
                if unicodedata.category(character).startswith('M'):
                    raise BindingError('unsupported_feature')
                if script(character) not in ('Latn', 'Grek', 'Cyrl', 'Zyyy', 'Zinh') or ord(character) not in cmap:
                    raise BindingError('unsupported_feature')
                glyphs.append(cmap[ord(character)])
            width_units = sum(hmtx[glyph][0] for glyph in glyphs) + sum(kern.get(pair, 0) for pair in zip(glyphs, glyphs[1:]))
            width = width_units * size / units
            advance = width + (kern.get((previous_glyph,glyphs[0]),0)*size/units if previous_glyph else 0)
            widths.append(width)
            kerned.append(advance)
            previous_glyph = glyphs[-1]
        return graphemes, widths, kerned


def presentation(node, parents, name, default):
    current = node
    while current is not None:
        style = dict(tuple(map(str.strip, part.split(':', 1))) for part in current.get('style', '').split(';') if part.strip())
        if name in style:
            return style[name]
        if current.get(name) is not None:
            return current.get(name)
        current = parents.get(current)
    return default


def fixed(value):
    if not math.isfinite(value) or abs(value) > 1_000_000:
        raise BindingError('resource_limit')
    return format(value, '.4f').rstrip('0').rstrip('.') or '0'


def bind_text(node: ET.Element, spec: BindingSpec, value: str, *, fabric: bool, parents: dict, metrics: TextMetrics):
    options = dict(spec.options)
    size, line_height, align = options['font_size'], options['line_height'], options['text_align']
    family = presentation(node, parents, 'font-family', metrics.profile.family).strip("'\"")
    if family != metrics.profile.family:
        raise BindingError('unsupported_feature')
    weight = presentation(node, parents, 'font-weight', 'normal')
    style = presentation(node, parents, 'font-style', 'normal')
    anchor = presentation(node, parents, 'text-anchor', 'start')
    if fabric and anchor != 'start' or not fabric and anchor != {'left':'start','center':'middle','right':'end'}[align]:
        raise BindingError('unsupported_feature')
    for prop in ('letter-spacing', 'dominant-baseline'):
        if presentation(node, parents, prop, 'normal') not in ('normal', '0'):
            raise BindingError('unsupported_feature')
    span_styles = set()
    for child in node:
        if set(child.attrib) - {'x', 'y', 'style', '{http://www.w3.org/XML/1998/namespace}space'}:
            raise BindingError('unsupported_feature')
        # Fabric emits white-space only on whitespace fragments, even in
        # otherwise uniform text; it is not a rich-text style difference.
        declarations = [part.strip() for part in child.get('style', '').split(';') if part.strip() and part.strip() != 'white-space: pre']
        span_styles.add('; '.join(declarations))
    if len(span_styles) > 1:
        raise BindingError('unsupported_feature')
    span_style = next(iter(span_styles), '')
    lines = re.split(r'\r?\n', value)
    if any('\r' in line for line in lines):
        raise BindingError('unsupported_feature')
    spacing = spec.layout.char_spacing * size / 1000 if spec.layout else 0
    measured = [metrics.advances(line, size, weight, style) for line in lines]
    widths = [max(0, sum(advances) + max(0, len(graphemes)-1)*spacing) for graphemes, _, advances in measured]
    width = max(2, max(widths))
    height = size * 1.13 * (1 + (len(lines)-1)*line_height)
    fixed(width); fixed(height)
    if fabric:
        if node.get('x') is not None or node.get('y') is not None or node.get('text-anchor') not in (None, 'start'):
            raise BindingError('unsupported_feature')
        x, y = -width / 2, -height / 2 + size * 1.13 * (1 - .222)
        if spec.layout:
            dw, dh = width-spec.layout.width, height-spec.layout.height
            dx = spec.layout.advance_width[0]*dw + spec.layout.advance_height[0]*dh
            dy = spec.layout.advance_width[1]*dw + spec.layout.advance_height[1]*dh
            if dx or dy:
                node.set('transform', node.get('transform', '') + f' translate({fixed(dx)} {fixed(dy)})')
    else:
        first = next(iter(node), None)
        x = float(node.get('x', first.get('x', '0') if first is not None else '0'))
        y = float(node.get('y', first.get('y', '0') if first is not None else '0'))
    for child in list(node):
        node.remove(child)
    node.text = None
    node.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    for index, (line, line_width, (graphemes, char_widths, advances)) in enumerate(zip(lines, widths, measured)):
        left = x + ((width-line_width)/2 if align == 'center' else width-line_width if align == 'right' else 0) if fabric else x
        top = y + index * size * 1.13 * line_height
        fragments = graphemes if spacing else [line]
        for char_index, fragment in enumerate(fragments):
            # Fabric emits no tspan for an empty line, but that line still
            # contributes to vertical layout and subsequent baselines.
            if not fragment:
                continue
            offset = advances[char_index] - char_widths[char_index] if spacing else 0
            span = ET.SubElement(node, f'{{{SVG_NS}}}tspan', {'x': fixed(left+offset), 'y': fixed(top)})
            if span_style:
                span.set('style', span_style)
            if not fabric:
                span.set('text-anchor', {'left': 'start', 'center': 'middle', 'right': 'end'}[align])
            span.text = fragment
            if spacing:
                left += advances[char_index] + spacing
