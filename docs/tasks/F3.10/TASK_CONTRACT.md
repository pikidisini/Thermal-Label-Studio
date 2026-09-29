# F3.10 / A11 — reproducible build controls

- Writer: Luna Low
- Reviewer/advisor: Codex reviewer
- Scope: deterministic frontend dependency installation in the Docker build and truthful project-status snapshot.

Use the committed npm lockfile through `npm ci`. Do not invent resvg checksums, image digests, or Python lock constraints. Record unresolved artifact checksum verification as a blocker when no trusted value is available in the repository.
