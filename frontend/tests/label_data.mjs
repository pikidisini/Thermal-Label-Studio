import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseBoundedJson, validateCanonicalLabelData } from '../src/features/data-tokens/model/canonicalLabelData.ts';
import { parseLocalSapJson, createCanonicalWorkingCopy, readLocalSapJsonSource } from '../src/features/data-tokens/model/localSapJsonParser.ts';
import { useContractStore } from '../src/store/useContractStore.ts';
import { importDataset } from '../src/features/data-tokens/model/importDataset.ts';
const cases=JSON.parse(fs.readFileSync(new URL('../../tests/contracts/label_data_cases.json',import.meta.url),'utf8'));
test('logical target is retained for print, rejected for simulation/null/raw address',()=>{
  const original=JSON.parse(cases.find(c=>c.valid).raw);
  const value={...original,mode:'print',target_id:'TCP_TEST_A'};
  assert.equal(validateCanonicalLabelData(value).target_id,'TCP_TEST_A');
  for(const target_id of [null,'','http://127.0.0.1:19100']) assert.throws(()=>validateCanonicalLabelData({...value,target_id}));
  assert.throws(()=>validateCanonicalLabelData({...value,mode:'simulation'}));
});
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


test('default catalog exactly mirrors SAP sample data keys, strings and descriptions', async () => {
  const {LABEL_FIELD_CATALOG, LABEL_FIELD_GROUPS, labelTokenKeys, getLabelField, canAddLabelField} = await import('../src/features/data-tokens/model/labelFieldCatalog.ts');
  const sample = JSON.parse(fs.readFileSync(new URL('../../docs/examples/label_data.sample.json', import.meta.url), 'utf8'));
  const data = sample.items[0].data;
  assert.equal(LABEL_FIELD_CATALOG.length, 47);
  assert.equal(LABEL_FIELD_GROUPS.length, 1);
  assert.deepEqual(LABEL_FIELD_CATALOG.map(field => field.key), Object.keys(data));
  assert.deepEqual(Object.fromEntries(LABEL_FIELD_CATALOG.map(field => [field.key, field.label])), sample.field_descriptions);
  assert.deepEqual(Object.fromEntries(LABEL_FIELD_CATALOG.map(field => [field.key, field.example])), data);
  assert.ok(LABEL_FIELD_CATALOG.every(field => field.businessType === 'string' && typeof field.example === 'string'));
  assert.equal(labelTokenKeys({}).length, 47);
  for (const key of ['width_mm', 'roll_number', 'label_code', 'component_lot_numbers']) assert.equal(getLabelField(key), undefined);
  const supplied = {ZZWIDTH: '0695', zero: 0, flag: false};
  const keys = labelTokenKeys(supplied, new Set(['template_only']));
  assert.ok(keys.includes('ZZWIDTH'));
  assert.ok(keys.includes('template_only'));
  assert.deepEqual(supplied, {ZZWIDTH: '0695', zero: 0, flag: false});
  assert.equal(supplied.width_mm, undefined);
  assert.equal(canAddLabelField('a', ['A']), true);
  for (const key of ['', ' bad', 'bad ', 'a'.repeat(129), '__proto__', 'constructor', 'prototype']) assert.equal(canAddLabelField(key, []), false);
  assert.equal(canAddLabelField('a'.repeat(128), []), true);
  assert.equal(canAddLabelField('ZZWIDTH', keys), false);
});

test('demo defaults match SAP sample and dataset replacement never fills absent values', async () => {
  const {createDefaultTokenData} = await import('../src/features/data-tokens/model/defaultTokenData.ts');
  const {useContractStore} = await import('../src/store/useContractStore.ts');
  const sample = JSON.parse(fs.readFileSync(new URL('../../docs/examples/label_data.sample.json', import.meta.url), 'utf8'));
  const data = createDefaultTokenData();
  assert.deepEqual(data, sample.items[0].data);
  assert.equal(data.ZZSEQUENCENBR, '000001');
  assert.equal(data.ZZSPLICE, undefined);
  assert.equal(data['ZZSPLICE-1'], '0');
  data.ZZWIDTH = 'changed';
  assert.equal(createDefaultTokenData().ZZWIDTH, '1200');
  const previous = useContractStore.getState();
  try {
    useContractStore.getState().setLocalImportedContract({fields: {ZZWIDTH: '0695'}}, {ZZWIDTH: '0695'}, null);
    assert.deepEqual(useContractStore.getState().tokenMap, {ZZWIDTH: '0695'});
    assert.equal(useContractStore.getState().tokenMap.ZZLENGTH, undefined);
  } finally { useContractStore.setState(previous); }
});

test('editing a missing catalog field is deliberate local data and keeps exact custom identities', async () => {
  const {useContractStore} = await import('../src/store/useContractStore.ts');
  const previous = useContractStore.getState();
  try {
    useContractStore.setState({tokenMap: {}, jsonData: {}, activeContractKey: 'default', customTokens: new Set(), outputBlocked: false});
    assert.deepEqual(useContractStore.getState().tokenMap, {});
    useContractStore.getState().updateTokenValue('ZZWIDTH', '0695');
    assert.equal(useContractStore.getState().tokenMap.ZZWIDTH, '0695');
    assert.equal(useContractStore.getState().tokenMap.width_mm, undefined);
    useContractStore.getState().markCustomToken('a');
    useContractStore.getState().markCustomToken('A');
    assert.deepEqual([...useContractStore.getState().customTokens], ['default:a', 'default:A']);
    useContractStore.getState().setOutputBlocked(true);
    useContractStore.getState().updateTokenValue('ZZWIDTH', '900');
    assert.equal(useContractStore.getState().tokenMap.ZZWIDTH, '0695');
  } finally { useContractStore.setState(previous); }
});
