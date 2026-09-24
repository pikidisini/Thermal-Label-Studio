"""Unit and integration tests for AuthService, password security, and SqliteAuthRepository."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
import time
import pytest

from app.auth.models import Role, User, Session
from app.auth.repository import SqliteAuthRepository
from app.auth.security import (
    generate_secure_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.auth.service import (
    AuthService,
    DEFAULT_SESSION_TTL_SECONDS,
    LOCKOUT_DURATION_SECONDS,
    MAX_LOGIN_FAILURES,
)


class TestSecurityUtilities:
    """Tests cryptographic primitives and security helpers."""

    def test_password_hashing_and_verification(self):
        raw_pw = "SuperSecret123!"
        hashed = hash_password(raw_pw)

        assert hashed != raw_pw
        assert hashed.startswith("pbkdf2_sha256$600000$")
        assert verify_password(raw_pw, hashed) is True
        assert verify_password("WrongPassword!", hashed) is False

    def test_hash_token_deterministic(self):
        token = "test-token-123456"
        h1 = hash_token(token)
        h2 = hash_token(token)
        assert h1 == h2
        assert len(h1) == 64  # SHA256 hex string

    def test_generate_secure_token_randomness(self):
        t1 = generate_secure_token(32)
        t2 = generate_secure_token(32)
        assert t1 != t2
        assert len(t1) == 64  # 32 bytes in hex = 64 chars


class TestSqliteAuthRepository:
    """Tests SQLite persistence layer for users and sessions."""

    @pytest.fixture
    def repo(self, tmp_path):
        db_path = tmp_path / "test_repo.db"
        return SqliteAuthRepository(db_path)

    def test_create_and_get_user(self, repo):
        pw_hash = hash_password("Secret123!")
        user = repo.create_user("ppic_user_1", pw_hash, Role.PPIC)
        assert user.username == "ppic_user_1"
        assert user.role == Role.PPIC
        assert user.is_active is True

        fetched_by_id = repo.get_user_by_id(user.id)
        assert fetched_by_id is not None
        assert fetched_by_id.username == "ppic_user_1"

        fetched_by_name = repo.get_user_by_username("ppic_user_1")
        assert fetched_by_name is not None
        assert fetched_by_name.id == user.id

    def test_create_duplicate_username_raises(self, repo):
        pw_hash = hash_password("Secret123!")
        repo.create_user("duplicate_user", pw_hash, Role.PPIC)
        with pytest.raises(ValueError, match="already exists"):
            repo.create_user("duplicate_user", pw_hash, Role.IT)

    def test_update_user_password(self, repo):
        pw_hash1 = hash_password("OldPassword123!")
        user = repo.create_user("user_pw_change", pw_hash1, Role.PPIC)

        pw_hash2 = hash_password("NewPassword456!")
        updated = repo.update_user_password(user.id, pw_hash2)
        assert updated is True

        fetched = repo.get_user_by_id(user.id)
        assert fetched.password_hash == pw_hash2

    def test_set_user_active(self, repo):
        pw_hash = hash_password("Secret123!")
        user = repo.create_user("deactivate_user", pw_hash, Role.IT)
        assert user.is_active is True

        repo.set_user_active(user.id, False)
        fetched = repo.get_user_by_id(user.id)
        assert fetched.is_active is False

        repo.set_user_active(user.id, True)
        fetched2 = repo.get_user_by_id(user.id)
        assert fetched2.is_active is True

    def test_list_users(self, repo):
        repo.create_user("user_a", hash_password("A123!"), Role.PPIC)
        repo.create_user("user_b", hash_password("B123!"), Role.IT)
        users = repo.list_users()
        assert len(users) == 2
        usernames = [u.username for u in users]
        assert "user_a" in usernames
        assert "user_b" in usernames

    def test_session_lifecycle(self, repo):
        user = repo.create_user("session_user", hash_password("Pass123!"), Role.PPIC)
        token = "raw-session-token-xyz"
        token_hash = hash_token(token)
        now = datetime.now(timezone.utc)
        expires = now + timedelta(hours=8)

        session = Session(
            session_id=token,
            session_hash=token_hash,
            user_id=user.id,
            username=user.username,
            role=user.role,
            csrf_token="csrf-abc-123",
            created_at=now,
            expires_at=expires,
            last_activity_at=now,
        )
        repo.save_session(session)

        # Retrieve
        fetched = repo.get_session_by_hash(token_hash)
        assert fetched is not None
        assert fetched.user_id == user.id
        assert fetched.username == "session_user"
        assert fetched.role == Role.PPIC

        # Delete session
        deleted = repo.delete_session(token_hash)
        assert deleted is True
        assert repo.get_session_by_hash(token_hash) is None

    def test_delete_sessions_for_user(self, repo):
        user = repo.create_user("multi_session_user", hash_password("Pass123!"), Role.IT)
        now = datetime.now(timezone.utc)
        expires = now + timedelta(hours=8)

        for i in range(3):
            s = Session(
                session_id=f"token-{i}",
                session_hash=hash_token(f"token-{i}"),
                user_id=user.id,
                username=user.username,
                role=user.role,
                csrf_token=f"csrf-{i}",
                created_at=now,
                expires_at=expires,
                last_activity_at=now,
            )
            repo.save_session(s)

        deleted_count = repo.delete_sessions_for_user(user.id)
        assert deleted_count == 3
        assert repo.get_session_by_hash(hash_token("token-0")) is None


class TestAuthService:
    """Tests AuthService business logic, brute-force lockout, and CSRF checks."""

    @pytest.fixture
    def auth(self, tmp_path):
        db_path = tmp_path / "auth_service_test.db"
        repo = SqliteAuthRepository(db_path)
        service = AuthService(repository=repo, session_ttl_seconds=3600)
        repo.create_user("ppic_john", hash_password("ValidPassword123!"), Role.PPIC)
        repo.create_user("it_alice", hash_password("AdminPassword123!"), Role.IT)
        return service

    def test_authenticate_success(self, auth):
        session, err = auth.authenticate("ppic_john", "ValidPassword123!", "127.0.0.1")
        assert err is None
        assert session is not None
        assert session.username == "ppic_john"
        assert session.role == Role.PPIC
        assert session.csrf_token is not None

        # Validate session via token
        validated = auth.validate_session(session.session_id)
        assert validated is not None
        assert validated.user_id == session.user_id

    def test_authenticate_invalid_password(self, auth):
        session, err = auth.authenticate("ppic_john", "WrongPassword!", "127.0.0.1")
        assert session is None
        assert err == "INVALID_CREDENTIALS"

    def test_authenticate_nonexistent_user(self, auth):
        session, err = auth.authenticate("unknown_user_xyz", "SomePassword!", "127.0.0.1")
        assert session is None
        assert err == "INVALID_CREDENTIALS"

    def test_authenticate_inactive_user(self, auth):
        user = auth.repository.get_user_by_username("ppic_john")
        auth.repository.set_user_active(user.id, False)

        session, err = auth.authenticate("ppic_john", "ValidPassword123!", "127.0.0.1")
        assert session is None
        assert err == "INVALID_CREDENTIALS"

    def test_brute_force_lockout_trigger(self, auth):
        client_ip = "192.168.1.50"
        for _ in range(MAX_LOGIN_FAILURES):
            sess, err = auth.authenticate("ppic_john", "WrongPassword!", client_ip)
            assert sess is None
            assert err == "INVALID_CREDENTIALS"

        # The 6th attempt must be locked out
        sess, err = auth.authenticate("ppic_john", "ValidPassword123!", client_ip)
        assert sess is None
        assert err == "LOCKED_OUT"

    def test_logout_revokes_session(self, auth):
        session, _ = auth.authenticate("it_alice", "AdminPassword123!", "127.0.0.1")
        assert session is not None

        assert auth.validate_session(session.session_id) is not None
        auth.logout(session.session_id)
        assert auth.validate_session(session.session_id) is None

    def test_csrf_token_verification(self, auth):
        session, _ = auth.authenticate("it_alice", "AdminPassword123!", "127.0.0.1")
        assert auth.verify_csrf(session, session.csrf_token) is True
        assert auth.verify_csrf(session, "invalid-csrf-token") is False
        assert auth.verify_csrf(session, "") is False
        assert auth.verify_csrf(session, None) is False

    def test_expired_session_returns_none(self, auth):
        session, _ = auth.authenticate("ppic_john", "ValidPassword123!", "127.0.0.1")
        token_hash = hash_token(session.session_id)

        # Manually alter expires_at in repository to the past
        past = datetime.now(timezone.utc) - timedelta(seconds=10)
        with auth.repository._get_connection() as conn:
            conn.execute(
                "UPDATE auth_sessions SET expires_at = ? WHERE session_hash = ?",
                (past.isoformat(), token_hash),
            )

        # Should be expired and automatically deleted
        assert auth.validate_session(session.session_id) is None
