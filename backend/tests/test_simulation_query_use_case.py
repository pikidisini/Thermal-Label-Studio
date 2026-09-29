from app.application.simulation_queries import list_recent_batches, summarize_batch


def test_summary_use_case_minimizes_raw_record():
    summary = summarize_batch({
        "batch_id": "b-1", "producer_namespace": "SAP", "request_id": "r-1",
        "created_at": "2026-09-24T02:00:00Z", "raw_snapshot": {"secret": "omit"},
        "items": [{"item_id": "i-1", "item_sequence": 1, "canonical_item_data": {"secret": "omit"}}],
    })
    assert summary["batch_id"] == "b-1"
    assert "raw_snapshot" not in summary
    assert "canonical_item_data" not in summary["items"][0]


def test_list_use_case_keeps_newest_limit_without_sorting_all_output():
    records = [
        {"batch_id": "old", "created_at": "2026-09-24T01:00:00Z"},
        {"batch_id": "new", "created_at": "2026-09-24T03:00:00Z"},
        {"batch_id": "mid", "created_at": "2026-09-24T02:00:00Z"},
    ]
    result = list_recent_batches(records, limit=2)
    assert [item["batch_id"] for item in result] == ["new", "mid"]


def test_list_use_case_summarizes_only_top_limit():
    calls = []
    records = [{"batch_id": str(i), "created_at": f"2026-09-24T{i:02d}:00:00Z"} for i in range(10)]
    result = list_recent_batches(records, limit=3, summarize=lambda record: calls.append(record["batch_id"]) or record)
    assert len(result) == 3
    assert len(calls) == 3
