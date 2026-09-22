"""PDF Batch Evidence Generator Service.

Generates durable multi-page PDF batch evidence for SAP shadow print simulation.
Strictly adheres to AC 5:
- Page 1: Manifest / Cover page with batch metadata, audit trail, and prominent watermark.
- Pages 2..N+1: Exact physical dimensions per media profile in points, 1 page per item
  in strict item_sequence ASC, overlaid with "SIMULASI — BUKAN UNTUK CETAK FISIK".
- Zero auto-scaling of label contents.
"""

from __future__ import annotations

import io
from datetime import datetime
from typing import Any, Dict, List, Optional
from PIL import Image

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

WATERMARK_TEXT = "SIMULASI — BUKAN UNTUK CETAK FISIK"


class PdfEvidenceService:
    """Service to render multi-page PDF evidence documents for SAP shadow simulation."""

    @staticmethod
    def mm_to_points(mm: float) -> float:
        """Convert millimeters to PDF typographic points (72 points per inch)."""
        return (float(mm) / 25.4) * 72.0

    @classmethod
    def generate_batch_pdf(
        cls,
        batch_id: str,
        producer_namespace: str,
        request_id: str,
        printer_id: str,
        virtual_profile: Dict[str, Any],
        items: List[Dict[str, Any]],
        raw_contract_sha256: str,
        created_at: datetime,
    ) -> bytes:
        """Renders complete multi-page PDF evidence including manifest cover and ordered label pages."""
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=A4)

        # -------------------------------------------------------------
        # PAGE 1: MANIFEST & COVER PAGE (A4 Portrait)
        # -------------------------------------------------------------
        c.setPageSize(A4)
        page_w, page_h = A4

        # Background Watermark on Cover Page
        c.saveState()
        c.setFillColorRGB(0.92, 0.4, 0.4, alpha=0.18)
        c.setFont("Helvetica-Bold", 36)
        c.translate(page_w / 2, page_h / 2)
        c.rotate(35)
        c.drawCentredString(0, 0, WATERMARK_TEXT)
        c.restoreState()

        # Top Header Banner
        c.setFillColorRGB(0.06, 0.09, 0.16)  # Dark slate (#0F172A)
        c.rect(0, page_h - 90, page_w, 90, fill=1, stroke=0)

        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 18)
        c.drawString(36, page_h - 42, "SAP SHADOW PRINT SIMULATION EVIDENCE")

        c.setFillColor(colors.HexColor("#94A3B8"))  # Slate 400
        c.setFont("Helvetica", 10)
        c.drawString(36, page_h - 60, "PPIC & Production Virtual Audit Trail — Pipeline Verification")

        c.setFillColor(colors.HexColor("#F59E0B"))  # Amber 500
        c.setFont("Helvetica-Bold", 9)
        c.drawRightString(page_w - 36, page_h - 42, "STATUS: SIMULATED (PDF SINK)")

        # Disclaimer Box
        c.setFillColorRGB(0.99, 0.95, 0.95)
        c.setStrokeColorRGB(0.9, 0.25, 0.25)
        c.setLineWidth(1)
        c.roundRect(36, page_h - 145, page_w - 72, 42, 4, fill=1, stroke=1)

        c.setFillColorRGB(0.75, 0.1, 0.1)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(48, page_h - 122, f"PERINGATAN: {WATERMARK_TEXT}")
        c.setFont("Helvetica", 8.5)
        c.setFillColorRGB(0.2, 0.2, 0.2)
        c.drawString(
            48,
            page_h - 136,
            "Dokumen ini diproduksi oleh sink simulasi virtual untuk verifikasi layout, data SAP, dan urutan batch. Tidak ada printer fisik yang dihubungi.",
        )

        # Batch Metadata Grid
        y = page_h - 165
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(colors.HexColor("#0F172A"))
        c.drawString(36, y, "1. Informasi Batch & Audit Pipeline")
        y -= 12

        c.setStrokeColor(colors.HexColor("#CBD5E1"))
        c.setLineWidth(0.5)
        c.line(36, y, page_w - 36, y)
        y -= 16

        metadata_entries = [
            ("Batch ID", batch_id),
            ("Producer Namespace", producer_namespace),
            ("Request ID (Idempotency Key)", request_id),
            ("Logical Printer ID", printer_id),
            (
                "Virtual Printer Profile",
                f"{virtual_profile.get('width_mm', 200)}x{virtual_profile.get('height_mm', 80)} mm | {virtual_profile.get('dpi', 203.2)} DPI | {virtual_profile.get('orientation', 'portrait')} | {virtual_profile.get('printer_language', 'ZPL').upper()}",
            ),
            ("Total Item Terurut", f"{len(items)} label"),
            ("Waktu Simulasi (UTC)", created_at.isoformat()),
            ("Raw Contract SHA-256", raw_contract_sha256),
        ]

        c.setFont("Helvetica", 9)
        for label, val in metadata_entries:
            c.setFont("Helvetica-Bold", 8.5)
            c.setFillColor(colors.HexColor("#475569"))
            c.drawString(44, y, f"{label}:")
            c.setFont("Courier", 8.5)
            c.setFillColor(colors.HexColor("#0F172A"))
            c.drawString(200, y, str(val))
            y -= 15

        # Items Manifest Table
        y -= 10
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(colors.HexColor("#0F172A"))
        c.drawString(36, y, "2. Manifest Item Berurutan (item_sequence ASC)")
        y -= 8

        c.line(36, y, page_w - 36, y)
        y -= 16

        # Table Header
        c.setFillColor(colors.HexColor("#F1F5F9"))
        c.rect(36, y - 4, page_w - 72, 16, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#334155"))
        c.setFont("Helvetica-Bold", 8)
        c.drawString(42, y, "Seq")
        c.drawString(70, y, "Template Version")
        c.drawString(190, y, "Ringkasan Data Canonical SAP (Material / Batch / Roll / Berat)")
        c.drawRightString(page_w - 42, y, "Item Data SHA-256")
        y -= 16

        # Table Rows
        c.setFont("Helvetica", 7.5)
        sorted_items = sorted(items, key=lambda x: x.get("item_sequence", 0))

        for idx, item in enumerate(sorted_items):
            if y < 80:
                # Add continuation text if table is long
                c.drawString(42, y, f"...dan {len(sorted_items) - idx} item berikutnya.")
                break

            seq = item.get("item_sequence", idx + 1)
            tmpl_id = item.get("template_version_id", "-")
            item_hash = item.get("item_data_sha256", "-")[:16] + "..."

            # Format item summary
            data = item.get("canonical_item_data", {})
            summary_parts = []
            if "material_code" in data:
                summary_parts.append(f"Mat: {data['material_code']}")
            elif "fields" in data and "brand" in data["fields"]:
                summary_parts.append(f"Brand: {data['fields']['brand']}")
            if "batch_number" in data:
                summary_parts.append(f"Batch: {data['batch_number']}")
            elif "fields" in data and "batch_text" in data["fields"]:
                summary_parts.append(f"Batch: {data['fields']['batch_text']}")
            if "roll_number" in data:
                summary_parts.append(f"Roll: {data['roll_number']}")
            elif "fields" in data and "roll_no" in data["fields"]:
                summary_parts.append(f"Roll: {data['fields']['roll_no']}")
            if "gross_weight" in data:
                summary_parts.append(f"Gross: {data['gross_weight']}")
            elif "fields" in data and "gross_weight_kg" in data["fields"]:
                summary_parts.append(f"Gross: {data['fields']['gross_weight_kg']}kg")

            summary_str = " | ".join(summary_parts) if summary_parts else str(data)[:50]

            # Alternating row background
            if idx % 2 == 1:
                c.setFillColor(colors.HexColor("#F8FAFC"))
                c.rect(36, y - 3, page_w - 72, 13, fill=1, stroke=0)

            c.setFillColor(colors.HexColor("#0F172A"))
            c.setFont("Helvetica-Bold", 7.5)
            c.drawString(42, y, str(seq))

            c.setFont("Helvetica", 7.5)
            c.drawString(70, y, str(tmpl_id)[:24])
            c.drawString(190, y, str(summary_str)[:55])

            c.setFont("Courier", 7)
            c.setFillColor(colors.HexColor("#64748B"))
            c.drawRightString(page_w - 42, y, item_hash)

            y -= 13

        # Cover Footer
        c.setStrokeColor(colors.HexColor("#E2E8F0"))
        c.line(36, 45, page_w - 36, 45)
        c.setFont("Helvetica", 7.5)
        c.setFillColor(colors.HexColor("#94A3B8"))
        c.drawString(36, 32, "Thermal Label Studio Virtual PDF Simulation Sink — Fail-Closed Boundary")
        c.drawRightString(page_w - 36, 32, "Halaman 1 / Cover Manifest")

        c.showPage()

        # -------------------------------------------------------------
        # PAGES 2 .. N+1: INDIVIDUAL LABEL PAGES (Exact Physical Points)
        # -------------------------------------------------------------
        label_w_mm = float(virtual_profile.get("width_mm", 200.0))
        label_h_mm = float(virtual_profile.get("height_mm", 80.0))
        label_w_pt = cls.mm_to_points(label_w_mm)
        label_h_pt = cls.mm_to_points(label_h_mm)

        for page_idx, item in enumerate(sorted_items, start=1):
            c.setPageSize((label_w_pt, label_h_pt))

            # 1. Render Label Content
            rendered_bytes = item.get("rendered_image_bytes")
            if rendered_bytes:
                try:
                    img = Image.open(io.BytesIO(rendered_bytes))
                    c.drawImage(
                        ImageReader(img),
                        0,
                        0,
                        width=label_w_pt,
                        height=label_h_pt,
                        preserveAspectRatio=True,
                    )
                except Exception:
                    cls._draw_vector_fallback(c, item, label_w_pt, label_h_pt)
            else:
                cls._draw_vector_fallback(c, item, label_w_pt, label_h_pt)

            # 2. Overlaid Watermark (Mandatory per AC 5)
            c.saveState()

            # Top Safety Header Bar
            header_bar_h = 14
            c.setFillColorRGB(0.9, 0.2, 0.2, alpha=0.88)
            c.rect(0, label_h_pt - header_bar_h, label_w_pt, header_bar_h, fill=1, stroke=0)

            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 7.5)
            seq_num = item.get("item_sequence", page_idx)
            header_text = (
                f"{WATERMARK_TEXT}  |  Item: {seq_num}/{len(sorted_items)}  |  Batch: {batch_id[:8]}"
            )
            c.drawCentredString(label_w_pt / 2, label_h_pt - 10, header_text)

            # Prominent Diagonal Watermark across the label
            c.setFillColorRGB(0.85, 0.15, 0.15, alpha=0.30)
            c.setFont("Helvetica-Bold", 24)
            c.translate(label_w_pt / 2, label_h_pt / 2)
            c.rotate(24)
            c.drawCentredString(0, 0, WATERMARK_TEXT)

            c.restoreState()
            c.showPage()

        c.save()
        return buffer.getvalue()

    @staticmethod
    def _draw_vector_fallback(
        c: canvas.Canvas,
        item: Dict[str, Any],
        w_pt: float,
        h_pt: float,
    ) -> None:
        """Draws a clean fallback vector mockup when rasterized image is not directly provided."""
        c.saveState()
        # White background & outer label border
        c.setFillColor(colors.white)
        c.rect(0, 0, w_pt, h_pt, fill=1, stroke=0)

        c.setStrokeColor(colors.black)
        c.setLineWidth(1.5)
        c.rect(4, 4, w_pt - 8, h_pt - 8, fill=0, stroke=1)

        data = item.get("canonical_item_data", {})
        fields = data.get("fields", data)

        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 12)
        title = fields.get("material_code") or fields.get("brand") or "CANONICAL LABEL"
        c.drawString(14, h_pt - 30, str(title))

        c.setFont("Helvetica", 9)
        desc = fields.get("material_desc") or fields.get("type_film") or "Material / Roll Description"
        c.drawString(14, h_pt - 44, str(desc))

        # Secondary fields
        c.setFont("Courier-Bold", 9)
        batch_val = fields.get("batch_number") or fields.get("batch_text") or "-"
        roll_val = fields.get("roll_number") or fields.get("roll_no") or "-"
        gross_val = fields.get("gross_weight") or fields.get("gross_weight_kg") or "-"
        net_val = fields.get("net_weight") or fields.get("net_weight_kg") or "-"

        c.drawString(14, h_pt - 64, f"BATCH: {batch_val}   ROLL: {roll_val}")
        c.drawString(14, h_pt - 78, f"NET: {net_val}   GROSS: {gross_val}")

        # Simulated Barcode Strip at bottom
        c.setFillColor(colors.black)
        bar_x = 14
        bar_y = 12
        bar_w = w_pt - 28
        bar_h = 24
        c.rect(bar_x, bar_y, bar_w, 2, fill=1, stroke=0)
        c.rect(bar_x, bar_y + bar_h, bar_w, 2, fill=1, stroke=0)

        # Barcode vertical stripes mockup
        step = 4
        for x_offset in range(0, int(bar_w), step):
            if (x_offset // step) % 3 != 0:
                c.rect(bar_x + x_offset, bar_y + 2, 2, bar_h - 2, fill=1, stroke=0)

        c.restoreState()
