"""Explicit seeding script for Pilot Line 1 printer and media profiles.

Following ADR-010, ADR-020, and ADR-024:
- Populates media_profiles and media_profile_versions for 80x200mm pilot labels.
- Populates template_versions for 80x200mm pilot labels.
- Registers a trusted central_tcp printer in printer_registry.
- Initializes printer_dispatch_state for safe single-writer leasing.
- Executed explicitly by operators or during automated pilot deployment tests.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from typing import Any
import uuid

import psycopg

logger = logging.getLogger("seed_pilot")

DEFAULT_MEDIA_PROFILE_ID = "profile-80x200"
DEFAULT_MEDIA_PROFILE_VERSION_ID = "c0000000-0000-0000-0000-000000000001"
DEFAULT_TEMPLATE_VERSION_ID = "d0000000-0000-0000-0000-000000000001"
DEFAULT_TEMPLATE_ID = "template-pilot-80x200"
DEFAULT_SVG_PAYLOAD_REF = "pilot_template_80x200_v1"
DEFAULT_SVG_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def seed_pilot_data(
    database_url: str,
    printer_id: str = "PRN-PILOT-01",
    site_id: str = "pilot-site",
    area_id: str = "packing-line-1",
    brand: str = "HONEYWELL",
    model: str = "PD45S",
    network_host: str = "192.168.1.50",
    network_port: int = 9100,
    printer_language: str = "ipl",
    emulation: str = "native",
    dpi: float = 203.0,
    width_mm: float = 80.0,
    height_mm: float = 200.0,
) -> dict[str, Any]:
    """Idempotently seeds media profiles, templates, and printer registry for pilot.

    Returns a dict with the seeded IDs.
    """
    if not database_url:
        raise ValueError("database_url is required")
    if not printer_id:
        raise ValueError("printer_id is required")

    brand_upper = brand.upper()
    if brand_upper not in ("HONEYWELL", "INTERMEC", "ZEBRA"):
        raise ValueError(f"brand must be one of HONEYWELL, INTERMEC, ZEBRA: {brand}")
    if printer_language not in ("ipl", "zpl"):
        raise ValueError(f"printer_language must be ipl or zpl: {printer_language}")
    if printer_language == "ipl" and emulation != "native":
        raise ValueError("IPL printer language only supports native emulation")

    media_version_uuid = uuid.UUID(DEFAULT_MEDIA_PROFILE_VERSION_ID)
    template_version_uuid = uuid.UUID(DEFAULT_TEMPLATE_VERSION_ID)

    with psycopg.connect(database_url) as conn:
        with conn.transaction():
            # 1. Media Profile
            conn.execute(
                """
                INSERT INTO media_profiles (media_profile_id, name, is_enabled)
                VALUES (%s, %s, TRUE)
                ON CONFLICT (media_profile_id) DO UPDATE
                SET name = EXCLUDED.name, is_enabled = TRUE, updated_at = CURRENT_TIMESTAMP
                """,
                (DEFAULT_MEDIA_PROFILE_ID, f"{width_mm:.0f}x{height_mm:.0f}mm Pilot Label"),
            )

            # 2. Media Profile Version
            conn.execute(
                """
                INSERT INTO media_profile_versions (
                    media_profile_version_id, media_profile_id, version,
                    width_mm, height_mm, material_type, sensor_mode, orientation
                ) VALUES (%s, %s, 1, %s, %s, 'synthetic', 'gap', 'portrait')
                ON CONFLICT (media_profile_id, version) DO UPDATE
                SET width_mm = EXCLUDED.width_mm,
                    height_mm = EXCLUDED.height_mm,
                    material_type = EXCLUDED.material_type,
                    sensor_mode = EXCLUDED.sensor_mode,
                    orientation = EXCLUDED.orientation
                """,
                (media_version_uuid, DEFAULT_MEDIA_PROFILE_ID, width_mm, height_mm),
            )

            # 3. Template Version
            conn.execute(
                """
                INSERT INTO template_versions (
                    template_version_id, template_id, version,
                    svg_payload_ref, svg_content_sha256,
                    width_mm, height_mm, orientation,
                    asset_font_manifest, renderer_compatibility
                ) VALUES (%s, %s, 1, %s, %s, %s, %s, 'portrait', '{}'::jsonb, '{}'::jsonb)
                ON CONFLICT (template_id, version) DO UPDATE
                SET width_mm = EXCLUDED.width_mm,
                    height_mm = EXCLUDED.height_mm,
                    svg_payload_ref = EXCLUDED.svg_payload_ref,
                    svg_content_sha256 = EXCLUDED.svg_content_sha256
                """,
                (
                    template_version_uuid,
                    DEFAULT_TEMPLATE_ID,
                    DEFAULT_SVG_PAYLOAD_REF,
                    DEFAULT_SVG_SHA256,
                    width_mm,
                    height_mm,
                ),
            )

            # 4. Printer Registry (delivery_mode = 'central_tcp')
            conn.execute(
                """
                INSERT INTO printer_registry (
                    printer_id, site_id, area_id, brand, model,
                    delivery_mode, configured_media_profile_version_id,
                    network_host, network_port, printer_language,
                    emulation, confirmed_dpi, is_enabled
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    'central_tcp', %s,
                    %s, %s, %s,
                    %s, %s, TRUE
                )
                ON CONFLICT (printer_id) DO UPDATE
                SET site_id = EXCLUDED.site_id,
                    area_id = EXCLUDED.area_id,
                    brand = EXCLUDED.brand,
                    model = EXCLUDED.model,
                    delivery_mode = 'central_tcp',
                    configured_media_profile_version_id = EXCLUDED.configured_media_profile_version_id,
                    network_host = EXCLUDED.network_host,
                    network_port = EXCLUDED.network_port,
                    printer_language = EXCLUDED.printer_language,
                    emulation = EXCLUDED.emulation,
                    confirmed_dpi = EXCLUDED.confirmed_dpi,
                    is_enabled = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    printer_id,
                    site_id,
                    area_id,
                    brand_upper,
                    model,
                    media_version_uuid,
                    network_host,
                    network_port,
                    printer_language,
                    emulation,
                    dpi,
                ),
            )

            # 5. Printer Dispatch State
            conn.execute(
                """
                INSERT INTO printer_dispatch_state (printer_id)
                VALUES (%s)
                ON CONFLICT (printer_id) DO NOTHING
                """,
                (printer_id,),
            )

    return {
        "media_profile_id": DEFAULT_MEDIA_PROFILE_ID,
        "media_profile_version_id": str(media_version_uuid),
        "template_id": DEFAULT_TEMPLATE_ID,
        "template_version_id": str(template_version_uuid),
        "printer_id": printer_id,
        "site_id": site_id,
        "network_host": network_host,
        "network_port": network_port,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed pilot data for Thermal Label Studio")
    parser.add_argument("--database-url", default=os.getenv("PRINT_AGENT_DATABASE_URL"), help="PostgreSQL connection URL")
    parser.add_argument("--printer-id", default=os.getenv("PILOT_PRINTER_ID", "PRN-PILOT-01"), help="Pilot printer ID")
    parser.add_argument("--site-id", default=os.getenv("PILOT_SITE_ID", "pilot-site"), help="Site ID")
    parser.add_argument("--area-id", default=os.getenv("PILOT_AREA_ID", "packing-line-1"), help="Area ID")
    parser.add_argument("--brand", default=os.getenv("PILOT_PRINTER_BRAND", "HONEYWELL"), help="Printer brand")
    parser.add_argument("--model", default=os.getenv("PILOT_PRINTER_MODEL", "PD45S"), help="Printer model")
    parser.add_argument("--host", default=os.getenv("PILOT_PRINTER_HOST", "192.168.1.50"), help="Printer network host / IP")
    parser.add_argument("--port", type=int, default=int(os.getenv("PILOT_PRINTER_PORT", "9100")), help="Printer network port")
    parser.add_argument("--language", default=os.getenv("PILOT_PRINTER_LANGUAGE", "ipl"), help="Printer language (ipl, zpl)")
    parser.add_argument("--emulation", default=os.getenv("PILOT_PRINTER_EMULATION", "native"), help="Emulation (native, zsim2)")
    parser.add_argument("--dpi", type=float, default=float(os.getenv("PILOT_PRINTER_DPI", "203.0")), help="Confirmed DPI")

    args = parser.parse_args(argv)

    if not args.database_url:
        print("ERROR: Database URL is required (set PRINT_AGENT_DATABASE_URL or pass --database-url)", file=sys.stderr)
        return 1

    try:
        result = seed_pilot_data(
            database_url=args.database_url,
            printer_id=args.printer_id,
            site_id=args.site_id,
            area_id=args.area_id,
            brand=args.brand,
            model=args.model,
            network_host=args.host,
            network_port=args.port,
            printer_language=args.language,
            emulation=args.emulation,
            dpi=args.dpi,
        )
        print(f"Successfully seeded pilot data:")
        print(f"  - Media Profile: {result['media_profile_id']} (Version {result['media_profile_version_id']})")
        print(f"  - Template: {result['template_id']} (Version {result['template_version_id']})")
        print(f"  - Printer: {result['printer_id']} ({result['network_host']}:{result['network_port']})")
        return 0
    except Exception as exc:
        print(f"ERROR: Failed to seed pilot data: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
