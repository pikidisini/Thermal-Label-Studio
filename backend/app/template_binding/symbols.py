"""Bounded black/white symbol assets, independently of final label rendering."""
from dataclasses import dataclass
import base64
import hashlib
import io
import math
from PIL import Image, ImageDraw
from . import barcode, qr
from .composition import BindingError


@dataclass(frozen=True)
class SymbolEvidence:
    element_index: int
    kind: str
    payload_sha256: str
    modules_sha256: str
    width_px: int
    height_px: int
    qr_version: int | None
    mask: int | None


@dataclass(frozen=True)
class SymbolPlan:
    evidence: SymbolEvidence
    rows: tuple[str, ...]
    scale: float
    margin: float


def plan(spec, value):
    options=dict(spec.options)
    if spec.kind=='qrcode':
        matrix,version,mask=qr.matrix(value,options)
        rows=tuple(''.join(map(str,row)) for row in matrix)
        total=len(rows)+2
        scale=options['size']/total if options['size']>=total else 4
        width=height=math.floor(total*scale)
        margin=scale
    else:
        bits=barcode.modules(spec.kind,value)
        if not float(options['module_width']).is_integer() or not float(options['bar_height']).is_integer():
            raise BindingError('unsupported_feature')
        scale=int(options['module_width'])
        margin=2
        width=len(bits)*scale+4
        height=int(options['bar_height'])+4
        if spec.kind=='ean13':height+=min(12,scale*10)//2+2
        rows=(bits,)
        version=mask=None
    if max(width,height)>4096 or width*height>4_000_000:
        raise BindingError('resource_limit')
    evidence=SymbolEvidence(spec.element_index,spec.kind,hashlib.sha256(value.encode('utf-8')).hexdigest(),hashlib.sha256('\n'.join(rows).encode('ascii')).hexdigest(),width,height,version,mask)
    return SymbolPlan(evidence,rows,scale,margin)


def image(plan):
    e=plan.evidence
    output=Image.new('RGBA',(e.width_px,e.height_px),'white')
    if e.kind == 'qrcode':
        draw_qr(output, plan)
    else:
        draw_barcode(output, plan)
    return output


def data_url(plan):
    buffer=io.BytesIO()
    image(plan).save(buffer,format='PNG',compress_level=6)
    return 'data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode('ascii')

def draw_qr(output, plan):
    e = plan.evidence
    # Match npm qrcode's sample-at-floor pixel mapping exactly, including
    # fractional sizes and the explicit four-pixel minimum-scale behavior.
    pixels=output.load()
    for y in range(e.height_px):
        if not plan.margin<=y<e.height_px-plan.margin:continue
        row=math.floor((y-plan.margin)/plan.scale)
        for x in range(e.width_px):
            if plan.margin<=x<e.width_px-plan.margin:
                col=math.floor((x-plan.margin)/plan.scale)
                if plan.rows[row][col]=='1':pixels[x,y]=(0,0,0,255)


def draw_barcode(output, plan):
    e = plan.evidence
    draw=ImageDraw.Draw(output)
    for i,bit in enumerate(plan.rows[0]):
        if bit=='1':
            x=2+i*int(plan.scale)
            bottom=e.height_px-3
            if e.kind=='ean13' and not (i<3 or 45<=i<50 or i>=92):
                bottom-=min(12,int(plan.scale)*10)//2+2
            draw.rectangle((x,2,x+int(plan.scale)-1,bottom),fill='black')
