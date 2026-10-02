"""Global graphics library with safe, versioned embedded payloads.

The registry is deliberately separate from templates: a template receives a data
URI copy, then retains asset id/version only as update metadata.
"""
from __future__ import annotations
import base64, json, re, uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from PIL import Image
from ..config import GRAPHICS_LIBRARY_DIR, STORAGE_BACKEND
from ..config import CUSTOM_TEMPLATES_DIR

MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 16_000_000
ALLOWED = {"image/svg+xml": ".svg", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
SVG_FORBIDDEN = re.compile(r"<\s*(script|foreignObject|iframe|object|embed|animate|set)\b|\bon\w+\s*=|(?:href|xlink:href)\s*=\s*[\"']\s*(?:(?:[a-z][a-z0-9+.-]*:)|//)", re.I)

class GraphicsService:
    @classmethod
    def _minio(cls):
        from ..storage.minio import _client
        import os
        return _client(), os.getenv("MINIO_TEMPLATE_BUCKET", "thermal-label"), "graphics/registry.json"
    @staticmethod
    def _registry() -> Path: return GRAPHICS_LIBRARY_DIR / "registry.json"
    @classmethod
    def _read(cls) -> dict[str, Any]:
        if STORAGE_BACKEND == "minio":
            client,bucket,key=cls._minio()
            try:
                response=client.get_object(bucket,key); raw=response.read(); response.close(); response.release_conn(); return json.loads(raw.decode("utf8"))
            except KeyError: return {"version":1,"graphics":[]}
            except Exception as exc:
                # Only an absent registry initializes a library. Credentials,
                # transport, malformed content, and all other object-store
                # failures must remain visible rather than looking empty.
                try:
                    from minio.error import S3Error
                    if isinstance(exc, S3Error) and exc.code in {"NoSuchKey", "NoSuchObject"}:
                        return {"version":1,"graphics":[]}
                except ImportError: pass
                raise
        try: return json.loads(cls._registry().read_text("utf-8"))
        except FileNotFoundError: return {"version": 1, "graphics": []}
    @classmethod
    def _write(cls, registry: dict[str, Any]) -> None:
        if STORAGE_BACKEND == "minio":
            import io
            client,bucket,key=cls._minio(); raw=json.dumps(registry,sort_keys=True).encode("utf8")
            client.put_object(bucket,key,io.BytesIO(raw),len(raw),content_type="application/json"); return
        target=cls._registry(); tmp=target.with_suffix(".tmp"); tmp.write_text(json.dumps(registry, sort_keys=True), "utf-8"); tmp.replace(target)
    @staticmethod
    def validate(payload: bytes, content_type: str) -> tuple[str, int | None, int | None]:
        if content_type not in ALLOWED: raise ValueError("Only SVG, PNG, JPEG, and WebP graphics are allowed")
        if not payload or len(payload) > MAX_BYTES: raise ValueError("Graphic must be between 1 byte and 5 MiB")
        if content_type == "image/svg+xml":
            try: text=payload.decode("utf-8")
            except UnicodeDecodeError as exc: raise ValueError("SVG must be UTF-8") from exc
            if "<svg" not in text.lower() or SVG_FORBIDDEN.search(text): raise ValueError("SVG contains active or external content")
            return text, None, None
        try:
            from io import BytesIO
            image=Image.open(BytesIO(payload)); image.verify()
            image=Image.open(BytesIO(payload)); width,height=image.size
        except Exception as exc: raise ValueError("Image payload is invalid") from exc
        if width < 1 or height < 1 or width * height > MAX_PIXELS: raise ValueError("Image dimensions are not allowed")
        return "", width, height
    @classmethod
    def list(cls):
        return [{k:v for k,v in item.items() if k != "payload"} for item in cls._read()["graphics"]]
    @classmethod
    def get(cls, graphic_id: str) -> dict[str, Any]:
        item=next((x for x in cls._read()["graphics"] if x["id"] == graphic_id), None)
        if not item: raise KeyError("Graphic not found")
        return item
    @staticmethod
    def _data_uri(payload: bytes, content_type: str) -> str:
        return f"data:{content_type};base64," + base64.b64encode(payload).decode("ascii")
    @classmethod
    def add(cls, name: str, payload: bytes, content_type: str) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9 _.-]{1,100}", name.strip()): raise ValueError("Invalid graphic name")
        _text,width,height=cls.validate(payload, content_type)
        registry=cls._read(); graphic_id=str(uuid.uuid4()); now=datetime.now(timezone.utc).isoformat()
        item={"id":graphic_id,"name":name.strip(),"version":1,"content_type":content_type,"byte_length":len(payload),"width":width,"height":height,"created_at":now,"updated_at":now,"payload":base64.b64encode(payload).decode("ascii")}
        registry["graphics"].append(item); cls._write(registry); return {**{k:v for k,v in item.items() if k != "payload"}, "data_uri":cls._data_uri(payload,content_type)}
    @classmethod
    def update(cls, graphic_id: str, payload: bytes, content_type: str) -> dict[str, Any]:
        cls.validate(payload, content_type); registry=cls._read(); item=next((x for x in registry["graphics"] if x["id"] == graphic_id),None)
        if not item: raise KeyError("Graphic not found")
        item.setdefault("versions",[]).append({"version":item["version"],"content_type":item["content_type"],"payload":item["payload"],"updated_at":item.get("updated_at")})
        item.update({"version":item["version"]+1,"content_type":content_type,"byte_length":len(payload),"payload":base64.b64encode(payload).decode("ascii"),"updated_at":datetime.now(timezone.utc).isoformat()})
        cls._write(registry); return {**{k:v for k,v in item.items() if k != "payload"}, "data_uri":cls._data_uri(payload,content_type)}
    @classmethod
    def delete(cls, graphic_id: str) -> bool:
        registry=cls._read(); original=len(registry["graphics"]); registry["graphics"]=[x for x in registry["graphics"] if x["id"] != graphic_id]
        if len(registry["graphics"]) == original:return False
        cls._write(registry); return True
    @classmethod
    def embedded(cls, graphic_id: str) -> dict[str, Any]:
        item=cls.get(graphic_id); raw=base64.b64decode(item["payload"]); return {"id":item["id"],"version":item["version"],"name":item["name"],"content_type":item["content_type"],"data_uri":cls._data_uri(raw,item["content_type"])}
    @classmethod
    def impact(cls, graphic_id: str) -> list[dict[str, Any]]:
        marker=f'data-graphic-asset-id="{graphic_id}"'
        result=[]
        if STORAGE_BACKEND == "minio":
            from ..storage.minio import MinioTemplateStore
            store=MinioTemplateStore()
            for obj in store.list():
                key=str(obj.object_name)
                if not key.endswith(".svg"): continue
                raw=store.read(key)
                if marker in raw: result.append({"template_id":Path(key).stem,"filename":Path(key).name,"object_key":key,"version":len(re.findall(marker,raw))})
            return result
        for path in CUSTOM_TEMPLATES_DIR.rglob("*.svg"):
            try: raw=path.read_text("utf-8")
            except OSError: continue
            if marker in raw:
                result.append({"template_id":path.stem,"filename":path.name,"version":len(re.findall(marker,raw))})
        return result
    @classmethod
    def bulk_update(cls, graphic_id: str, template_ids: list[str], dry_run: bool=False) -> dict[str, Any]:
        asset=cls.embedded(graphic_id); requested=set(template_ids); impacted=cls.impact(graphic_id)
        targets=[x for x in impacted if x["template_id"] in requested] if requested else impacted
        if dry_run: return {"dry_run":True,"affected":targets,"updated":[]}
        revision_root=GRAPHICS_LIBRARY_DIR / "template-revisions"; revision_root.mkdir(exist_ok=True) if STORAGE_BACKEND != "minio" else None
        updated=[]; marker=re.escape(f'data-graphic-asset-id="{graphic_id}"')
        # Image element is intentionally replaced as a bounded tag operation: all
        # layout attributes remain byte-for-byte intact except embedded source/version.
        tag_pattern=re.compile(r"<image\b[^>]*"+marker+r"[^>]*>",re.I)
        href_pattern=re.compile(r"(?:xlink:)?href=\"[^\"]*\"",re.I)
        version_pattern=re.compile(r"data-graphic-asset-version=\"[^\"]*\"",re.I)
        for target in targets:
            if STORAGE_BACKEND == "minio":
                from ..storage.minio import MinioTemplateStore
                import io
                store=MinioTemplateStore(); path=None; original=store.read(target["object_key"])
                def replace_tag(match):
                    tag=href_pattern.sub(f'href="{asset["data_uri"]}"',match.group(0)); return version_pattern.sub(f'data-graphic-asset-version="{asset["version"]}"',tag)
                changed=tag_pattern.sub(replace_tag,original)
                if changed==original: continue
                stamp=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                rev_key=f"graphics/template-revisions/{target['template_id']}/{stamp}.svg"; raw=original.encode(); store.client.put_object(store.bucket,rev_key,io.BytesIO(raw),len(raw),content_type="image/svg+xml")
                payload=changed.encode(); store.client.put_object(store.bucket,target["object_key"],io.BytesIO(payload),len(payload),content_type="image/svg+xml")
                if store.read(target["object_key"]) != changed: raise ValueError("Template update verification failed")
                updated.append({"template_id":target["template_id"],"revision":stamp}); continue
            path=next((p for p in CUSTOM_TEMPLATES_DIR.rglob(target["filename"]) if p.stem==target["template_id"]),None)
            if not path: continue
            original=path.read_text("utf-8")
            def replace_tag(match):
                tag=href_pattern.sub(f'href="{asset["data_uri"]}"',match.group(0))
                return version_pattern.sub(f'data-graphic-asset-version="{asset["version"]}"',tag)
            changed=tag_pattern.sub(replace_tag,original)
            if changed==original: continue
            rev_dir=revision_root/target["template_id"]; rev_dir.mkdir(parents=True,exist_ok=True)
            stamp=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            (rev_dir/f"{stamp}.svg").write_text(original,"utf-8")
            tmp=path.with_suffix(".svg.tmp"); tmp.write_text(changed,"utf-8"); tmp.replace(path)
            updated.append({"template_id":target["template_id"],"revision":stamp})
        return {"dry_run":False,"affected":targets,"updated":updated}
