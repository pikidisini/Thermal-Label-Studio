"""Render sanitized monitor artifacts without extra Jenkins sandbox privileges."""
import json
from pathlib import Path
import re
import sys
import time


def render(source, destination):
    if time.time() - source.stat().st_mtime > 180:
        raise ValueError('Monitor data is stale')
    value = json.loads(source.read_text())
    if value.get('state') not in {'UP', 'DOWN', 'WARNING'}:
        raise ValueError('Unexpected monitor state')
    revision = value.get('application_source', '')
    if not re.fullmatch('[A-Za-z0-9_.-]{1,80}', revision):
        raise ValueError('Unexpected revision')
    disk = float(value['disk_percent'])
    if not 0 <= disk <= 100:
        raise ValueError('Unexpected disk reading')
    (destination / 'status.json').write_text(json.dumps(value, indent=2) + '\n')
    (destination / 'state.txt').write_text(value['state'])
    (destination / 'description.txt').write_text(f"{value['state']} | disk {disk}% | {revision}")


if __name__ == '__main__':
    render(Path(sys.argv[1]), Path.cwd())
