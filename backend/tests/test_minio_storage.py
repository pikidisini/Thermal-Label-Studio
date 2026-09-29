import io, json
from types import SimpleNamespace
import pytest
from app.storage.minio import MinioArtifactStorage, MinioTemplateStore
from app.print_jobs.models import ArtifactReference
from app.print_jobs.artifact_storage import ArtifactConflictError, ArtifactIntegrityError
import app.services.template_service as template_module
from app.services.template_service import TemplateService

class FakeResponse:
    def __init__(self,b): self.b=io.BytesIO(b)
    def read(self): return self.b.read()
    def close(self): pass
    def release_conn(self): pass
class FakeMinio:
    def __init__(self): self.objects={}; self.fail=False
    def put_object(self,b,k,data,length,**kw): self.objects[(b,k)]=data.read()
    def get_object(self,b,k):
        if self.fail: raise OSError("network")
        if (b,k) not in self.objects: raise KeyError(k)
        return FakeResponse(self.objects[(b,k)])
    def list_objects(self,b,prefix,recursive=True):
        return [SimpleNamespace(object_name=k) for (bucket,k) in self.objects if bucket==b and k.startswith(prefix)]
    def remove_object(self,b,k): self.objects.pop((b,k),None)
    def copy_object(self,b,dst,source): self.objects[(b,dst)]=self.objects[(source.bucket_name,source.object_name)]

def storage(): return MinioArtifactStorage(client=FakeMinio(), bucket="thermal-label")
def test_fresh_idempotent_and_conflict():
    s=storage(); r=s.put("job1","label.zpl",b"abc"); assert s.read_verified(r,s.checksum(b"abc"))==b"abc"; assert s.put("job1","label.zpl",b"abc")==r
    with pytest.raises(ArtifactConflictError): s.put("job1","label.zpl",b"different")
def test_incomplete_and_corrupt_rejected():
    s=storage(); s.client.objects[(s.bucket,"artifacts/job1.payload")]=b"abc"
    with pytest.raises(ArtifactIntegrityError): s.put("job1","label.zpl",b"abc")
    s=storage(); s.client.objects[(s.bucket,"artifacts/job1.manifest.json")]=b"{}"
    with pytest.raises(ArtifactIntegrityError): s.put("job1","label.zpl",b"abc")
    s=storage(); s.put("job1","label.zpl",b"abc"); s.client.objects[(s.bucket,"artifacts/job1.manifest.json")]=b"bad"
    with pytest.raises(ArtifactIntegrityError): s.put("job1","label.zpl",b"abc")
def test_network_failure_fails_closed():
    s=storage(); s.client.fail=True
    with pytest.raises(ArtifactIntegrityError): s.put("job1","label.zpl",b"abc")
def test_template_list_and_crud():
    c=FakeMinio(); t=MinioTemplateStore(client=c,bucket="thermal-label"); c.put_object("thermal-label","templates/a/b.svg",io.BytesIO(b"<svg/>"),6)
    assert [o.object_name for o in t.list()]==["templates/a/b.svg"]; assert t.read("templates/a/b.svg")=="<svg/>"

def test_template_service_minio_folder_parent_and_global_id(monkeypatch, tmp_path):
    c=FakeMinio(); store=MinioTemplateStore(client=c,bucket="thermal-label",cache_dir=tmp_path)
    monkeypatch.setattr(template_module, "STORAGE_BACKEND", "minio")
    monkeypatch.setattr(TemplateService, "_minio_store", classmethod(lambda cls: store))
    with pytest.raises(ValueError, match="Parent folder"):
        TemplateService.save_custom_template("A", "<svg/>", "missing")
    TemplateService.create_folder("A")
    TemplateService.save_custom_template("Label", "<svg width='10mm' height='5mm'/>", "A")
    TemplateService.save_custom_template("Label", "<svg width='11mm' height='5mm'/>", "A")
    TemplateService.save_custom_template("Label", "<svg width='12mm' height='5mm'/>")
    assert "templates/A/label.svg" in [o.object_name for o in store.list()]
    TemplateService.create_folder("B")
    with pytest.raises(ValueError, match="another folder"):
        TemplateService.save_custom_template("Label", "<svg/>", "B")
    assert TemplateService.get_template_detail("label").is_builtin is False

def test_template_service_minio_move_verifies_and_deletes_custom(monkeypatch):
    c=FakeMinio(); store=MinioTemplateStore(client=c,bucket="thermal-label")
    monkeypatch.setattr(template_module, "STORAGE_BACKEND", "minio")
    monkeypatch.setattr(TemplateService, "_minio_store", classmethod(lambda cls: store))
    TemplateService.create_folder("A"); TemplateService.create_folder("B")
    TemplateService.save_custom_template("Label", "<svg/>", "A")
    assert TemplateService.move_template("label", "B")
    assert "templates/B/label.svg" in [o.object_name for o in store.list()]
    assert "templates/A/label.svg" not in [o.object_name for o in store.list()]
    assert TemplateService.delete_custom_template("label")

def test_template_service_minio_builtin_detail_is_builtin(monkeypatch, tmp_path):
    c=FakeMinio(); store=MinioTemplateStore(client=c,bucket="thermal-label")
    builtin=tmp_path / "builtin"; builtin.mkdir()
    (builtin / "builtin.svg").write_text("<svg width='10mm' height='5mm'/>", encoding="utf-8")
    monkeypatch.setattr(template_module, "STORAGE_BACKEND", "minio")
    monkeypatch.setattr(template_module, "BUILTIN_TEMPLATES_DIR", builtin)
    monkeypatch.setattr(TemplateService, "_minio_store", classmethod(lambda cls: store))
    detail=TemplateService.get_template_detail("builtin")
    assert detail is not None and detail.is_builtin is True
