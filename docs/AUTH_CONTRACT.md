# Local accounts and browser access

Source implementation: 2026-10-21. Database activation, HTTPS LAN acceptance,
SAP execution and physical printing are separate gates. Browser login is
mandatory for interactive APIs; unconfigured/unavailable authentication fails
closed with 503. No runtime in-memory fallback or implicit account exists.

## Roles and API admission

| Capability | Admin | Designer | Operator |
| --- | --- | --- | --- |
| Own login/logout/password | Yes | Yes | Yes |
| Accounts, printer/integration/access-key settings, audit/activity history | Yes | No | No |
| Studio, templates, Graphics, editable Test Data, editor output | Yes | Yes | No |
| Label Print catalog, configured SAP preview, dataset preview, print/status | Yes | Yes | Yes |

`backend/app/auth/middleware.py` declares explicit route/method policies. Unknown
interactive APIs are denied. Authentication and permission checks precede body
processing and effects. Missing/expired sessions return 401, denied roles/CSRF/
origins return 403, and unavailable auth storage/configuration returns 503.
Temporary-password accounts can only inspect their session, change password,
logout and report deliberate activity. Anonymous users can obtain a bounded
pre-login session; login requires its CSRF token.

`POST /api/v1/label-intake` retains independent bearer/policy admission and never
accepts a browser session as machine authentication. Its bearer grants no browser
administration access. Public HTML/assets and `/health`/`/ready` contain no
authenticated application data; readiness remains dependency presence, not a
database/authentication/deployment acceptance test.

Designer `GET /management/snapshot` returns only writable state, policy origin
and revision for Studio template identity updates. Template mutation responses
also return only the resulting policy revision for Designer. It omits integrations,
credentials, printers and policy grants. Operator reads only dataset summaries,
`GET /label-print/printers` and `GET /label-print/operations`; full dataset
payloads and Management configuration remain restricted. Preview artifacts carry
an account owner; cross-account IDs fail before printer transport.

## Browser and account APIs

All paths below are relative to `/api/v1`. Responses are `Cache-Control: no-store`.

| Method/path | Input / behavior |
| --- | --- |
| `GET /auth/session` | Return `{user, csrf_token, expires_at, idle_expires_at}`; create a 15-minute anonymous session when necessary. No idle extension. |
| `POST /auth/login` | `{username,password}`; rotate session on success. |
| `POST /auth/logout` | Revoke current session and expire cookie. |
| `POST /auth/change-password` | `{current_password,password}`; revoke all previous sessions and issue a new session. |
| `POST /auth/activity` | Extend idle deadline after deliberate UI/tool activity, never absolute expiry. |
| `GET /management/users` | Admin-only public account fields. |
| `POST /management/users` | `{username,display_name,role,password}`; password is temporary. |
| `PATCH /management/users/{id}` | `{display_name,role,active}`; stable account ID/username. |
| `POST /management/users/{id}/reset-password` | `{password}`; revoke sessions and require password change. |

Public accounts contain `id`, `username`, `display_name`, `role`, `active` and
`must_change_password`; hashes never leave the server. Username is 1–64 ASCII
letters/digits/dot/underscore/hyphen, unique case-insensitively. Display name is
nonblank and at most 128 characters. Passwords are 7–128 characters (minimum revised by explicit user request on 2026-10-21), allow spaces
and Unicode, and are never trimmed or silently truncated. Changing a password
requires a value different from the current (including temporary) password. Argon2id uses 19 MiB,
two iterations and one parallel lane. No self-registration, permanent deletion,
Remember me, SSO, MFA or email recovery is implemented.

Sessions use 256-bit random cookie values; only their SHA-256 digests are stored.
CSRF tokens are separate session-bound values returned to the client, kept only
in memory and sent as `X-CSRF-Token`. Mutating requests require an exact trusted
Origin, including login. The cookie is host-only, `HttpOnly`, `SameSite=Lax`,
`Path=/` and `Secure` on HTTPS. Only explicit loopback HTTP development omits
Secure. Server deadlines are 30 minutes idle and 12 hours absolute. Background
catalog/session reads do not renew idle time. Login failure messages are generic;
five failures per normalized username lock attempts for 15 minutes, with a
separate 30-failure/IP window. Expired session/limit entries are cleaned during
session creation/login. Capacity is 1,000 accounts and 10,000 concurrent sessions.

PostgreSQL transactions serialize auth changes with a dedicated advisory lock,
including concurrent last-active-Admin protection. Role/status changes and
password resets revoke all sessions. Account/security events store action,
timestamp and stable actor/target IDs, never submitted credentials. Configuration
audit and operational activity gain real account IDs; historical unauthenticated
entries remain unchanged. Activity history remains best-effort, independently
enabled, and never controls print retries.

The UI fetch wrapper attaches CSRF to same-origin interactive calls only. A 401
returns the user to login without retrying a request. Logout/account replacement
reloads the document to clear in-memory data; cross-tab notification and bfcache
restore revalidation prevent showing another account's current state. Editor
drafts use stable account IDs. Studio and Label Print uncertainty locks survive
login/logout in the same tab; explicit operator checks are required to clear
uncertainty. They remain browser locks, not durable global job orchestration.

## Explicit activation and recovery

Use the already authorized Studio database DSN through `TLS_DATABASE_URL`.
Do not put passwords/DSNs in command history. All commands below default to plan
only unless `--apply` and exact target confirmation are supplied. Back up the
named database before approved provisioning; no backup is performed implicitly.

