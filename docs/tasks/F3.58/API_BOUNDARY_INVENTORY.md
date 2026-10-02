# F3.58 Shared API and Transport Boundary Inventory

## Transport ownership

| Path / concern | Owner | Active consumers / reason | Decision |
| --- | --- | --- | --- |
| `shared/api/apiBase.ts` | Shared transport configuration | Auth, Simulation, Graphics, Print UI, Templates/Render/Print/SAP transport | Retain as the sole `API_BASE` source. |
| `features/auth/api/csrfHeaders.ts` | Auth feature | Stateful CSRF header read and token refresh require the Auth Zustand store and `authApi` | Add and expose from Auth public barrel. |
| `utils/api/{templatesApi,renderApi,printApi,sapApi}.ts` | Shared endpoint modules | `apiClient` facade, editor shell, templates/simulation/print flows, tests | Retain paths for now; endpoints span feature boundaries and transport/hardware safeguards. |
| `utils/apiClient.ts` | Application-level cross-domain facade | Templates, Simulation, Print UI, test contracts | Retain. It aggregates endpoint modules; it is not a feature-specific API. |
| `features/auth/api/authApi.ts` | Auth feature | Auth store and Auth CSRF helper | Retain; its public barrel exposes `authApi`. |
| `features/simulation/api/{safeDemoApi,sapShadowSimulationApi}.ts` | Simulation feature | Simulation UI and integration tests | Retain through Simulation public barrel. |
| `features/graphics/api/graphicsApi.ts` | Graphics feature | Graphics UI / bulk-update UI | Retain through Graphics public barrel. |
| `utils/api/apiConfig.ts` | Legacy compatibility adapter | Zero after migration | Delete. Fallback template constants move unchanged beside `templatesApi`, their only owner. |
| `utils/api/csrfHelper.ts` | Legacy compatibility adapter | Zero after migration | Delete. Same implementation resides in Auth feature. |

## Boundary rationale

`API_BASE` is a pure shared transport primitive and therefore belongs in `shared/api`. CSRF header acquisition is not a generic shared primitive: it reads authenticated state and may request a new CSRF token, so it belongs with the Auth feature. Endpoint modules for rendering, print, templates, and SAP remain where they are because they are cross-domain contracts or hardware-sensitive boundaries. Renaming them without changing their owner or consumers would create churn without reducing coupling.

`apiClient` remains an explicit application-level facade. It aggregates Templates, Render, Print, Safe Demo, and SAP calls for orchestration callers and existing transport tests. It does not conceal a feature-specific implementation and is intentionally retained for a later, separately bounded caller migration.

## Preservation evidence

No endpoint URL, `fetch` method, `credentials`, body, header merge order, error branch, fallback contract, or fail-closed predicate was edited. The two deleted files were re-exports/configuration adapters only after all callers moved to the established shared/Auth boundaries.
