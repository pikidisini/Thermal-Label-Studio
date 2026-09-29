# F3.10 / A11 — hasil increment

Status: PARTIAL / READY FOR REVIEW

Docker frontend build now uses an explicit `frontend/package-lock.json` COPY followed by `npm ci`, which requires and honors the committed lockfile. The active `docs/PROJECT_STATUS.md` snapshot was corrected to identify the current architecture-hardening branch and the uncommitted A01-A05/A07/A09/A11 work (with A06/A08/A10 pending), while treating F3.3 login as baseline rather than new uncommitted work.

The resvg download remains pinned to the existing version URL, but no trusted SHA-256 checksum is present in this repository and no network lookup was authorized or required. Checksum verification is therefore **BLOCKED / NOT IMPLEMENTED**, rather than using an invented value. Python requirements remain range-based; this Python 3.14 environment is not a verified source for a Python 3.11 Docker lock, so freezing them is deferred.

Verification: Dockerfile syntax/static inspection and `git diff --check` are reviewer gates. No image build, download, deployment, or production integration was run by this increment.
