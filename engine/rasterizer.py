"""
SVG to Bitmap Rasterizer Module using resvg CLI executable.
Converts SVG to PNG Preview and 1-Bit Monochrome BMP.
"""

from __future__ import annotations

import io
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, Optional, Union
from PIL import Image

RESAMPLING_FILTERS: Dict[str, Image.Resampling] = {
    "NEAREST": Image.Resampling.NEAREST,
    "BOX": Image.Resampling.BOX,
    "LANCZOS": Image.Resampling.LANCZOS,
    "BILINEAR": Image.Resampling.BILINEAR,
    "BICUBIC": Image.Resampling.BICUBIC,
    "HAMMING": Image.Resampling.HAMMING,
}


def get_resvg_executable_path() -> Path:
    """Resolves path to resvg binary bundled with the engine, in PyInstaller bundle, or system PATH."""
    import shutil

    # 1. PyInstaller bundle support (_MEIPASS)
    if hasattr(sys, "_MEIPASS"):
        exe_name = "resvg.exe" if sys.platform == "win32" else "resvg"
        meipass_resvg = Path(sys._MEIPASS) / "engine" / "bin" / exe_name
        if meipass_resvg.is_file():
            return meipass_resvg

    # 2. Bundled local binary
    current_dir = Path(__file__).parent
    binary_name = "resvg.exe" if sys.platform == "win32" else "resvg"
    bundled_resvg = current_dir / "bin" / binary_name
    if bundled_resvg.is_file():
        return bundled_resvg

    # 3. Check system PATH via shutil.which
    sys_resvg = shutil.which("resvg")
    if sys_resvg:
        return Path(sys_resvg)

    # 4. Standard Linux / Docker paths
    for standard_path in [Path("/usr/local/bin/resvg"), Path("/usr/bin/resvg")]:
        if standard_path.is_file():
            return standard_path

    raise FileNotFoundError(
        f"resvg executable not found. Expected at '{bundled_resvg.resolve()}', /usr/local/bin/resvg, or in system PATH."
    )



def calculate_otsu_threshold(image: Union[str, Path, Image.Image]) -> int:
    """
    Computes an optimal binarization threshold using Otsu's Global Thresholding Method.
    Maximizes inter-class variance between foreground and background pixels.

    Args:
        image: Source PIL Image or path to image file.

    Returns:
        Optimal integer threshold in range [0, 255] (default fallback: 128).
    """
    if isinstance(image, (str, Path)):
        img = Image.open(str(image))
    else:
        img = image

    gray = img.convert("L")
    hist = gray.histogram()
    total = sum(hist)
    if total == 0:
        return 128

    current_max = -1.0
    threshold = 128
    sum_total = sum(i * hist[i] for i in range(256))
    sum_b = 0
    weight_b = 0
    best_thresholds = []

    for i in range(256):
        weight_b += hist[i]
        if weight_b == 0:
            continue
        weight_f = total - weight_b
        if weight_f == 0:
            break
        sum_b += i * hist[i]
        mean_b = sum_b / weight_b
        mean_f = (sum_total - sum_b) / weight_f
        between_var = weight_b * weight_f * ((mean_b - mean_f) ** 2)
        if between_var > current_max:
            current_max = between_var
            best_thresholds = [i]
        elif between_var == current_max:
            best_thresholds.append(i)

    if best_thresholds:
        # Return midpoint of maximum variance plateau (e.g. 127 for binary 0/255 images)
        return int(sum(best_thresholds) / len(best_thresholds))

    return threshold


