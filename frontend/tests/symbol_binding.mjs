import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import {PNG} from 'pngjs';
import * as fabric from 'fabric';
import {getEnv} from 'fabric/node';
import {barcodeGenerators} from '../src/features/barcode/model/barcodeGenerators.ts';
import {qrGenerator} from '../src/features/qr/model/qrGenerator.ts';
import {generatePreviewDataUrl,validatePreviewPayload} from '../src/features/barcode/model/barcodePreview.ts';
import {replaceSymbolImage} from '../src/features/barcode/model/replaceSymbolImage.ts';
import {creationSymbolSpec} from '../src/features/canvas/svg/bindingMetadata.ts';
import {exportFabricToSvg} from '../src/features/canvas/svg/fabricSvgExporter.ts';

fabric.setEnv(getEnv());
globalThis.document=getEnv().document;
globalThis.XMLSerializer=getEnv().window.XMLSerializer;
globalThis.DOMParser=getEnv().window.DOMParser;
const fixture=new URL('../../tests/contracts/symbol_vectors.json',import.meta.url);
const geometryFixture=new URL('../../tests/contracts/templates/symbol_binding_fabric.json',import.meta.url);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function pixels(url) {
  assert.ok(url);
  const png=PNG.sync.read(Buffer.from(url.split(',')[1],'base64'));
  return {width:png.width,height:png.height,rgba_sha256:hash(png.data)};
}
function portablePixels(value) {
  return {...value, rgba_sha256: '<platform-raster>'};
}
function portableFixture(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (key === 'pixels' && item && typeof item === 'object') return portablePixels(item);
    if (typeof item === 'string') return item.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, '<platform-png>');
    return item;
  }));
}
async function capture() {
  const cases=[];
  for(const [type,values] of [['code128',['0','false','A','12','123','1234','12345','ABC1234DEF','AB12345cd6789Z','12ABCx1234',' A B ','~!@#$%^&*()_+','ABC1234xY567890','ABCD']],['code39',['0','A','ABC-39','0123456789','AZ $%+-./']],['ean13',['4006381333931','5901234123457','0000000000000']]]) {
    for(const value of values) for(const [module_width,bar_height] of [[2,40],[1,12],[3,51]]) {
      const target={};
      JsBarcode(target,value,{format:type.toUpperCase(),displayValue:false});
      const bits=target.encodings.map(row=>row.data).join('');
      const generate=type==='code128'?'generateCode128DataUrl':type==='code39'?'generateCode39DataUrl':'generateEan13DataUrl';
      const options={module_width,bar_height,margin:2,display_value:false,font_size:12,checksum:type==='ean13'?'verified':type==='code39'?false:'native'};
      cases.push({type,value,options,bits,pixels:pixels(barcodeGenerators[generate](value,{barWidth:module_width,barHeight:bar_height}))});
    }
  }
  const qrValues=['0','false','HELLO WORLD','1234567890123456789012345','Lot ABC1234567890 / false','é Δ 日本語 😀','A1b234567890XYZ\nnext',' A&B <tag> ','AB12CD34EF56','😀'.repeat(20),'x'.repeat(180),'ABCDEF1234567890'.repeat(12)];
  for(const value of qrValues) for(const ecc of ['L','M','Q','H']) for(const segmentation of ['auto','byte']) {
    const options={ecc,encoding:'utf8',segmentation,margin:1,size:150,qr_version:'auto',mask:'auto'};
    const data=segmentation==='byte'?[{data:value,mode:'byte'}]:value;
    const settings={errorCorrectionLevel:ecc,width:150,margin:1,color:{dark:'#000000',light:'#ffffff'}};
    const qr=QRCode.create(data,settings);
    const url=await qrGenerator.generateQrDataUrl(value,{ecc,size:150,segmentation});
    cases.push({type:'qrcode',value,options,version:qr.version,mask:qr.maskPattern,modules:Array.from({length:qr.modules.size},(_,r)=>Array.from(qr.modules.data.slice(r*qr.modules.size,(r+1)*qr.modules.size)).join('')),pixels:pixels(url)});
  }
  for(const mask of [0,1,2,3,4,5,6,7]) {
    const value='Version7 é ABC123';
    const options={ecc:'Q',encoding:'utf8',segmentation:'byte',margin:1,size:151.5,qr_version:7,mask};
    const data=[{data:value,mode:'byte'}];
    const settings={version:7,maskPattern:mask,errorCorrectionLevel:'Q',width:151.5,margin:1,color:{dark:'#000000',light:'#ffffff'}};
    const qr=QRCode.create(data,settings);
    cases.push({type:'qrcode',value,options,version:7,mask,modules:Array.from({length:qr.modules.size},(_,r)=>Array.from(qr.modules.data.slice(r*qr.modules.size,(r+1)*qr.modules.size)).join('')),pixels:pixels(await qrGenerator.generateQrDataUrl(value,{ecc:'Q',size:151.5,segmentation:'byte',version:7,mask}))});
  }
  return {libraries:{jsbarcode:JSON.parse(fs.readFileSync(new URL('../node_modules/jsbarcode/package.json',import.meta.url),'utf8')).version,qrcode:JSON.parse(fs.readFileSync(new URL('../node_modules/qrcode/package.json',import.meta.url),'utf8')).version},cases};
}
test('independent actual Studio module and RGBA pixel oracle',async()=>{
  const current=await capture();
  if(process.env.UPDATE_SYMBOL_FIXTURES==='1') fs.writeFileSync(fixture,JSON.stringify(current,null,2));
  assert.deepEqual(current,JSON.parse(fs.readFileSync(fixture,'utf8')));
});

