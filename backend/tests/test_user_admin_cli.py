"""Tests for user administration CLI tool (app.cli.user_admin)."""

import pytest
from app.auth.models import Role
from app.auth.service import auth_service
from app.cli.user_admin import main


def test_cli_rejects_password_flag_in_argv(isolate_auth_service):
    """P2: Passing --password flag in argv must be rejected by argument parser."""
    with pytest.raises(SystemExit):
        main(["create-user", "--username", "cli_test", "--role", "PPIC", "--password", "SecretPass123!"])

    with pytest.raises(SystemExit):
        main(["set-password", "--username", "cli_test", "--password", "NewPass123!"])


def test_cli_create_user_and_list_users(isolate_auth_service, monkeypatch, capsys):
    # 1. Create PPIC user via interactive getpass mock
    monkeypatch.setattr("getpass.getpass", lambda prompt="": "SecretPass123!")
    rc = main(["create-user", "--username", "cli_ppic", "--role", "PPIC"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "Sukses" in out
    assert "cli_ppic" in out

    # 2. Create IT user
    monkeypatch.setattr("getpass.getpass", lambda prompt="": "AdminPass123!")
    rc2 = main(["create-user", "--username", "cli_it", "--role", "IT"])
    assert rc2 == 0

    # 3. List users
    rc_list = main(["list-users"])
    assert rc_list == 0
    list_out = capsys.readouterr().out
    assert "cli_ppic" in list_out
    assert "cli_it" in list_out
    assert "PPIC" in list_out
    assert "IT" in list_out


def test_cli_create_user_duplicate_fails(isolate_auth_service, monkeypatch, capsys):
    monkeypatch.setattr("getpass.getpass", lambda prompt="": "SecretPass123!")
    main(["create-user", "--username", "dup_user", "--role", "PPIC"])
    rc_dup = main(["create-user", "--username", "dup_user", "--role", "IT"])
    assert rc_dup == 1
    err = capsys.readouterr().err
    assert "sudah terdaftar" in err


def test_cli_create_user_short_password_fails(isolate_auth_service, monkeypatch, capsys):
    monkeypatch.setattr("getpass.getpass", lambda prompt="": "short")
    rc = main(["create-user", "--username", "short_pw_user", "--role", "PPIC"])
    assert rc == 1
    err = capsys.readouterr().err
    assert "minimal harus 8 karakter" in err


def test_cli_set_password_and_revoke_sessions(isolate_auth_service, monkeypatch, capsys):
    # Create user and authenticate
    monkeypatch.setattr("getpass.getpass", lambda prompt="": "OldPass123!")
    main(["create-user", "--username", "pw_user", "--role", "PPIC"])
    session, _ = auth_service.authenticate("pw_user", "OldPass123!", "127.0.0.1")
    assert session is not None
    assert auth_service.validate_session(session.session_id) is not None

    # Change password via CLI
    monkeypatch.setattr("getpass.getpass", lambda prompt="": "NewPass456!")
    rc = main(["set-password", "--username", "pw_user"])
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


def test_cli_deactivate_and_activate_user(isolate_auth_service, monkeypatch, capsys):
    monkeypatch.setattr("getpass.getpass", lambda prompt="": "TogglePass123!")
    main(["create-user", "--username", "toggle_user", "--role", "IT"])
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


def test_cli_nonexistent_user_returns_error(isolate_auth_service, monkeypatch, capsys):
    monkeypatch.setattr("getpass.getpass", lambda prompt="": "Pass1234!")
    assert main(["set-password", "--username", "ghost"]) == 1
    assert main(["deactivate-user", "--username", "ghost"]) == 1
    assert main(["activate-user", "--username", "ghost"]) == 1
