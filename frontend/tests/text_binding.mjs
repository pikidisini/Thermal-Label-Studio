import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {registerFont} from 'canvas';
import * as fabric from 'fabric';
import {getEnv} from 'fabric/node';
import {exportFabricToSvg} from '../src/features/canvas/svg/fabricSvgExporter.ts';
import {importSvgIntoFabricCanvas} from '../src/features/canvas/svg/fabricSvgImporter.ts';
import {decodeSpec, validateTextLayout} from '../src/features/canvas/svg/bindingMetadata.ts';
import {resolvePayloadTemplate} from '../src/features/barcode/model/barcodePayload.ts';

const fontPath=process.env.T04_FONT_PATH || 'C:/Windows/Fonts/arial.ttf';
const fontFamily=process.env.T04_FONT_FAMILY || 'Arial';
const fontAvailable=fs.existsSync(fontPath);
const variants={};
if(fontAvailable) {
  registerFont(fontPath,{family:fontFamily});
  if(path.basename(fontPath).toLowerCase()==='arial.ttf') {
    for(const [name,weight,style] of [['arialbd.ttf','bold','normal'],['ariali.ttf','normal','italic'],['arialbi.ttf','bold','italic']]) {
      const variant=path.join(path.dirname(fontPath),name);
      registerFont(variant,{family:fontFamily,weight,style});
      variants[name]=crypto.createHash('sha256').update(fs.readFileSync(variant)).digest('hex');
    }
  }
}
fabric.setEnv(getEnv());
globalThis.DOMParser=getEnv().window.DOMParser;
globalThis.XMLSerializer=getEnv().window.XMLSerializer;
const fixtureUrl=new URL('../../tests/contracts/templates/text_binding_fabric.json',import.meta.url);
const scalarsUrl=new URL('../../tests/contracts/text_scalar_cases.json',import.meta.url);
const scalarValues=[0,-0,true,false,1,1.0,1.25,0.000001,0.0000001,1e-8,1.2345678901234567,9007199254740991,-9007199254740991,5e-324,1.2345e-100,0.30000000000000004,1.0000000000000002,1000000000000000.5,'  A&B <tag>  ','é Δ é','  '];

function create(align,origin,grouped,spacing=0,weight='normal',style='normal') {
  const c=new fabric.StaticCanvas(null,{width:320,height:240});
  const t=new fabric.FabricText('SAMPLE OLD\nShort',{left:110,top:80,fontSize:14,fontFamily,textAlign:align,lineHeight:1.25,
    originX:origin[0],originY:origin[1],angle:23,skewX:7,skewY:3,scaleX:1.2,scaleY:.8,flipX:grouped,
    fill:'#123456',payloadTemplate:'Lot {{KEY}} / {{ZERO}} {{FLAG}}',charSpacing:spacing,fontWeight:weight,fontStyle:style});
  if(grouped) {
    const inner=new fabric.Group([t,new fabric.Rect({left:20,top:25,width:8,height:8,fill:'red'})],{angle:11,isEditorGroup:true});
    c.add(new fabric.Group([inner],{left:150,top:110,angle:-9,skewX:5,isEditorGroup:true}));
  } else c.add(t);
  return {c,t};
}

test('capture actual Studio text replacement oracle, independent of Python binder',{skip:!fontAvailable},()=>{
  const captures=[];
  for(const align of ['left','center','right']) for(const [name,origin,grouped,spacing,weight,style] of [
    ['center',['center','center'],false,0,'normal','normal'],['top-left',['left','top'],false,0,'normal','normal'],
    ['bottom-right',['right','bottom'],false,0,'normal','normal'],['nested',[.25,.75],true,0,'normal','normal'],
    ['spaced',['center','center'],false,80,'normal','normal'],['negative-spacing',['right','bottom'],false,-80,'normal','normal'],['bold-italic',['left','top'],false,0,'bold','italic']]) {
    for(const data of [{KEY:' A&B <one> ',ZERO:0,FLAG:false},{KEY:'Bé Δ\nsecond',ZERO:1.25,FLAG:true},{KEY:'\n\n',ZERO:0,FLAG:false},{KEY:'é Å Cyrillic Ж',ZERO:1e-7,FLAG:false}]) {
      const {c,t}=create(align,origin,grouped,spacing,weight,style);
      const before=exportFabricToSvg(c,80,60);assert.ok(before);
      const resolved=resolvePayloadTemplate(t.payloadTemplate,data,'text');assert.equal(resolved.error,null);
      t.set('text',resolved.value);c.renderAll();
      const expected=exportFabricToSvg(c,80,60);assert.ok(expected);
      captures.push({name:`${align}-${name}-${captures.length}`,data,before,expected});c.dispose();
    }
  }
  if(process.env.UPDATE_TEXT_FIXTURES==='1') {
    fs.writeFileSync(fixtureUrl,JSON.stringify({fabric:fabric.version,font:{family:fontFamily,sha256:crypto.createHash('sha256').update(fs.readFileSync(fontPath)).digest('hex'),variants},width_mm:80,height_mm:60,dpi:203,cases:captures},null,2));
    fs.writeFileSync(scalarsUrl,JSON.stringify(scalarValues.map(value=>({value,expected:String(value)})),null,2));
  }
  const stored=JSON.parse(fs.readFileSync(fixtureUrl,'utf8'));
  assert.equal(stored.cases.length,captures.length);
  assert.equal(stored.font.sha256,crypto.createHash('sha256').update(fs.readFileSync(fontPath)).digest('hex'));
  assert.deepEqual(stored.font.variants,variants);
  assert.deepEqual(captures,stored.cases);
});

