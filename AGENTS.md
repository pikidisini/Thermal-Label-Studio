# AI working rules

- Work in this checkout, not the parent Git repository or archived web_app.
  Read README.md and the active contracts: docs/ARCHITECTURE.md, PRODUCT_FLOW.md,
  API_CONTRACT.md, DEVELOPMENT.md, DECISIONS.md and TEMPLATE_BINDING_CONTRACT.md.
  Consult SYMBOL_GENERATOR_NOTICES.md for dependencies and
  docs/implementation/universal-label-pipeline/STATUS.md for current acceptance.
  Implemented source includes Studio, PostgreSQL/MinIO templates, PostgreSQL
  sample datasets, canonical data, bounded text/symbol binding, shared
  preparation/raster/IPL output and opt-in intake policy/ledger/replay.
  Studio storage and intake ledger are separate lifecycle boundaries.
  Actual SAP ECC integration, physical printer acceptance, HTTPS LAN activation,
  broader job orchestration and production operations remain separate work.
  Local accounts, server sessions and Admin/Designer/Operator permissions are implemented
  in app/auth; see docs/AUTH_CONTRACT.md. Auth schema/bootstrap need explicit
  named-target provisioning; no startup DDL or localhost auth bypass. Retired auth and dependent
  prototype flows stay archived. Fixture entry loading is separate from Studio/
  diagnostics; retained graphics clients do not establish integration readiness.
  Phase task inventories/results are historical, dated evidence. `.archive/`
  is reference only. Server CI/CD is defined in tools/jenkins/server and Jenkinsfile;
  migrate preserved Jenkins/SonarQube state before cutover. The release marker
  stays absent until exact-commit source, quality and real isolated-storage gates
  pass. The legacy local source-quality job remains historical, not a deploy job.
  Controller has no build executor/socket; only trusted reviewed revisions may
  use the Docker-capable agent. Monitoring must not create auth sessions or write
  application data. SQL changes block automatic deployment; never restore data
  or resend printer work as an automatic image rollback.
- The checkpoint includes local SVG import/export and JSON exploration, editing,
  versioned layouts, Preview, PNG Label Simulation and fixture simulation.
  Graphics supports immutable PNG/JPEG/WebP assets and embedded-copy insertion.
  Provision its PostgreSQL table only with named-target authorization; startup
  must not apply Graphics DDL. Version updates/bulk replacement stay unmounted.
  Studio IPL Print uses a validated per-action numeric TCP target
  edited in its dialog and remembered locally; server target is optional fallback.
  Opening/editing Print never connects; explicit Print encodes copies 1..999
  (default 1) through native IPL quantity and submits one payload once.
  Success permits another deliberate print; uncertain failures remain locked
  until the user checks the printer and reopens. No automatic retry exists. Real printer acceptance/feedback
  require separate named-target authorization.
  Unavailable Graphic Update Center and data/protocol export controls must
  explain availability without sending unsupported requests. Python binds
  loopback by default; the container explicitly configures its internal bind,
  while Compose host ports must stay loopback-only.
- Preserve existing user changes. Keep edits within the authorized task and
  implement the smallest complete slice.
- Product UI supports English (default) and Bahasa Indonesia through shared
  dictionaries. Keep technical contracts and active documentation in English.
  Never translate SAP/JSON keys, barcode payloads or authored label content.
- Follow `SAP/API -> validate label_code -> resolve layout -> bind SVG -> raster
  bitmap -> simulation sink OR print transport`. Both outputs share the same
  processed bitmap and encoded payload; only the final sink differs.
- Keep feature ownership explicit: label_data owns canonical scalar spelling;
  template_binding owns metadata admission/binding; engine owns shared output;
  label_intake owns policy, identity, ledger and execution. Frontend features own
  consumed model/API/UI boundaries; avoid duplicate global utilities and wrappers.
- Template metadata is versioned and fail-closed. Keep missing/null/empty distinct
  from 0/false: output text uses `N/A` for absent keys and ` - ` for null/empty;
  unavailable barcode/QR sources produce plain centered ` N/A ` boxes, never
  encoded fallback payloads. Reject unsupported profiles. Do not execute authored code or
  auto-migrate stored dynamic templates. Preserve numeric/HMAC/replay semantics.
- Intake fails closed without explicit credentials, policy and durable ledger.
  Never invent transient HMAC keys, use an operational in-memory fallback, infer
  print permission or retry an uncertain send. Packaging schema is not activation.
  Local sample_roll simulation/replay is a scoped checkpoint. T06 browser
  acceptance is BLOCKED; T07/T10/T11 remain NEEDS_REPLAN per current status.
  Cooperative/driver timeouts are not hard cancellation/native memory guarantees.
  T12 physical acceptance is optional and requires its own execution scope.
- Do not add compatibility layers, restore archived service structure, or
  introduce speculative abstractions. Add an abstraction only for a current,
  demonstrated need.
- Validate external input on the server. Unknown label codes, missing layouts,
  invalid required data, and processing failures must fail closed.
- Obtain explicit authorization for the named target before SAP access, printer
  delivery, database/object-store operations, or container/deployment actions.
  A code change is not authorization for those external effects.
- Keep simulation free of printer effects. Use fakes and disposable fixtures
  for tests; protect operational Docker volumes and do not log secrets/raw data.
  Legacy backend/data was removed with explicit user authorization; do not
  recreate it as application storage or test output.
