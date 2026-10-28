#!/bin/sh
# One reviewed administrator bootstrap. No operational data is removed.
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run this bootstrap with sudo' >&2; exit 1; }
stage=/opt/thermal-label-studio/ci-bootstrap
test -f "$stage/source/tools/jenkins/server/compose.yml"
test -f "$stage/private/ci.env"
test -f "$stage/private/migration.key"
install -d -m 0755 /opt/thermal-label-ci /opt/thermal-label-ci/bin
install -d -m 0700 -o abap -g abap /etc/thermal-label-ci /etc/thermal-label-ci/agents /var/backups/thermal-label-ci /var/lib/thermal-label-ci
install -d -m 0750 -o abap -g abap /var/lib/thermal-label-ci/monitor
install -d -m 0755 -o abap -g abap /opt/thermal-label-ci/work/build /opt/thermal-label-ci/work/monitor
install -d -m 0755 -o abap -g abap /opt/thermal-label-ci/work/build/home /opt/thermal-label-ci/work/monitor/home
if [ ! -e /opt/thermal-label-ci/source ]; then ln -s "$stage/source" /opt/thermal-label-ci/source; fi
install -m 0600 -o abap -g abap "$stage/private/ci.env" /etc/thermal-label-ci/ci.env
install -d -m 0700 -o abap -g abap /etc/thermal-label-ci/recovery
install -m 0600 -o abap -g abap "$stage/private/migration.key" /etc/thermal-label-ci/recovery/migration.key
install -m 0755 -o root -g root "$stage/source/scripts/ci_host.py" /opt/thermal-label-ci/bin/ci_host.py
# Preserve inactive historical HMAC/encryption material with future app backups.
install -d -m 0700 -o abap -g abap /etc/thermal-label-studio/recovery/material
legacy="$(python3 -c 'import json; from pathlib import Path; p=Path("/opt/thermal-label-studio/releases/aa5838ce8387/extract-result.json"); print(Path(json.loads(p.read_text())["extracted"]).name)')"
case "$legacy" in restore_*) ;; *) echo 'Unexpected legacy recovery directory' >&2; exit 1;; esac
for original in /var/backups/thermal-label-studio/"$legacy"/configuration/*; do
    test -f "$original"
    install -m 0600 -o abap -g abap "$original" /etc/thermal-label-studio/recovery/material/"$(basename "$original")"
done
cat > /etc/systemd/system/thermal-label-ci.service <<'EOF'
[Unit]
Description=Thermal Label Jenkins and SonarQube
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target
[Service]
Type=oneshot
RemainAfterExit=yes
Restart=on-failure
RestartSec=30s
WorkingDirectory=/opt/thermal-label-ci/source
ExecStartPre=/usr/bin/test -f /var/lib/thermal-label-ci/migration-ready
ExecStart=/usr/bin/docker compose --env-file /etc/thermal-label-ci/ci.env -f tools/jenkins/server/compose.yml up -d --no-build
ExecStop=/usr/bin/docker compose --env-file /etc/thermal-label-ci/ci.env -f tools/jenkins/server/compose.yml stop
TimeoutStartSec=300
TimeoutStopSec=180
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/thermal-label-ci.path <<'EOF'
[Unit]
Description=Start CI only after verified migration
[Path]
PathExists=/var/lib/thermal-label-ci/migration-ready
Unit=thermal-label-ci.service
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/thermal-label-monitor.service <<'EOF'
[Unit]
Description=Read-only Thermal Label runtime monitoring
After=docker.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/thermal-label-ci/bin/ci_host.py monitor
TimeoutStartSec=45
StandardOutput=null
EOF
cat > /etc/systemd/system/thermal-label-monitor.timer <<'EOF'
[Unit]
Description=Check Thermal Label runtime each minute
[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
AccuracySec=5s
[Install]
WantedBy=timers.target
EOF
systemd-analyze verify /etc/systemd/system/thermal-label-ci.service /etc/systemd/system/thermal-label-ci.path /etc/systemd/system/thermal-label-monitor.service /etc/systemd/system/thermal-label-monitor.timer
systemctl daemon-reload
systemctl reset-failed thermal-label-ci.service thermal-label-ci.path || true
systemctl enable --now thermal-label-monitor.timer
systemctl start thermal-label-monitor.service
# Migration must restore volumes and verify images before CI startup.
systemctl enable thermal-label-ci.service
systemctl enable --now thermal-label-ci.path
echo 'Bootstrap complete. Monitoring enabled; CI service awaits verified volume migration.'
