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
   layouts. Actual SAP intake, approved layouts, jobs are future integration
   work. Studio Print separately chooses a per-action TCP target.
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


The successful PM45 G/u/U sample supersedes Direct Graphics for the retained IPL
encoder. Simulation now decodes its exact payload, including tiled graphics at
most799dots per side, rather than returning the source raster PNG. Graphics 64..99
and format 90 are a bounded reserved namespace requiring deployment allocation.
Direction0 is the supported logical canvas subset; full physical placement and
tiled printing remain unverified. Printer feedback and full-media physical acceptance remain deferred.


Shared output preparation chooses language at the simulation/print action, with
IPL as the only implemented choice. Layout owns physical dimensions and DPI.
Prepared output is immutable and both sinks consume the exact encoded payload;
print submission does not reencode or rasterize and adds no printer profile
compatibility gate. Studio TCP RAW transport is implemented; real target setup
and physical acceptance remain separately authorized actions.


Studio Print permits one explicit submission to a validated per-action
numeric IPv4/IPv6 target. The dialog owns editable IP/port and remembers the last
valid target in browser-local storage; the environment target is optional fallback
for clients omitting an action target. Browser choices never mutate server-global
configuration. Default loading cannot gate manual entry or overwrite later edits.
Copies is an action parameter (default 1, strict integer 1..999). The shared pipeline
encodes native IPL `<RS>N` with `<US>1`; it does not loop the raster, encoder or
transport. Simulation renders one logical canvas for quantity N. Success unlocks
a deliberate subsequent Print; deterministic pre-send errors also unlock. Uncertain
failures retain the inspection/reopen lock. TCP connect/write remain bounded;
exact bytes are sent once and socket closes on
every path. No retry or printer feedback is added. Invalid target fails before
rasterization/transport construction. Known pre-send preparation failure and
unknown/uncertain delivery remain distinct; HTTP 500 alone cannot prove no send.
Opening/editing target does not contact a printer. Source/fake validation does
not establish physical acceptance.


## T02 admission refinements

Canonical mode/copies are strict semantic JSON values: 1.0/1e0 copies equal1, typed models normalize copies to int. Backend/frontend object budgets use common conservative reservation instead of float JSON spelling; raw limit remains2MiB. Historical missing-mode copies1000 is retained read-only and requires explicit correction. No compatibility intake aliases or automatic output were added.
