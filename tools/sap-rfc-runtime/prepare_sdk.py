"""Verify private SDK inputs and the public PyRFC source before building."""
import hashlib
import json
from pathlib import Path
import sys
import urllib.request
import zipfile

ARCHIVES = {
    'sdk_base': '32611b5680b931e17b47c7b9a597e33f1e3711a8a242fac0763fb298c97daf04',
    'sdk_hotfix': '4b80762d8eb13d091e484b0e965074a045d67e0c33a37d1d5328033dcc9e99e1',
}


def sdk():
    destination = Path('/opt/sap-rfc/sdk')
    destination.mkdir(parents=True)
    for name, expected in ARCHIVES.items():
        filename = ('nwrfc750P_12-70002752.zip' if name == 'sdk_base'
                    else 'nwrfc750P12HF_1-70002752.zip')
        path = Path('/run/secrets') / filename
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError('SDK archive checksum mismatch: ' + name)
        with zipfile.ZipFile(path) as archive:
            for entry in archive.infolist():
                parts = Path(entry.filename).parts
                if 'nwrfcsdk' not in parts:
                    continue
                relative = Path(*parts[parts.index('nwrfcsdk') + 1:])
                # Only runtime libraries, build headers and their notices are needed.
                # Do not install SDK demo executables or example connection files.
                if not relative.parts or relative.parts[0] not in {'lib', 'include', 'doc'}:
                    continue
                target = destination / relative
                if not target.resolve().is_relative_to(destination.resolve()):
                    raise ValueError('Unsafe SDK archive member')
                if entry.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(archive.read(entry))


def pyrfc():
    with urllib.request.urlopen('https://pypi.org/pypi/pyrfc/3.3.1/json', timeout=30) as response:
        release = json.load(response)
    source, = [item for item in release['urls'] if item['packagetype'] == 'sdist']
    with urllib.request.urlopen(source['url'], timeout=60) as response:
        data = response.read()
    digest = hashlib.sha256(data).hexdigest()
    if digest != source['digests']['sha256']:
        raise ValueError('PyRFC source checksum mismatch')
    Path('/build/pyrfc.tar.gz').write_bytes(data)
    Path('/opt/sap-rfc/build-inputs.json').write_text(json.dumps({
        'sdk_archives': ARCHIVES, 'pyrfc_version': '3.3.1', 'pyrfc_source_sha256': digest,
    }, indent=2) + '\n')


if __name__ == '__main__':
    pyrfc() if '--pyrfc' in sys.argv else sdk()