def svg_to_png(
    svg_source: Union[str, Path],
    output_png_path: Union[str, Path],
    width_px: int = 1600,
    height_px: int = 640,
    dpi: float = 203.2,
    super_sample_factor: int = 2,
    downsampling_filter: str = "NEAREST",
    resvg_path: Optional[Union[str, Path]] = None,
    timeout: float = 15.0,
) -> Path:
    """
    Renders an SVG file or SVG string to PNG image using resvg CLI with optional super-sampling.
    Default dimensions: 1600 x 640 px (200mm x 80mm @ 203.2 DPI / 8 dots per mm).
    When super_sample_factor > 1, renders at (super_sample_factor * target_size) and scales
    down via selectable downsampling filter (default: NEAREST to completely prevent intermediate
    anti-aliasing grayscale notches/diagonal bleeding during 1-bit binarization).
    Includes explicit process timeout and Windows-safe creationflags to avoid hangs.
    """
    resvg_exe = Path(resvg_path) if resvg_path else get_resvg_executable_path()
    if not resvg_exe.is_file():
        raise FileNotFoundError(f"resvg binary not found: {resvg_exe.resolve()}")

    out_p = Path(output_png_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    # If svg_source is a path to an existing file
    is_file = False
    if isinstance(svg_source, Path):
        try:
            if svg_source.is_file():
                is_file = True
                input_file = svg_source
        except OSError:
            is_file = False
    elif isinstance(svg_source, str):
        if "<svg" not in svg_source and "\n" not in svg_source and len(svg_source) < 1024:
            try:
                p = Path(svg_source)
                if p.is_file():
                    is_file = True
                    input_file = p
            except OSError:
                is_file = False

    temp_svg_file: Optional[Path] = None
    if not is_file:
        # Write SVG content to temp file
        temp_svg_file = out_p.parent / f"_temp_{os.getpid()}.svg"
        with open(temp_svg_file, "w", encoding="utf-8") as f:
            f.write(str(svg_source))
        input_file = temp_svg_file

    render_factor = max(1, super_sample_factor)
    render_w = width_px * render_factor if width_px is not None else None
    render_h = height_px * render_factor if height_px is not None else None
    render_dpi = dpi * render_factor

    try:
        cmd = [
            str(resvg_exe),
            str(input_file.resolve()),
            str(out_p.resolve()),
            "--width", str(render_w) if render_w is not None else str(width_px),
            "--height", str(render_h) if render_h is not None else str(height_px),
            "--dpi", str(int(round(render_dpi))),
            "--background", "white",
        ]

        # Windows-safe creationflags to suppress console popup and prevent stdio hang
        kwargs = {
            "capture_output": True,
            "text": True,
            "check": False,
            "stdin": subprocess.DEVNULL,
            "timeout": timeout,
        }
        if sys.platform == "win32":
            kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)

        result = subprocess.run(cmd, **kwargs)
        if result.returncode != 0:
            raise RuntimeError(f"resvg failed with code {result.returncode}: {result.stderr}")

        if not out_p.is_file():
            raise FileNotFoundError(f"Output PNG not created by resvg: {out_p}")

        # If super-sampled, scale down to target width_px and height_px via configured downsampling filter (default: NEAREST)
        if width_px is not None and height_px is not None:
            # Re-open safely or load with ImageFile.LOAD_TRUNCATED_IMAGES enabled
            from PIL import ImageFile
            ImageFile.LOAD_TRUNCATED_IMAGES = True
            with Image.open(out_p) as rendered_img:
                rendered_img.load()
                if render_factor > 1 or rendered_img.size != (width_px, height_px):
                    filter_key = str(downsampling_filter).upper().strip()
                    resample_filter = RESAMPLING_FILTERS.get(filter_key, Image.Resampling.NEAREST)
                    resampled_img = rendered_img.resize((width_px, height_px), resample=resample_filter)
                    mode = "RGBA" if resampled_img.mode == "RGBA" else "RGB"
                    bg_color = (255, 255, 255, 255) if mode == "RGBA" else (255, 255, 255)
                    aligned_canvas = Image.new(mode, (width_px, height_px), bg_color)
                    aligned_canvas.paste(resampled_img, (0, 0))
                    aligned_canvas.save(out_p, format="PNG")

        return out_p
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(f"resvg rendering timed out after {timeout} seconds: {e}") from e
    except OSError as e:
        raise RuntimeError(f"Failed to execute resvg binary '{resvg_exe}': {e}") from e
    finally:
        if temp_svg_file and temp_svg_file.is_file():
            try:
                temp_svg_file.unlink()
            except OSError:
                pass


def rotate_image_cw(
    image: Union[str, Path, Image.Image],
    angle: int = 0,
) -> Image.Image:
    """
    Rotates an image clockwise by the specified angle (0, 90, 180, 270 degrees).
    Uses Image.rotate(-angle, expand=True) to ensure target width and height swap
    correctly when rotating 90° or 270° (e.g. 1600x640 -> 640x1600) without clipping.

    Args:
        image: Source PIL Image or Path/str to an image file.
        angle: Clockwise rotation angle in degrees (0, 90, 180, 270).

    Returns:
        Rotated PIL Image object.
    """
    if isinstance(image, (str, Path)):
        img = Image.open(str(image))
    else:
        img = image

    normalized_angle = angle % 360
    if normalized_angle == 0:
        return img

    # Pillow rotates counter-clockwise by default, so clockwise angle theta is -theta
    # fillcolor ensures any edge padding (if any) is clean white
    fill_color = 255 if img.mode in ("1", "L") else (255, 255, 255)
    if img.mode == "RGBA":
        fill_color = (255, 255, 255, 255)

    rotated = img.rotate(-normalized_angle, expand=True, fillcolor=fill_color)
    return rotated


def png_to_1bit_monochrome(
    png_source: Union[str, Path, Image.Image],
    threshold: int = 128,
) -> Image.Image:
    """
    Converts PNG image to 1-Bit monochrome binarized PIL Image (mode '1')
    without dithering using a clean threshold point lookup.
    """
    if isinstance(png_source, Image.Image):
        img = png_source
    else:
        img = Image.open(png_source)

    # Convert to Grayscale ('L')
    gray = img.convert("L")

    # Threshold lookup table: < threshold -> 0 (Black), >= threshold -> 255 (White)
    table = [0 if i < threshold else 255 for i in range(256)]
    binarized = gray.point(table, mode="1")
    return binarized


def save_1bit_bmp(image_1bit: Image.Image, output_bmp_path: Union[str, Path]) -> Path:
    """Saves 1-bit monochrome PIL Image to BMP file."""
    out_p = Path(output_bmp_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)
    if image_1bit.mode != "1":
        image_1bit = image_1bit.convert("1", dither=Image.NONE)
    image_1bit.save(out_p, format="BMP")
    return out_p

