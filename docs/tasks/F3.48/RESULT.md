# F3.48 Result — Frontend test environment diagnosis

## Diagnosis

`canvas@2.11.2` remains an optional Fabric dependency in `frontend/package-lock.json` and its native module is absent: `node_modules/canvas/build/Release/canvas.node` does not exist. The installed Node runtime is `v24.18.0` (ABI 137). The installed package's post-install script is `node-pre-gyp install --fallback-to-build --update-binary`.

No package, lockfile, application source, or runtime configuration was changed. The current frontend test loader no longer reaches the missing optional native binding: a full `npm test` run completed without a `canvas.node` module-load failure. The native binary remains absent, so a future test which imports Fabric's Node path directly would need a dependency restore under a supported Node LTS runtime.

If the native path is required later, the reproducible restore command is `npm ci --include=optional` under the repository's supported Node LTS version. This command may download or build native dependencies and was intentionally not run because the task forbids installs/network without a separate approved need.

## Validation

| Check | Status | Evidence |
| --- | --- | --- |
| Native-binding diagnosis | PASS | `canvas.node` is absent; package lock marks Canvas optional and Fabric optional-depends on it. |
| Full `npm test` environment | PASS | The runner started and completed all test workers without a Canvas native-module error. |
| Full `npm test` assertions | PASS | 138 passed, 0 failed. |
| TypeScript | PASS | `npx tsc --noEmit` completed with exit code 0. |
| Production build | PASS | Vite built 1,894 modules. Existing Fabric mixed dynamic/static import advisory is non-failing. |
| Diff check | PASS | `git diff --check` found no whitespace error; it printed existing CRLF notices only. |

## Scope confirmation

The stale test contract was repaired without changing application behavior: `test_auth_flow.mjs` now asserts the current English button copy, and `test_frontend.mjs` consumes `parseLocalSapJson` through the `features/data-tokens` public API. `features/data-tokens/index.ts` exports the already-existing parser and its types. No UI, backend, auth flow, Docker, printer, port, dependency, lockfile, commit, push, deployment, restart, or service change was made.
