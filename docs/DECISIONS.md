# Decisions

These decisions describe the current source. Dated phase inventories/results and
archived documents retain history; they are not current launch instructions.

1. One application, one root Dockerfile, one Compose file and one Python manifest.
   The frontend retains its package manifest and lockfile.
2. Studio is a local editor with no login/session/CSRF implementation. Retired auth,
   operator simulation, print/export and old API adapters are archived. Future
   shared deployment requires new server authentication/authorization controls.
3. Both Studio preview entry points call the current editor-preview API. One PNG
   populates both Preview panels; display effects do not prove printer behavior.
4. PostgreSQL owns layout metadata, active versions and version history. MinIO owns
   immutable SVG. Versions/checksums/object keys are server-owned. A save publishes
   a new version; it is not an approval workflow or an idempotent request.
5. Database/object-store writes are not atomic together. Preserve artifacts after
   uncertain commit/upload results and allocate a fresh immutable key on retry
   under the per-label transaction lock, with bounded conflict probes. Gaps and
   unreferenced artifacts are allowed; automatic deletion after errors is unsafe.
6. Layout processing validates caller facts and server layout resolution. Current
   acceptance/fixture processing does not automatically consume saved Studio
   layouts. Actual SAP intake, approved layouts, jobs and live transport are future
   integration work.
7. Target flow: SAP/API -> validate label_code -> resolve layout -> bind SVG ->
   raster bitmap -> shared encoded payload -> simulation sink OR print transport.
   Both final sinks must consume the same processed output. Preview alone does
   not establish payload orchestration or physical printer delivery.
8. External inputs fail closed; secrets/raw business data stay out of logs/reports.
   Interfaces exist for consumed behavior only. Do not restore archived service
   structures or add speculative compatibility layers.
9. Storage drivers load only for configured persistence. Fixture source tests
   require no storage services. Operational data and existing volume identities
   are preserved; schema/bucket initialization is an authorized startup write.
10. /health is liveness and /ready checks packaged dependency presence. Neither
    certifies current storage connectivity, device compatibility or production.
11. The installed local Jenkins/SonarQube workflow checks a curated source snapshot
    and performs no checkout/deployment. Source gate, quality gate, live runtime
    acceptance and production approval remain separate.
12. Generated test reports, traces and screenshots use unique children of .tmp.
    Test source stays under backend/tests and frontend/tests. Temporary output is
    never source, configuration, operational data or a new-repository artifact.
13. Future repository transition from Thermal-Label-Studio-legacy to
    Thermal-Label-Studio follows a reviewed checkpoint. No remote/repository
    operation is implied by local repairs. Preserve separate parent/web_app Git
    boundaries until a transition is explicitly authorized.
14. Test local failure paths with fakes; seek named-target authorization before
    storage/SAP/printer/container operations. Migrations, backup/restore,
    reconciliation, access controls and production operations require their own
    implementation and evidence. No current source PASS upgrades those claims.

15. The checkpoint covers the local Studio/editor, SVG import/export, local JSON,
    versioned save/open, Preview, PNG Label Simulation and fixture simulation.
    Global graphics, shared access/auth, SAP, jobs, printers and production stay
    future work; planned UI controls must not invoke unavailable backend routes.
16. The direct Python runtime binds loopback by default. Docker explicitly sets
    its internal bridge listener; Compose host publishing stays localhost-only.
    Remaining quality/dependency findings are recorded in SONARQUBE.md and are
    not waived by source tests or by a planned fresh repository.
