"""Explicit seeding script for Pilot Line 1 printer and media profiles.

Following ADR-010, ADR-020, and ADR-024 (and B2B2G Safety Hardening):
- Populates media_profiles and media_profile_versions for 80x200mm pilot labels.
- Populates template_versions for 80x200mm pilot labels.
- Registers a trusted central_tcp printer in printer_registry.
- Protects existing printer configuration against unintended overwrite (fail-closed).
- Requires explicit --force-update and --reason with audit trail in print_audit_events.
- Initializes printer_dispatch_state for safe single-writer leasing.
- Enforces fail-closed rejection on placeholder passwords unless ALLOW_INSECURE_TEST_CREDENTIALS=true.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from typing import Any
import uuid

import psycopg

from .security_validation import validate_database_credentials

logger = logging.getLogger("seed_pilot")

DEFAULT_MEDIA_PROFILE_ID = "profile-80x200"
DEFAULT_MEDIA_PROFILE_VERSION_ID = "c0000000-0000-0000-0000-000000000001"
DEFAULT_TEMPLATE_VERSION_ID = "d0000000-0000-0000-0000-000000000001"
DEFAULT_TEMPLATE_ID = "template-pilot-80x200"
DEFAULT_SVG_PAYLOAD_REF = "pilot_template_80x200_v1"
DEFAULT_SVG_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


class PrinterConflictError(RuntimeError):
    """Raised when seed_pilot encounters an existing printer with differing configuration without force-update."""


def seed_pilot_data(
    database_url: str,
    printer_id: str = "PRN-PILOT-01",
    site_id: str = "pilot-site",
    area_id: str = "packing-line-1",
    brand: str = "HONEYWELL",
    model: str = "PD45S",
    network_host: str = "127.0.0.1",
    network_port: int = 9100,
    printer_language: str = "ipl",
    emulation: str = "native",
    dpi: float = 203.0,
    width_mm: float = 80.0,
    height_mm: float = 200.0,
    force_update: bool = False,
    reason: str | None = None,
    actor_id: str = "seed_pilot",
    allow_insecure_credentials: bool = False,
) -> dict[str, Any]:
    """Idempotently seeds media profiles, templates, and printer registry for pilot.

    Prevents overwriting differing printer configuration unless force_update=True and reason is given.
    Returns a dict with the seeded IDs.
    """
    if not database_url:
        raise ValueError("database_url is required")
    if not printer_id:
        raise ValueError("printer_id is required")

    # Safety validation: reject placeholder password in database connection
    validate_database_credentials(database_url, allow_insecure=allow_insecure_credentials)

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

            # 4. Printer Registry Safety Check (B2B2G Overwrite Protection)
            existing = conn.execute(
                """
                SELECT
                    site_id, area_id, brand, model, delivery_mode,
                    configured_media_profile_version_id,
                    COALESCE(host(network_host), network_host::text) AS network_host,
                    network_port, printer_language, emulation, confirmed_dpi, is_enabled
                FROM printer_registry
                WHERE printer_id = %s
                """,
                (printer_id,),
            ).fetchone()

            clean_req_host = str(network_host).split("/")[0]

            if existing is None:
                # Insert brand new printer
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
                    """,
                    (
                        printer_id,
                        site_id,
                        area_id,
                        brand_upper,
                        model,
                        media_version_uuid,
                        clean_req_host,
                        network_port,
                        printer_language,
                        emulation,
                        dpi,
                    ),
                )
                logger.info("Registered new pilot printer '%s' (%s:%d)", printer_id, clean_req_host, network_port)
            else:
                # Compare fields for changes
                diffs: dict[str, tuple[Any, Any]] = {}
                curr_site = existing[0]
                curr_area = existing[1]
                curr_brand = existing[2]
                curr_model = existing[3]
                curr_delivery = existing[4]
                curr_media_uuid = existing[5]
                curr_host = str(existing[6]).split("/")[0] if existing[6] else ""
                curr_port = int(existing[7]) if existing[7] is not None else None
                curr_lang = existing[8]
                curr_emul = existing[9]
                curr_dpi = float(existing[10]) if existing[10] is not None else None

                if curr_site != site_id:
                    diffs["site_id"] = (curr_site, site_id)
                if curr_area != area_id:
                    diffs["area_id"] = (curr_area, area_id)
                if curr_brand != brand_upper:
                    diffs["brand"] = (curr_brand, brand_upper)
                if curr_model != model:
                    diffs["model"] = (curr_model, model)
                if curr_delivery != "central_tcp":
                    diffs["delivery_mode"] = (curr_delivery, "central_tcp")
                if curr_media_uuid != media_version_uuid:
                    diffs["configured_media_profile_version_id"] = (str(curr_media_uuid), str(media_version_uuid))
                if curr_host != clean_req_host:
                    diffs["network_host"] = (curr_host, clean_req_host)
                if curr_port != network_port:
                    diffs["network_port"] = (curr_port, network_port)
                if curr_lang != printer_language:
                    diffs["printer_language"] = (curr_lang, printer_language)
                if curr_emul != emulation:
                    diffs["emulation"] = (curr_emul, emulation)
                if curr_dpi is not None and abs(curr_dpi - float(dpi)) > 0.01:
                    diffs["confirmed_dpi"] = (curr_dpi, float(dpi))

                if not diffs:
                    logger.info("Printer '%s' already exists with identical configuration. No-op.", printer_id)
                else:
                    if not force_update:
                        formatted = ", ".join(f"{k}: current='{v[0]}' requested='{v[1]}'" for k, v in diffs.items())
                        raise PrinterConflictError(
                            f"Printer '{printer_id}' already exists with differing configuration ({formatted}). "
                            "Pass force_update=True and provide --reason to update."
                        )
                    if not reason or not reason.strip():
                        raise ValueError("A non-empty reason is required when force-updating printer registry.")

                    # Update printer registry
                    conn.execute(
                        """
                        UPDATE printer_registry
                        SET site_id = %s,
                            area_id = %s,
                            brand = %s,
                            model = %s,
                            delivery_mode = 'central_tcp',
                            configured_media_profile_version_id = %s,
                            network_host = %s,
                            network_port = %s,
                            printer_language = %s,
                            emulation = %s,
                            confirmed_dpi = %s,
                            is_enabled = TRUE,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE printer_id = %s
                        """,
                        (
                            site_id,
                            area_id,
                            brand_upper,
                            model,
                            media_version_uuid,
                            clean_req_host,
                            network_port,
                            printer_language,
                            emulation,
                            dpi,
                            printer_id,
                        ),
                    )

                    # Record audit trail in print_audit_events
                    printer_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, printer_id)
                    audit_metadata = {
                        "printer_id": printer_id,
                        "reason": reason.strip(),
                        "diffs": {k: {"old": str(v[0]), "new": str(v[1])} for k, v in diffs.items()},
                    }
                    conn.execute(
                        """
                        INSERT INTO print_audit_events (
                            actor_type, actor_id, action, aggregate_type, aggregate_id, reason_code, metadata
                        ) VALUES ('operator', %s, 'printer_registry_updated', 'printer', %s, 'force_update', %s::jsonb)
                        """,
                        (
                            actor_id,
                            printer_uuid,
                            json.dumps(audit_metadata),
                        ),
                    )
                    logger.info("Force-updated printer '%s' with audit trail (reason: %s)", printer_id, reason.strip())

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
        "network_host": clean_req_host,
        "network_port": network_port,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed pilot data for Thermal Label Studio with safety checks")
    parser.add_argument("--database-url", default=os.getenv("PRINT_AGENT_DATABASE_URL"), help="PostgreSQL connection URL")
    parser.add_argument("--printer-id", default=os.getenv("PILOT_PRINTER_ID", "PRN-PILOT-01"), help="Pilot printer ID")
    parser.add_argument("--site-id", default=os.getenv("PILOT_SITE_ID", "pilot-site"), help="Site ID")
    parser.add_argument("--area-id", default=os.getenv("PILOT_AREA_ID", "packing-line-1"), help="Area ID")
    parser.add_argument("--brand", default=os.getenv("PILOT_PRINTER_BRAND", "HONEYWELL"), help="Printer brand")
    parser.add_argument("--model", default=os.getenv("PILOT_PRINTER_MODEL", "PD45S"), help="Printer model")
    parser.add_argument("--host", default=os.getenv("PILOT_PRINTER_HOST", "127.0.0.1"), help="Printer network host / IP")
    parser.add_argument("--port", type=int, default=int(os.getenv("PILOT_PRINTER_PORT", "9100")), help="Printer network port")
    parser.add_argument("--language", default=os.getenv("PILOT_PRINTER_LANGUAGE", "ipl"), help="Printer language (ipl, zpl)")
    parser.add_argument("--emulation", default=os.getenv("PILOT_PRINTER_EMULATION", "native"), help="Emulation (native, zsim2)")
    parser.add_argument("--dpi", type=float, default=float(os.getenv("PILOT_PRINTER_DPI", "203.0")), help="Confirmed DPI")
    parser.add_argument("--force-update", action="store_true", help="Force overwrite existing printer configuration")
    parser.add_argument("--reason", default=None, help="Audit reason required when force-updating printer registry")

    args = parser.parse_args(argv)

    if not args.database_url:
        print("ERROR: Database URL is required (set PRINT_AGENT_DATABASE_URL or pass --database-url)", file=sys.stderr)
        return 1

    # Security boundary: ALLOW_INSECURE_TEST_CREDENTIALS is an explicit environment-controlled
    # exception strictly reserved for disposable test containers (CI / local tests) and is
    # strictly prohibited in pilot or production deployments.
    allow_insecure = os.getenv("ALLOW_INSECURE_TEST_CREDENTIALS", "").strip().lower() in ("true", "1", "yes")

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
            force_update=args.force_update,
            reason=args.reason,
            allow_insecure_credentials=allow_insecure,
        )
        print(f"Successfully seeded pilot data:")
        print(f"  - Media Profile: {result['media_profile_id']} (Version {result['media_profile_version_id']})")
        print(f"  - Template: {result['template_id']} (Version {result['template_version_id']})")
        print(f"  - Printer: {result['printer_id']} ({result['network_host']}:{result['network_port']})")
        return 0
    except PrinterConflictError as exc:
        print(f"CONFLICT ERROR: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"ERROR: Failed to seed pilot data: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
