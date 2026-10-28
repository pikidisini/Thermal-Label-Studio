"""Encrypted maintenance-window backup and offline verification. Plan-only by default.

Backup is read-only against explicitly named PostgreSQL/MinIO targets. Restore
extraction never connects to a database or printer. A successful verify proves
bundle integrity, not that a database restore has succeeded.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import tempfile
from urllib.parse import unquote, urlsplit
from uuid import uuid4
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

HEADER = b'TLSBACKUP1'
CHUNK = 1024*1024


def safe_output_root(path):
    if path is None or not path.is_absolute() or not path.is_dir():
        raise ValueError('An existing absolute private output root is required.')
    resolved=path.resolve()
    project=Path(__file__).resolve().parents[1]
    if resolved.is_relative_to(project) or any((parent/'.git').exists() for parent in (resolved,*resolved.parents)):
        raise ValueError('Backup and extracted secrets must remain outside source repositories.')
    return resolved


def file_hash(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(CHUNK),b''):
            digest.update(chunk)
    return digest.hexdigest()


def encrypt(source,target,key):
    nonce = os.urandom(12)
    cipher = Cipher(algorithms.AES(key),modes.GCM(nonce)).encryptor()
    cipher.authenticate_additional_data(HEADER)
    with source.open('rb') as incoming,target.open('xb') as outgoing:
        outgoing.write(HEADER+nonce)
        for chunk in iter(lambda:incoming.read(CHUNK),b''):
            outgoing.write(cipher.update(chunk))
        outgoing.write(cipher.finalize()+cipher.tag)


def decrypt(source,target,key):
    with source.open('rb') as incoming:
        if incoming.read(len(HEADER))!=HEADER:
            raise ValueError('Invalid backup format.')
        nonce=incoming.read(12)
        size=source.stat().st_size-len(HEADER)-12-16
        if size<0:
            raise ValueError('Invalid backup format.')
        incoming.seek(-16,2); tag=incoming.read(16)
        incoming.seek(len(HEADER)+12)
        cipher=Cipher(algorithms.AES(key),modes.GCM(nonce,tag)).decryptor()
        cipher.authenticate_additional_data(HEADER)
        with target.open('xb') as outgoing:
            remaining=size
            while remaining:
                chunk=incoming.read(min(CHUNK,remaining))
                if not chunk:
                    raise ValueError('Incomplete backup.')
                outgoing.write(cipher.update(chunk)); remaining-=len(chunk)
            outgoing.write(cipher.finalize())


def validate_archive(path):
    with tarfile.open(path,'r') as archive:
        members=archive.getmembers()
        names=set()
        for member in members:
            relative=PurePosixPath(member.name)
            if (not member.isfile() or relative.is_absolute() or '..' in relative.parts
                    or '\\' in member.name or member.name in names):
                raise ValueError('Unsafe backup member.')
            names.add(member.name)
        manifest=json.load(archive.extractfile('manifest.json'))
        if set(manifest.get('files',{})) != names-{'manifest.json'}:
            raise ValueError('Backup inventory mismatch.')
        for name,expected in manifest['files'].items():
            digest=hashlib.sha256()
            with archive.extractfile(name) as stream:
                for chunk in iter(lambda:stream.read(CHUNK),b''):
                    digest.update(chunk)
            if digest.hexdigest()!=expected:
                raise ValueError('Backup checksum mismatch.')
        return manifest


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=('create','verify','extract'))
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--backup-key-file',type=Path)
    parser.add_argument('--bundle',type=Path)
    parser.add_argument('--output-root',type=Path)
    parser.add_argument('--configuration-file',type=Path,action='append',default=[])
    parser.add_argument('--pg-dump',type=Path)
    parser.add_argument('--confirm-host')
    parser.add_argument('--confirm-database')
    parser.add_argument('--confirm-object-store')
    parser.add_argument('--confirm-bucket')
    parser.add_argument('--quiesced',action='store_true')
    args=parser.parse_args(argv)
    if not args.apply:
        print(json.dumps({'action':args.action,'status':'PLAN ONLY','external_operations':'NOT RUN'}))
        return 0
    if os.name!='posix':
        parser.error('Run applied backup operations on the approved Linux host.')
    if args.backup_key_file is None:
        parser.error('An off-server 32-byte backup key file is required.')
    key=args.backup_key_file.read_bytes()
    if len(key)!=32:
        parser.error('Backup key must contain exactly 32 bytes.')
    root=safe_output_root(args.output_root)
    # All disposable files belong to one newly-created directory. No recursive
    # cleanup ever targets a caller-supplied directory or operational volume.
    with tempfile.TemporaryDirectory(prefix='tls-backup-',dir=root) as temporary:
        stage=Path(temporary); os.chmod(stage,0o700)
        archive_path=stage/'backup.tar'
        if args.action=='create':
            from app.config import get_settings
            from minio import Minio
            import urllib3
            settings=get_settings().persistence
            if settings is None:
                parser.error('Explicit persistence settings are required.')
            parsed=urlsplit(settings.database_url)
            if (not args.quiesced or parsed.hostname!=args.confirm_host
                    or parsed.path.lstrip('/')!=args.confirm_database
                    or settings.minio_endpoint!=args.confirm_object_store
                    or settings.minio_bucket!=args.confirm_bucket
                    or not args.confirm_database or args.pg_dump is None or not args.pg_dump.is_absolute()
                    or not args.configuration_file):
                parser.error('Confirm all named targets, stopped writers, pg_dump path and configuration/key sources.')
            env=dict(os.environ)
            env.update(PGHOST=parsed.hostname,PGPORT=str(parsed.port or 5432),PGDATABASE=unquote(parsed.path.lstrip('/')),
                       PGUSER=unquote(parsed.username or ''),PGPASSWORD=unquote(parsed.password or ''),PGCONNECT_TIMEOUT='5')
            dump=stage/'database.dump'
            result=subprocess.run([str(args.pg_dump),'--format=custom','--no-owner','--no-acl','--file',str(dump)],
                                  env=env,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=3600)
            if result.returncode:
                raise ValueError('Database backup failed.')
            client=Minio(settings.minio_endpoint,access_key=settings.minio_access_key,secret_key=settings.minio_secret_key,
                secure=settings.minio_secure,http_client=urllib3.PoolManager(timeout=urllib3.Timeout(connect=5,read=30),retries=False))
            inventory={'database.dump':dump}; objects={}
            for index,obj in enumerate(client.list_objects(settings.minio_bucket,recursive=True)):
                name=f'objects/{index:08d}'
                local=stage/f'object-{index:08d}'
                client.fget_object(settings.minio_bucket,obj.object_name,str(local))
                inventory[name]=local; objects[name]=obj.object_name
            for index,configuration in enumerate(args.configuration_file):
                local=stage/f'configuration-{index:04d}'
                shutil.copyfile(configuration,local)
                inventory[f'configuration/{index:04d}']=local
            manifest={'version':1,'files':{name:file_hash(path) for name,path in inventory.items()},
                      'objects':objects,'configuration_sources':[path.name for path in args.configuration_file],
                      'restore_requires_paused_queue':True}
            with tarfile.open(archive_path,'w') as archive:
                for name,path in inventory.items():
                    archive.add(path,arcname=name,recursive=False)
                raw=json.dumps(manifest).encode(); member=tarfile.TarInfo('manifest.json'); member.size=len(raw); member.mode=0o600
                archive.addfile(member,io.BytesIO(raw))
            validate_archive(archive_path)
            target=root/('backup_'+uuid4().hex+'.tlsbackup')
            encrypted=stage/'bundle.tlsbackup'
            encrypt(archive_path,encrypted,key); os.chmod(encrypted,0o600)
            # Authenticate the actual written bundle before reporting success.
            verified=stage/'verified.tar'; decrypt(encrypted,verified,key); validate_archive(verified)
            os.replace(encrypted,target)
            print(json.dumps({'status':'PASS','bundle':str(target),'restore':'NOT RUN'}))
        else:
            if args.bundle is None:
                parser.error('An explicit bundle path is required.')
            decrypt(args.bundle,archive_path,key)
            validate_archive(archive_path)
            if args.action=='extract':
                target=root/('restore_'+uuid4().hex); target.mkdir(mode=0o700)
                with tarfile.open(archive_path,'r') as archive:
                    archive.extractall(target,filter='data')
                print(json.dumps({'status':'PASS','extracted':str(target),'database_restore':'NOT RUN','queue':'MUST REMAIN PAUSED'}))
            else:
                print(json.dumps({'status':'PASS','database_restore':'NOT RUN'}))
    return 0


if __name__=='__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('Backup operation failed. Private diagnostic output was suppressed.')
        raise SystemExit(1) from None
