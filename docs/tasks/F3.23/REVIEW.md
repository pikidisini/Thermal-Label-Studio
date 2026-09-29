# F3.23 Advisor review

Status: **local migration complete; production hardening remains open**.

The writer implementation was reviewed against the actual source inventory and live MinIO behavior. Corrections made before cutover included rejecting a missing bucket as a storage failure, preserving the existing folder when Save omits `folder_id`, rejecting orphan artifact payloads, and treating duplicate template IDs globally. Focused tests passed after these corrections. The migration ran after a non-destructive backup, then repeated without additional writes; independent adapter reads matched all 11 source payloads.

Remaining review findings:

1. `MinioArtifactStorage.put` reads for an existing reference before writing the payload and manifest. Concurrent processes writing the same reference can race. Use conditional object creation or a shared coordination mechanism before relying on this as an immutable multi-worker artifact store.
2. The migration source inventory had no custom SVG templates. Live MinIO template CRUD was exercised with disposable data, but existing nested SVG source migration was not exercised. The migration script does not yet create `.folder` markers for folders found in an old SVG library, so add that behavior and a representative nested-template migration test before importing a populated server library.
3. MinIO app credentials are currently root credentials on loopback. Create a dedicated restricted identity and enable transport encryption before shared deployment. Confirm AGPL/source distribution and support obligations for the selected MinIO distribution.
4. Local app process restart is manual after host reboot; integrate MinIO configuration into the approved server service/deployment workflow.
