"""
Barcode and QR Code generator and SVG bounding box injector.
Supports Code128-B (via python-barcode) and QR Code 2D Matrix (via qrcode).
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional

from barcode import Code128
import qrcode
from qrcode.constants import ERROR_CORRECT_M


def generate_code128_pattern(code: str) -> str:
    """Generates a 1D bit string ('1' for bar, '0' for space) for Code128."""
    if not code:
        return ""
    bc = Code128(code, writer=None)
    built_pattern = bc.build()
    if not built_pattern or not isinstance(built_pattern, list):
        raise ValueError(f"Failed to generate Code128 pattern for code: '{code}'")
    return built_pattern[0]


def generate_qr_matrix(payload: str, error_correction=ERROR_CORRECT_M) -> List[List[bool]]:
    """Generates a 2D boolean matrix for QR code payload. True = black module."""
    if not payload:
        return []
    qr = qrcode.QRCode(
        error_correction=error_correction,
        box_size=1,
        border=0,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    return qr.get_matrix()

def create_barcode_svg_group(
    code_value: str,
    x: float,
    y: float,
    width: float,
    height: float,
    group_id: Optional[str] = None,
) -> ET.Element:
    """Creates an SVG <g> containing consolidated <path> for 1D barcode with crispEdges."""
    group = ET.Element("g")
    if group_id:
        group.set("id", group_id)

    pattern = generate_code128_pattern(code_value)
    if not pattern:
        return group

    total_modules = len(pattern)
    module_width = width / float(total_modules)

    path_d = []
    idx = 0
    while idx < total_modules:
        if pattern[idx] == "1":
            start_idx = idx
            while idx < total_modules and pattern[idx] == "1":
                idx += 1
            run_length = idx - start_idx
            x0 = x + (start_idx * module_width)
            x1 = x + ((start_idx + run_length) * module_width)
            y0 = y
            y1 = y + height
            path_d.append(f"M{x0:.4f},{y0:.4f}H{x1:.4f}V{y1:.4f}H{x0:.4f}Z")
        else:
            idx += 1

    if path_d:
        path_elem = ET.Element("path")
        path_elem.set("d", " ".join(path_d))
        path_elem.set("fill", "#000000")
        path_elem.set("stroke", "none")
        path_elem.set("shape-rendering", "crispEdges")
        group.append(path_elem)

    return group


def create_qr_svg_group(
    payload: str,
    x: float,
    y: float,
    width: float,
    height: float,
    group_id: Optional[str] = None,
) -> ET.Element:
    """Creates an SVG <g> containing consolidated horizontal run-length <path> for 2D QR Code with crispEdges."""
    group = ET.Element("g")
    if group_id:
        group.set("id", group_id)

    matrix = generate_qr_matrix(payload)
    if not matrix:
        return group

    rows = len(matrix)
    cols = len(matrix[0]) if rows > 0 else 0
    if rows == 0 or cols == 0:
        return group

    box_size = min(width / cols, height / rows)
    offset_x = x + (width - (cols * box_size)) / 2.0
    offset_y = y + (height - (rows * box_size)) / 2.0

    path_d = []
    for r in range(rows):
        c = 0
        while c < cols:
            if matrix[r][c]:
                start_c = c
                while c < cols and matrix[r][c]:
                    c += 1
                span = c - start_c
                x0 = offset_x + (start_c * box_size)
                x1 = offset_x + ((start_c + span) * box_size)
                y0 = offset_y + (r * box_size)
                y1 = offset_y + ((r + 1) * box_size)
                path_d.append(f"M{x0:.4f},{y0:.4f}H{x1:.4f}V{y1:.4f}H{x0:.4f}Z")
            else:
                c += 1

    if path_d:
        path_elem = ET.Element("path")
        path_elem.set("d", " ".join(path_d))
        path_elem.set("fill", "#000000")
        path_elem.set("stroke", "none")
        path_elem.set("shape-rendering", "crispEdges")
        group.append(path_elem)

    return group


def inject_barcodes_and_qr(svg_content: str, contract_data: Dict[str, Any]) -> str:
    """
    Parses SVG XML, replaces <rect data-barcode="..."> and <rect data-qr="...">
    (including Fabric.js exported <g> wrappers) with generated vector barcode groups.
    """
    codes = contract_data.get("codes", {}) if isinstance(contract_data, dict) else {}
    fields = contract_data.get("fields", {}) if isinstance(contract_data, dict) else {}
    if not isinstance(codes, dict):
        codes = {}
    if not isinstance(fields, dict):
        fields = {}

    ET.register_namespace("", "http://www.w3.org/2000/svg")
    root = ET.fromstring(svg_content)

    def resolve_barcode_val(key: str) -> str:
        clean_key = key.replace("{{", "").replace("}}", "").strip()
        val = (
            codes.get(clean_key, "")
            or fields.get(clean_key, "")
            or contract_data.get(clean_key, "")
            or codes.get(key, "")
            or fields.get(key, "")
            or contract_data.get(key, "")
        )
        if not val:
            if clean_key in ("batch_barcode", "batch_number", "batch_text") or "batch" in clean_key:
                val = fields.get("batch_text") or fields.get("batch_number") or contract_data.get("batch_number") or ""
            elif clean_key in ("roll_barcode", "roll_no") or "roll" in clean_key:
                val = fields.get("roll_no") or contract_data.get("roll_no") or ""
            elif clean_key in ("material_barcode", "matnr", "material_number") or "material" in clean_key or "mat" in clean_key:
                val = fields.get("material_number") or contract_data.get("material_number") or ""
        return str(val) if val else ""

    def resolve_qr_val(key: str) -> str:
        clean_key = key.replace("{{", "").replace("}}", "").strip()
        payload = (
            codes.get(clean_key, "")
            or fields.get(clean_key, "")
            or contract_data.get(clean_key, "")
            or codes.get(key, "")
            or fields.get(key, "")
            or contract_data.get(key, "")
        )
        if not payload:
            if clean_key in ("batch_text", "batch_number") or "batch" in clean_key:
                payload = fields.get("batch_text") or fields.get("batch_number") or contract_data.get("batch_number") or ""
            elif clean_key in ("material_number", "matnr") or "material" in clean_key or "mat" in clean_key:
                payload = fields.get("material_number") or contract_data.get("material_number") or ""
            else:
                mat = fields.get("material_number", "") or contract_data.get("material_number", "")
                bat = fields.get("batch_text") or fields.get("batch_number", "") or contract_data.get("batch_number", "")
                rol = fields.get("roll_no", "") or contract_data.get("roll_no", "")
                if mat or bat or rol:
                    payload = f"MAT:{mat};BAT:{bat};ROL:{rol}"
        return str(payload) if payload else ""

    def process_element(parent: ET.Element) -> None:
        children = list(parent)
        for i, child in enumerate(children):
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            barcode_key = (
                child.attrib.get("data-barcode")
                or child.attrib.get("dataBarcode")
                or child.attrib.get("databarcode")
            )
            qr_key = (
                child.attrib.get("data-qr")
                or child.attrib.get("dataQr")
                or child.attrib.get("dataqr")
            )
            elem_id = child.attrib.get("id") or ""
            label = (
                child.attrib.get("{http://www.inkscape.org/namespaces/inkscape}label")
                or child.attrib.get("inkscape:label")
                or ""
            )

            # Check if this element or its group matches barcode/QR rules
            is_qr = (
                bool(qr_key)
                or elem_id == "rect_batch_barcode-8"
                or "qr" in elem_id.lower()
                or "qr" in label.lower()
            )
            is_barcode = (
                bool(barcode_key)
                or "batch_barcode" in elem_id
                or ("barcode" in elem_id.lower() and not is_qr)
                or ("barcode" in label.lower() and not is_qr)
            )

            # Disambiguate if both matched or rect_batch_barcode-8
            if elem_id == "rect_batch_barcode-8" or "qr" in elem_id.lower():
                is_barcode = False
                is_qr = True

            if is_barcode:
                key = barcode_key or "batch_barcode"
                code_val = resolve_barcode_val(key)
                if not code_val and barcode_key:
                    code_val = barcode_key
                if code_val:
                    if tag in ("rect", "image"):
                        x = float(child.attrib.get("x", 0))
                        y = float(child.attrib.get("y", 0))
                        w = float(child.attrib.get("width", 0))
                        h = float(child.attrib.get("height", 0))
                        barcode_group = create_barcode_svg_group(
                            code_value=code_val,
                            x=x,
                            y=y,
                            width=w,
                            height=h,
                            group_id=elem_id,
                        )
                        parent.remove(child)
                        parent.insert(i, barcode_group)
                        continue
                    elif tag == "g":
                        # Fabric group wrapper: find inner rect or image
                        inner_target = None
                        for sub in list(child):
                            sub_tag = sub.tag.split("}")[-1] if "}" in sub.tag else sub.tag
                            if sub_tag in ("rect", "image"):
                                inner_target = sub
                                break
                        if inner_target is not None:
                            x = float(inner_target.attrib.get("x", 0))
                            y = float(inner_target.attrib.get("y", 0))
                            w = float(inner_target.attrib.get("width", 0))
                            h = float(inner_target.attrib.get("height", 0))
                            barcode_group = create_barcode_svg_group(
                                code_value=code_val,
                                x=x,
                                y=y,
                                width=w,
                                height=h,
                            )
                            child.remove(inner_target)
                            for path_node in list(barcode_group):
                                child.append(path_node)
                            continue

            elif is_qr:
                key = qr_key or "qr_payload"
                payload = resolve_qr_val(key)
                if not payload and qr_key:
                    payload = qr_key
                if payload:
                    if tag in ("rect", "image"):
                        x = float(child.attrib.get("x", 0))
                        y = float(child.attrib.get("y", 0))
                        w = float(child.attrib.get("width", 0))
                        h = float(child.attrib.get("height", 0))
                        qr_group = create_qr_svg_group(
                            payload=payload,
                            x=x,
                            y=y,
                            width=w,
                            height=h,
                            group_id=elem_id,
                        )
                        parent.remove(child)
                        parent.insert(i, qr_group)
                        continue
                    elif tag == "g":
                        # Fabric group wrapper: find inner rect or image
                        inner_target = None
                        for sub in list(child):
                            sub_tag = sub.tag.split("}")[-1] if "}" in sub.tag else sub.tag
                            if sub_tag in ("rect", "image"):
                                inner_target = sub
                                break
                        if inner_target is not None:
                            x = float(inner_target.attrib.get("x", 0))
                            y = float(inner_target.attrib.get("y", 0))
                            w = float(inner_target.attrib.get("width", 0))
                            h = float(inner_target.attrib.get("height", 0))
                            qr_group = create_qr_svg_group(
                                payload=payload,
                                x=x,
                                y=y,
                                width=w,
                                height=h,
                            )
                            child.remove(inner_target)
                            for path_node in list(qr_group):
                                child.append(path_node)
                            continue

            process_element(child)

    process_element(root)
    xml_decl = '<?xml version="1.0" encoding="UTF-8"?>\n'
    return xml_decl + ET.tostring(root, encoding="utf-8").decode("utf-8")

