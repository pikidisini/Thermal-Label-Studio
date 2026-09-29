import asyncio
import hashlib
from pathlib import Path

from app.services.sap_shadow_service import SapShadowService
from app.services.sap_shadow_service import SapShadowBatchRequest, SapShadowItemInput


def test_template_pin_is_immutable_after_source_mutation(tmp_path: Path, monkeypatch):
    source = tmp_path / "source.svg"
    source.write_bytes(b"<svg>A</svg>")
    monkeypatch.setattr("app.services.sap_shadow_service.TemplateService.get_template_path", lambda _id: source)
    service = SapShadowService(storage_base_dir=tmp_path / "store")
    pin = service._pin_template("demo")
    source.write_bytes(b"<svg>B</svg>")
    snapshot = service._template_snapshot_dir / f"{pin['template_content_sha256']}.svg"
    assert snapshot.read_bytes() == b"<svg>A</svg>"
    assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == pin["template_content_sha256"]


def test_canonical_ingest_pins_source_and_restart_reads_same_snapshot(tmp_path: Path, monkeypatch):
    source = tmp_path / "source.svg"
    source.write_bytes(b'<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="80mm" viewBox="0 0 200 80"><text x="2" y="20">{{brand}}</text><text x="2" y="40">A</text></svg>')
    monkeypatch.setattr("app.services.sap_shadow_service.TemplateService.get_template_path", lambda _id: source)
    service = SapShadowService(storage_base_dir=tmp_path / "store")
    request = SapShadowBatchRequest(
        producer_namespace="TEST",
        request_id="PIN-1",
        printer_id="VIRTUAL-THERMAL-01",
        items=[SapShadowItemInput(
            item_sequence=1,
            template_version_id="demo",
            canonical_item_data={"brand": "A", "type_film": "FILM", "base_film": "PET", "width_mm": 80, "length_m": 200},
            copies=1,
        )],
    )
    accepted = asyncio.run(service.ingest_batch(request, auto_process=False))
    item = service.get_batch(accepted["batch_id"])["items"][0]
    source.write_bytes(b'<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="80mm" viewBox="0 0 200 80"><text x="2" y="20">{{brand}}</text><text x="2" y="40">B</text></svg>')
    restarted = SapShadowService(storage_base_dir=tmp_path / "store")
    recovered = restarted.get_batch(accepted["batch_id"])
    assert recovered["items"][0]["template_content_sha256"] == item["template_content_sha256"]
    snapshot = restarted._template_snapshot_dir / f'{item["template_content_sha256"]}.svg'
    assert b">A</text>" in snapshot.read_bytes()
    captured = []
    original_inject = __import__("app.services.sap_shadow_service", fromlist=["inject_data"]).inject_data
    def capture(svg, *args, **kwargs):
        captured.append(svg)
        return original_inject(svg, *args, **kwargs)
    monkeypatch.setattr("app.services.sap_shadow_service.inject_data", capture)
    asyncio.run(restarted.process_batch(accepted["batch_id"]))
    assert restarted.get_batch(accepted["batch_id"])["status"] == "completed"
    assert captured and ">A</text>" in captured[0] and ">B</text>" not in captured[0]


def test_corrupt_template_snapshot_fails_closed(tmp_path: Path, caplog):
    service = SapShadowService(storage_base_dir=tmp_path / "store")
    digest = "a" * 64
    snapshot = service._template_snapshot_dir / f"{digest}.svg"
    snapshot.write_bytes(b"corrupt")
    record = {
        "batch_id": "batch", "status": "accepted", "artifact": None,
        "virtual_profile": {"dpi": 203.2, "width_mm": 200.0, "height_mm": 80.0},
        "items": [{
            "template_version_id": "demo", "template_content_sha256": digest,
            "canonical_item_data": {}, "status": "accepted", "simulation_tolerant": True,
        }],
    }
    service._batches["batch"] = record
    asyncio.run(service.process_batch("batch"))
    failed = service.get_batch("batch")
    assert failed["status"] == "failed"
    assert failed["artifact"] is None
    assert failed["error"] == "Simulasi batch SAP mengalami kegagalan teknis saat render evidence."
    assert "failed integrity validation" in caplog.text
