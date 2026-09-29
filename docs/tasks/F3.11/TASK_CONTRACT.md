# F3.11 / A06 — shared SQLite auth lockout state

- Writer: Luna Low
- Reviewer/advisor: Codex reviewer
- Scope: replace process-local lockout state for `SqliteAuthRepository` with shared SQLite state.

Acceptance: two `AuthService` instances sharing one disposable SQLite DB observe the same five-failure/300-second lockout; concurrent updates use `BEGIN IMMEDIATE`; expiry clears state; key material is SHA-256 of normalized IP and username; database failures fail closed. Non-SQLite test doubles retain the existing in-memory fallback. Generic auth responses remain unchanged.