- Follow one application, one standard launch: root Dockerfile,
  docker-compose.yml (app/PostgreSQL/MinIO), requirements.txt and .env.example.
  Docker and local development use the same Python manifest; test tools are
  intentionally included. Fixture pages/tests do not define deployment modes.
  Root .env is the ignored local Compose input; never commit credentials.
  The app normally binds localhost:8002. External volume names preserve existing
  data. Do not provision, delete, migrate or attach operational volumes without
  authorization for the named target. Verify RESVG_SHA256 before an authorized
  build; archived split/phase/prototype files are not active launch paths.
- Use a unique child of project-root `.tmp/` for each temporary run and every
  generated test report/screenshot/trace. Test source stays in tests folders. Contents
  must be disposable; never store source/config/operational data there. Verify
  cleanup paths and remove only the intended child, never root `.tmp/` recursively.
- Browser tests use one frontend/playwright.config.js and the already running
  standard app. Keep ui mocks and real integration evidence separate. No server
  startup or legacy auth seeding belongs in Playwright. Storage-write tests need
  explicit named-target authorization and E2E_ALLOW_STORAGE_WRITES=true; they
  retain a unique synthetic layout. Archived specs are migration reference only.
- For authorized source editing, scripts/dev.py coordinates loopback Vite HMR
  and Uvicorn reload using the same manifests. It starts no containers and defaults
  to existing authorized Compose storage. --no-storage disables persistence explicitly.
  --persistence requires a named,
  authorized storage target because startup initializes schema/bucket.
  Default startup (also --compose-storage) resolves ignored root .env through Compose,
  requires existing storage services and a stopped Compose app, and maps only
  loopback storage ports. Do not print resolved secrets. Keep
  Docker as the final packaged-runtime validation; live reload is not image evidence.
  Windows development descendants belong to the launcher's kill-on-close job;
  preserve that lifecycle protection and separate console process groups. Existing
  orphan workers still need verified project ownership before cleanup. This is
  process lifetime protection, not acceptance of intake hard memory/deadline gates.
  Interactive Windows port recovery may stop a verified project server only after
  explicit y/yes confirmation and fresh PID/creation-time/command validation.
  --check and noninteractive input must never prompt or stop an existing process.
  Do not print command lines or stop unrelated/unidentified port owners.
- Use scripts/check_project.py for the local check plan; add
  --run-source-checks to execute backend/frontend tests, TypeScript and build.
  Use scripts/check_coverage.py for measured Python and unit/browser frontend
  coverage; pass its verified unique report directory to sonar_scan.ps1.
  Keep production sourcemaps disabled and reject stale coverage fingerprints.
  Add meaningful tests for new behavior and run checks relevant to the change.
  Report PASS, FAIL, BLOCKED, and NOT RUN precisely; never infer readiness from
  an unexecuted gate.
- SonarQube is a separate local quality stack under tools/sonarqube, with its
  own PostgreSQL database and named volumes; never attach it to application
  storage. Before changing code, use only findings from the current authorized
  snapshot. Do not add suppressions, broaden exclusions, weaken the quality
  gate, or classify findings as false positives merely to obtain PASS. Run the
  relevant source checks and scan again after a repair; report source-gate and
  quality-gate results separately. Sonar findings do not establish SAP,
  database, rendering, printer, or production readiness.
- Update the active contracts when implemented behavior changes. Do not edit
  archived history to make it appear current. No reset, clean, deletion, or
  overwriting existing work without explicit task authorization.

- Both Studio preview entry points must use the current editor-preview API; do
  not restore legacy render/inspection routes. Preserve immutable SVG artifacts
  after ambiguous storage commits; never delete a possibly committed version
  merely because its HTTP request failed. Test commit/upload failures with fakes.
- Thermal-Label-Studio is the clean source repository; Thermal-Label-Studio-legacy
  retains prior history. Preserve backend/schema and the prepared job foundation.
  Do not include archives, credentials, operational data or generated reports.
  Publishing changes requires user authorization.


Frontend visual controls use CSS custom properties in `frontend/src/index.css` as the single source for palette pairs, UI typography, compact/default sizes, spacing, borders, radius, shadows, backdrop and motion. Shared primitives expose semantic `tone`, `variant`, `selected` and disabled treatment; native feature controls use the same `data-ui-*` contract. Keep caller classes for layout and deliberate technical geometry. Use compact/stepper variants for narrow editor fields. Selected colors have paired foregrounds. Planned actions remain native-disabled and use the generic planned hover treatment. Focus-visible stays observable. Reduced motion applies only to marked controls, chrome animations and modal portals; authored SVG, Fabric objects and export pixels remain outside UI styling.

Label Print LAN delivery uses registered Management targets directly from the server
via /label-print/print. Do not reintroduce agent/token prerequisites for LAN.
Preserve artifact reuse, server target validation, one-attempt delivery, per-item
stop-on-failure outcomes and browser uncertainty locking. Physical tests still
require named-target/count authorization. Retained local_agent is standalone.

Label Print status is an explicit /label-print/printer-status IPL ENQ query to
a revalidated registered target, serialized with LAN Print. Never query on
selection/startup/Demo, send reset/configuration commands, infer physical print
completion from status, or replace ambiguous IPL states with a READY claim.

Asynchronous intake v2 is implemented under backend/app/intake_queue with two
Linux/cgroup-fenced worker containers and encrypted transient queue payloads.
Read docs/PRODUCTION_QUEUE.md before queue, cutover, recovery or deployment work.
API v1/v2 must share permanent identity; never reclaim ownership from a heartbeat
timeout, resend an uncertain item, or bypass physical-address printer ownership.
Production uses TLS_STORAGE_INITIALIZE=false and additive explicit provisioning.
All storage/SAP/container/printer gates still require their named-target scope.
