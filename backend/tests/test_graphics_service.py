"""F3.37 graphics safety and portable-update coverage."""
import base64
import io
from types import SimpleNamespace
import pytest
from app.services.graphics_service import GraphicsService
SAFE_SVG=b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>'
class _Response:
    def __init__(self, data): self._data=io.BytesIO(data)
    def read(self): return self._data.read()
    def close(self): pass
    def release_conn(self): pass
class FakeMinio:
    def __init__(self): self.objects={}
    def put_object(self,bucket,key,data,length,**_): self.objects[(bucket,key)]=data.read()
    def get_object(self,bucket,key):
        if (bucket,key) not in self.objects: raise KeyError(key)
        return _Response(self.objects[(bucket,key)])
    def list_objects(self,bucket,prefix,recursive=True): return [SimpleNamespace(object_name=key) for (b,key) in self.objects if b==bucket and key.startswith(prefix)]
@pytest.fixture()
def isolated(monkeypatch,tmp_path):
    import app.services.graphics_service as service
    monkeypatch.setattr(service,"GRAPHICS_LIBRARY_DIR",tmp_path/"graphics"); monkeypatch.setattr(service,"CUSTOM_TEMPLATES_DIR",tmp_path/"templates")
    service.GRAPHICS_LIBRARY_DIR.mkdir(); service.CUSTOM_TEMPLATES_DIR.mkdir(); return tmp_path
def test_rejects_active_or_external_svg():
    with pytest.raises(ValueError): GraphicsService.validate(b'<svg><script>alert(1)</script></svg>',"image/svg+xml")
    with pytest.raises(ValueError): GraphicsService.validate(b'<svg><image href="https://example.test/a"/></svg>',"image/svg+xml")
def test_asset_embeds_and_bulk_update_preserves_transform(isolated):
    graphic=GraphicsService.add("Company Logo",SAFE_SVG,"image/svg+xml"); old="data:image/svg+xml;base64,"+base64.b64encode(SAFE_SVG).decode()
    template=isolated/"templates"/"label.svg"; template.write_text(f'<svg><image transform="matrix(1 0 0 1 44 11)" href="{old}" data-graphic-asset-id="{graphic["id"]}" data-graphic-asset-version="1"/></svg>',"utf8")
    assert GraphicsService.impact(graphic["id"])[0]["template_id"] == "label"
    newer=GraphicsService.update(graphic["id"],b'<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>',"image/svg+xml")
    assert GraphicsService.bulk_update(graphic["id"],["label"],dry_run=True)["affected"]
    completed=GraphicsService.bulk_update(graphic["id"],["label"]); saved=template.read_text("utf8")
    assert completed["updated"] and 'transform="matrix(1 0 0 1 44 11)"' in saved and f'data-graphic-asset-version="{newer["version"]}"' in saved and newer["data_uri"] in saved
    assert list((isolated/"graphics"/"template-revisions"/"label").glob("*.svg"))

def test_minio_registry_roundtrip_and_bulk_readback(monkeypatch):
    import app.services.graphics_service as service
    from app.storage.minio import MinioTemplateStore
    client=FakeMinio(); store=MinioTemplateStore(client=client,bucket="thermal-label")
    monkeypatch.setattr(service,"STORAGE_BACKEND","minio")
    monkeypatch.setattr(service.GraphicsService,"_minio",classmethod(lambda cls:(client,"thermal-label","graphics/registry.json")))
    monkeypatch.setattr("app.storage.minio._client",lambda:client)
    client.put_object("thermal-label","templates/label.svg",io.BytesIO(b'<svg><image href="old" data-graphic-asset-id="x" data-graphic-asset-version="1" transform="translate(2)"/></svg>'),126)
    asset=service.GraphicsService.add("A",SAFE_SVG,"image/svg+xml")
    raw=client.objects[("thermal-label","templates/label.svg")].decode().replace('data-graphic-asset-id="x"',f'data-graphic-asset-id="{asset["id"]}"')
    client.objects[("thermal-label","templates/label.svg")]=raw.encode()
    service.GraphicsService.update(asset["id"],b'<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>',"image/svg+xml")
    result=service.GraphicsService.bulk_update(asset["id"],["label"])
    updated=client.objects[("thermal-label","templates/label.svg")].decode()
    assert result["updated"] and 'transform="translate(2)"' in updated
    assert any(k.startswith("graphics/template-revisions/label/") for b,k in client.objects if b=="thermal-label")
