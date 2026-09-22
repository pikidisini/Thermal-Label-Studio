"""
Safe Demo Service — In-memory batch simulation and monitoring.

Provides a fully isolated, fail-closed demonstration flow without accessing
physical printers, TCP Port 9100, company databases, or real SAP data.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import hashlib
from typing import Any, Dict, List

from ..print_jobs.batch_ingestion import default_label_renderer
from ..print_jobs.socket_transport import SimulatorSocketTransport

DEMO_DISCLAIMER = "Demo data / not SAP production data"
SAFETY_NOTICE = (
    "Simulator only — tidak ada printer fisik diakses. "
    "Mode TCP dan Port 9100 dinonaktifkan."
)
COPIES_EXPLANATION = (
    "Nilai copies=1 menyatakan 1 lembar fisik identik per label. "
    "Satu batch dapat berisi beberapa label dengan data berbeda."
)

DEMO_FIXTURE_ITEMS: List[Dict[str, Any]] = [
    {
        "item_sequence": 1,
        "item_id": "DEMO-ITEM-001",
        "copies": 1,
        "template_version_id": "label_roll_80x200",
        "canonical_item_data": {
            "material_code": "MAT-DEMO-ALUM-01",
            "material_desc": "Aluminium Foil 80x200 Grade A",
            "batch_number": "BATCH-2026-X01",
            "roll_number": "ROLL-001-A",
            "gross_weight": "12.50 KG",
            "net_weight": "12.10 KG",
            "production_date": "2026-09-21",
        },
    },
    {
        "item_sequence": 2,
        "item_id": "DEMO-ITEM-002",
        "copies": 1,
        "template_version_id": "label_roll_80x200",
        "canonical_item_data": {
            "material_code": "MAT-DEMO-ALUM-02",
            "material_desc": "Aluminium Foil 80x200 Grade B",
            "batch_number": "BATCH-2026-X02",
            "roll_number": "ROLL-002-B",
            "gross_weight": "15.80 KG",
            "net_weight": "15.40 KG",
            "production_date": "2026-09-21",
        },
    },
    {
        "item_sequence": 3,
        "item_id": "DEMO-ITEM-003",
        "copies": 1,
        "template_version_id": "label_roll_80x200",
        "canonical_item_data": {
            "material_code": "MAT-DEMO-ALUM-03",
            "material_desc": "Aluminium Foil 80x200 Grade C",
            "batch_number": "BATCH-2026-X03",
            "roll_number": "ROLL-003-C",
            "gross_weight": "18.20 KG",
            "net_weight": "17.75 KG",
            "production_date": "2026-09-21",
        },
    },
]


def _build_initial_items() -> List[Dict[str, Any]]:
    items = []
    for fixture in DEMO_FIXTURE_ITEMS:
        item = {
            **fixture,
            "status": "ready",
            "status_display": "Siap disimulasikan",
            "byte_count": None,
            "payload_sha256": None,
            "history": [],
        }
        items.append(item)
    return items


class SafeDemoService:
    """In-memory service managing safe demo batches and simulation lifecycles."""

    def __init__(self) -> None:
        self.transport = SimulatorSocketTransport()
        self._lock = asyncio.Lock()
        self._batch: Dict[str, Any] = self._create_initial_batch()

    def _create_initial_batch(self) -> Dict[str, Any]:
        now_iso = datetime.now(timezone.utc).isoformat()
        return {
            "batch_id": "demo-batch-roll-001",
            "batch_name": "Simulasi Batch Produksi: Aluminium Foil 80x200",
            "disclaimer": DEMO_DISCLAIMER,
            "safety_notice": SAFETY_NOTICE,
            "copies_explanation": COPIES_EXPLANATION,
            "environment": "Local Safe Simulation (In-Memory)",
            "printer_id": "SIMULATOR-ZEBRA-01",
            "printer_type": "simulator",
            "transport": "SimulatorSocketTransport",
            "status": "ready",
            "status_display": "Siap dijalankan",
            "total_items": len(DEMO_FIXTURE_ITEMS),
            "created_at": now_iso,
            "updated_at": now_iso,
            "items": _build_initial_items(),
        }

    def get_batch(self) -> Dict[str, Any]:
        """Return the current batch definition and state."""
        return self._batch

    def get_status(self) -> Dict[str, Any]:
        """Return summary status of current demo simulation."""
        completed_count = sum(
            1 for it in self._batch["items"] if it.get("status") == "sent_to_simulator"
        )
        return {
            "batch_id": self._batch["batch_id"],
            "batch_status": self._batch["status"],
            "total_items": self._batch["total_items"],
            "completed_items": completed_count,
            "safety_notice": SAFETY_NOTICE,
            "dispatches_count": len(self.transport.dispatches),
            "updated_at": self._batch["updated_at"],
        }

    async def run_simulation(self) -> Dict[str, Any]:
        """Execute the safe batch simulation across all items in sequence.

        Never opens network sockets; strictly dispatches to SimulatorSocketTransport.
        """
        async with self._lock:
            # Re-initialize item states if previously run
            now_iso = datetime.now(timezone.utc).isoformat()
            self._batch["status"] = "running"
            self._batch["status_display"] = "Sedang memproses simulasi..."
            self._batch["updated_at"] = now_iso

            # Ensure item sequence order
            sorted_items = sorted(self._batch["items"], key=lambda x: x["item_sequence"])

            for item in sorted_items:
                # 1. accepted
                t_acc = datetime.now(timezone.utc).isoformat()
                item["status"] = "accepted"
                item["status_display"] = "Diterima dalam antrian demo"
                item["history"] = [
                    {
                        "state": "accepted",
                        "timestamp": t_acc,
                        "message": "Item batch diterima dalam antrian simulasi.",
                    }
                ]
                await asyncio.sleep(0.01)

                # 2. rendered
                t_ren = datetime.now(timezone.utc).isoformat()
                payload_bytes = default_label_renderer(
                    template_ref=item["template_version_id"],
                    item_data=item["canonical_item_data"],
                    printer_language="zpl",
                    dpi=203.2,
                )
                item["status"] = "rendered"
                item["status_display"] = "Payload label berhasil dirender"
                item["history"].append(
                    {
                        "state": "rendered",
                        "timestamp": t_ren,
                        "message": "Payload ZPL berhasil dirender dari data kanonikal.",
                    }
                )
                await asyncio.sleep(0.01)

                # 3. queued
                t_que = datetime.now(timezone.utc).isoformat()
                item["status"] = "queued"
                item["status_display"] = "Siap dalam antrian dispatcher"
                item["history"].append(
                    {
                        "state": "queued",
                        "timestamp": t_que,
                        "message": "Menunggu alokasi dispatcher simulator.",
                    }
                )
                await asyncio.sleep(0.01)

                # 4. claimed
                t_cla = datetime.now(timezone.utc).isoformat()
                item["status"] = "claimed"
                item["status_display"] = "Dialokasikan ke simulator"
                item["history"].append(
                    {
                        "state": "claimed",
                        "timestamp": t_cla,
                        "message": "Item dialokasikan ke SimulatorSocketTransport.",
                    }
                )
                await asyncio.sleep(0.01)

                # 5. sending
                t_snd = datetime.now(timezone.utc).isoformat()
                item["status"] = "sending"
                item["status_display"] = "Mengirim ke transport simulator..."
                item["history"].append(
                    {
                        "state": "sending",
                        "timestamp": t_snd,
                        "message": "Mengirimkan byte payload ke transport simulator.",
                    }
                )
                await asyncio.sleep(0.01)

                # 6. sent_to_simulator (Strictly simulator transport)
                self.transport.send("simulator://local", 0, payload_bytes)
                t_fin = datetime.now(timezone.utc).isoformat()
                item["byte_count"] = len(payload_bytes)
                item["payload_sha256"] = hashlib.sha256(payload_bytes).hexdigest()
                item["status"] = "sent_to_simulator"
                item["status_display"] = "Terkirim ke simulator — tidak dicetak fisik"
                item["history"].append(
                    {
                        "state": "sent_to_simulator",
                        "timestamp": t_fin,
                        "message": "Terkirim ke simulator — tidak dicetak fisik",
                    }
                )

            self._batch["status"] = "completed"
            self._batch["status_display"] = "Selesai disimulasikan di simulator"
            self._batch["updated_at"] = datetime.now(timezone.utc).isoformat()
            return self._batch

    def reset(self) -> Dict[str, Any]:
        """Reset the in-memory state cleanly back to initial fixture.

        Does not modify external files or persistent databases.
        """
        self.transport = SimulatorSocketTransport()
        self._batch = self._create_initial_batch()
        return {
            "status": "reset_completed",
            "message": "State demo in-memory berhasil direset ke kondisi awal.",
            "batch": self._batch,
        }


# Global in-memory singleton for Safe Demo
safe_demo_service = SafeDemoService()
