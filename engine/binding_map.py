"""
SVG Data Binding & Bounding Box Extractor.
Extracts data-field/data-code/placeholder mappings from SVG templates and queries
exact vector element bounding boxes using resvg CLI query-all.
"""

from __future__ import annotations

import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from engine.rasterizer import get_resvg_executable_path


@dataclass
class BoundingBox:
    """Bounding box coordinates in image pixel space."""
    x: float
    y: float
    width: float
    height: float
    element_id: str
    json_path: str

    @property
    def x2(self) -> float:
        return self.x + self.width

    @property
    def y2(self) -> float:
        return self.y + self.height

    def contains_point(self, px: float, py: float, zoom_factor: float = 1.0) -> bool:
        """
        Checks if a point in pixel space falls inside this bounding box.
        Margin is zoom-aware to provide consistent hit-testing precision across zoom levels.
        """
        margin = max(2.0, 4.0 / max(0.1, zoom_factor))
        return (self.x - margin <= px <= self.x2 + margin) and (self.y - margin <= py <= self.y2 + margin)


class SVGInspectionEngine:
    """
    Parses SVG structure to map JSON contract paths (e.g., 'fields.brand', 'codes.batch_barcode')
    to SVG element IDs, queries element bounding boxes via resvg CLI, and scales them
    to match the output preview image coordinates.
    """

    PLACEHOLDER_PATTERN = re.compile(r"\{\{\s*([a-zA-Z0-9_\-]+)\s*\}\}")

    def __init__(self, resvg_path: Optional[Union[str, Path]] = None):
        self.resvg_exe = Path(resvg_path) if resvg_path else get_resvg_executable_path()

    def extract_element_bindings(self, svg_content: str) -> Dict[str, List[str]]:
        """
        Parses SVG XML and returns a mapping from JSON path to list of target SVG element IDs.
        Handles data-json-key, data-field, data-code, data-barcode, data-qr, and {{token}} placeholders.
        """
        bindings: Dict[str, List[str]] = {}

        def add_binding(json_path: str, elem_id: str):
            if not json_path or not elem_id:
                return
            if json_path not in bindings:
                bindings[json_path] = []
            if elem_id not in bindings[json_path]:
                bindings[json_path].append(elem_id)

        try:
            root = ET.fromstring(svg_content)
        except Exception:
            return bindings

        ns = "{http://www.w3.org/2000/svg}"
        parent_map = {c: p for p in root.iter() for c in p}

        for elem in root.iter():
            elem_id = elem.get("id")

            # explicit full json key / bind
            data_json_key = elem.get("data-json-key") or elem.get("data-bind")
            if data_json_key:
                target_id = self._find_queryable_id(elem, parent_map, ns)
                if target_id:
                    add_binding(data_json_key, target_id)

            # data-field attribute
            data_field = elem.get("data-field")
            if data_field:
                target_id = self._find_queryable_id(elem, parent_map, ns)
                if target_id:
                    add_binding(f"fields.{data_field}", target_id)

            # data-code attribute
            data_code = elem.get("data-code")
            if data_code:
                target_id = self._find_queryable_id(elem, parent_map, ns)
                if target_id:
                    add_binding(f"codes.{data_code}", target_id)

            # data-barcode attribute
            data_bc = elem.get("data-barcode")
            if data_bc:
                target_id = self._find_queryable_id(elem, parent_map, ns)
                if target_id:
                    add_binding(f"codes.{data_bc}", target_id)

            # data-qr attribute
            data_qr = elem.get("data-qr")
            if data_qr:
                target_id = self._find_queryable_id(elem, parent_map, ns)
                if target_id:
                    add_binding(f"codes.{data_qr}", target_id)

            # Inspect element text & tspans for {{token}}
            text_val = (elem.text or "") + "".join(child.tail or "" for child in elem)
            matches = self.PLACEHOLDER_PATTERN.findall(text_val)
            for token in matches:
                target_id = self._find_queryable_id(elem, parent_map, ns)
                if target_id:
                    add_binding(f"fields.{token}", target_id)
                    add_binding(f"codes.{token}", target_id)
        return bindings

    def _find_queryable_id(
        self,
        elem: ET.Element,
        parent_map: Dict[ET.Element, ET.Element],
        ns: str
    ) -> Optional[str]:
        """
        Traverses upward to find an ancestor with an ID suitable for resvg query.
        Prefers parent <text> or <g> over inner <tspan> to get the full bounding box.
        """
        curr: Optional[ET.Element] = elem
        tspan_id: Optional[str] = None

        while curr is not None:
            elem_id = curr.get("id")
            tag_name = curr.tag.replace(ns, "")
            if elem_id:
                if tag_name == "tspan" and tspan_id is None:
                    tspan_id = elem_id
                elif tag_name != "tspan":
                    # Found ancestor <text>, <rect>, <g>, etc.
                    return elem_id
            curr = parent_map.get(curr)

        return tspan_id

    def _parse_svg_dimensions(self, svg_file_path: Union[str, Path]) -> Tuple[float, float]:
        """
        Parses physical SVG width and height in mm from viewBox or width/height attributes.
        Defaults to (200.0, 80.0) mm if not explicitly specified.
        """
        try:
            tree = ET.parse(svg_file_path)
            root = tree.getroot()
            vb = root.get("viewBox")
            if vb:
                parts = [float(p) for p in re.split(r"[\s,]+", vb.strip()) if p]
                if len(parts) >= 4 and parts[2] > 0 and parts[3] > 0:
                    return parts[2], parts[3]

            w_str = root.get("width", "200mm")
            h_str = root.get("height", "80mm")

            def to_mm(val: str, default: float) -> float:
                v = val.strip().lower()
                if v.endswith("mm"):
                    return float(v[:-2])
                elif v.endswith("in"):
                    return float(v[:-2]) * 25.4
                elif v.endswith("px"):
                    return float(v[:-2]) * (25.4 / 96.0)
                try:
                    return float(v)
                except ValueError:
                    return default

            return to_mm(w_str, 200.0), to_mm(h_str, 80.0)
        except Exception:
            return 200.0, 80.0



    def query_all_element_boxes(
        self,
        svg_file_path: Union[str, Path],
        dpi: float = 203.2,
        target_width_px: int = 1600,
        target_height_px: int = 640,
    ) -> Dict[str, Tuple[float, float, float, float]]:
        """
        Runs resvg --dpi <dpi> --query-all to extract raw element bounding boxes,
        then scales them precisely to match the exact target raster width/height.

        Accurate scale ratio mapping:
        Scale_X = PNG_Width / (SVG_Width_mm / 25.4 * DPI)
        Scale_Y = PNG_Height / (SVG_Height_mm / 25.4 * DPI)
        
        Returns: { element_id: (x, y, width, height) in px }
        """
        svg_path = Path(svg_file_path)
        if not svg_path.is_file():
            return {}

        cmd_dpi = int(round(dpi))
        cmd = [
            str(self.resvg_exe),
            "--dpi", str(cmd_dpi),
            "--query-all",
            str(svg_path.resolve()),
        ]

        kwargs = {
            "capture_output": True,
            "text": True,
            "check": False,
            "stdin": subprocess.DEVNULL,
            "timeout": 15.0,
        }
        if sys.platform == "win32":
            kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)

        try:
            res = subprocess.run(cmd, **kwargs)
            if res.returncode != 0:
                return {}
        except Exception:
            return {}

        boxes: Dict[str, Tuple[float, float, float, float]] = {}
        for line in res.stdout.strip().splitlines():
            parts = line.strip().split(",")
            if len(parts) >= 5:
                elem_id = parts[0].strip()
                try:
                    x = float(parts[1])
                    y = float(parts[2])
                    w = float(parts[3])
                    h = float(parts[4])
                    boxes[elem_id] = (x, y, w, h)
                except ValueError:
                    continue

        # Compute direct physical SVG scale ratio to target raster pixel dimensions
        svg_w_mm, svg_h_mm = self._parse_svg_dimensions(svg_path)
        svg_rendered_w = (svg_w_mm / 25.4) * cmd_dpi
        svg_rendered_h = (svg_h_mm / 25.4) * cmd_dpi

        scale_x = target_width_px / svg_rendered_w if svg_rendered_w > 0 else 1.0
        scale_y = target_height_px / svg_rendered_h if svg_rendered_h > 0 else 1.0

        scaled_boxes: Dict[str, Tuple[float, float, float, float]] = {}
        for elem_id, (x, y, w, h) in boxes.items():
            scaled_boxes[elem_id] = (
                round(x * scale_x, 2),
                round(y * scale_y, 2),
                round(w * scale_x, 2),
                round(h * scale_y, 2),
            )

        return scaled_boxes

    def transform_bbox_by_rotation(
        self,
        bbox: BoundingBox,
        rotation_angle: int,
        orig_width_px: int,
        orig_height_px: int,
    ) -> BoundingBox:
        """
        Transforms a BoundingBox to match coordinates in rotated image space.

        Transformations (Clockwise):
        - 0°: No change
        - 90° CW:  (x, y, w, h) -> (orig_height_px - y - h, x, h, w)
        - 180° CW: (x, y, w, h) -> (orig_width_px - x - w, orig_height_px - y - h, w, h)
        - 270° CW: (x, y, w, h) -> (y, orig_width_px - x - w, h, w)
        """
        rot = rotation_angle % 360
        if rot == 0:
            return bbox

        x, y, w, h = bbox.x, bbox.y, bbox.width, bbox.height

        if rot == 90:
            new_x = round(orig_height_px - y - h, 2)
            new_y = round(x, 2)
            new_w = round(h, 2)
            new_h = round(w, 2)
        elif rot == 180:
            new_x = round(orig_width_px - x - w, 2)
            new_y = round(orig_height_px - y - h, 2)
            new_w = round(w, 2)
            new_h = round(h, 2)
        elif rot == 270:
            new_x = round(y, 2)
            new_y = round(orig_width_px - x - w, 2)
            new_w = round(h, 2)
            new_h = round(w, 2)
        else:
            return bbox

        return BoundingBox(
            x=new_x,
            y=new_y,
            width=new_w,
            height=new_h,
            element_id=bbox.element_id,
            json_path=bbox.json_path,
        )

    def build_inspection_map(
        self,
        svg_content: str,
        rendered_svg_path: Union[str, Path],
        target_width_px: int = 1600,
        target_height_px: int = 640,
        dpi: float = 203.2,
        rotation: int = 0,
    ) -> List[BoundingBox]:
        """
        Builds a complete list of BoundingBox objects mapping JSON paths to pixel coordinates.
        Supports automatic coordinate transformation for rotated images.
        """
        key_to_elem_ids = self.extract_element_bindings(svg_content)
        elem_boxes = self.query_all_element_boxes(
            rendered_svg_path,
            dpi=dpi,
            target_width_px=target_width_px,
            target_height_px=target_height_px,
        )

        all_boxes: List[BoundingBox] = []
        for json_path, elem_ids in key_to_elem_ids.items():
            for elem_id in elem_ids:
                if elem_id in elem_boxes:
                    bx, by, bw, bh = elem_boxes[elem_id]
                    if bw >= target_width_px * 0.95 and bh >= target_height_px * 0.95:
                        continue
                    box = BoundingBox(
                        x=bx,
                        y=by,
                        width=bw,
                        height=bh,
                        element_id=elem_id,
                        json_path=json_path,
                    )
                    if rotation % 360 != 0:
                        box = self.transform_bbox_by_rotation(
                            box,
                            rotation_angle=rotation,
                            orig_width_px=target_width_px,
                            orig_height_px=target_height_px,
                        )
                    all_boxes.append(box)

        return all_boxes
