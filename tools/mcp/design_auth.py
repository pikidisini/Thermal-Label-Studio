"""Explicit interactive login, separate from the MCP STDIO protocol.

Windows sessions are protected with current-user DPAPI; POSIX files are owner-only.
No password is persisted. The cached server session remains revocable and expiring.
"""
import argparse
import ctypes
from ctypes import wintypes
from getpass import getpass
import json
import os
from pathlib import Path
import stat
import sys

DEFAULT_SESSION = Path(__file__).resolve().parents[2] / '.auth' / 'design-session'


def dpapi(data, *, decrypt=False):
    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    output = Blob()
    crypt = ctypes.WinDLL('crypt32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    if decrypt:
        function = crypt.CryptUnprotectData
        result = function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output))
    else:
        function = crypt.CryptProtectData
        result = function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output))
    if not result:
        raise ValueError('Cannot protect or recover the current-user session.')
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    try:
        return ctypes.string_at(output.data, output.size)
    finally:
        kernel.LocalFree(ctypes.cast(output.data, ctypes.c_void_p))


def write_session(path, value):
    path = Path(path)
    if path.is_symlink():
        raise ValueError('Session path must not be a symbolic link.')
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    packed = json.dumps(value).encode('utf-8')
    packed = b'DPAPI\0' + dpapi(packed) if os.name == 'nt' else packed
    # Exclusive creation avoids following links or overwriting an existing session.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'wb') as file:
        file.write(packed)


def read_session(path, origin):
    path = Path(path)
    if path.is_symlink() or path.stat().st_size > 16384:
        raise ValueError('Invalid local session file.')
    if os.name != 'nt' and path.stat().st_mode & (stat.S_IRWXG | stat.S_IRWXO):
        raise ValueError('Session file must be owner-only (0600).')
    packed = path.read_bytes()
    if os.name == 'nt':
        if not packed.startswith(b'DPAPI\0'):
            raise ValueError('Windows session must use current-user DPAPI protection.')
        packed = dpapi(packed[6:], decrypt=True)
    value = json.loads(packed)
    if value['origin'] != origin:
        raise ValueError('Session origin does not match the configured target.')
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True)
    parser.add_argument('--session-file', type=Path, default=DEFAULT_SESSION)
    args = parser.parse_args()
    if not sys.stdin.isatty():
        raise ValueError('Explicit login requires an interactive terminal.')
    from design_server import DesignClient
    client = DesignClient(args.url)
    try:
        print('Studio username: ', end='', file=sys.stderr, flush=True)
        client.login(input(), getpass('Studio password: '))
        write_session(args.session_file, {'origin': client.origin, 'cookie': client.http.cookies.get('tls_session')})
        print('Protected session created. Configure TLS_MCP_DESIGN_SESSION_FILE; renew deliberately after expiry.', file=sys.stderr)
    finally:
        client.http.close()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Design login failed. Check target, account, password-change status and session-file availability.', file=sys.stderr)
        raise SystemExit(1) from None
