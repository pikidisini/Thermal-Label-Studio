"""Fail-closed local template/artifact migration to MinIO."""
from __future__ import annotations
import argparse,hashlib,io,json,os
from pathlib import Path
from dataclasses import dataclass
class MigrationError(RuntimeError):pass
SCHEMA="1.0"
ALLOWED_FILENAMES={"label.ipl","label.zpl","evidence.pdf"}
@dataclass(frozen=True)
class Item: kind:str;ref:str;payload_key:str;manifest_key:str;payload:bytes;manifest:bytes
def digest(b):return hashlib.sha256(b).hexdigest()
def check_manifest(p,b,ref,filename):
 try:d=json.loads(p.read_text(encoding="utf-8"))
 except Exception as e:raise MigrationError(f"invalid manifest: {p}") from e
 if not {"schema_version","payload_ref","filename","byte_length","sha256"}.issubset(d) or d["schema_version"]!=SCHEMA or d["payload_ref"]!=ref or d["filename"]!=filename or d["byte_length"]!=len(b) or d["sha256"]!=digest(b):raise MigrationError(f"manifest integrity invalid: {p}")
 if p.parent.name == "simulation_artifacts" and filename not in ALLOWED_FILENAMES: raise MigrationError(f"invalid artifact filename: {filename}")
 return p.read_bytes()
def inventory(root):
 root=Path(root).resolve();out=[];seen=set();tr=root/"templates"
 if tr.exists():
  for p in sorted(tr.rglob("*.svg")):
   if p.is_symlink() or any(x.is_symlink() for x in p.parents if x != tr.parent):raise MigrationError(f"dangerous template symlink: {p}")
   rel=p.relative_to(tr).as_posix();ref=p.stem
   if ref in seen:raise MigrationError(f"duplicate template id: {ref}")
   seen.add(ref);b=p.read_bytes();s=p.with_suffix(".manifest.json")
   m=check_manifest(s,b,ref,p.name) if s.exists() else json.dumps({"schema_version":SCHEMA,"payload_ref":ref,"filename":p.name,"byte_length":len(b),"sha256":digest(b)},sort_keys=True).encode()
   k="templates/"+rel;out.append(Item("template",ref,k,k+".manifest.json",b,m))
 ar=root/"out"/"simulation_artifacts"
 if ar.exists():
  for pp in ar.glob("*.payload"):
   if not (ar/(pp.stem+".manifest.json")).is_file(): raise MigrationError(f"orphan payload: {pp}")
  for mp in sorted(ar.glob("*.manifest.json")):
   ref=mp.name[:-14];pp=ar/(ref+".payload")
   if not pp.is_file():raise MigrationError(f"missing payload: {pp}")
   b=pp.read_bytes();d=json.loads(mp.read_text(encoding="utf-8"));out.append(Item("artifact",ref,f"artifacts/{ref}.payload",f"artifacts/{ref}.manifest.json",b,check_manifest(mp,b,ref,d.get("filename",""))))
 return out
def read_obj(c,b,k):
 try:r=c.get_object(b,k)
 except Exception as e:
  if getattr(e,"code",None) in {"NoSuchKey","NoSuchObject"} or isinstance(e,(KeyError,FileNotFoundError)):return None
  raise MigrationError(f"cannot read {b}/{k}") from e
 try:return r.read()
 finally:
  for n in ("close","release_conn"):
   f=getattr(r,n,None)
   if f:f()
def migrate(items,client,buckets):
 result={"templates":0,"artifacts":0,"copied":0,"already_present":0}
 for b in buckets.values():
  if hasattr(client,"bucket_exists") and not client.bucket_exists(b):raise MigrationError(f"bucket does not exist: {b}")
 for i in items:
  b=buckets[i.kind+"s"];a=read_obj(client,b,i.payload_key);m=read_obj(client,b,i.manifest_key)
  if (a is None)!=(m is None):raise MigrationError(f"partial target: {i.kind}/{i.ref}")
  if a is not None:
   if a!=i.payload or m!=i.manifest:raise MigrationError(f"destination conflict: {i.kind}/{i.ref}")
   result["already_present"]+=1
  else:
   client.put_object(b,i.payload_key,io.BytesIO(i.payload),len(i.payload),content_type="image/svg+xml" if i.kind=="template" else "application/octet-stream")
   client.put_object(b,i.manifest_key,io.BytesIO(i.manifest),len(i.manifest),content_type="application/json")
   if read_obj(client,b,i.payload_key)!=i.payload or read_obj(client,b,i.manifest_key)!=i.manifest:raise MigrationError(f"verification failure: {i.kind}/{i.ref}")
   result["copied"]+=1
  result[i.kind+"s"]+=1
 return result
def main(argv=None):
 p=argparse.ArgumentParser();p.add_argument("--apply",action="store_true");p.add_argument("--root",type=Path,default=Path("backend/data"));a=p.parse_args(argv)
 try:items=inventory(a.root)
 except MigrationError as e:print(json.dumps({"ok":False,"error":str(e)},separators=(",",":")));return 2
 if not a.apply:print(json.dumps({"ok":True,"dry_run":True,"templates":sum(i.kind=="template" for i in items),"artifacts":sum(i.kind=="artifact" for i in items)},separators=(",",":")));return 0
 if not all(os.getenv(k) for k in ("MINIO_ENDPOINT","MINIO_ACCESS_KEY","MINIO_SECRET_KEY")):print(json.dumps({"ok":False,"error":"MINIO_ENDPOINT, MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required"},separators=(",",":")));return 2
 try:
  from minio import Minio;c=Minio(os.environ["MINIO_ENDPOINT"],access_key=os.environ["MINIO_ACCESS_KEY"],secret_key=os.environ["MINIO_SECRET_KEY"],secure=os.getenv("MINIO_SECURE","false").lower() in {"1","true","yes"});r=migrate(items,c,{"templates":os.getenv("MINIO_TEMPLATE_BUCKET","thermal-label"),"artifacts":os.getenv("MINIO_ARTIFACT_BUCKET","thermal-label")});print(json.dumps({"ok":True,"dry_run":False,**r},separators=(",",":")));return 0
 except Exception as e:print(json.dumps({"ok":False,"error":str(e)},separators=(",",":")));return 2
if __name__=="__main__":raise SystemExit(main())
