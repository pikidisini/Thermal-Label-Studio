"""
Template Service for managing, parsing, and extracting metadata from SVG label templates.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ..config import BUILTIN_TEMPLATES_DIR, CUSTOM_TEMPLATES_DIR, PROJECT_ROOT
from ..models.schemas import TemplateDetail, TemplateSummary


class TemplateService:
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

        # 1. Search in BUILTIN_TEMPLATES_DIR
        if BUILTIN_TEMPLATES_DIR.exists():
            for p in BUILTIN_TEMPLATES_DIR.glob("*.svg"):
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

        # 2. Check root directory SVG templates if any
        for root_svg in PROJECT_ROOT.glob("label_*.svg"):
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

        # 3. Search in CUSTOM_TEMPLATES_DIR
        if CUSTOM_TEMPLATES_DIR.exists():
            for p in CUSTOM_TEMPLATES_DIR.glob("*.svg"):
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
                            height_mm=h_mm,
                        )
                    )

        return templates

    @classmethod
    def get_template_path(cls, template_id: str) -> Optional[Path]:
        """Finds template Path by ID or filename."""
        clean_id = template_id.replace(".svg", "")

        # Check custom first
        custom_path = CUSTOM_TEMPLATES_DIR / f"{clean_id}.svg"
        if custom_path.exists():
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
        return cls.parse_svg_string(svg_content, template_id=tmpl_path.stem, filename=tmpl_path.name, is_builtin=tmpl_path.parent != CUSTOM_TEMPLATES_DIR)

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
        tokens = sorted(list(set(re.findall(r"\{\{([a-zA-Z0-9_]+)\}\}", svg_content))))

        # Find 1D barcode fields (data-barcode="...")
        barcodes = sorted(list(set(re.findall(r'data-barcode=["\']([a-zA-Z0-9_]+)["\']', svg_content))))

        # Find QR code fields (data-qr="...")
        qrs = sorted(list(set(re.findall(r'data-qr=["\']([a-zA-Z0-9_]+)["\']', svg_content))))

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
    def save_custom_template(cls, template_name: str, svg_content: str) -> TemplateDetail:
        """Saves a new custom SVG template."""
        clean_name = re.sub(r"[^a-zA-Z0-9_-]", "_", template_name.lower().strip())
        if not clean_name.endswith(".svg"):
            file_name = f"{clean_name}.svg"
            tmpl_id = clean_name
        else:
            file_name = clean_name
            tmpl_id = clean_name[:-4]

        target_file = CUSTOM_TEMPLATES_DIR / file_name
        target_file.write_text(svg_content, encoding="utf-8")

        return cls.parse_svg_string(svg_content, template_id=tmpl_id, filename=file_name, is_builtin=False)

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
