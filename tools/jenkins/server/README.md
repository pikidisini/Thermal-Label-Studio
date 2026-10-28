# Server maintenance and CI/CD

The approved target is `192.168.254.58`: Jenkins on port 8081, SonarQube on
9004, and the existing application on 18082. HTTP LAN transport is the current
owner-selected pilot setting. Keep authentication and the migrated authorization
matrix; this is not production HTTPS acceptance.

## Layout and trust

The CI Compose project is `thermal-label-ci`. Its six external volumes use the
`thermal-label-ci-` prefix and never reuse application storage. Controller users,
credentials, encryption keys and build history come from the authenticated local
backup; never seed replacement administrator accounts.

The controller has zero build executors and no Docker socket. `tls-build` has one
executor and runs reviewed source from this repository. Its Docker access is
administrative host access: only trusted repository revisions may use it. Do not
enable arbitrary fork/PR builds with deployment privileges. `tls-monitor` is a
separate low-resource executor with only sanitized monitor-file access and no
Docker socket. Both agents connect to the controller through internal WebSocket.

Private configuration is `/etc/thermal-label-ci/ci.env`; agent secrets are in
its `agents/` child. All real configuration, credentials, volume archives and
generated reports remain outside Git. The application private environment and
volumes remain under their original named-target boundaries.

## Reporting and releases

Report a bug with the application revision, reproduction, expected/actual result
and a sanitized trace ID or screenshot. Features need user intent and acceptance
criteria. Use a branch and pull request; merging `main` makes a release eligible.

`thermal-label-release` polls Git every five minutes. A unique build report
directory binds source tests, measured coverage, mock browser tests, Sonar analysis
and real-storage image acceptance to one Git commit. Sonar must pass for that
analysis. Archive the report in Jenkins before removing disposable work.

`thermal-label-qualification` uses the maintenance branch before first cutover.
The host marker `/var/lib/thermal-label-ci/auto-release.enabled` remains absent
until migration and qualification pass. Without it, the release stage reports
`QUALIFIED` and performs no application deployment. Disable the qualification job
after cutover; retain its history.

A deployable candidate passes real PostgreSQL/MinIO tests with synthetic accounts,
Admin/Designer/Operator enforcement, immutable template save/read, Test Data PNG
preview, logout and restart persistence. CI storage/network names are unique and
labeled; only those resources are removed. No physical SAP/printer test is run.

The release lock prevents concurrent deployment. Only the current `main` SHA may
replace the application. Any schema SQL difference blocks automatic deployment.
The application stops briefly for a consistent encrypted PostgreSQL/MinIO backup;
historical inactive key material is included. On failed runtime checks, the old
image/configuration/source link is restored without restoring or deleting data.
Keep three successful release images, including active and fallback identities;
retain 20 Jenkins build records. Never prune unrelated host images or volumes.

## Monitoring

`thermal-label-monitor.timer` samples once per minute independently of Jenkins
builds. `/var/lib/thermal-label-ci/monitor/status.json` contains only sanitized
HTTP/container/storage status, CPU load, memory/disk usage, backup age and release
metadata. Three consecutive failures mark a service DOWN; two successful samples
mark it UP. Disk warnings begin at 80%, critical at 90%. A missing scheduled SLA
is not invented: backup age is informational until RPO/RTO are agreed.

`thermal-label-monitor` archives that summary and marks stale/unhealthy data in
the Jenkins dashboard. It performs no restart, deployment, resend, or messaging.
No Slack/email/Telegram integration is configured. Complete host failure cannot
be reported from this same host; external monitoring is a later scope.

## Migration and recovery

Run `install.sh` only after staging reviewed source and private inputs. It installs
monitoring and an enabled systemd CI path/service guarded by a migration-ready
marker. It does not reboot the host or start CI before volume restoration.
`restore_volumes.py` is plan-only unless explicitly applied to the fixed host;
it authenticates archives, refuses existing target volumes and compares extracted
files with the backup. Never delete a partial target to make a retry appear clean.

Preserve the stopped local stacks and their original volumes until server
acceptance. Their old deployment triggers must remain disabled. Keep a durable
encrypted off-server CI backup and a separately protected recovery key; Jenkins
credential recovery requires its original master/encryption material.

Systemd units are `thermal-label-ci.service`, `thermal-label-ci.path`,
`thermal-label-monitor.service` and `thermal-label-monitor.timer`. Inspect status
without printing resolved Compose environment. An application rollback does not
reverse a database migration. Review schema compatibility and restore only into
separately authorized isolated targets when testing recovery.
