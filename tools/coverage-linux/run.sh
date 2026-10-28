#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f "${TLS_FIXTURE_FONT_PATH:-}" ]]; then
  echo "BLOCKED: TLS_FIXTURE_FONT_PATH must point to an installed Linux font" >&2
  exit 2
fi
if [[ ! -f "${TLS_RENDERER_PATH:-}" ]]; then
  echo "BLOCKED: TLS_RENDERER_PATH must point to a verified Linux renderer" >&2
  exit 2
fi

mkdir -p .tmp
python3 -m app.run > .tmp/linux-coverage-app.log 2>&1 &
app_pid=$!
trap 'kill "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true' EXIT

for attempt in {1..60}; do
  if curl --fail --silent http://127.0.0.1:8000/ready >/dev/null; then
    python3 scripts/check_coverage.py --timeout "${TLS_COVERAGE_TIMEOUT:-1800}"
    exit $?
  fi
  sleep 1
done

echo "BLOCKED: application did not become ready for browser coverage" >&2
exit 1
