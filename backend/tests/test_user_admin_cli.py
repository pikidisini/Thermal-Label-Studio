"""Tests for user administration CLI tool (app.cli.user_admin)."""

import pytest
from app.auth.models import Role
from app.auth.service import auth_service
from app.cli.user_admin import main


def test_cli_create_user_and_list_users(isolate_auth_service, capsys):
    # 1. Create PPIC user
    rc = main(["create-user", "--username", "cli_ppic", "--role", "PPIC", "--password", "SecretPass123!"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "Sukses" in out
    assert "cli_ppic" in out

    # 2. Create IT user
    rc2 = main(["create-user", "--username", "cli_it", "--role", "IT", "--password", "AdminPass123!"])
    assert rc2 == 0

    # 3. List users
    rc_list = main(["list-users"])
    assert rc_list == 0
    list_out = capsys.readouterr().out
    assert "cli_ppic" in list_out
    assert "cli_it" in list_out
    assert "PPIC" in list_out
    assert "IT" in list_out


def test_cli_create_user_duplicate_fails(isolate_auth_service, capsys):
    main(["create-user", "--username", "dup_user", "--role", "PPIC", "--password", "SecretPass123!"])
    rc_dup = main(["create-user", "--username", "dup_user", "--role", "IT", "--password", "SecretPass123!"])
    assert rc_dup == 1
    err = capsys.readouterr().err
    assert "sudah terdaftar" in err


def test_cli_create_user_short_password_fails(isolate_auth_service, capsys):
    rc = main(["create-user", "--username", "short_pw_user", "--role", "PPIC", "--password", "short"])
    assert rc == 1
    err = capsys.readouterr().err
    assert "minimal harus 8 karakter" in err


def test_cli_set_password_and_revoke_sessions(isolate_auth_service, capsys):
    # Create user and authenticate
    main(["create-user", "--username", "pw_user", "--role", "PPIC", "--password", "OldPass123!"])
    session, _ = auth_service.authenticate("pw_user", "OldPass123!", "127.0.0.1")
    assert session is not None
    assert auth_service.validate_session(session.session_id) is not None

    # Change password via CLI
    rc = main(["set-password", "--username", "pw_user", "--password", "NewPass456!"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "Sukses" in out

    # Old session must be revoked
    assert auth_service.validate_session(session.session_id) is None

    # Old password no longer works
    old_auth, err1 = auth_service.authenticate("pw_user", "OldPass123!", "127.0.0.1")
    assert old_auth is None

    # New password works
    new_auth, err2 = auth_service.authenticate("pw_user", "NewPass456!", "127.0.0.1")
    assert new_auth is not None
    assert err2 is None


def test_cli_deactivate_and_activate_user(isolate_auth_service, capsys):
    main(["create-user", "--username", "toggle_user", "--role", "IT", "--password", "TogglePass123!"])
    session, _ = auth_service.authenticate("toggle_user", "TogglePass123!", "127.0.0.1")
    assert session is not None

    # Deactivate
    rc_deact = main(["deactivate-user", "--username", "toggle_user"])
    assert rc_deact == 0
    # Active session revoked
    assert auth_service.validate_session(session.session_id) is None
    # Cannot login
    s_failed, err = auth_service.authenticate("toggle_user", "TogglePass123!", "127.0.0.1")
    assert s_failed is None

    # Activate
    rc_act = main(["activate-user", "--username", "toggle_user"])
    assert rc_act == 0
    # Can login again
    s_success, err_ok = auth_service.authenticate("toggle_user", "TogglePass123!", "127.0.0.1")
    assert s_success is not None
    assert err_ok is None


def test_cli_nonexistent_user_returns_error(isolate_auth_service, capsys):
    assert main(["set-password", "--username", "ghost", "--password", "Pass1234!"]) == 1
    assert main(["deactivate-user", "--username", "ghost"]) == 1
    assert main(["activate-user", "--username", "ghost"]) == 1
