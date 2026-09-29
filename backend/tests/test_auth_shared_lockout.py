from datetime import datetime, timedelta, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from app.auth.models import Role
from app.auth.repository import SqliteAuthRepository
from app.auth.security import hash_password
from app.auth.service import AuthService


def test_sqlite_lockout_is_shared_between_service_instances(tmp_path: Path):
    db = tmp_path / "auth.db"
    repo1 = SqliteAuthRepository(db)
    repo1.create_user("operator", hash_password("correct"), Role.PPIC)
    first = AuthService(repository=repo1)
    second = AuthService(repository=SqliteAuthRepository(db))
    for _ in range(4):
        assert first.authenticate("operator", "wrong", "10.0.0.1")[1] == "INVALID_CREDENTIALS"
    assert second.authenticate("operator", "wrong", "10.0.0.1")[1] == "INVALID_CREDENTIALS"
    assert first.authenticate("operator", "correct", "10.0.0.1")[1] == "LOCKED_OUT"


def test_sqlite_lockout_expiry_allows_new_window(tmp_path: Path):
    db = tmp_path / "auth.db"
    repo = SqliteAuthRepository(db)
    repo.create_user("operator", hash_password("correct"), Role.PPIC)
    service = AuthService(repository=repo)
    start = datetime.now(timezone.utc)
    for _ in range(5):
        service.authenticate("operator", "wrong", "10.0.0.2", now=start)
    assert service.authenticate("operator", "correct", "10.0.0.2", now=start)[1] == "LOCKED_OUT"
    assert service.authenticate("operator", "correct", "10.0.0.2", now=start + timedelta(seconds=301))[1] is None


def test_sqlite_failure_updates_are_atomic_across_repository_instances(tmp_path: Path):
    db = tmp_path / "auth.db"
    first = SqliteAuthRepository(db)
    second = SqliteAuthRepository(db)
    now = datetime.now(timezone.utc)
    key = "b" * 64
    repos = [first, second]
    with ThreadPoolExecutor(max_workers=10) as pool:
        list(pool.map(lambda index: repos[index % 2].record_login_failure(key, now), range(10)))
    with first._get_connection() as conn:
        row = conn.execute("SELECT failure_count, locked_until FROM auth_login_lockouts WHERE key_hash = ?", (key,)).fetchone()
    assert row["failure_count"] == 10
    assert row["locked_until"] is not None
    assert first.check_login_lockout(key, now)


def test_sqlite_lockout_db_failures_fail_closed(tmp_path: Path, monkeypatch):
    repo = SqliteAuthRepository(tmp_path / "auth.db")
    repo.create_user("operator", hash_password("correct"), Role.PPIC)
    service = AuthService(repository=repo)
    monkeypatch.setattr(repo, "check_login_lockout", lambda *_args: (_ for _ in ()).throw(RuntimeError("db down")))
    assert service.authenticate("operator", "correct", "10.0.0.3")[1] == "LOCKED_OUT"

    monkeypatch.setattr(repo, "check_login_lockout", lambda *_args: False)
    monkeypatch.setattr(repo, "record_login_failure", lambda *_args: (_ for _ in ()).throw(RuntimeError("db down")))
    assert service.authenticate("operator", "wrong", "10.0.0.3")[1] == "INVALID_CREDENTIALS"

    monkeypatch.setattr(repo, "record_login_failure", lambda *_args: None)
    monkeypatch.setattr(repo, "clear_login_lockout", lambda *_args: (_ for _ in ()).throw(RuntimeError("db down")))
    assert service.authenticate("operator", "correct", "10.0.0.3")[1] == "INVALID_CREDENTIALS"
