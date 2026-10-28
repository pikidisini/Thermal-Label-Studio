"""Read-only deployment input validation. Does not print secrets or contact targets."""
import argparse
import ipaddress
from pathlib import Path
import re


def inspect(values):
    errors=[]
    for key in ('TLS_RELEASE_IMAGE','TLS_PROXY_IMAGE','TLS_POSTGRES_IMAGE','TLS_MINIO_IMAGE'):
        if re.fullmatch(r'[^\s]+@sha256:[0-9a-f]{64}',values.get(key,'')) is None:
            errors.append(key)
    for key in ('TLS_RUNTIME_ENV_FILE','TLS_WORKER_ENV_FILE','TLS_CERTIFICATE_FILE','TLS_PRIVATE_KEY_FILE',
                'TLS_POSTGRES_PASSWORD_FILE','TLS_MINIO_USER_FILE','TLS_MINIO_PASSWORD_FILE'):
        path=Path(values.get(key,''))
        if not path.is_absolute() or not path.is_file():
            errors.append(key)
    for key in ('TLS_POSTGRES_VOLUME','TLS_MINIO_VOLUME','TLS_HOSTNAME'):
        if not values.get(key,'') or re.search(r'\s|[/\\]',values[key]):
            errors.append(key)
    hostname=values.get('TLS_HOSTNAME','')
    if len(hostname)>253 or re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*',hostname) is None:
        errors.append('TLS_HOSTNAME')
    try:
        network=ipaddress.ip_network(values['TLS_CONTAINER_SUBNET'])
        proxy=ipaddress.ip_address(values['TLS_PROXY_IP'])
        lan=ipaddress.ip_address(values['TLS_LAN_BIND_IP'])
        if (proxy not in network or proxy in (network.network_address,network.broadcast_address,network.network_address+1)
                or not lan.is_private or lan.is_unspecified or lan.is_multicast or lan.is_loopback):
            raise ValueError()
    except (KeyError,ValueError):
        errors.append('network_configuration')
    return sorted(set(errors))


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('environment',type=Path)
    args=parser.parse_args(argv)
    values={}
    for line in args.environment.read_text(encoding='utf-8').splitlines():
        if line.strip() and not line.lstrip().startswith('#'):
            key,separator,value=line.partition('=')
            if not separator or key in values:
                parser.error('Invalid/duplicate deployment setting.')
            values[key]=value.strip().strip('"').strip("'")
    errors=inspect(values)
    if errors:
        print('BLOCKED: missing/invalid settings: '+', '.join(errors))
        return 1
    print('PASS: deployment inputs present. Image, HTTPS, storage, SAP and printer acceptance NOT RUN.')
    return 0


if __name__=='__main__':
    raise SystemExit(main())
