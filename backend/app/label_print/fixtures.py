"""Fixed, application-owned synthetic inputs, never an operational fallback."""
import base64
import json
from types import MappingProxyType

LABEL_CODE = 'FIXTURE_ROLL'
TEMPLATE_VERSION = 'fixture-ipl-v1'
TEXT_SPEC = base64.b64encode(json.dumps({
    'version': 1, 'font_size': 18, 'line_height': 1.2, 'text_align': 'left',
}).encode()).decode()
TEMPLATE = f'''<svg xmlns="http://www.w3.org/2000/svg" data-binding-version="1"
 width="80mm" height="60mm" viewBox="0 0 320 240">
 <text x="12" y="28" font-family="Arial" font-size="16">FIXTURE - NOT SAP</text>
 <text x="12" y="65" font-family="Arial" font-size="12">BATCH</text>
 <text x="12" y="92" font-family="Arial" font-size="18" data-field="BATCH"
 data-text-spec="{TEXT_SPEC}">BATCH</text>
 <text x="12" y="128" font-family="Arial" font-size="12">MATERIAL</text>
 <text x="12" y="155" font-family="Arial" font-size="18" data-field="MATERIAL"
 data-text-spec="{TEXT_SPEC}">MATERIAL</text>
 <text x="12" y="205" font-family="Arial" font-size="12">FIXTURE_ROLL / fixture-ipl-v1</text>
 </svg>'''
BATCHES = MappingProxyType({
    '0010245801': 'DEMO FILM A',
    '0010245802': 'DEMO FILM B',
    '0010245803': 'DEMO FILM C',
    '0010245804': 'DEMO FILM D',
})