```powershell
python -B scripts/provision_auth.py
python -B scripts/provision_auth.py --apply --confirm-host <host> --confirm-database <database>
python -B scripts/provision_auth.py --action bootstrap --username <admin> --display-name <name> --apply --confirm-host <host> --confirm-database <database>
```

Schema `backend/schema/008_auth.sql` creates `studio_auth.accounts`, `sessions`,
`login_limits` and append-only `security_events`. Repeated schema provisioning
preserves existing rows; bootstrap refuses a nonempty account store. Startup
never applies auth DDL. For separate provisioning/runtime database roles, grant
runtime USAGE on `studio_auth`, SELECT/INSERT/UPDATE/DELETE on accounts/sessions/
login_limits, INSERT on security_events and USAGE on its identity sequence.
Bootstrap/recovery require the same target confirmation and interactive password
entry. Recovery accepts only an existing Admin and audits `OFFLINE_RECOVERY`:

```powershell
python -B scripts/provision_auth.py --action recover --username <existing-admin> --apply --confirm-host <host> --confirm-database <database>
```

Set `TLS_AUTH_ORIGINS` to exact comma-separated browser/backend origins without
trailing slash. HTTPS is the default and required for cloud/production deployment.
The optional self-hosted LAN profile may set `TLS_AUTH_TRUSTED_LAN_HTTP=true` only
when every HTTP origin is an exact private numeric IP origin in
`TLS_AUTH_ORIGINS`; public addresses, DNS names, wildcards and unlisted hosts are
rejected. This mode preserves account, role, CSRF and session controls, but its
browser-to-server transport is not encrypted. The reverse proxy must preserve the
public Host, terminate TLS, and replace forwarded protocol/address headers.
`TLS_TRUSTED_PROXY_IPS` admits only explicit numeric peer addresses; empty means
forwarded headers are ignored. No wildcard trust exists. Keep the backend/Compose
port private and loopback-bound; configure the chosen proxy separately after
named-target authorization. No proxy vendor/hostname/certificate is selected.

Local HTTP development requires `TLS_AUTH_LOCAL_HTTP=true`, loopback origins and
a loopback client. Include the browser origin and, if Vite rewrites Host, its
backend origin (for example `http://127.0.0.1:5173,http://127.0.0.1:8000`). The dev
launcher carries explicit auth settings from Compose; it does not enable them.
`--no-storage` does not bypass login; browser mocks remain isolated source proof.
A host-loopback connection through Docker NAT may have a non-loopback container
peer; the HTTP development flag does not authorize that peer. Use the direct
loopback dev launcher for HTTP, or the explicitly trusted HTTPS proxy for the
packaged runtime. No implicit bridge bypass is provided.

## Design MCP

Run `tools/mcp/design_auth.py --url <explicit-origin>` interactively using the
tooling Python environment before starting the STDIO server. The account must be
an active Admin/Designer with its temporary password already changed. The helper
never saves a password. Its default session file is ignored `.auth/design-session`;
Windows uses current-user DPAPI, POSIX uses exclusive owner-only creation (0600).
Use `--session-file` for a new file when renewing, then set
`TLS_MCP_DESIGN_SESSION_FILE` to that file. Origin mismatch fails closed.
The server recovers that expiring session, reads its current CSRF value, and
reports deliberate tool activity without reauthenticating or retrying requests.
Expired/revoked sessions require a new explicit login. There is no loopback
authentication bypass. HTTPS targets and numeric-loopback HTTP targets are
supported; HTTP remains limited by the server's explicit development setting.

## Verification checkpoint — 2026-10-21

The complete source gate passed using
`python -B scripts/check_project.py --run-source-checks --timeout-seconds 1200`.
Backend regression, full frontend TypeScript, fresh frontend build and frontend
regression all returned exit code 0. The runner preserves its 600-second default,
records explicit budgets and keeps failures/timeouts as FAIL/BLOCKED. Earlier
600-second timeout reports remain historical and are not promoted to PASS.

| Gate | Evidence / status |
| --- | --- |
| Auth, Management and runner targeted regression | PASS, 74 tests with transactional fake storage |
| Complete source gate | PASS, all four checks; deployment_ready remains false |
| Browser UI mocks, installed Chrome | PASS across 51 selected scenarios: 50 passed in the main run; all 5 log scenarios passed on rerun after waiting for drawer exit animations |
| Design MCP MockTransport/STDIO | PASS, 13 tests; synthetic DPAPI roundtrip also passed on Windows |
| Named database DDL/bootstrap and real persistence | NOT RUN |
| Packaged container and HTTPS LAN sessions/proxy | NOT RUN |
| SAP target and physical printer | NOT RUN |
| SonarQube quality gate | NOT RUN |

This checkpoint implements source behavior. It does not activate an account,
provision storage, select a host/certificate/proxy, authorize external targets or
establish production readiness. Existing local Management/log work is retained.

## Account controls in application headers

Authenticated pages place the account display name, role, Change password and
Logout in the same header as the Thermal Label Studio brand. AuthGate owns the
shared action state and logout errors. The separate account strip is removed.
All application headers expose View -> Preference using the existing settings
dialog; Studio retains its full editor menus. Narrow headers wrap within the
viewport. Login and required password changes retain their dedicated forms.
