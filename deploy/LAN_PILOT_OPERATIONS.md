# LAN pilot operations

Use this runbook with the explicitly authorized server and storage recorded in
the private deployment inventory. It does not activate SAP, a printer, queued
intake, or production acceptance. Keep inventory, credentials, backup bundles,
recovery keys and generated acceptance evidence outside Git.

## Release and configuration

Keep each source snapshot, its file manifest, image identities and transfer
checksums in a separate release directory. A release must include current
authorized working-tree files, including required untracked source. Verify its
source gate and the exact image's renderer/font/PNG/IPL smoke test before use.
Changing a Git branch alone does not reproduce an uncommitted release.

The pilot uses the standard Compose stack plus `deploy/compose.lan.yml` and a
private target-specific overlay. The private overlay selects tested image tags
with `pull_policy: never`, disables builds, SAP RFC, queue execution, intake
ledger wiring and automatic storage initialization, and assigns the dedicated
container subnet. Registered printer configuration remains in the restored
database. SAP, queue and physical-device execution still require their own scope.

The approved layout on the server is:

- `/opt/thermal-label-studio/releases/<release>/source`: source snapshot.
- `/opt/thermal-label-studio/current`: link to the selected source snapshot.
- `/etc/thermal-label-studio/pilot.env`: private Compose input.
- `/etc/thermal-label-studio/pilot.yml`: private target overlay.
- `/etc/thermal-label-studio/recovery`: recovery key, separate from backup output.
- `/var/backups/thermal-label-studio`: encrypted backups and private restore scratch.

Application, configuration and backup directories are private to the deployment
administrator. Keep an access-controlled recovery copy on a different machine;
temporary directories alone are not a durable recovery strategy. Preserve every
encryption/HMAC version referenced by retained data or backups. Never print
resolved `docker compose config`, environment values or database documents into
logs or reports.

## Restore and startup

Pause source writers for a consistent database/object snapshot. Verify and
encrypt the backup before transfer, then verify its transfer checksum and
authenticated contents on the destination. Restore only into the explicitly
approved new volumes. Refuse a nonempty database or an existing destination
bucket. Compare table counts and verify every restored object's checksum before
starting the application. Preserve failed or partial targets for investigation.

The LAN migration utility is distinct from `scripts/production_restore.py`.
That existing utility creates isolated restore-drill database/bucket names and
must not be described as an in-place production migration.

At the owner's request, the pilot does not install a custom client-subnet
allowlist or outbound firewall block. The activation installer removes only the
`TLS-LAN-PILOT` chain, its DOCKER-USER jump and the exact pilot INPUT rejection
rule installed earlier. It preserves unrelated host/Docker firewall rules.
Application access still requires local-account login and role checks; the app
binds the selected LAN IP, and PostgreSQL/MinIO host ports remain loopback-only.

The private systemd unit `thermal-label-studio-lan.service` runs
`docker compose up -d --no-build`, without a firewall ExecStartPre hook.
Container `restart: "no"` leaves boot startup under this unit. Enable the
unit only after restore and image validation. The oneshot unit's active status
is not a substitute for checking individual container health.

For an authorized restart or status check:

```sh
sudo systemctl restart thermal-label-studio-lan.service
systemctl status thermal-label-studio-lan.service --no-pager
docker ps --filter label=com.docker.compose.project=thermal-label-studio-lan
```

Do not reboot a shared server without an agreed window. Test restart persistence
and record boot acceptance separately. Do not change unrelated services or their
firewall rules.

## Acceptance and recovery

Verify `/health`, `/ready`, anonymous API denial, exact login origin, login/logout,
roles, restored template reads and Test Data previews. Save one uniquely named
synthetic template and confirm it survives an authorized restart. A successful
health endpoint does not prove login, rendering, restore or physical output.

Preserve the source backup, previous image/source identities and both volumes.
On failed acceptance, stop the pilot with the authorized unit; do not run
`docker compose down -v`, clear storage, automatically resend, or overwrite the
source database. A source/image rollback does not undo database changes. Review
schema compatibility before changing the selected release.

Report source, image/runtime, access, storage/restore, browser, restart and boot
checks individually. Keep SAP, queued intake and printer operations `NOT RUN`
until separately scoped. HTTP LAN pilot access does not establish production
HTTPS or production-printing acceptance.
