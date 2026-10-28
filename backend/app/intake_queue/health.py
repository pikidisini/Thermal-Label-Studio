"""Small health process: read the supervisor's last committed DB heartbeat.

Do not import the application/driver stack into a third process inside the
128 MiB worker cgroup. The PID-1 supervisor publishes only after DB success.
"""
import json
import os
from pathlib import Path
import time

# Per-worker tmpfs is mounted owner-only for UID/GID 10001 by Compose.
HEALTH_FILE = Path('/run/tls-queue-health/heartbeat.json')


def main():
    try:
        if os.environ.get('TLS_QUEUE_ENABLED') != 'true':
            return 1
        identity = os.environ.get('TLS_QUEUE_WORKER_ID','')
        value = json.loads(HEALTH_FILE.read_text())
        age = time.monotonic()-value['monotonic']
        return 0 if identity in ('worker-1','worker-2') and value['worker_id']==identity and value['pid']==1 and 0<=age<20 else 1
    except Exception:
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
