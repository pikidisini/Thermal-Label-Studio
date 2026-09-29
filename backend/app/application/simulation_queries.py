"""Pure query use cases for simulation batch status and list views."""

from heapq import nlargest
from typing import Any, Callable, Dict, Iterable, List


def summarize_batch(record: Dict[str, Any]) -> Dict[str, Any]:
    """Return the public batch summary without exposing raw payload fields."""
    items = [
        {
            "item_id": item.get("item_id"),
            "item_sequence": item.get("item_sequence"),
            "template_version_id": item.get("template_version_id"),
            "copies": item.get("copies", 1),
            "status": item.get("status"),
            "missing_fields": list(item.get("missing_fields", [])),
            "warning_count": int(item.get("warning_count", 0)),
            "warnings": list(item.get("warnings", [])),
        }
        for item in record.get("items", [])
    ]
    summary: Dict[str, Any] = {
        "batch_id": record.get("batch_id"),
        "producer_namespace": record.get("producer_namespace"),
        "request_id": record.get("request_id"),
        "printer_id": record.get("printer_id"),
        "virtual_profile": record.get("virtual_profile"),
        "contract_type": record.get("contract_type", "canonical"),
        "status": record.get("status"),
        "total_items": record.get("total_items"),
        "completed_items": record.get("completed_items", 0),
        "items": items,
        "created_at": record.get("created_at"),
        "completed_at": record.get("completed_at"),
        "artifact": record.get("artifact"),
        "error": record.get("error"),
        "simulation_tolerant": bool(record.get("simulation_tolerant", False)),
        "warning_count": int(record.get("warning_count", 0)),
        "warnings": [warning for item in record.get("items", []) for warning in item.get("warnings", [])],
    }
    for key in ("label_code", "profile_version"):
        if key in record:
            summary[key] = record[key]
    return summary


def list_recent_batches(
    records: Iterable[Dict[str, Any]],
    limit: int = 50,
    summarize: Callable[[Dict[str, Any]], Dict[str, Any]] = summarize_batch,
) -> List[Dict[str, Any]]:
    """Return newest summaries using O(limit) selection memory."""
    if limit <= 0:
        return []
    recent = nlargest(limit, records, key=lambda record: str(record.get("created_at") or ""))
    return [summarize(record) for record in recent]
