"""Synthetic canonical contract; no operational storage/output."""
import json
from pathlib import Path
from copy import deepcopy
import pytest
from app.label_data import admit_json, validate_payload, LabelDataRequest, LabelDataItem

CASES=json.loads((Path(__file__).resolve().parents[2]/'tests/contracts/label_data_cases.json').read_text())
@pytest.mark.parametrize('case',CASES,ids=[c['name'] for c in CASES])
def test_shared_cases(case):
    if case['valid']:
        payload=admit_json(case['raw'].encode()); assert payload==json.loads(case['raw'])
        model=LabelDataRequest.model_validate(payload)
        assert type(model.items[0].copies) is int
        validate_payload(model.model_dump())
    else:
        with pytest.raises(ValueError): admit_json(case['raw'].encode())

@pytest.mark.parametrize('body',[b'\xff',b'\xef\xbb\xbf{}',b'x'*(2*1024*1024+1)],ids=['invalid_utf8','bom','oversize'])
def test_raw_bounds(body):
    with pytest.raises(ValueError): admit_json(body)

def test_models_and_huge_values_are_closed():
    payload=json.loads(CASES[0]['raw'])
    payload['items'][0]['copies']=10**1000
    with pytest.raises(ValueError): validate_payload(payload)
    item=deepcopy(payload['items'][0]); item['copies']=0
    with pytest.raises(ValueError): LabelDataItem.model_validate(item)

def test_optional_descriptions_roundtrip_and_case():
    payload=json.loads(CASES[0]['raw']);del payload['field_descriptions']
    result=LabelDataRequest.model_validate(payload).model_dump()
    validate_payload(result)
    assert result['items'][0]['data']['A']=='  Exact  '
    assert result['items'][0]['data']['a'] is False
