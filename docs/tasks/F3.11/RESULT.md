# F3.11 / A06 — hasil increment

Status: PARTIAL / READY FOR REVIEW

`SqliteAuthRepository` now owns an `auth_login_lockouts` table and atomic failure updates. `AuthService` uses this shared state when the repository is SQLite, hashes the normalized IP/username key before storage, and retains the in-memory path for non-SQLite test doubles. Lockout read/update errors fail closed. The existing five failures and 300-second window remain unchanged.

Targeted two-instance, concurrency, and expiry tests are required from the reviewer. The global test fixture may isolate auth databases per test; production/shared-worker behavior requires all instances to point at the same SQLite path. PostgreSQL/shared-host limiter migration remains future A06 work.
