import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as fabric from 'fabric';
import { getEnv as nodeEnv } from 'fabric/node';
import { exportFabricToSvg } from '../src/features/canvas/svg/fabricSvgExporter.ts';
import { importSvgIntoFabricCanvas } from '../src/features/canvas/svg/fabricSvgImporter.ts';
import { creationSymbolSpec, decodeSpec, validateMetadataDocument } from '../src/features/canvas/svg/bindingMetadata.ts';

fabric.setEnv(nodeEnv());
globalThis.DOMParser = nodeEnv().window.DOMParser;
globalThis.XMLSerializer = nodeEnv().window.XMLSerializer;
function canvas() { return new fabric.StaticCanvas(null, { width:160, height:120 }); }
function fixture() {
  const c=canvas();
  const text=new fabric.FabricText('Sample\nSecond',{left:12,top:15,fontSize:12,fontFamily:'Arial',angle:17,lineHeight:1.16,textAlign:'left',dataField:'ZZCHARG'});
  const composition=new fabric.FabricText('Width 0',{left:30,top:65,fontSize:10,fontFamily:'Arial',payloadTemplate:'Width {{ZZWIDTH}}'});
  const picture=nodeEnv().document.createElement('canvas');picture.width=20;picture.height=20;picture.getContext('2d').fillRect(2,2,8,12);
  const image=new fabric.FabricImage(picture,{left:100,top:10,isBarcode:true,barcodeType:'qrcode',barcodeValue:'OLD',dataQr:'ZZCHARG',payloadTemplate:'{{ZZCHARG}}',symbolSpec:creationSymbolSpec('qrcode')});
  const inner=new fabric.Group([new fabric.Rect({width:12,height:8,fill:'red'}), new fabric.Ellipse({rx:3,ry:4,left:10,top:12})], {angle:11,scaleY:0.8,isEditorGroup:true});
  const group=new fabric.Group([inner,composition],{left:45,top:45,angle:33,scaleX:1.2,skewX:5,isEditorGroup:true});
  c.add(text,image,group,new fabric.Circle({radius:5,left:130,top:95,fill:'blue'}));
  return c;
}
const path=new URL('../../tests/contracts/templates/fabric_v1.svg',import.meta.url);

