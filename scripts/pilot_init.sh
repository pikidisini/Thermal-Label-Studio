#!/usr/bin/env bash
# ==============================================================================
# Thermal Label Studio — Pilot Initialization Script (scripts/pilot_init.sh)
# ==============================================================================
# Enforces ADR-024 (Zero Auto-Migration during container boot).
# Explicitly applies the database baseline schema and seeds Pilot Line 1 printer.
#
# Usage:
#   ./scripts/pilot_init.sh [compose-file]
# Example:
#   ./scripts/pilot_init.sh docker-compose.pilot.yml
# ==============================================================================

set -euo pipefail

COMPOSE_FILE="${1:-docker-compose.pilot.yml}"

echo "================================================================"
echo " Thermal Label Studio — Pilot Initialization"
echo " Compose File: ${COMPOSE_FILE}"
echo "================================================================"

# 1. Check docker compose command availability
if command -v docker &>/dev/null && docker compose version &>/dev/null; then
    COMPOSE_CMD="docker compose -f ${COMPOSE_FILE}"
else
    echo "ERROR: 'docker compose' is required but not found in PATH." >&2
    exit 1
fi

# 2. Check if .env file exists, otherwise warn
if [ ! -f .env ]; then
    echo "WARNING: '.env' file not found in current directory."
    if [ -f .env.pilot.example ]; then
        echo "Copying '.env.pilot.example' to '.env'..."
        cp .env.pilot.example .env
    fi
fi

# 3. Ensure database service is up and healthy
echo "[Step 1/4] Ensuring PostgreSQL database service is healthy..."
${COMPOSE_CMD} up -d db

echo "Waiting for database healthcheck..."
max_wait=30
count=0
until [ "$(${COMPOSE_CMD} ps -q db | xargs -r docker inspect -f '{{.State.Health.Status}}' 2>/dev/null)" = "healthy" ]; do
    sleep 2
    count=$((count + 2))
    if [ $count -ge $max_wait ]; then
        echo "ERROR: PostgreSQL database did not become healthy within ${max_wait} seconds." >&2
        exit 1
    fi
done
echo "PostgreSQL database is ready and healthy."

# 4. Explicitly apply database baseline migrations (ADR-024)
echo "[Step 2/4] Applying PostgreSQL baseline schema (ADR-024)..."
${COMPOSE_CMD} run --rm app python -m backend.app.print_jobs.migrations apply

# 5. Verify database migration status
echo "[Step 3/4] Verifying database baseline installation..."
${COMPOSE_CMD} run --rm app python -m backend.app.print_jobs.migrations verify

# 6. Seed Pilot Line 1 printer and media profiles
echo "[Step 4/4] Seeding Pilot Line 1 printer and media profiles..."
${COMPOSE_CMD} run --rm app python -m backend.app.print_jobs.seed_pilot

echo "================================================================"
echo " Pilot initialization completed successfully!"
echo " You can now start the application and dispatcher services:"
echo "   ${COMPOSE_CMD} up -d app dispatcher"
echo "================================================================"
