"""User Administration CLI tool for Thermal Label Studio.

Enables secure bootstrap and management of PPIC and IT accounts without public
registration, hardcoded default credentials, or logging secrets to terminal.
"""

from __future__ import annotations

import argparse
import getpass
import sys
from typing import List, Optional

from ..auth.models import Role
from ..auth.repository import SqliteAuthRepository
from ..auth.security import hash_password
from ..auth.service import auth_service
from ..config import BACKEND_DIR


def get_repo() -> SqliteAuthRepository:
    return auth_service.repository  # type: ignore


def cmd_create_user(args: argparse.Namespace) -> int:
    repo = get_repo()
    clean_username = args.username.strip()
    if not clean_username:
        print("Error: Username tidak boleh kosong.", file=sys.stderr)
        return 1

    try:
        role = Role.from_str(args.role)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    existing = repo.get_user_by_username(clean_username)
    if existing:
        print(f"Error: Pengguna '{clean_username}' sudah terdaftar.", file=sys.stderr)
        return 1

    password = getpass.getpass(f"Masukkan kata sandi untuk '{clean_username}': ")
    confirm = getpass.getpass("Konfirmasi kata sandi: ")
    if password != confirm:
        print("Error: Konfirmasi kata sandi tidak cocok.", file=sys.stderr)
        return 1

    if len(password) < 8:
        print("Error: Kata sandi minimal harus 8 karakter.", file=sys.stderr)
        return 1

    pw_hash = hash_password(password)
    user = repo.create_user(username=clean_username, password_hash=pw_hash, role=role)
    print(f"Sukses: Pengguna '{user.username}' dengan peran '{user.role.value}' berhasil dibuat.")
    return 0


def cmd_set_password(args: argparse.Namespace) -> int:
    repo = get_repo()
    clean_username = args.username.strip()
    user = repo.get_user_by_username(clean_username)
    if not user:
        print(f"Error: Pengguna '{clean_username}' tidak ditemukan.", file=sys.stderr)
        return 1

    password = getpass.getpass(f"Masukkan kata sandi baru untuk '{clean_username}': ")
    confirm = getpass.getpass("Konfirmasi kata sandi baru: ")
    if password != confirm:
        print("Error: Konfirmasi kata sandi tidak cocok.", file=sys.stderr)
        return 1

    if len(password) < 8:
        print("Error: Kata sandi minimal harus 8 karakter.", file=sys.stderr)
        return 1

    pw_hash = hash_password(password)
    repo.update_user_password(user.id, pw_hash)
    # Revoke all active sessions upon password reset
    revoked = auth_service.revoke_all_user_sessions(user.id)
    print(f"Sukses: Kata sandi pengguna '{clean_username}' diperbarui ({revoked} sesi aktif dicabut).")
    return 0


def cmd_deactivate_user(args: argparse.Namespace) -> int:
    repo = get_repo()
    clean_username = args.username.strip()
    user = repo.get_user_by_username(clean_username)
    if not user:
        print(f"Error: Pengguna '{clean_username}' tidak ditemukan.", file=sys.stderr)
        return 1

    repo.set_user_active(user.id, False)
    revoked = auth_service.revoke_all_user_sessions(user.id)
    print(f"Sukses: Pengguna '{clean_username}' dinonaktifkan ({revoked} sesi aktif dicabut).")
    return 0


def cmd_activate_user(args: argparse.Namespace) -> int:
    repo = get_repo()
    clean_username = args.username.strip()
    user = repo.get_user_by_username(clean_username)
    if not user:
        print(f"Error: Pengguna '{clean_username}' tidak ditemukan.", file=sys.stderr)
        return 1

    repo.set_user_active(user.id, True)
    print(f"Sukses: Pengguna '{clean_username}' diaktifkan kembali.")
    return 0


def cmd_list_users(args: argparse.Namespace) -> int:
    repo = get_repo()
    users = repo.list_users()
    if not users:
        print("Tidak ada pengguna yang terdaftar.")
        return 0

    print(f"{'ID':<36} | {'USERNAME':<16} | {'ROLE':<6} | {'ACTIVE':<6} | {'CREATED AT'}")
    print("-" * 90)
    for u in users:
        status_str = "YES" if u.is_active else "NO"
        print(f"{u.id:<36} | {u.username:<16} | {u.role.value:<6} | {status_str:<6} | {u.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Thermal Label Studio User Administration Tool")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # create-user
    p_create = subparsers.add_parser("create-user", help="Create a new PPIC or IT user")
    p_create.add_argument("--username", required=True, help="Username")
    p_create.add_argument("--role", required=True, choices=["PPIC", "IT"], help="User role (PPIC or IT)")
    p_create.set_defaults(func=cmd_create_user)

    # set-password
    p_pw = subparsers.add_parser("set-password", help="Set new password for a user")
    p_pw.add_argument("--username", required=True, help="Username")
    p_pw.set_defaults(func=cmd_set_password)

    # deactivate-user
    p_deact = subparsers.add_parser("deactivate-user", help="Deactivate user and revoke all sessions")
    p_deact.add_argument("--username", required=True, help="Username")
    p_deact.set_defaults(func=cmd_deactivate_user)

    # activate-user
    p_act = subparsers.add_parser("activate-user", help="Activate user")
    p_act.add_argument("--username", required=True, help="Username")
    p_act.set_defaults(func=cmd_activate_user)

    # list-users
    p_list = subparsers.add_parser("list-users", help="List registered users")
    p_list.set_defaults(func=cmd_list_users)

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