test('independently authored symbol metadata roundtrips without optional editor hints', async()=>{
  const original=fixture();
  const svg=exportFabricToSvg(original,40,30).replace(/ data-is-barcode="[^"]*"/g,'').replace(/ data-qr="[^"]*"/g,'').replace(/ data-barcode="[^"]*"/g,'');
  const c=canvas();
  await new Promise((resolve,reject)=>importSvgIntoFabricCanvas(c,svg,160,120,resolve,()=>true,()=>{},()=>undefined,reject));
  const symbols=c.getObjects().filter(o=>o.symbolSpec);
  assert.equal(symbols.length,1);
  assert.equal(symbols[0].isBarcode,true);
  const output=exportFabricToSvg(c,40,30,4,{serverBinding:true});
  assert.ok(output);
  const doc=new DOMParser().parseFromString(output,'image/svg+xml');
  validateMetadataDocument(doc);
  assert.equal(doc.querySelector('[data-symbol-spec]').getAttribute('data-field'),'ZZCHARG');
  original.dispose();c.dispose();
});
test('actual Fabric7 canonical fixture serializes deterministic complete metadata',()=>{
  const c=fixture(); const svg=exportFabricToSvg(c,40,30);
  assert.ok(svg); const doc=new DOMParser().parseFromString(svg,'image/svg+xml');validateMetadataDocument(doc);
  assert.equal(doc.documentElement.getAttribute('data-binding-version'),'1');
  assert.equal(doc.querySelector('text').getAttribute('data-field'),'ZZCHARG');
  assert.deepEqual(decodeSpec(doc.querySelector('[data-symbol-spec]').getAttribute('data-symbol-spec')),creationSymbolSpec('qrcode'));
  assert.ok(doc.querySelector('g[data-editor-group]'));assert.ok(doc.querySelectorAll('tspan').length>=3);
  if(process.env.UPDATE_TEMPLATE_FIXTURES==='1') {fs.mkdirSync(new URL('../../tests/contracts/templates/',import.meta.url),{recursive:true});fs.writeFileSync(path,svg);}
  assert.ok(fs.existsSync(path));
  c.dispose();
});
test('actual Fabric import/export preserves canonical semantic metadata and transforms',async()=>{
  const c=canvas();const svg=fs.readFileSync(path,'utf8');
  const original=fixture();
  await new Promise((resolve,reject)=>importSvgIntoFabricCanvas(c,svg,160,120,resolve,()=>true,()=>{},()=>undefined,reject));
  const roundtrip=exportFabricToSvg(c,40,30);assert.ok(roundtrip);
  const doc=new DOMParser().parseFromString(roundtrip,'image/svg+xml');validateMetadataDocument(doc);
  assert.equal(doc.querySelector('text[data-field]').getAttribute('data-field'),'ZZCHARG');
  assert.equal(decodeSpec(doc.querySelector('[data-payload-spec]:not([data-symbol-spec])').getAttribute('data-payload-spec')).template,'Width {{ZZWIDTH}}');
  assert.deepEqual(decodeSpec(doc.querySelector('[data-symbol-spec]').getAttribute('data-symbol-spec')),creationSymbolSpec('qrcode'));
  assert.equal(doc.documentElement.getAttribute('viewBox'),'0 0 160 120');
  assert.ok(c.getObjects().some(o=>o.isEditorGroup));
  const flatten=(objects)=>objects.flatMap(o=>[o,...(o.getObjects?flatten(o.getObjects()):[])]);
  const before=flatten(original.getObjects()), after=flatten(c.getObjects());
  before.forEach(o=>o.setCoords()); after.forEach(o=>o.setCoords());
  assert.deepEqual(after.map(o=>o.type),before.map(o=>o.type));
  for(let i=0;i<before.length;i++) {
    const a=before[i],b=after[i];
    a.calcTransformMatrix().forEach((v,j)=>assert.ok(Math.abs(v-b.calcTransformMatrix()[j])<0.02,`world matrix object ${i} component ${j}`));
    for(const component of ['left','top','width','height']) assert.ok(Math.abs(a.getBoundingRect()[component]-b.getBoundingRect()[component])<0.03,`bounds object ${i} ${component}: ${JSON.stringify({before:a.getBoundingRect(),after:b.getBoundingRect(),aText:a.text,bText:b.text,aFont:a.fontSize,bFont:b.fontSize})}`);
    if(a.type==='text') assert.equal(a.text,b.text);
    if(a.type==='image') assert.equal(a.getSrc(),b.getSrc());
  }
  assert.equal(after.filter(o=>o.isEditorGroup).length,2);
  assert.equal(doc.querySelector('text[data-field]').querySelectorAll('tspan').length,2);
  original.dispose();
  c.dispose();
});
test('invalid metadata rejects before import and never erases bad bindings on export',async()=>{
  const c=fixture();c.getObjects()[0].dataField='ZZCHARG\n';assert.equal(exportFabricToSvg(c,40,30),'');c.dispose();
  const original=fs.readFileSync(path,'utf8');
  for(const bad of [original.replace('data-binding-version="1"','data-binding-version="2"'),original.replace(/data-symbol-spec="[^"]+"/,'data-symbol-spec="???"'),original.replace('data-field="ZZCHARG"','data-field="BAD"')]) {
    const target=canvas();let error;
    importSvgIntoFabricCanvas(target,bad,160,120,()=>assert.fail('invalid imported'),()=>true,()=>{},()=>undefined,message=>{error=message;});
    assert.match(error,/metadata/);assert.equal(target.getObjects().length,0);target.dispose();
  }
});
test('symbol field-only source and invalid composition/spec never fall back to static',()=>{
  const c=fixture();const symbol=c.getObjects()[1];delete symbol.dataQr;delete symbol.payloadTemplate;symbol.dataField='ZZCHARG';
  const svg=exportFabricToSvg(c,40,30);assert.ok(svg.includes('data-field="ZZCHARG"'));
  validateMetadataDocument(new DOMParser().parseFromString(svg,'image/svg+xml'));
  symbol.payloadTemplate=12;assert.equal(exportFabricToSvg(c,40,30),'');
  delete symbol.payloadTemplate;symbol.isBarcode=false;assert.equal(exportFabricToSvg(c,40,30),'');
  c.dispose();
});

test('all symbol metadata kinds serialize and restore exact settings', async()=>{
  for(const type of ['code128','code39','ean13','qrcode']) {
    const source=fixture(); const image=source.getObjects()[1];
    image.set({barcodeType:type,symbolSpec:creationSymbolSpec(type),dataQr:undefined,dataBarcode:undefined,dataField:'ZZCHARG'});
    const svg=exportFabricToSvg(source,40,30); assert.ok(svg);
    const target=canvas(); await new Promise((resolve,reject)=>importSvgIntoFabricCanvas(target,svg,160,120,resolve,()=>true,()=>{},()=>undefined,reject));
    assert.deepEqual(target.getObjects()[1].symbolSpec,creationSymbolSpec(type));
    const bad=creationSymbolSpec(type);bad.options[type==='qrcode'?'margin':'checksum']='invalid';
    image.set('symbolSpec',bad);assert.equal(exportFabricToSvg(source,40,30),'');
    source.dispose();target.dispose();
  }
});
test('ordinary canonical SVG without Fabric profile retains SVG coordinates', async()=>{
  const svg='<svg xmlns="http://www.w3.org/2000/svg" data-binding-version="1" width="40mm" height="30mm" viewBox="0 0 160 120"><rect x="10" y="20" width="30" height="40" stroke-width="0" transform="translate(5 7)"/></svg>';
  const target=canvas();await new Promise((resolve,reject)=>importSvgIntoFabricCanvas(target,svg,160,120,resolve,()=>true,()=>{},()=>undefined,reject));
  const box=target.getObjects()[0].getBoundingRect();assert.equal(box.left,15);assert.equal(box.top,27);assert.equal(box.width,30);assert.equal(box.height,40);target.dispose();
});
test('text metric conflicts reject before canvas mutation',()=>{
  const source=fs.readFileSync(path,'utf8').replace('font-size="12"','font-size="20"');
  assert.throws(()=>validateMetadataDocument(new DOMParser().parseFromString(source,'image/svg+xml')));
});

test('symbol owner with multiple drawables rejects rather than duplicating owners',()=>{
  const bad=fs.readFileSync(path,'utf8').replace('<image style=','<rect width="2" height="2"/><image style=');
  assert.throws(()=>validateMetadataDocument(new DOMParser().parseFromString(bad,'image/svg+xml')));
});

test('placeholder-only symbol canonicalizes source and unsupported graphics rejects',()=>{
  const source=fixture(), image=source.getObjects()[1];image.set({dataQr:undefined,payloadTemplate:undefined,dataPlaceholder:'ZZCHARG'});
  const svg=exportFabricToSvg(source,40,30);assert.ok(svg);assert.match(svg,/data-field="ZZCHARG"/);
  image.set('graphicAssetId','unmounted');assert.equal(exportFabricToSvg(source,40,30),'');source.dispose();
  const bad=fs.readFileSync(path,'utf8').replace('xlink:href=','href="data:image/png;base64,AAAA" xlink:href=');
  assert.throws(()=>validateMetadataDocument(new DOMParser().parseFromString(bad,'image/svg+xml')));
});
