"""QR matrices with npm qrcode 1.5.4 segmentation and mask decisions.

Policy adapted from node-qrcode (MIT, Ryan Day and contributors).
qrcode 8.2 supplies standard bit packing, Reed-Solomon and matrix placement.
See docs/SYMBOL_GENERATOR_NOTICES.md.
"""
import heapq
import itertools
import math
import re
import qrcode
from qrcode import util, exceptions, constants
from .composition import BindingError

ECC = {'L': constants.ERROR_CORRECT_L, 'M': constants.ERROR_CORRECT_M, 'Q': constants.ERROR_CORRECT_Q, 'H': constants.ERROR_CORRECT_H}
NUM, ALPHA, BYTE = 1,2,4


def validate_payload(value):
    if not value or len(value.encode('utf-8')) > 2048:
        raise BindingError('invalid_symbol_payload')


def _raw(value):
    return [(m[0], NUM if m[0][0].isdigit() and m[0][0].isascii() else ALPHA if re.fullmatch(r'[A-Z $%*+\-./:]+',m[0]) else BYTE) for m in re.finditer(r'\d+|[A-Z $%*+\-./:]+|[^A-Z0-9 $%*+\-./:]+', value, flags=re.ASCII)]


def _bits(length, mode):
    if mode == NUM:
        return length//3*10+(0,4,7)[length%3]
    if mode == ALPHA:
        return length//2*11+length%2*6
    return length*8


def _data(segments):
    return [util.QRData(value.encode('utf-8'),mode=mode) for value,mode in segments]


def _fit(segments,ecc):
    qr=qrcode.QRCode(error_correction=ECC[ecc],border=0)
    qr.data_list=_data(segments)
    try:
        return qr.best_fit()
    except exceptions.DataOverflowError:
        return None


def _edge_weight(parent, chosen, length, version):
    if parent and parent['mode'] == chosen:
        weight = _bits(parent['count'] + length, chosen) - _bits(parent['count'], chosen)
        parent['count'] += length
        return weight
    if parent:
        parent['count'] = length
    return _bits(length, chosen) + 4 + util.length_in_bits(chosen, version)


def _optimized(raw, version):
    # Retain upstream graph construction/tie order, including lastCount's
    # edge-construction update. A different optimizer can change the matrix.
    table, graph, previous = {}, {'start':{}}, ['start']
    for i,(value,mode) in enumerate(raw):
        modes = {NUM: (NUM, ALPHA, BYTE), ALPHA: (ALPHA, BYTE)}.get(mode, (BYTE,))
        current=[]
        for j,chosen in enumerate(modes):
            key=f'{i}:{j}'
            length=len(value.encode('utf-8')) if chosen==BYTE else len(value)
            table[key]={'value':value,'mode':chosen,'count':0}
            graph[key]={}
            current.append(key)
            for parent in previous:
                graph[parent][key] = _edge_weight(table.get(parent), chosen, length, version)
        previous=current
    for parent in previous:graph[parent]['end']=0
    predecessors = _shortest_path(graph)
    return _path_segments(table, predecessors)


def _shortest_path(graph):
    serial=itertools.count()
    queue=[(0,next(serial),'start')]
    costs, predecessors = {'start':0}, {}
    while queue:
        cost,_,parent=heapq.heappop(queue)
        for node,weight in graph.get(parent,{}).items():
            candidate=cost+weight
            if node not in costs or candidate<costs[node]:
                costs[node]=candidate
                predecessors[node]=parent
                heapq.heappush(queue,(candidate,next(serial),node))
    return predecessors


def _path_segments(table, predecessors):
    path=[]
    node=predecessors['end']
    while node!='start':
        path.append(node);node=predecessors[node]
    segments=[]
    for node in reversed(path):
        item=table[node]
        if segments and segments[-1][1]==item['mode']:
            segments[-1]=(segments[-1][0]+item['value'],item['mode'])
        else:segments.append((item['value'],item['mode']))
    return segments


def _line_penalty(line):
    score = 0
    run=0;previous=None;bits=0
    for i,bit in enumerate(line):
        if bit==previous:run+=1
        else:
            if run>=5:score+=run-2
            previous=bit;run=1
        bits=((bits<<1)&0x7ff)|int(bit)
        if i>=10 and bits in (0x5d0,0x05d):score+=40
    if run>=5:score+=run-2
    return score


def _penalty(matrix):
    # npm scores candidates with real format bits, uses first-mask ties,
    # and ceil (not floor) for the dark-module proportion penalty.
    size=len(matrix)
    score=0
    score = sum(_line_penalty(line) for line in list(matrix)+list(zip(*matrix)))
    for r in range(size-1):
        for c in range(size-1):
            if matrix[r][c]==matrix[r+1][c]==matrix[r][c+1]==matrix[r+1][c+1]:score+=3
    score+=abs(math.ceil(sum(map(sum,matrix))*100/(size*size)/5)-10)*10
    return score


def matrix(value, options):
    validate_payload(value)
    version=options['qr_version']
    raw=_raw(value) if options['segmentation']=='auto' else [(value,BYTE)]
    estimate=(version if version!='auto' else _fit(raw,options['ecc'])) or 40
    segments=_optimized(raw,estimate) if options['segmentation']=='auto' else raw
    best=_fit(segments,options['ecc'])
    if best is None or version!='auto' and int(version)<best:
        raise BindingError('symbol_capacity')
    version=best if version=='auto' else int(version)
    qr=qrcode.QRCode(version=version,error_correction=ECC[options['ecc']],border=0)
    qr.data_list=_data(segments)
    mask=options['mask']
    if mask=='auto':
        candidates=[]
        for index in range(8):
            qr.makeImpl(False,index)
            candidates.append((_penalty(qr.modules),index))
        mask=min(candidates)[1]
    qr.makeImpl(False,int(mask))
    return tuple(tuple(int(v) for v in row) for row in qr.modules),version,int(mask)