test('actual Fabric symbol refresh preserves design corners and full-image mapping',async()=>{
  const cases=[];
  for(const type of ['code128','code39','ean13','qrcode']) for(const origin of [['center','center'],['left','top'],[.25,.75]]) for(const nested of [false,true]) {
    const old=type==='ean13'?'4006381333931':'SAMPLE';
    const value=type==='ean13'?'5901234123457':type==='qrcode'?'Lot é 日本 😀 / 1234567890':'A1234567890 / 0';
    const spec=creationSymbolSpec(type);
    const object=await fabric.FabricImage.fromURL(await generatePreviewDataUrl(type,old,spec));
    object.set({left:110,top:80,scaleX:.35,scaleY:.75,angle:21,skewX:7,skewY:3,flipX:nested,originX:origin[0],originY:origin[1],isBarcode:true,barcodeType:type,symbolSpec:spec,payloadTemplate:'{{KEY}}',dataField:'KEY',barcodeValue:old});
    const c=new fabric.StaticCanvas(null,{width:320,height:240});
    if(nested) c.add(new fabric.Group([new fabric.Group([object,new fabric.Rect({left:10,top:20,width:10,height:10,fill:'red'})],{angle:11,isEditorGroup:true})],{angle:-9,isEditorGroup:true})); else c.add(object);
    const before=exportFabricToSvg(c,80,60);assert.ok(before);
    const paintedCorners=()=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>fabric.util.transformPoint(new fabric.Point(x*object.width/2,y*object.height/2),object.calcTransformMatrix())).map(p=>[p.x,p.y]);
    const corners=paintedCorners();
    const url=await generatePreviewDataUrl(type,value,spec);
    assert.equal(await replaceSymbolImage(object,url),true);
    object.set('barcodeValue',value);
    const after=paintedCorners();
    for(let i=0;i<4;i++) for(let j=0;j<2;j++) assert.ok(Math.abs(corners[i][j]-after[i][j])<1e-7);
    const expected=exportFabricToSvg(c,80,60);assert.ok(expected);
    cases.push({type,data:{KEY:value},before,expected,pixels:pixels(url)});c.dispose();
  }
  if(process.env.UPDATE_SYMBOL_FIXTURES==='1') fs.writeFileSync(geometryFixture,JSON.stringify({fabric:fabric.version,cases},null,2));
  const expectedFixture=JSON.parse(fs.readFileSync(geometryFixture,'utf8'));
  assert.deepEqual(portableFixture({fabric:fabric.version,cases}),portableFixture(expectedFixture));
});

test('invalid generators never substitute data, clean EAN, change symbology or allocate oversized images',async()=>{
  for(const value of ['', '123', '4006381333932', '4006381333931\n', 'x4006381333931']) assert.equal(barcodeGenerators.generateEan13DataUrl(value),null);
  for(const value of ['', 'lowercase', 'é', 'A\n']) assert.equal(barcodeGenerators.generateCode39DataUrl(value),null);
  for(const value of ['', 'é', 'A\n', 'x'.repeat(513)]) assert.equal(barcodeGenerators.generateCode128DataUrl(value),null);
  for(const value of ['', '😀'.repeat(513), '\ud800']) assert.equal(await qrGenerator.generateQrDataUrl(value),null);
  assert.equal(await qrGenerator.generateQrDataUrl('x'.repeat(2048),{ecc:'H',version:1}),null);
  assert.equal(await qrGenerator.generateQrDataUrl('valid',{size:4096}),null);
  assert.equal(barcodeGenerators.generateCode128DataUrl('valid',{barWidth:1.5}),null);
  assert.ok(validatePreviewPayload('unknown','valid'));
  assert.equal(await generatePreviewDataUrl('unknown','valid'),null);
});

test('cancelled refresh cannot overwrite latest pixels or geometry',async()=>{
  const object=await fabric.FabricImage.fromURL(await generatePreviewDataUrl('code128','OLD'));
  const source=object.getSrc(),matrix=object.calcOwnMatrix();
  assert.equal(await replaceSymbolImage(object,await generatePreviewDataUrl('code128','NEW LONGER'),()=>false),false);
  assert.equal(object.getSrc(),source);assert.deepEqual(object.calcOwnMatrix(),matrix);
});
