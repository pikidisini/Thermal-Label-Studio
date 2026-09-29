# F3.8 / A04 — hasil increment

Status: PARTIAL / READY FOR REVIEW

`backend/app/application/simulation_queries.py` now owns the pure summary/list use case. It has no FastAPI or filesystem dependency and preserves the existing public summary fields while omitting raw payload fields. `SapShadowService` delegates sanitization and recent selection to it, preserving existing HTTP routes.

The slice uses bounded top-N selection for the application result and passes the service's memory/disk records lazily into it. Disk enumeration and reads remain O(n); this reduces result materialization and sorting memory but is not a bounded I/O scan. Durable repository/streaming enumeration, ingestion/render separation, and the remaining large service responsibilities are intentionally deferred.

Targeted pure use-case tests were added. Full backend regression and route tests remain reviewer gates.
