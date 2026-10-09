# AI working rules

- Work from current source and the five active documents in `docs/`.
  The current local implementation is Studio editing/server PNG preview plus
  P8C versioned layout persistence in PostgreSQL/MinIO. Fixture mode remains
  available without persistence configuration or storage-driver imports.
  SAP intake, physical printer acceptance, current API authentication, job orchestration,
  migrations and production operations remain separate work.
  Studio has no login/session/role implementation. Retired auth and dependent
  prototype flows stay archived. Fixture entry loading is separate from Studio/
  diagnostics; retained graphics clients do not establish integration readiness.
  Phase task inventories/results are historical, dated evidence. `.archive/`
  is reference only. The local Jenkins/SonarQube quality gate is installed for
  curated source validation only; no deployment pipeline is claimed.
- The checkpoint includes local SVG import/export and JSON exploration, editing,
  versioned layouts, Preview, PNG Label Simulation and fixture simulation.
  Global graphics is planned; keep its prepared implementation unmounted.
  Studio IPL Print uses a validated per-action numeric TCP target
  edited in its dialog and remembered locally; server target is optional fallback.
  Opening/editing Print never connects; explicit Print encodes copies 1..999
  (default 1) through native IPL quantity and submits one payload once.
  Success permits another deliberate print; uncertain failures remain locked
  until the user checks the printer and reopens. No automatic retry exists. Real printer acceptance/feedback
  require separate named-target authorization.
  Unavailable global graphics and data/protocol export controls must
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
