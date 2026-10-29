"""Coverage must build fresh browser assets, independent of backend gate order."""
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from check_project import source_checks
from check_coverage import frontend_preparation


def test_coverage_runs_typecheck_then_fresh_frontend_build():
    checks = source_checks()
    steps = frontend_preparation(list(reversed(checks)))
    assert [name for name, _, _ in steps] == ['frontend_typecheck', 'frontend_build']
    assert all(cwd == ROOT / 'frontend' for _, _, cwd in steps)
    assert 'tsc' in ' '.join(steps[0][1])
    assert steps[1][1][-2:] == ('run', 'build')
    assert not any('pytest' in ' '.join(command) for _, command, _ in steps)


def test_missing_build_prerequisite_fails_before_tests_use_stale_assets():
    checks = [c for c in source_checks() if c.name != 'frontend_build']
    with pytest.raises(KeyError, match='frontend_build'):
        frontend_preparation(checks)
