"""
Processor pipeline orchestrator for label rendering and printer encoding.

Pipeline:
1. Load & validate JSON contract (Pure Data v1.1)
2. Inject string fields & codes into SVG template placeholders
3. Generate vector Code128 and QR Code modules into bounding box rects
4. Rasterize SVG to PNG preview using resvg
5. Binarize to 1-Bit monochrome bitmap & pack bits per row
6. Encode to target printer instructions (ZPL, TSPL, IPL, PNG preview)
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from .renderer import load_json_contract, load_svg_template, inject_data, validate_no_orphan_tokens
from .barcode_generator import inject_barcodes_and_qr
from .rasterizer import svg_to_png, png_to_1bit_monochrome, save_1bit_bmp, rotate_image_cw, calculate_otsu_threshold
from .bit_packer import get_raw_bitmap_data
from .printer_encoders import encode_zpl, encode_tspl, encode_ipl, encode_pdf
from PIL import Image


def align_to_byte_boundary(pixels: int, alignment: int = 8) -> int:
    """
    Aligns pixel dimension (width) up to the nearest multiple of alignment (default 8 dots / 1 byte).
    Ensures bitmap row-padding and byte-stream alignment for thermal printer encoders (IPL, ZPL, TSPL).
    """
    return ((pixels + alignment - 1) // alignment) * alignment


def process_label(
    json_source: Union[str, Path, dict],
    template_source: Union[str, Path],
    out_dir: Union[str, Path],
    formats: Union[str, List[str]] = "all",
    dpi: float = 203.2,
    rotation: int = 0,
    binarization_threshold: Optional[int] = None,
    super_sample_factor: int = 2,
    downsampling_filter: str = "NEAREST",
    width_px: Optional[int] = None,
    height_px: Optional[int] = None,
    width_mm: float = 200.0,
    height_mm: float = 80.0,
) -> Dict[str, Path]:
    """
    Executes the full end-to-end rendering and encoding pipeline.
    
    Args:
        json_source: Input JSON contract or dict.
        template_source: SVG template path.
        out_dir: Output directory for rendered artifacts.
        formats: Target formats ('all', or comma-separated list like 'zpl,png').
        dpi: Target thermal printer resolution DPI (e.g. 203.2, 300, 600).
        rotation: Clockwise rotation angle (0, 90, 180, 270 degrees).
        binarization_threshold: Threshold [0..255] for monochrome 1-bit conversion (None = auto-detect via Otsu).
        super_sample_factor: Multiplier for vector anti-aliasing super-sampling before downscaling (default: 2).
        downsampling_filter: Resampling filter for super-sample downscaling (default: 'NEAREST' for sharp 1-bit output).
        width_px: Explicit override width in dots (optional).
        height_px: Explicit override height in dots (optional).
        width_mm: Physical label width in millimeters (default: 200.0).
        height_mm: Physical label height in millimeters (default: 80.0).

    Returns:
        Dictionary mapping format names ('svg', 'png', 'bmp', 'pdf', 'zpl', 'tspl', 'ipl')
        to their generated file paths.
    """
    output_dir = Path(out_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Calculate dynamic pixel resolution if not explicitly specified (aligned to 8-dot byte boundary)
    raw_w_px = int(round((width_mm / 25.4) * dpi)) if width_px is None else width_px
    target_w_px = align_to_byte_boundary(raw_w_px, alignment=8)
    target_h_px = int(round((height_mm / 25.4) * dpi)) if height_px is None else height_px

    if isinstance(formats, str):
        if formats.lower() == "all":
            selected_formats = ["svg", "png", "bmp", "pdf", "zpl", "tspl", "ipl"]
        else:
            selected_formats = [f.strip().lower() for f in formats.split(",")]
    else:
        selected_formats = [f.lower() for f in formats]

    results: Dict[str, Path] = {}

    # Step 1: Load Contract & SVG Template
    contract_data = load_json_contract(json_source)
    svg_template = load_svg_template(template_source)

    # Step 2: Inject Pure Data fields & codes
    injected_svg = inject_data(svg_template, contract_data)
    validate_no_orphan_tokens(injected_svg)

    # Step 3: Inject vector Barcode & QR Code into bounding boxes
    complete_svg = inject_barcodes_and_qr(injected_svg, contract_data)

    # Save SVG if requested or always save intermediate
    svg_path = output_dir / "label.svg"
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(complete_svg)
    # Always include svg and png in results as they are core visual/inspection artifacts
    results["svg"] = svg_path

    # Step 4: Rasterize SVG to PNG preview with dynamic DPI and dimensions (with super-sampling)
    png_path = output_dir / "preview.png"
    svg_to_png(
        svg_source=complete_svg,
        output_png_path=png_path,
        width_px=target_w_px,
        height_px=target_h_px,
        dpi=dpi,
        super_sample_factor=super_sample_factor,
        downsampling_filter=downsampling_filter,
    )

    # Step 4a: Apply image rotation before 1-bit binarization & printer encoding if specified
    active_rotation = rotation % 360
    effective_width_mm = width_mm
    effective_height_mm = height_mm

    if active_rotation != 0:
        rotated_img = rotate_image_cw(png_path, angle=active_rotation)
        new_w, new_h = rotated_img.size
        aligned_new_w = align_to_byte_boundary(new_w, alignment=8)
        if aligned_new_w != new_w:
            mode = "RGBA" if rotated_img.mode == "RGBA" else "RGB"
            bg_color = (255, 255, 255, 255) if mode == "RGBA" else (255, 255, 255)
            aligned_img = Image.new(mode, (aligned_new_w, new_h), bg_color)
            aligned_img.paste(rotated_img, (0, 0))
            rotated_img = aligned_img
        rotated_img.save(png_path, format="PNG")

        # Swap physical dimensions for TSPL and PDF metadata when rotated 90° or 270°
        if active_rotation in (90, 270):
            effective_width_mm, effective_height_mm = height_mm, width_mm

    # Always include preview PNG in results (essential for UI canvas rendering)
    results["png"] = png_path

    # Step 5: Convert PNG to 1-Bit Monochrome & Save BMP using Otsu or adjustable threshold
    effective_threshold = (
        binarization_threshold
        if binarization_threshold is not None
        else calculate_otsu_threshold(png_path)
    )
    image_1bit = png_to_1bit_monochrome(png_path, threshold=effective_threshold)
    bmp_path = output_dir / "label_1bit.bmp"
    save_1bit_bmp(image_1bit, bmp_path)
    if "bmp" in selected_formats:
        results["bmp"] = bmp_path

    # Step 5b: Generate PDF if requested
    if "pdf" in selected_formats or "all" in selected_formats:
        pdf_path = output_dir / "label.pdf"
        encode_pdf(
            image_source=image_1bit,
            output_pdf_path=pdf_path,
            dpi=dpi,
            width_mm=effective_width_mm,
            height_mm=effective_height_mm,
        )
        results["pdf"] = pdf_path

    # Step 6: Bit packing
    raw_bytes, w, h, bytes_per_row = get_raw_bitmap_data(image_1bit)

    # Step 7: Encoders
    if "zpl" in selected_formats or "all" in selected_formats:
        zpl_str = encode_zpl(
            raw_bytes,
            width_px=w,
            height_px=h,
            width_mm=effective_width_mm,
            height_mm=effective_height_mm,
        )
        zpl_path = output_dir / "label.zpl"
        with open(zpl_path, "w", encoding="ascii") as f:
            f.write(zpl_str)
        results["zpl"] = zpl_path

    if "tspl" in selected_formats or "all" in selected_formats:
        tspl_bytes = encode_tspl(
            raw_bytes,
            width_px=w,
            height_px=h,
            width_mm=effective_width_mm,
            height_mm=effective_height_mm,
        )
        tspl_path = output_dir / "label.tspl"
        with open(tspl_path, "wb") as f:
            f.write(tspl_bytes)
        results["tspl"] = tspl_path

    if "ipl" in selected_formats or "all" in selected_formats:
        ipl_bytes = encode_ipl(raw_bytes, width_px=w, height_px=h)
        ipl_path = output_dir / "label.ipl"
        with open(ipl_path, "wb") as f:
            f.write(ipl_bytes)
        results["ipl"] = ipl_path

    return results

