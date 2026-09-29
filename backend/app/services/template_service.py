"""
Template Service for managing, parsing, and extracting metadata from SVG label templates.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ..config import BUILTIN_TEMPLATES_DIR, CUSTOM_TEMPLATES_DIR, PROJECT_ROOT, STORAGE_BACKEND
from ..models.schemas import TemplateDetail, TemplateSummary


class TemplateService:
    MAX_FOLDER_DEPTH = 8

    @classmethod
    def _minio_store(cls):
        if STORAGE_BACKEND != "minio":
            return None
        from ..storage.minio import MinioTemplateStore
        return MinioTemplateStore()

    @classmethod
    def _folder_path(cls, folder_id: Optional[str]) -> Path:
        root = CUSTOM_TEMPLATES_DIR.resolve()
        if not folder_id:
            return root
        raw = str(folder_id).replace("\\", "/").strip("/")
        parts = raw.split("/")
        if not parts or len(parts) > cls.MAX_FOLDER_DEPTH or any(not p or p in {".", ".."} or not re.fullmatch(r"[A-Za-z0-9 _-]+", p) for p in parts):
            raise ValueError("Invalid folder path")
        target = (root.joinpath(*parts)).resolve()
        if target != root and root not in target.parents:
            raise ValueError("Invalid folder path")
        return target

    @classmethod
    def _clean_template_id(cls, template_id: str) -> str:
        if not isinstance(template_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]+(?:\.svg)?", template_id):
            raise ValueError("Invalid template ID")
        return template_id[:-4] if template_id.endswith(".svg") else template_id

    @classmethod
    def list_folders(cls) -> List[dict]:
        if STORAGE_BACKEND == "minio":
            store = cls._minio_store(); folders=set()
            for obj in store.list():
                rel=str(obj.object_name)[len(store.prefix):]; parent=Path(rel).parent
                if str(parent) != ".":
                    parts=parent.parts
                    for i in range(1,len(parts)+1): folders.add("/".join(parts[:i]))
            return [{"id": f, "name": Path(f).name, "path": f, "parent_id": str(Path(f).parent) if str(Path(f).parent) != "." else None} for f in sorted(folders)]
        root = CUSTOM_TEMPLATES_DIR.resolve()
        if not root.exists(): return []
        result = []
        for p in sorted((d for d in root.rglob("*") if d.is_dir()), key=lambda x: str(x).lower()):
            try:
                if root not in p.resolve().parents:
                    continue
            except OSError:
                continue
            rel = p.relative_to(root).as_posix()
            parent = p.parent.relative_to(root).as_posix() if p.parent != root else None
            result.append({"id": rel, "name": p.name, "path": rel, "parent_id": parent})
        return result

    @classmethod
    def create_folder(cls, name: str, parent_id: Optional[str] = None) -> dict:
        reserved = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}
        if not re.fullmatch(r"[A-Za-z0-9 _-]{1,80}", name.strip()) or name.strip() in {".", ".."} or name.strip().split(".")[0].upper() in reserved:
            raise ValueError("Invalid folder name")
        if STORAGE_BACKEND == "minio":
            store=cls._minio_store(); parent=store.validate_folder(parent_id or "")
            if parent and not any(str(o.object_name) == f"{store.prefix}{parent}/.folder" for o in store.list()):
                raise ValueError("Parent folder does not exist")
            parent=(parent + "/") if parent else ""
            folder=f"{parent}{name.strip()}"
            folder=store.validate_folder(folder)
            if any(str(o.object_name) == store.prefix+folder+"/.folder" for o in store.list()): raise ValueError("Folder already exists")
            import io
            marker=f"{store.prefix}{folder}/.folder"; store.client.put_object(store.bucket, marker, io.BytesIO(b""), 0, content_type="application/x-directory")
            return {"id":folder,"name":name.strip(),"path":folder,"parent_id":parent or None}
        parent = cls._folder_path(parent_id)
        if not parent.exists() or not parent.is_dir():
            raise ValueError("Parent folder does not exist")
        target = (parent / name.strip()).resolve()
        root = CUSTOM_TEMPLATES_DIR.resolve()
        if root not in target.parents or target.exists(): raise ValueError("Folder already exists or is invalid")
        target.mkdir(parents=False)
        rel = target.relative_to(root).as_posix()
        return {"id": rel, "name": target.name, "path": rel, "parent_id": parent.relative_to(root).as_posix() if parent != root else None}
    @staticmethod
    def _parse_dimension(dim_str: Optional[str]) -> Optional[float]:
        if not dim_str:
            return None
        match = re.search(r"([\d\.]+)", dim_str)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                return None
        return None

    @classmethod
    def list_templates(cls) -> List[TemplateSummary]:
        """Lists all built-in and custom templates available."""
        templates: List[TemplateSummary] = []
        seen_ids = set()

        # Built-ins remain local. In MinIO mode custom templates are read only
        # from the object store, preventing stale local custom files from being
        # silently selected.
        if STORAGE_BACKEND == "minio":
            store = cls._minio_store()
            for obj in store.list():
                key = str(obj.object_name)
                if not key.endswith(".svg") or not key.startswith(store.prefix):
                    continue
                rel = key[len(store.prefix):]
                tmpl_id = Path(rel).stem
                if tmpl_id in seen_ids: continue
                seen_ids.add(tmpl_id)
                detail = cls.parse_svg_string(store.read(key), template_id=tmpl_id, filename=Path(rel).name)
                templates.append(TemplateSummary(id=tmpl_id, name=tmpl_id.replace("_", " ").title(), filename=Path(rel).name, is_builtin=False, width_mm=detail.width_mm, height_mm=detail.height_mm, folder_id=str(Path(rel).parent) if str(Path(rel).parent) != "." else None, folder_path=str(Path(rel).parent) if str(Path(rel).parent) != "." else None))

        # 1. Search in CUSTOM_TEMPLATES_DIR first (User-created and uploaded templates)
        if STORAGE_BACKEND != "minio" and CUSTOM_TEMPLATES_DIR.exists():
            for p in sorted(CUSTOM_TEMPLATES_DIR.rglob("*.svg"), key=lambda x: x.stat().st_mtime, reverse=True):
                if CUSTOM_TEMPLATES_DIR.resolve() not in p.resolve().parents:
                    continue
                tmpl_id = p.stem
                if tmpl_id not in seen_ids:
                    seen_ids.add(tmpl_id)
                    w_mm, h_mm = cls.extract_dimensions_from_file(p)
                    templates.append(
                        TemplateSummary(
                            id=tmpl_id,
                            name=tmpl_id.replace("_", " ").title(),
                            filename=p.name,
                            is_builtin=False,
                            width_mm=w_mm,
                            height_mm=h_mm, folder_id=p.parent.relative_to(CUSTOM_TEMPLATES_DIR).as_posix() if p.parent != CUSTOM_TEMPLATES_DIR else None,
                            folder_path=p.parent.relative_to(CUSTOM_TEMPLATES_DIR).as_posix() if p.parent != CUSTOM_TEMPLATES_DIR else None,
                        )
                    )

        # 2. Search in BUILTIN_TEMPLATES_DIR
        if BUILTIN_TEMPLATES_DIR.exists():
            for p in sorted(BUILTIN_TEMPLATES_DIR.glob("*.svg")):
                tmpl_id = p.stem
                if tmpl_id not in seen_ids:
                    seen_ids.add(tmpl_id)
                    w_mm, h_mm = cls.extract_dimensions_from_file(p)
                    templates.append(
                        TemplateSummary(
                            id=tmpl_id,
                            name=tmpl_id.replace("_", " ").title(),
                            filename=p.name,
                            is_builtin=True,
                            width_mm=w_mm,
                            height_mm=h_mm,
                        )
                    )

        # 3. Check root directory SVG templates if any
        for root_svg in sorted(PROJECT_ROOT.glob("label_*.svg")):
            tmpl_id = root_svg.stem
            if tmpl_id not in seen_ids:
                seen_ids.add(tmpl_id)
                w_mm, h_mm = cls.extract_dimensions_from_file(root_svg)
                templates.append(
                    TemplateSummary(
                        id=tmpl_id,
                        name=tmpl_id.replace("_", " ").title(),
                        filename=root_svg.name,
                        is_builtin=True,
                        width_mm=w_mm,
                        height_mm=h_mm,
                    )
                )

        return templates

    @classmethod
    def get_template_path(cls, template_id: str) -> Optional[Path]:
        """Finds template Path by ID or filename."""
        try: clean_id = cls._clean_template_id(template_id)
        except ValueError: return None

        # Check custom first. In MinIO mode materialize the selected object into
        # a private cache so existing render/print callers can keep their Path API.
        if STORAGE_BACKEND == "minio":
            store = cls._minio_store()
            for obj in store.list():
                if str(obj.object_name).endswith(f"/{clean_id}.svg") or str(obj.object_name) == f"{store.prefix}{clean_id}.svg":
                    return store.materialize(clean_id, str(obj.object_name))
            # MinIO mode is authoritative for custom templates.
            builtin_path = BUILTIN_TEMPLATES_DIR / f"{clean_id}.svg"
            if builtin_path.exists(): return builtin_path
            root_path = PROJECT_ROOT / f"{clean_id}.svg"
            return root_path if root_path.exists() else None
        # Check custom first
        root = CUSTOM_TEMPLATES_DIR.resolve()
        for custom_path in root.rglob(f"{clean_id}.svg"):
            if custom_path.is_file() and root in custom_path.resolve().parents:
                return custom_path

        # Check builtin directory
        builtin_path = BUILTIN_TEMPLATES_DIR / f"{clean_id}.svg"
        if builtin_path.exists():
            return builtin_path

        # Check root
        root_path = PROJECT_ROOT / f"{clean_id}.svg"
        if root_path.exists():
            return root_path

        return None

    @classmethod
    def get_template_detail(cls, template_id: str) -> Optional[TemplateDetail]:
        """Extracts full metadata, dynamic tokens, barcodes, and QR fields from an SVG."""
        tmpl_path = cls.get_template_path(template_id)
        if not tmpl_path or not tmpl_path.exists():
            return None

        svg_content = tmpl_path.read_text(encoding="utf-8")
        if STORAGE_BACKEND == "minio":
            clean_id = cls._clean_template_id(template_id)
            store = cls._minio_store()
            is_builtin = not any(
                str(obj.object_name).endswith(f"/{clean_id}.svg")
                or str(obj.object_name) == f"{store.prefix}{clean_id}.svg"
                for obj in store.list()
            )
        else:
            is_builtin = tmpl_path.resolve().parent != CUSTOM_TEMPLATES_DIR.resolve() and CUSTOM_TEMPLATES_DIR.resolve() not in tmpl_path.resolve().parents
        return cls.parse_svg_string(svg_content, template_id=tmpl_path.stem, filename=tmpl_path.name, is_builtin=is_builtin)

    @classmethod
    def parse_svg_string(
        cls,
        svg_content: str,
        template_id: str = "inline_template",
        filename: str = "inline.svg",
        is_builtin: bool = False
    ) -> TemplateDetail:
        """Parses an SVG content string and returns full details."""
        # Find all {{placeholder}} tokens
        tokens = sorted(list(set(re.findall(r"\{\{\s*([a-zA-Z0-9_\-]+)\s*\}\}", svg_content))))
        tokens = sorted(set(tokens) | set(re.findall(r'(?<![A-Za-z0-9_-])data-placeholder=["\']([a-zA-Z0-9_\-]+)["\']', svg_content)))

        # Find 1D barcode fields (data-barcode="..." or data-field="...")
        barcodes = sorted(list(set(re.findall(r'data-barcode=["\']([^"\']+)["\']', svg_content))))

        # Find QR code fields (data-qr="...")
        qrs = sorted(list(set(re.findall(r'data-qr=["\']([^"\']+)["\']', svg_content))))

        # Parse XML attributes
        w_mm: Optional[float] = None
        h_mm: Optional[float] = None
        view_box: Optional[str] = None

        try:
            root = ET.fromstring(svg_content)
            view_box = root.attrib.get("viewBox")
            raw_w = root.attrib.get("width")
            raw_h = root.attrib.get("height")
            if raw_w:
                w_mm = cls._parse_dimension(raw_w)
            if raw_h:
                h_mm = cls._parse_dimension(raw_h)
        except Exception:
            pass

        return TemplateDetail(
            id=template_id,
            name=template_id.replace("_", " ").title(),
            filename=filename,
            is_builtin=is_builtin,
            width_mm=w_mm or 200.0,
            height_mm=h_mm or 80.0,
            view_box=view_box,
            tokens=tokens,
            barcode_fields=barcodes,
            qr_fields=qrs,
            raw_svg=svg_content,
            svg_content=svg_content,
        )

    @classmethod
    def save_custom_template(cls, template_name: str, svg_content: str, folder_id: Optional[str] = None) -> TemplateDetail:
        """Saves a new custom SVG template."""
        clean_name = re.sub(r"[^a-zA-Z0-9_-]", "_", template_name.lower().strip())
        if not clean_name.endswith(".svg"):
            file_name = f"{clean_name}.svg"
            tmpl_id = clean_name
        else:
            file_name = clean_name
            tmpl_id = clean_name[:-4]

        if STORAGE_BACKEND == "minio":
            store = cls._minio_store()
            existing = [str(o.object_name) for o in store.list() if str(o.object_name).endswith("/" + tmpl_id + ".svg") or str(o.object_name) == store.prefix + tmpl_id + ".svg"]
            folder = store.validate_folder(folder_id or "")
            # The editor omits folder_id on Save; preserve the existing object's
            # folder instead of moving a nested template to the bucket root.
            if folder_id is None and len(existing) == 1:
                relative = existing[0][len(store.prefix):]
                folder = store.validate_folder(str(Path(relative).parent) if str(Path(relative).parent) != "." else "")
            key = store._key(folder, tmpl_id)
            if any(item != key for item in existing):
                raise ValueError("Template ID already exists in another folder")
            if folder and not any(str(o.object_name) == store.prefix + folder + "/.folder" for o in store.list()):
                raise ValueError("Parent folder does not exist")
            import io
            store.client.put_object(store.bucket, key, io.BytesIO(svg_content.encode("utf-8")), len(svg_content.encode("utf-8")), content_type="image/svg+xml")
            return cls.parse_svg_string(svg_content, template_id=tmpl_id, filename=file_name, is_builtin=False)
        folder = cls._folder_path(folder_id)
        existing = cls.get_template_path(tmpl_id)
        if existing and CUSTOM_TEMPLATES_DIR.resolve() in existing.resolve().parents:
            if folder_id and folder.resolve() != existing.parent.resolve():
                raise ValueError("Template ID already exists in another folder; move it explicitly")
            folder = existing.parent
        folder.mkdir(parents=True, exist_ok=True)
        target_file = folder / file_name
        target_file.write_text(svg_content, encoding="utf-8")

        return cls.parse_svg_string(svg_content, template_id=tmpl_id, filename=file_name, is_builtin=False)

    @classmethod
    def move_template(cls, template_id: str, folder_id: Optional[str]) -> bool:
        if STORAGE_BACKEND == "minio":
            store=cls._minio_store(); clean=cls._clean_template_id(template_id)
            sources=[str(o.object_name) for o in store.list() if str(o.object_name).endswith(f"/{clean}.svg") or str(o.object_name)==f"{store.prefix}{clean}.svg"]
            if len(sources)>1: raise ValueError("Duplicate template ID")
            src=sources[0] if sources else None
            if not src: return False
            destination=store.validate_folder(folder_id or "")
            if destination and not any(str(o.object_name)==store.prefix+destination+"/.folder" for o in store.list()): raise ValueError("Destination folder does not exist")
            dst=store._key(destination, clean)
            if src==dst: return True
            if any(str(o.object_name) == dst for o in store.list()):
                raise ValueError("Template already exists in destination")
            from minio.commonconfig import CopySource
            store.client.copy_object(store.bucket,dst,CopySource(store.bucket,src))
            if store.read(dst) != store.read(src):
                raise ValueError("Template move verification failed")
            store.client.remove_object(store.bucket,src); return True
        source = cls.get_template_path(template_id)
        root = CUSTOM_TEMPLATES_DIR.resolve()
        if not source or root not in source.resolve().parents: return False
        target_dir = cls._folder_path(folder_id)
        if not target_dir.exists() or not target_dir.is_dir(): raise ValueError("Destination folder does not exist")
        target = target_dir / source.name
        if target.exists() and target.resolve() != source.resolve(): raise ValueError("Template already exists in destination")
        source.replace(target)
        return True

    @classmethod
    def delete_custom_template(cls, template_id: str) -> bool:
        """Deletes a custom template file from CUSTOM_TEMPLATES_DIR."""
        try: clean_id = cls._clean_template_id(template_id)
        except ValueError: return False
        if STORAGE_BACKEND == "minio":
            store=cls._minio_store(); src=next((str(o.object_name) for o in store.list() if str(o.object_name).endswith(f"/{clean_id}.svg") or str(o.object_name)==f"{store.prefix}{clean_id}.svg"),None)
            if not src: return False
            store.client.remove_object(store.bucket,src); return True
        target_file = cls.get_template_path(clean_id)
        if target_file and CUSTOM_TEMPLATES_DIR.resolve() in target_file.resolve().parents:
            target_file.unlink()
            return True
        return False

    @classmethod
    def extract_dimensions_from_file(cls, path: Path) -> Tuple[Optional[float], Optional[float]]:
        try:
            content = path.read_text(encoding="utf-8")
            root = ET.fromstring(content)
            w = cls._parse_dimension(root.attrib.get("width"))
            h = cls._parse_dimension(root.attrib.get("height"))
            return w, h
        except Exception:
            return None, None
