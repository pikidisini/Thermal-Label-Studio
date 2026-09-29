# F3.9 / A05 — hasil increment

Status: PARTIAL / READY FOR REVIEW

Canonical and raw simulation ingestion now copies the server-resolved SVG into `simulation_templates/sha256/<sha256>.svg`, records `template_content_sha256` and `template_snapshot_ref` on every accepted item, and renders only from the verified snapshot. A missing hash, missing file, or digest mismatch fails closed. Template IDs remain in the batch for compatibility.

Old stored batches without a pinned hash are explicitly rejected during processing with a reproducibility error; they are not silently treated as reproducible. Existing profile/rules approval registry, immutable approved revision lifecycle, and optimistic draft concurrency remain future A05 work.

Verification: added synthetic source-mutation and corrupted-snapshot tests; reviewer should run them with the repository's writable short basetemp. `py_compile` passed. No production database, SAP, printer, deployment, commit, or push was used.
