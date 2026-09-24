#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:?image tag required}"
LIVE="tls-local-sim"
CANDIDATE="tls-local-sim-candidate"
DATA_VOLUME="tls-local-sim-data"

# PILOT_OPERATOR_SECRET is retained for legacy compatibility; unified app login CLI bootstrap is primary.
if [[ -z "${PILOT_OPERATOR_SECRET:-}" ]]; then
  echo "INFO: PILOT_OPERATOR_SECRET not set; using unified application account bootstrap."
fi
if docker container inspect "$CANDIDATE" >/dev/null 2>&1; then
  echo "A candidate container already exists; inspect it before continuing."
  exit 1
fi

run_app() {
  local name="$1"
  local image="$2"
  shift 2
  local env_args=(
    --env LOCAL_SIMULATION_ONLY=true
    --env SAFE_DEMO_MODE=false
    --env SAP_SHADOW_SIMULATION_ENABLED=true
    --env PILOT_OPERATOR_ENABLED=true
  )
  if [[ -n "${PILOT_OPERATOR_SECRET:-}" ]]; then
    env_args+=(--env PILOT_OPERATOR_SECRET)
  fi
  docker run --detach --name "$name" "$@" \
    "${env_args[@]}" \
    "$image" >/dev/null
}

check_health() {
  local name="$1"
  local attempt
  for attempt in $(seq 1 30); do
    if docker exec "$name" python -c \
      "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).read()" \
      >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

check_simulation_safety() {
  local name="$1"
  docker exec "$name" python -c '
import json
import urllib.error
import urllib.request

base = "http://127.0.0.1:8000"
status = json.load(urllib.request.urlopen(base + "/api/status", timeout=3))
assert status["safe_demo_mode"] is False
assert status["sap_shadow_simulation_enabled"] is True

# Physical dispatch must be fail-closed (404)
for path in ("/api/v1/print/tcp", "/api/v1/sap/print"):
    request = urllib.request.Request(base + path, data=b"{}", method="POST")
    try:
        urllib.request.urlopen(request, timeout=3)
    except urllib.error.HTTPError as error:
        assert error.code == 404, (path, error.code)
    else:
        raise AssertionError("Physical dispatch route unexpectedly open: " + path)

# Unauthenticated browser sensitive endpoints must fail-closed (401)
req_me = urllib.request.Request(base + "/api/v1/auth/me", method="GET")
try:
    urllib.request.urlopen(req_me, timeout=3)
    raise AssertionError("Unauthenticated access to /api/v1/auth/me unexpectedly allowed")
except urllib.error.HTTPError as error:
    assert error.code == 401, ("Auth guard failed", error.code)
' >/dev/null

  # Verify user_admin CLI is packaged and executable
  docker exec "$name" python -m app.cli.user_admin --help >/dev/null
}

cleanup_candidate() {
  if docker container inspect "$CANDIDATE" >/dev/null 2>&1; then
    docker rm --force "$CANDIDATE" >/dev/null
  fi
}
trap cleanup_candidate EXIT

# Verify startup without publishing a port and without sharing the live data volume.
run_app "$CANDIDATE" "$IMAGE"
check_health "$CANDIDATE" || { echo "Candidate health check failed; live app unchanged."; exit 1; }
check_simulation_safety "$CANDIDATE" || { echo "Candidate safety check failed; live app unchanged."; exit 1; }
cleanup_candidate

OLD_IMAGE=""
if docker container inspect "$LIVE" >/dev/null 2>&1; then
  OLD_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$LIVE")"
  docker image tag "$OLD_IMAGE" tls-local-sim:previous
  docker rm --force "$LIVE" >/dev/null
fi

run_live() {
  run_app "$LIVE" "$1" \
    --restart unless-stopped \
    --publish 127.0.0.1:8000:8000 \
    --volume "$DATA_VOLUME:/app/backend/data"
}

if ! run_live "$IMAGE" || ! check_health "$LIVE" || ! check_simulation_safety "$LIVE"; then
  echo "New deployment failed. Restoring previous image if available."
  if docker container inspect "$LIVE" >/dev/null 2>&1; then
    docker rm --force "$LIVE" >/dev/null
  fi
  if [[ -n "$OLD_IMAGE" ]]; then
    run_live "$OLD_IMAGE"
    check_health "$LIVE" || echo "WARNING: previous image did not recover health."
  fi
  exit 1
fi

docker image tag "$IMAGE" tls-local-sim:deployed
echo "Local simulation deployed from $IMAGE on 127.0.0.1:8000."
