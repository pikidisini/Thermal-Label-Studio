import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseBoundedJson, validateCanonicalLabelData } from '../src/features/data-tokens/model/canonicalLabelData.ts';
import { parseLocalSapJson, createCanonicalWorkingCopy, readLocalSapJsonSource } from '../src/features/data-tokens/model/localSapJsonParser.ts';
import { useContractStore } from '../src/store/useContractStore.ts';
import { importDataset } from '../src/features/data-tokens/model/importDataset.ts';
const cases=JSON.parse(fs.readFileSync(new URL('../../tests/contracts/label_data_cases.json',import.meta.url),'utf8'));
for(const entry of cases) test(`shared canonical: ${entry.name}`,()=>{
  const run=()=>validateCanonicalLabelData(parseBoundedJson(entry.raw));
  if(entry.valid) assert.deepEqual(run(),JSON.parse(entry.raw)); else assert.throws(run);
});
test('historical copy is explicit, original unchanged and read-only state prevents edits',()=>{
  const source=JSON.parse(cases[0].raw);delete source.mode;
  const parsed=parseLocalSapJson(source);
  assert.equal(parsed.outputBlocked,true);assert.ok(parsed.warnings.length);
  useContractStore.setState({outputBlocked:true,tokenMap:parsed.items[0].tokenMap,jsonData:parsed.items[0].contract});
  useContractStore.getState().updateTokenValue('A','changed');
  assert.equal(useContractStore.getState().tokenMap.A,'  Exact  ');
  useContractStore.getState().switchContract('unknown');
  assert.equal(useContractStore.getState().outputBlocked,true);
  const copy=createCanonicalWorkingCopy(source,'print');
  assert.equal(copy.outputBlocked,false);assert.equal(copy.items[0].contract.source.mode,'print');assert.equal(source.mode,undefined);
  assert.equal(copy.items[0].tokenMap.label_code,undefined);
  useContractStore.setState({outputBlocked:false});
});
test('raw file import detects duplicates and fatal UTF-8 without network or print',async()=>{
  const original=globalThis.fetch; const requests=[];
  globalThis.fetch=async(...args)=>{requests.push(args);throw new Error('unexpected network');};
  const file=(raw)=>({name:'sample.json',size:raw.length,arrayBuffer:async()=>new TextEncoder().encode(raw).buffer});
  try {
    const print=JSON.parse(cases[0].raw);print.mode='print';
    const result=await readLocalSapJsonSource(file(JSON.stringify(print)));
    assert.equal(result.parsed.items[0].contract.source.mode,'print');
    await assert.rejects(readLocalSapJsonSource(file('{"a":1,"a":2}')));
    await assert.rejects(readLocalSapJsonSource({name:'bad.json',size:1,arrayBuffer:async()=>new Uint8Array([255]).buffer}));
    assert.deepEqual(requests,[]);
  } finally {globalThis.fetch=original;}
});
test('Studio upload action persists only canonical dataset; print mode never submits and history never saves',async()=>{
  const original=globalThis.fetch;const calls=[];const applied=[];const statuses=[];
  globalThis.fetch=async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return {ok:true,json:async()=>({id:'saved',name:'sample'})};};
  const file=(payload)=>{const bytes=new TextEncoder().encode(JSON.stringify(payload));return {name:'sample.json',size:bytes.length,arrayBuffer:async()=>bytes.buffer};};
  const callbacks={current:()=>true,apply:p=>applied.push(p),status:s=>statuses.push(s),saved:()=>{}};
  try {
    const payload=JSON.parse(cases[0].raw);payload.mode='print';
    await importDataset(file(payload),callbacks);
    assert.equal(calls.length,1);assert.match(calls[0][0],/studio-sample-datasets$/);
    assert.equal(calls[0][1].payload.mode,'print');assert.equal(applied[0].outputBlocked,false);
    delete payload.mode;payload.items[0].copies=1000;
    await importDataset(file(payload),callbacks);
    assert.equal(calls.length,1);assert.equal(applied[1].outputBlocked,true);
    assert.equal(applied[1].items[0].contract.source.copies,1000);
    assert.throws(()=>createCanonicalWorkingCopy(payload,'print'));
    assert.equal(createCanonicalWorkingCopy(payload,'simulation',[999]).items[0].contract.source.copies,999);
    globalThis.fetch=async()=>{throw new Error('offline');};
    payload.mode='simulation';payload.items[0].copies=1;
    await importDataset(file(payload),callbacks);
    assert.match(statuses.at(-1),/could not be stored/);assert.equal(applied.length,3);
  } finally {globalThis.fetch=original;}
});
