"""One-time, explicitly authorized fresh ledger setup for the local database.

Never run automatically at application startup. Existing schemas, roles or
configuration are preserved and require a separate migration plan.
"""
import argparse
import json
from pathlib import Path
import secrets
import subprocess
import sys
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit, urlunsplit
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
ROLE = 'tls_intake_runtime'


def compose():
    result = subprocess.run(['docker', 'compose', 'config', '--format', 'json'],
                            cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Cannot resolve local Compose configuration.')
    return json.loads(result.stdout)


def setup():
    import psycopg
    from psycopg import sql
    config = compose()
    parsed = urlsplit(config['services']['app']['environment']['TLS_DATABASE_URL'])
    ports = config['services']['postgres']['ports']
    if (parsed.hostname != 'postgres' or parsed.path != '/thermal_label_studio'
            or not any(p.get('host_ip') == '127.0.0.1' and int(p['target']) == 5432
                       and int(p['published']) == 5434 for p in ports)):
        raise RuntimeError('Unexpected database target; refusing setup.')
    admin = urlunsplit(parsed._replace(netloc=parsed.netloc.rsplit('@', 1)[0] + '@127.0.0.1:5434'))
    local = ROOT / '.env.intake-ledger.ps1'
    pending = list(ROOT.glob('.env.intake-ledger.pending.*.ps1'))
    if local.exists() or pending:
        raise RuntimeError('Existing ledger configuration preserved; inspect it before setup.')
    with psycopg.connect(admin, connect_timeout=3) as connection:
        with connection.cursor() as cursor:
            cursor.execute('SELECT current_database()')
            if cursor.fetchone()[0] != 'thermal_label_studio':
                raise RuntimeError('Wrong database.')
            cursor.execute("SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='label_intake')")
            if cursor.fetchone()[0]:
                raise RuntimeError('Existing ledger schema preserved; migration review required.')
            cursor.execute('SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=%s)', (ROLE,))
            if cursor.fetchone()[0]:
                raise RuntimeError('Existing ledger role preserved; migration review required.')

    # Backup is operational data, kept outside disposable .tmp and ignored by Git.
    backups = ROOT / '.env.ledger-backups'
    backups.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = backups / ('thermal_label_studio-' + stamp + '-' + uuid4().hex + '.dump')
    container = subprocess.run(['docker', 'compose', 'ps', '-q', 'postgres'],
                               cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    if not container or '\n' in container:
        raise RuntimeError('Expected one running PostgreSQL container.')
    inspect = subprocess.run(['docker', 'inspect', container], capture_output=True, text=True, check=True)
    published = json.loads(inspect.stdout)[0]['NetworkSettings']['Ports'].get('5432/tcp') or []
    if not any(p['HostIp'] == '127.0.0.1' and p['HostPort'] == '5434' for p in published):
        raise RuntimeError('Backup container does not match the authorized database port.')
    with backup.open('xb') as output:
        dumped = subprocess.run(['docker', 'exec', container, 'pg_dump', '-U', parsed.username,
                                 '-d', 'thermal_label_studio', '-Fc'], stdout=output, stderr=subprocess.PIPE)
    if dumped.returncode or backup.stat().st_size == 0:
        raise RuntimeError('Backup failed; database migration not attempted.')
    with backup.open('rb') as stream:
        if stream.read(5) != b'PGDMP':
            raise RuntimeError('Backup format invalid; database migration not attempted.')
    print('Backup created:', backup)

    password = secrets.token_urlsafe(48)
    hmac_key = secrets.token_urlsafe(48)
    runtime_dsn = 'postgresql://' + ROLE + ':' + quote(password, safe='') + '@127.0.0.1:5434/thermal_label_studio'
    references = json.dumps({'database_env': 'TLS_INTAKE_DATABASE_URL', 'active_key': 'k1',
                             'keys': {'k1': 'TLS_INTAKE_HMAC_K1'}}, separators=(',', ':'))
    pending_path = ROOT / ('.env.intake-ledger.pending.' + uuid4().hex + '.ps1')
    # Persist credentials BEFORE committing their database role. Keep pending file
    # after any ambiguous failure; never silently rotate/recreate the key version.
    pending_path.write_text(
        '# Private ledger configuration. Never share or print. Retain HMAC keys across restarts.\n'
        + "$env:TLS_INTAKE_DATABASE_URL = '" + runtime_dsn + "'\n"
        + "$env:TLS_INTAKE_HMAC_K1 = '" + hmac_key + "'\n"
        + "$env:TLS_INTAKE_LEDGER_JSON = '" + references + "'\n", encoding='utf-8')
    schema = (ROOT / 'backend/schema/002_label_intake.sql').read_text(encoding='utf-8')
    if schema.count('\nBEGIN;') != 1 or schema.count('\nCOMMIT;') != 1:
        raise RuntimeError('Unexpected schema transaction boundaries.')
    schema = schema.replace('\nBEGIN;', '', 1).replace('\nCOMMIT;', '', 1)
    with psycopg.connect(admin, connect_timeout=3) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout='3s'")
            cursor.execute("SET LOCAL statement_timeout='15s'")
            cursor.execute(schema)
            cursor.execute(sql.SQL('CREATE ROLE {} LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB '
                                   'NOCREATEROLE NOREPLICATION NOBYPASSRLS').format(
                                       sql.Identifier(ROLE), sql.Literal(password)))
            cursor.execute(sql.SQL('GRANT CONNECT ON DATABASE thermal_label_studio TO {}').format(sql.Identifier(ROLE)))
            cursor.execute(sql.SQL('GRANT USAGE ON SCHEMA label_intake TO {}').format(sql.Identifier(ROLE)))
            for privilege, tables in (
                ('SELECT, UPDATE', 'capacity'),
                ('SELECT, INSERT', 'key_versions, simulation_results'),
                ('SELECT, INSERT, UPDATE', 'requests, items'),
            ):
                names = sql.SQL(', ').join(sql.Identifier('label_intake', name.strip()) for name in tables.split(','))
                cursor.execute(sql.SQL('GRANT {} ON {} TO {}').format(
                    sql.SQL(privilege), names, sql.Identifier(ROLE)))
    pending_path.rename(local)
    print('Fresh ledger schema and restricted runtime role installed.')
    print('Private runtime config:', local)
    print('No template, printer, cleanup or recovery operation performed.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply-authorized-local-target', action='store_true')
    args = parser.parse_args()
    if not args.apply_authorized_local_target:
        print('Plan only: back up thermal_label_studio at 127.0.0.1:5434, then install fresh label_intake schema,')
        print('restricted tls_intake_runtime role and private retained HMAC/runtime configuration.')
        return 0
    try:
        setup()
    except Exception as exc:
        # Driver exceptions may contain SQL, DSNs or password literals.
        print('Setup stopped (' + type(exc).__name__ + '). Inspect target and retained pending configuration before retrying; secrets omitted.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
