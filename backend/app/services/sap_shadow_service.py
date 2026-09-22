"""SAP Shadow Print Simulation Service.

Implements the virtual simulation pipeline replicating SAP ZLABEL / ZMM_LABEL_JSON:
- Reuses validation, ingestion, and real rendering pipeline (inject_data, inject_barcodes_and_qr, svg_to_png).
- Resolves printer_id server-side to virtual media profile.
- Strict canonical contract validation (extra="forbid").
- Strict enforcement of copies == 1 for simulation.
- Strict idempotency key per (producer_namespace, request_id).
- Strictly zero network sockets, TCP 9100, or Windows Spooler calls.
- Emits durable watermarked PDF evidence via PdfEvidenceService.
- Durable persistence of batches and idempotency index to filesystem (and optional PostgreSQL).
- Retains artifacts for 7 days via DurableFilesystemArtifactStorage.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import tempfile
from typing import Any, Dict, List, Literal, Optional, Set, Union
import uuid

from pydantic import BaseModel, ConfigDict, Field

from ..config import STORAGE_OUT_DIR
from ..print_jobs.artifact_storage import (
    ArtifactStorage,
    DurableFilesystemArtifactStorage,
)
from ..services.pdf_evidence_service import PdfEvidenceService
from ..services.template_service import TemplateService

# Core Label Engine Modules
from engine.renderer import inject_data
from engine.barcode_generator import inject_barcodes_and_qr
from engine.rasterizer import svg_to_png

logger = logging.getLogger("sap_shadow_service")

# Virtual Printer Registry (Server-side mapping only — never specifies network host/port)
VIRTUAL_PRINTER_REGISTRY: Dict[str, Dict[str, Any]] = {
    "PILOT-PRINTER-01": {
        "printer_id": "PILOT-PRINTER-01",
        "site_id": "PILOT-SITE-01",
        "dpi": 203.2,
        "width_mm": 200.0,
        "height_mm": 80.0,
        "orientation": "portrait",
        "printer_language": "zpl",
        "emulation": "standard",
        "is_virtual": True,
    },
    "VIRTUAL-THERMAL-01": {
        "printer_id": "VIRTUAL-THERMAL-01",
        "site_id": "SIMULATION-LOCAL",
        "dpi": 203.2,
        "width_mm": 200.0,
        "height_mm": 80.0,
        "orientation": "portrait",
        "printer_language": "zpl",
        "emulation": "standard",
        "is_virtual": True,
    },
}


class SapCanonicalFields(BaseModel):
    """Strict typed fields for SAP label data contract."""

    model_config = ConfigDict(extra="forbid")

    brand: Optional[str] = Field(default=None, max_length=64)
    type_film: Optional[str] = Field(default=None, max_length=64)
    base_film: Optional[str] = Field(default=None, max_length=64)
    material_code: Optional[str] = Field(default=None, max_length=64)
    material_number: Optional[str] = Field(default=None, max_length=64)
    material_desc: Optional[str] = Field(default=None, max_length=128)
    batch_number: Optional[str] = Field(default=None, max_length=64)
    batch_text: Optional[str] = Field(default=None, max_length=64)
    roll_number: Optional[str] = Field(default=None, max_length=64)
    roll_no: Optional[str] = Field(default=None, max_length=64)
    width_mm: Optional[Union[float, str]] = None
    length_m: Optional[Union[float, str]] = None
    width_inch: Optional[Union[float, str]] = None
    length_feet: Optional[Union[float, str]] = None
    gross_weight: Optional[str] = Field(default=None, max_length=32)
    gross_weight_kg: Optional[Union[float, str]] = None
    net_weight: Optional[str] = Field(default=None, max_length=32)
    net_weight_kg: Optional[Union[float, str]] = None
    weight_lbs: Optional[Union[float, str]] = None
    core_inch: Optional[Union[float, str]] = None
    used_before: Optional[str] = Field(default=None, max_length=32)
    so_item: Optional[str] = Field(default=None, max_length=64)
    splice_1_m: Optional[str] = Field(default=None, max_length=32)
    splice_2_m: Optional[str] = Field(default=None, max_length=32)
    splice_1_feet: Optional[str] = Field(default=None, max_length=32)
    splice_2_feet: Optional[str] = Field(default=None, max_length=32)
    treatment_inside: Optional[str] = Field(default=None, max_length=32)
    treatment_outside: Optional[str] = Field(default=None, max_length=32)
    production_date: Optional[str] = Field(default=None, max_length=32)


class SapCanonicalCodes(BaseModel):
    """Strict typed codes for barcodes and QR matrices."""

    model_config = ConfigDict(extra="forbid")

    batch_barcode: Optional[str] = Field(default=None, max_length=128)
    roll_barcode: Optional[str] = Field(default=None, max_length=128)
    material_barcode: Optional[str] = Field(default=None, max_length=128)
    qr_payload: Optional[str] = Field(default=None, max_length=512)


class SapCanonicalItemData(BaseModel):
    """Strict canonical data model for SAP simulation label items.

    Supports either versioned pure data envelope ('fields' and 'codes')
    or structured roll label model. Extra fields are strictly forbidden.
    """

    model_config = ConfigDict(extra="forbid")

    contract_version: Optional[str] = Field(default="1.1", max_length=16)
    fields: Optional[SapCanonicalFields] = None
    codes: Optional[SapCanonicalCodes] = None

    # Structured roll label properties (when passed at root of item data)
    brand: Optional[str] = Field(default=None, max_length=64)
    type_film: Optional[str] = Field(default=None, max_length=64)
    base_film: Optional[str] = Field(default=None, max_length=64)
    material_code: Optional[str] = Field(default=None, max_length=64)
    material_number: Optional[str] = Field(default=None, max_length=64)
    material_desc: Optional[str] = Field(default=None, max_length=128)
    batch_number: Optional[str] = Field(default=None, max_length=64)
    batch_text: Optional[str] = Field(default=None, max_length=64)
    roll_number: Optional[str] = Field(default=None, max_length=64)
    roll_no: Optional[str] = Field(default=None, max_length=64)
    width_mm: Optional[Union[float, str]] = None
    length_m: Optional[Union[float, str]] = None
    width_inch: Optional[Union[float, str]] = None
    length_feet: Optional[Union[float, str]] = None
    gross_weight: Optional[str] = Field(default=None, max_length=32)
    gross_weight_kg: Optional[Union[float, str]] = None
    net_weight: Optional[str] = Field(default=None, max_length=32)
    net_weight_kg: Optional[Union[float, str]] = None
    weight_lbs: Optional[Union[float, str]] = None
    core_inch: Optional[Union[float, str]] = None
    used_before: Optional[str] = Field(default=None, max_length=32)
    so_item: Optional[str] = Field(default=None, max_length=64)
    splice_1_m: Optional[str] = Field(default=None, max_length=32)
    splice_2_m: Optional[str] = Field(default=None, max_length=32)
    splice_1_feet: Optional[str] = Field(default=None, max_length=32)
    splice_2_feet: Optional[str] = Field(default=None, max_length=32)
    treatment_inside: Optional[str] = Field(default=None, max_length=32)
    treatment_outside: Optional[str] = Field(default=None, max_length=32)
    production_date: Optional[str] = Field(default=None, max_length=32)


class SapSourceMetadata(BaseModel):
    """Restricted audit metadata originating from SAP."""

    model_config = ConfigDict(extra="forbid")

    werks: Optional[str] = Field(default=None, max_length=8, description="SAP Plant code (e.g. 1100)")
    lgort: Optional[str] = Field(default=None, max_length=8, description="SAP Storage location (e.g. 0001)")
    sap_user: Optional[str] = Field(default=None, max_length=32, description="SAP User ID (e.g. M_PPIC)")
    system_id: Optional[str] = Field(default=None, max_length=16, description="SAP System ID (e.g. PRD, QAS)")
    transaction_code: Optional[str] = Field(default=None, max_length=20, description="SAP T-Code (e.g. ZLABEL)")


class SapShadowItemInput(BaseModel):
    """Canonical SAP item input for simulation."""

    model_config = ConfigDict(extra="forbid")

    item_sequence: int = Field(..., ge=1, description="Sequence number of label within batch (1-indexed)")
    template_version_id: str = Field(..., min_length=1, max_length=128, description="Target label template identifier")
    canonical_item_data: SapCanonicalItemData = Field(..., description="Strict SAP canonical pure data payload")
    copies: Literal[1] = Field(default=1, description="Number of copies (strictly 1 for pilot simulation per AC 4 / P2-2)")


class SapShadowBatchRequest(BaseModel):
    """Canonical SAP batch request for simulation."""

    model_config = ConfigDict(extra="forbid")

    producer_namespace: str = Field(
        ...,
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="SAP producer namespace (e.g. SAP_PPIC, SAP_WM)",
    )
    request_id: str = Field(
        ...,
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="SAP unique request/idempotency key",
    )
    printer_id: str = Field(
        ...,
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="Logical printer target resolved server-side to virtual profile",
    )
    items: List[SapShadowItemInput] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="List of canonical items ordered by item_sequence",
    )
    source_metadata: Optional[SapSourceMetadata] = Field(
        default=None,
        description="Optional non-functional metadata from SAP (restricted audit fields)",
    )


def normalize_canonical_for_engine(canonical_data: SapCanonicalItemData) -> Dict[str, Any]:
    """Normalizes typed canonical data into engine pure data contract v1.1 format."""
    data_dict = canonical_data.model_dump(exclude_none=True)

    fields: Dict[str, Any] = {}
    codes: Dict[str, Any] = {}

    if "fields" in data_dict and isinstance(data_dict["fields"], dict):
        fields.update(data_dict["fields"])
    if "codes" in data_dict and isinstance(data_dict["codes"], dict):
        codes.update(data_dict["codes"])

    for k, v in data_dict.items():
        if k not in ("fields", "codes", "contract_version"):
            fields[k] = v

    batch_val = str(fields.get("batch_text") or fields.get("batch_number") or "")
    roll_val = str(fields.get("roll_no") or fields.get("roll_number") or "")
    mat_val = str(fields.get("material_code") or fields.get("material_number") or "")
    brand_val = str(fields.get("brand") or "POLYTRON")
    film_val = str(fields.get("type_film") or fields.get("material_desc") or "ALUMINIUM FOIL")
    base_val = str(fields.get("base_film") or "PET FILM")
    net_val = str(fields.get("net_weight_kg") or fields.get("net_weight") or "")
    gross_val = str(fields.get("gross_weight_kg") or fields.get("gross_weight") or "")

    net_clean = net_val.replace("KG", "").replace("Kg", "").replace("kg", "").strip()
    gross_clean = gross_val.replace("KG", "").replace("Kg", "").replace("kg", "").strip()

    fields.setdefault("brand", brand_val)
    fields.setdefault("type_film", film_val)
    fields.setdefault("base_film", base_val)
    fields.setdefault("batch_text", batch_val)
    fields.setdefault("batch_number", batch_val)
    fields.setdefault("roll_no", roll_val)
    fields.setdefault("roll_number", roll_val)
    fields.setdefault("material_code", mat_val)
    fields.setdefault("material_number", mat_val)
    fields.setdefault("width_mm", str(fields.get("width_mm", "80")))
    fields.setdefault("length_m", str(fields.get("length_m", "2000")))
    fields.setdefault("width_inch", str(fields.get("width_inch", "3.15")))
    fields.setdefault("length_feet", str(fields.get("length_feet", "6561")))
    fields.setdefault("net_weight_kg", net_clean or "12.00")
    fields.setdefault("gross_weight_kg", gross_clean or "12.50")
    fields.setdefault("weight_lbs", str(fields.get("weight_lbs", "26.4")))
    fields.setdefault("core_inch", str(fields.get("core_inch", "3")))
    fields.setdefault("used_before", str(fields.get("used_before", "12/2028")))
    fields.setdefault("so_item", str(fields.get("so_item", "10")))
    fields.setdefault("splice_1_m", str(fields.get("splice_1_m", "0")))
    fields.setdefault("splice_2_m", str(fields.get("splice_2_m", "0")))
    fields.setdefault("splice_1_feet", str(fields.get("splice_1_feet", "0")))
    fields.setdefault("splice_2_feet", str(fields.get("splice_2_feet", "0")))
    fields.setdefault("treatment_inside", str(fields.get("treatment_inside", "Corona")))
    fields.setdefault("treatment_outside", str(fields.get("treatment_outside", "None")))

    codes.setdefault("batch_barcode", batch_val or "BAT-DEFAULT")
    codes.setdefault("roll_barcode", roll_val or "ROL-DEFAULT")
    codes.setdefault("material_barcode", mat_val or "MAT-DEFAULT")
    codes.setdefault("qr_payload", f"MAT:{mat_val};BAT:{batch_val};ROL:{roll_val}")

    return {"fields": fields, "codes": codes}


class SimulationPersistenceError(RuntimeError):
    """Raised when durable atomic disk persistence fails."""
    pass


class SapShadowService:
    """Service managing SAP Shadow Print Simulation pipeline with durable persistence."""

    def __init__(
        self,
        artifact_storage: Optional[ArtifactStorage] = None,
        storage_base_dir: Optional[Path] = None,
    ) -> None:
        base_dir = storage_base_dir or STORAGE_OUT_DIR
        self.base_dir = base_dir

        if artifact_storage is not None:
            self.artifact_storage = artifact_storage
        else:
            storage_dir = base_dir / "simulation_artifacts"
            self.artifact_storage = DurableFilesystemArtifactStorage(storage_dir)

        # Durable file store directories
        self._batch_store_dir = base_dir / "simulation_batches" / "records"
        self._idempotency_store_dir = base_dir / "simulation_batches" / "idempotency"
        self._batch_store_dir.mkdir(parents=True, exist_ok=True)
        self._idempotency_store_dir.mkdir(parents=True, exist_ok=True)

        # In-memory hot cache
        self._batches: Dict[str, Dict[str, Any]] = {}
        self._idempotency_map: Dict[str, str] = {}  # "namespace:request_id" -> batch_id
        self._batch_payload_hashes: Dict[str, str] = {}  # batch_id -> raw_contract_sha256
        self._lock = asyncio.Lock()
        self._background_tasks: Set[asyncio.Task[Any]] = set()

    # ------------------------------------------------------------------
    # Durable Persistence Layer (Filesystem + Optional PostgreSQL)
    # ------------------------------------------------------------------

    def _sanitize_filename_key(self, key: str) -> str:
        """Sanitizes idempotency key for safe filesystem path."""
        return re.sub(r"[^A-Za-z0-9_-]", "__", key)

    def _save_batch_to_disk(self, record: Dict[str, Any]) -> None:
        """Atomically saves batch state to durable filesystem store.

        Fails closed by raising SimulationPersistenceError if disk write fails.
        """
        batch_id = record["batch_id"]
        target_path = self._batch_store_dir / f"{batch_id}.json"
        temp_path = self._batch_store_dir / f"{batch_id}.json.tmp"

        # Create clean record for disk serialization (omit volatile binary bytes)
        disk_record = dict(record)
        if "items" in disk_record:
            disk_items = []
            for it in disk_record["items"]:
                cleaned = dict(it)
                cleaned.pop("rendered_image_bytes", None)
                disk_items.append(cleaned)
            disk_record["items"] = disk_items

        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(disk_record, f, indent=2)
            os.replace(temp_path, target_path)
        except Exception as exc:
            logger.error("Failed to persist simulation batch %s to disk: %s", batch_id, exc)
            raise SimulationPersistenceError(f"Failed to persist batch {batch_id} to disk: {exc}") from exc

    def _load_batch_from_disk(self, batch_id: str) -> Optional[Dict[str, Any]]:
        """Loads batch record from durable filesystem store."""
        target_path = self._batch_store_dir / f"{batch_id}.json"
        if not target_path.is_file():
            return None
        try:
            with open(target_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logger.error("Failed to load simulation batch %s from disk: %s", batch_id, exc)
            return None

    def _save_idempotency_to_disk(
        self,
        idempotency_key: str,
        batch_id: str,
        contract_hash: str,
    ) -> None:
        """Atomically saves idempotency mapping to durable filesystem store.

        Fails closed by raising SimulationPersistenceError if disk write fails.
        """
        safe_name = self._sanitize_filename_key(idempotency_key)
        target_path = self._idempotency_store_dir / f"{safe_name}.json"
        temp_path = self._idempotency_store_dir / f"{safe_name}.json.tmp"
        payload = {
            "idempotency_key": idempotency_key,
            "batch_id": batch_id,
            "contract_hash": contract_hash,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            os.replace(temp_path, target_path)
        except Exception as exc:
            logger.error("Failed to persist idempotency key %s to disk: %s", idempotency_key, exc)
            raise SimulationPersistenceError(f"Failed to persist idempotency key {idempotency_key} to disk: {exc}") from exc

    def _load_idempotency_from_disk(self, idempotency_key: str) -> Optional[Dict[str, Any]]:
        """Loads idempotency mapping from durable filesystem store."""
        safe_name = self._sanitize_filename_key(idempotency_key)
        target_path = self._idempotency_store_dir / f"{safe_name}.json"
        if not target_path.is_file():
            return None
        try:
            with open(target_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logger.error("Failed to load idempotency key %s from disk: %s", idempotency_key, exc)
            return None

    def resolve_virtual_printer(self, printer_id: str) -> Dict[str, Any]:
        """Resolves logical printer_id to virtual printer profile.

        Fails closed if printer_id is not in permitted virtual registry.
        """
        if printer_id not in VIRTUAL_PRINTER_REGISTRY:
            allowed = sorted(VIRTUAL_PRINTER_REGISTRY.keys())
            raise ValueError(f"Unknown or unauthorized printer_id '{printer_id}'. Allowed virtual printers: {allowed}")
        return VIRTUAL_PRINTER_REGISTRY[printer_id]

    def _calculate_contract_hash(self, request: SapShadowBatchRequest) -> str:
        """Deterministically computes SHA-256 digest of incoming canonical contract."""
        normalized = {
            "producer_namespace": request.producer_namespace,
            "request_id": request.request_id,
            "printer_id": request.printer_id,
            "items": [
                {
                    "item_sequence": it.item_sequence,
                    "template_version_id": it.template_version_id,
                    "canonical_item_data": it.canonical_item_data.model_dump(exclude_none=True),
                    "copies": it.copies,
                }
                for it in sorted(request.items, key=lambda x: x.item_sequence)
            ],
        }
        raw_json = json.dumps(normalized, sort_keys=True)
        return hashlib.sha256(raw_json.encode("utf-8")).hexdigest()

    async def ingest_batch(
        self,
        request: SapShadowBatchRequest,
        auto_process: bool = True,
    ) -> Dict[str, Any]:
        """Ingests canonical SAP batch, validates contract, and initiates simulation."""
        # 1. Resolve virtual profile (server-side only)
        virtual_profile = self.resolve_virtual_printer(request.printer_id)

        # 2. Validate sequence uniqueness
        sequences = [it.item_sequence for it in request.items]
        if len(sequences) != len(set(sequences)):
            raise ValueError("item_sequence values within batch must be strictly unique")

        # 3. Validate template compatibility for all items
        for it in request.items:
            clean_id = it.template_version_id.replace(".svg", "")
            tmpl_path = TemplateService.get_template_path(clean_id)
            if not tmpl_path:
                known = [t.id for t in TemplateService.list_templates()]
                if clean_id not in known and clean_id != "label_roll_80x200":
                    raise ValueError(f"Template '{it.template_version_id}' not found.")
            else:
                w_mm, h_mm = TemplateService.extract_dimensions_from_file(tmpl_path)
                if w_mm and h_mm:
                    expected_w = virtual_profile.get("width_mm")
                    expected_h = virtual_profile.get("height_mm")
                    if expected_w and expected_h:
                        if abs(w_mm - expected_w) > 1.0 or abs(h_mm - expected_h) > 1.0:
                            raise ValueError(
                                f"Template '{it.template_version_id}' dimensions ({w_mm}x{h_mm}mm) "
                                f"do not match virtual printer media profile ({expected_w}x{expected_h}mm)"
                            )

        # 4. Check Idempotency Key (In-Memory + Durable Filesystem Store)
        idempotency_key = f"{request.producer_namespace}:{request.request_id}"
        contract_hash = self._calculate_contract_hash(request)

        async with self._lock:
            existing_batch_id = self._idempotency_map.get(idempotency_key)
            existing_hash = None

            if existing_batch_id:
                existing_hash = self._batch_payload_hashes.get(existing_batch_id)
            else:
                # Check disk store across restarts
                stored_idem = self._load_idempotency_from_disk(idempotency_key)
                if stored_idem:
                    existing_batch_id = stored_idem.get("batch_id")
                    existing_hash = stored_idem.get("contract_hash")

            if existing_batch_id:
                if existing_hash and existing_hash != contract_hash:
                    raise ValueError(
                        f"Conflict: request_id '{request.request_id}' has already been submitted with different payload."
                    )

                existing_record = self.get_batch(existing_batch_id)
                if existing_record:
                    # P1-B: If existing batch was interrupted in accepted/processing, resume it
                    if existing_record.get("status") in ("accepted", "processing") and auto_process:
                        task = asyncio.create_task(self.process_batch(existing_batch_id))
                        self._background_tasks.add(task)
                        task.add_done_callback(self._background_tasks.discard)

                    return {
                        "batch_id": existing_batch_id,
                        "producer_namespace": request.producer_namespace,
                        "request_id": request.request_id,
                        "printer_id": request.printer_id,
                        "status": existing_record["status"],
                        "total_items": existing_record["total_items"],
                        "idempotent_replay": True,
                        "created_at": existing_record["created_at"],
                        "message": "Idempotent replay: existing batch returned.",
                    }

            # 5. Create new batch record
            batch_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)

            sorted_items = sorted(request.items, key=lambda x: x.item_sequence)

            batch_items = []
            for item in sorted_items:
                item_dict = item.canonical_item_data.model_dump(exclude_none=True)
                item_json = json.dumps(item_dict, sort_keys=True)
                item_hash = hashlib.sha256(item_json.encode("utf-8")).hexdigest()
                batch_items.append({
                    "item_id": str(uuid.uuid4()),
                    "item_sequence": item.item_sequence,
                    "template_version_id": item.template_version_id,
                    "canonical_item_data": item_dict,
                    "copies": item.copies,
                    "item_data_sha256": item_hash,
                    "status": "accepted",
                })

            batch_record = {
                "batch_id": batch_id,
                "producer_namespace": request.producer_namespace,
                "request_id": request.request_id,
                "printer_id": request.printer_id,
                "virtual_profile": virtual_profile,
                "raw_contract_sha256": contract_hash,
                "status": "accepted",
                "total_items": len(batch_items),
                "completed_items": 0,
                "items": batch_items,
                "created_at": now.isoformat(),
                "completed_at": None,
                "artifact": None,
                "error": None,
            }

            self._batches[batch_id] = batch_record
            self._idempotency_map[idempotency_key] = batch_id
            self._batch_payload_hashes[batch_id] = contract_hash

            # P1-B & Atomicity Invariant:
            # Persist to durable filesystem store with atomic write.
            # If idempotency index write fails, clean up the batch record from disk.
            # If cleanup fails, poison the record state to prevent recovery.
            try:
                self._save_batch_to_disk(batch_record)
                self._save_idempotency_to_disk(idempotency_key, batch_id, contract_hash)
            except Exception:
                # 1. Rollback in-memory state
                self._batches.pop(batch_id, None)
                self._idempotency_map.pop(idempotency_key, None)
                self._batch_payload_hashes.pop(batch_id, None)

                # 2. Cleanup orphan batch record from disk
                batch_file = self._batch_store_dir / f"{batch_id}.json"
                if batch_file.is_file():
                    try:
                        batch_file.unlink()
                        logger.info("Cleaned up uncommitted orphan batch file %s from disk after persistence failure", batch_id)
                    except Exception as cleanup_exc:
                        logger.critical("Failed to unlink orphan batch file %s: %s; poisoning status to persistence_aborted", batch_id, cleanup_exc)
                        try:
                            batch_record["status"] = "persistence_aborted"
                            batch_record["error"] = "Uncommitted: persistence aborted before idempotency commit."
                            self._save_batch_to_disk(batch_record)
                        except Exception:
                            pass
                raise

        # 6. Trigger processing with managed task tracking
        if auto_process:
            task = asyncio.create_task(self.process_batch(batch_id))
            self._background_tasks.add(task)
            task.add_done_callback(self._background_tasks.discard)

        return {
            "batch_id": batch_id,
            "producer_namespace": request.producer_namespace,
            "request_id": request.request_id,
            "printer_id": request.printer_id,
            "status": "accepted",
            "total_items": len(batch_items),
            "idempotent_replay": False,
            "created_at": now.isoformat(),
            "message": "SAP simulation batch accepted for processing.",
        }

    async def process_batch(self, batch_id: str) -> None:
        """Executes simulation pipeline for batch: renders items with engine and produces PDF evidence."""
        record = self.get_batch(batch_id)
        if not record:
            return
        if record.get("status") == "completed" and record.get("artifact"):
            return

        try:
            record["status"] = "processing"
            self._save_batch_to_disk(record)
            virtual_profile = record["virtual_profile"]

            dpi = float(virtual_profile.get("dpi", 203.2))
            w_mm = float(virtual_profile.get("width_mm", 200.0))
            h_mm = float(virtual_profile.get("height_mm", 80.0))
            target_w = int(round((w_mm / 25.4) * dpi))
            target_h = int(round((h_mm / 25.4) * dpi))

            rendered_items = []
            # Process items strictly in item_sequence ASC
            for item in record["items"]:
                item["status"] = "rendering"

                # P1-1: Real rendering pipeline execution
                clean_id = item["template_version_id"].replace(".svg", "")
                tmpl_path = TemplateService.get_template_path(clean_id)

                if not tmpl_path or not tmpl_path.is_file():
                    raise FileNotFoundError(
                        f"Template '{item['template_version_id']}' not found on filesystem. Mockup fallback is forbidden."
                    )

                svg_template_content = tmpl_path.read_text(encoding="utf-8")
                canonical_model = SapCanonicalItemData(**item["canonical_item_data"])
                contract_data = normalize_canonical_for_engine(canonical_model)

                # 1. Inject pure text data
                injected_svg = inject_data(svg_template_content, contract_data)
                # 2. Inject vector 1D/2D barcodes
                final_svg = inject_barcodes_and_qr(injected_svg, contract_data)

                # 3. Rasterize to exact media points/pixels via engine
                with tempfile.TemporaryDirectory() as td:
                    temp_png = Path(td) / "label_render.png"
                    svg_to_png(
                        svg_source=final_svg,
                        output_png_path=temp_png,
                        width_px=target_w,
                        height_px=target_h,
                        dpi=dpi,
                    )
                    rendered_bytes = temp_png.read_bytes()

                if not rendered_bytes:
                    raise RuntimeError(
                        f"Rendering produced empty bytes for template '{item['template_version_id']}'."
                    )

                item["status"] = "completed"
                record["completed_items"] += 1

                pdf_item = dict(item)
                pdf_item["rendered_image_bytes"] = rendered_bytes
                rendered_items.append(pdf_item)

            # Generate multi-page PDF batch evidence (A4 cover + exact physical points label pages)
            pdf_bytes = PdfEvidenceService.generate_batch_pdf(
                batch_id=batch_id,
                producer_namespace=record["producer_namespace"],
                request_id=record["request_id"],
                printer_id=record["printer_id"],
                virtual_profile=virtual_profile,
                items=rendered_items,
                raw_contract_sha256=record["raw_contract_sha256"],
                created_at=datetime.fromisoformat(record["created_at"]),
            )

            # Store evidence PDF in durable artifact storage
            payload_ref = f"sim-{batch_id[:16]}-{hashlib.sha256(batch_id.encode()).hexdigest()[:8]}"
            artifact_ref = self.artifact_storage.put(
                payload_ref=payload_ref,
                filename="evidence.pdf",
                payload=pdf_bytes,
            )

            now = datetime.now(timezone.utc)
            record["status"] = "completed"
            record["completed_at"] = now.isoformat()
            record["artifact"] = {
                "payload_ref": artifact_ref.payload_ref,
                "filename": artifact_ref.filename,
                "media_type": artifact_ref.media_type,
                "byte_length": artifact_ref.byte_length,
                "sha256": self.artifact_storage.checksum(pdf_bytes),
                "download_url": f"/api/v1/simulation/sap-batches/{batch_id}/pdf",
            }

            # Persist finalized batch state to disk
            self._save_batch_to_disk(record)

        except Exception as exc:
            logger.error("Error executing SAP shadow simulation batch %s: %s", batch_id, type(exc).__name__, exc_info=True)
            record["status"] = "failed"
            record["error"] = "Simulasi batch SAP mengalami kegagalan teknis saat render evidence."
            self._save_batch_to_disk(record)

    def get_batch(self, batch_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves simulation batch status and details from memory or durable disk."""
        if batch_id in self._batches:
            return self._batches[batch_id]

        disk_record = self._load_batch_from_disk(batch_id)
        if disk_record:
            if disk_record.get("status") in ("persistence_aborted", "persistence_failed"):
                return None
            self._batches[batch_id] = disk_record
            return disk_record
        return None

    def list_batches(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Lists recent simulation batches sorted by created_at descending."""
        batches: List[Dict[str, Any]] = []
        seen_ids = set()

        # In-memory hot records
        for b_id, rec in self._batches.items():
            seen_ids.add(b_id)
            batches.append(rec)

        # Records from durable disk store
        if self._batch_store_dir.is_dir():
            for p in self._batch_store_dir.glob("*.json"):
                b_id = p.stem
                if b_id not in seen_ids:
                    seen_ids.add(b_id)
                    rec = self._load_batch_from_disk(b_id)
                    if rec and rec.get("status") not in ("persistence_aborted", "persistence_failed"):
                        batches.append(rec)

        # Sort descending by created_at
        def _get_sort_key(b: Dict[str, Any]) -> str:
            return str(b.get("created_at") or "")

        batches.sort(key=_get_sort_key, reverse=True)
        return batches[:limit]

    def get_evidence_pdf(self, batch_id: str) -> bytes:
        """Retrieves verified evidence PDF bytes from durable storage."""
        record = self.get_batch(batch_id)
        if not record:
            raise KeyError("Batch not found.")
        if record["status"] != "completed" or not record.get("artifact"):
            raise ValueError(f"Evidence PDF is not ready (batch status: {record['status']}).")

        artifact_dict = record["artifact"]
        from ..print_jobs.models import ArtifactReference
        ref = ArtifactReference(
            payload_ref=artifact_dict["payload_ref"],
            filename=artifact_dict["filename"],
            media_type=artifact_dict["media_type"],
            byte_length=artifact_dict["byte_length"],
        )
        return self.artifact_storage.read_verified(ref, artifact_dict["sha256"])

    def recover_on_startup(self) -> int:
        """Scans durable storage on application startup and recovers unfinished batches.

        Explicit Recovery Policy (P1-B): 'Controlled Virtual Resume on Startup'.
        Batches in 'accepted' or 'processing' states were interrupted by a server restart.

        Atomicity Invariant:
        Only batches with a confirmed, valid idempotency commit index matching their batch_id
        and contract_hash are eligible for recovery. Any orphan, uncommitted, or poisoned
        records are strictly ignored and safely cleaned up, preventing phantom processing
        of requests that previously failed with HTTP 500.
        """
        recovered_count = 0
        if not self._batch_store_dir.exists():
            return 0

        if not self._batch_store_dir.is_dir():
            raise SimulationPersistenceError(
                f"Batch store path '{self._batch_store_dir}' exists but is not a directory."
            )

        try:
            batch_files = sorted(self._batch_store_dir.glob("*.json"))
        except Exception as exc:
            logger.critical("Failed to read simulation batch storage directory %s: %s", self._batch_store_dir, exc)
            raise SimulationPersistenceError(f"Cannot read simulation batch store directory: {exc}") from exc

        for path in batch_files:
            batch_id = path.stem
            try:
                record = self._load_batch_from_disk(batch_id)
            except Exception as exc:
                logger.error("Failed reading batch record %s during recovery: %s", batch_id, exc)
                continue

            if not record:
                continue

            # Check status eligibility
            if record.get("status") not in ("accepted", "processing"):
                continue

            # Atomicity invariant check: verify valid idempotency commit index (Proof of Commit)
            p_ns = record.get("producer_namespace")
            req_id = record.get("request_id")
            if not p_ns or not req_id:
                logger.warning("Ignoring corrupted batch record %s without namespace or request_id", batch_id)
                continue

            idempotency_key = f"{p_ns}:{req_id}"
            stored_idem = self._load_idempotency_from_disk(idempotency_key)

            if (
                not stored_idem
                or stored_idem.get("batch_id") != batch_id
                or stored_idem.get("contract_hash") != record.get("raw_contract_sha256")
            ):
                logger.warning(
                    "Startup recovery: rejecting batch record %s (no valid idempotency commit or contract hash mismatch for %s)",
                    batch_id,
                    idempotency_key,
                )
                try:
                    path.unlink()
                    logger.info("Cleaned up uncommitted or contract_hash mismatched orphan batch record %s on startup recovery", batch_id)
                except Exception:
                    pass
                continue

            # Valid committed batch interrupted during execution -> safely resume
            logger.info(
                "Startup recovery: resuming interrupted simulation batch %s (status: %s)",
                batch_id,
                record["status"],
            )
            self._batches[batch_id] = record
            self._idempotency_map[idempotency_key] = batch_id
            self._batch_payload_hashes[batch_id] = record.get("raw_contract_sha256", "")

            task = asyncio.create_task(self.process_batch(batch_id))
            self._background_tasks.add(task)
            task.add_done_callback(self._background_tasks.discard)
            recovered_count += 1

        return recovered_count

    def clear_for_tests(self) -> None:
        """Resets in-memory cache and test disk state for isolated test executions."""
        self._batches.clear()
        self._idempotency_map.clear()
        self._batch_payload_hashes.clear()
        self._background_tasks.clear()

        if self._batch_store_dir.is_dir():
            for p in self._batch_store_dir.glob("*.json*"):
                try:
                    p.unlink()
                except OSError:
                    pass
        if self._idempotency_store_dir.is_dir():
            for p in self._idempotency_store_dir.glob("*.json*"):
                try:
                    p.unlink()
                except OSError:
                    pass


# Global Singleton Instance
sap_shadow_service = SapShadowService()
