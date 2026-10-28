"""Plan-only isolated restore drill. Never starts services or contacts a printer.

Applied operation creates a generated tls_restore_* database and tls-restore-*
bucket, never reuses/cleans an existing target. Retain these targets for review.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import unquote,urlsplit
from uuid import uuid4
from production_backup import file_hash


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--extracted',type=Path)
    parser.add_argument('--pg-restore',type=Path)
    parser.add_argument('--confirm-host')
    parser.add_argument('--confirm-object-store')
    parser.add_argument('--isolated',action='store_true')
    args=parser.parse_args(argv)
    if not args.apply:
        print(json.dumps({'status':'PLAN ONLY','storage_writes':'NOT RUN','printer_operations':'NOT RUN'}))
        return 0
    from app.config import get_settings
    import psycopg
    from psycopg import sql
    from minio import Minio
    import urllib3
    settings=get_settings().persistence
    if settings is None:
        parser.error('Explicit isolated persistence configuration is required.')
    parsed=urlsplit(settings.database_url)
    if (not args.isolated or not args.confirm_host or parsed.hostname!=args.confirm_host
            or settings.minio_endpoint!=args.confirm_object_store
            or args.extracted is None or not args.extracted.is_absolute()
            or args.pg_restore is None or not args.pg_restore.is_absolute()):
        parser.error('Confirm the isolated host/object store, extracted directory and pg_restore path.')
    root=args.extracted.resolve()
    manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
    for name,digest in manifest['files'].items():
        original=root/name
        local=original.resolve()
        if not local.is_relative_to(root) or original.is_symlink() or file_hash(local)!=digest:
            raise ValueError('Restore inventory is invalid.')
    if not set(manifest['objects']).issubset(manifest['files']):
        raise ValueError('Restore object inventory is invalid.')
    identifier=uuid4().hex
    database='tls_restore_'+identifier
    bucket='tls-restore-'+identifier
    with psycopg.connect(settings.database_url,autocommit=True,connect_timeout=5) as connection:
        connection.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(database)))
    # Static generated identity only; credentials are passed through environment.
    env=dict(os.environ)
    env.update(PGHOST=parsed.hostname,PGPORT=str(parsed.port or 5432),PGDATABASE=database,
               PGUSER=unquote(parsed.username or ''),PGPASSWORD=unquote(parsed.password or ''),PGCONNECT_TIMEOUT='5')
    result=subprocess.run([str(args.pg_restore),'--single-transaction','--exit-on-error','--no-owner','--no-acl',
                           '--dbname',database,str(root/'database.dump')],env=env,stdin=subprocess.DEVNULL,
                           stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=3600)
    if result.returncode:
        raise ValueError('Isolated database restore failed; preserve target for investigation.')
    with psycopg.connect(settings.database_url,dbname=database,connect_timeout=5) as connection:
        connection.execute('UPDATE label_intake.queue_control SET paused=true WHERE singleton=true')
        connection.execute("INSERT INTO label_intake.queue_audit(actor,action,note) VALUES('RESTORE_DRILL','RESTORE_PAUSE','Isolated restore; reconciliation required before any activation.')")
    client=Minio(settings.minio_endpoint,access_key=settings.minio_access_key,secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,http_client=urllib3.PoolManager(timeout=urllib3.Timeout(connect=5,read=30),retries=False))
    if client.bucket_exists(bucket):
        raise ValueError('Generated restore bucket already exists.')
    client.make_bucket(bucket)
    for local,object_name in manifest['objects'].items():
        client.fput_object(bucket,object_name,str(root/local))
    print(json.dumps({'status':'RESTORED','database':database,'bucket':bucket,'queue':'PAUSED',
                      'worker_start':'NOT RUN','printer_operations':'NOT RUN','application_acceptance':'NOT RUN'}))
    return 0


if __name__=='__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('Isolated restore failed. Preserve generated targets; no printer operation was performed.')
        raise SystemExit(1) from None
