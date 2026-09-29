from pathlib import Path
import importlib.util,sys

spec=importlib.util.spec_from_file_location("migration",Path(__file__).parents[2]/"scripts"/"migrate_to_minio.py")
m=importlib.util.module_from_spec(spec);sys.modules["migration"]=m;spec.loader.exec_module(m)

class R:
 def __init__(self,b):self.b=b
 def read(self):return self.b
 def close(self):pass
 def release_conn(self):pass
class C:
 def __init__(self):self.d={};self.puts=0
 def bucket_exists(self,b):return True
 def get_object(self,b,k):
  if (b,k) not in self.d: raise KeyError(k)
  return R(self.d[b,k])
 def put_object(self,b,k,s,n,**kw):self.d[b,k]=s.read();self.puts+=1

def test_copy_and_idempotence(tmp_path):
 a=tmp_path/"out"/"simulation_artifacts";a.mkdir(parents=True)
 p=a/"x.payload";p.write_bytes(b"abc")
 (a/"x.manifest.json").write_text('{"schema_version":"1.0","payload_ref":"x","filename":"label.zpl","byte_length":3,"sha256":"'+m.digest(b'abc')+'"}')
 items=m.inventory(tmp_path);c=C();r=m.migrate(items,c,{"artifacts":"a","templates":"t"});assert r["copied"]==1
 r=m.migrate(items,c,{"artifacts":"a","templates":"t"});assert r["already_present"]==1 and c.puts==2

def test_partial_target_fails(tmp_path):
 a=tmp_path/"out"/"simulation_artifacts";a.mkdir(parents=True);p=a/"x.payload";p.write_bytes(b"a")
 (a/"x.manifest.json").write_text('{"schema_version":"1.0","payload_ref":"x","filename":"label.zpl","byte_length":1,"sha256":"'+m.digest(b'a')+'"}')
 c=C();c.d["a","artifacts/x.payload"]=b"a"
 try:m.migrate(m.inventory(tmp_path),c,{"artifacts":"a","templates":"t"})
 except m.MigrationError:pass
 else:assert False