test('exact scalar spelling and significant spaces match canonical text semantics',()=>{
  for(const c of JSON.parse(fs.readFileSync(scalarsUrl,'utf8'))) assert.equal(resolvePayloadTemplate('{{K}}',{K:c.value},'text').value,c.expected);
  for(const value of [null,undefined,'']) assert.ok(resolvePayloadTemplate('{{K}}',{K:value},'text').error);
});

test('text layout origin and spacing restore across actual SVG import/export',{skip:!fontAvailable},async()=>{
  const {c,t}=create('right',['left','top'],false,80);
  t.set({payloadTemplate:undefined,dataField:'KEY',dataPlaceholder:'KEY',isDynamic:true});
  const svg=exportFabricToSvg(c,80,60), target=new fabric.StaticCanvas(null,{width:320,height:240});
  await new Promise((resolve,reject)=>importSvgIntoFabricCanvas(target,svg,320,240,resolve,()=>true,()=>{},()=>undefined,reject));
  const restored=target.getObjects()[0];
  assert.equal(restored.originX,0);assert.equal(restored.originY,0);assert.equal(restored.charSpacing,80);
  assert.equal(restored.text,t.text);
  const output=exportFabricToSvg(target,80,60);assert.ok(output);
  const document=new DOMParser().parseFromString(output,'image/svg+xml');
  validateTextLayout(decodeSpec(document.querySelector('[data-text-layout]').getAttribute('data-text-layout')));
  assert.throws(()=>validateTextLayout({version:1}));
  c.dispose();target.dispose();
});

test('dynamic text background geometry rejects until its profile is proven',{skip:!fontAvailable},()=>{
  const {c,t}=create('left',['center','center'],false);
  t.set('textBackgroundColor','red');
  assert.equal(exportFabricToSvg(c,80,60),'');
  c.dispose();
});


test('Design import retains template samples for missing fields, including grouped compositions', async () => {
  const source = new fabric.StaticCanvas(null, {width:320,height:240});
  const sample = new fabric.FabricText('1200 mm', {fontFamily, fontSize:14, payloadTemplate:'{{width_mm}} mm'});
  source.add(new fabric.Group([sample], {isEditorGroup:true}));
  const svg = exportFabricToSvg(source,80,60);
  const target = new fabric.StaticCanvas(null,{width:320,height:240});
  await new Promise((resolve,reject)=>importSvgIntoFabricCanvas(target,svg,320,240,resolve,()=>true,()=>{},()=>undefined,reject));
  const restored = target.getObjects()[0].getObjects()[0];
  assert.equal(restored.text,'1200 mm');
  assert.equal(restored.designPreviewText,'1200 mm');
  assert.equal(restored.payloadTemplate,'{{width_mm}} mm');
  source.dispose(); target.dispose();
});

test('Design sample fallback is limited to absent startup keys', async () => {
  const {designPreviewSample,shouldUseDesignPreviewSample} = await import('../src/features/data-tokens/model/designPreview.ts');
  assert.equal(designPreviewSample('roll_no — no data'),'Sample');
  assert.equal(designPreviewSample('00001234'),'00001234');
  assert.equal(shouldUseDesignPreviewSample('demo-defaults',['width_mm'],{ZZWIDTH:'1200'}),true);
  for (const key of ['local:1','stored:1']) assert.equal(shouldUseDesignPreviewSample(key,['width_mm'],{}),false);
  for (const value of [null,'',0,false]) assert.equal(shouldUseDesignPreviewSample('demo-defaults',['width_mm'],{width_mm:value}),false);
});
