"""Failed-image cleanup never removes accepted or unrelated image tags."""
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import ci_build


def test_sap_runtime_rejects_changed_base_image_before_build(monkeypatch, tmp_path):
    config = tmp_path / 'runtime.json'
    config.write_text(json.dumps({'base_image': 'thermal-label-sap-base:private',
                                  'base_image_id': 'sha256:' + 'a' * 64}))
    monkeypatch.setattr(ci_build, 'run', lambda args: json.dumps([{
        'Id': 'sha256:' + 'b' * 64, 'Config': {'Labels': {
            'io.thermal-label.sap-runtime': '750.12-hf1-pyrfc3.3.1-py312'}}}]).encode())
    with pytest.raises(ValueError, match='identity changed'):
        ci_build.sap_runtime_base(config)


def test_sap_runtime_is_optional_and_requires_identified_private_image(monkeypatch, tmp_path):
    config = tmp_path / 'runtime.json'
    assert ci_build.sap_runtime_base(config) == ([], None)
    identity = 'sha256:' + 'a' * 64
    config.write_text(json.dumps({'base_image': 'thermal-label-sap-base:private',
                                  'base_image_id': identity}))
    metadata = {'Id': identity, 'Config': {'Labels': {}}}
    monkeypatch.setattr(ci_build, 'run', lambda args: json.dumps([metadata]).encode())
    with pytest.raises(ValueError, match='Unrecognized'):
        ci_build.sap_runtime_base(config)
    metadata['Config']['Labels']['io.thermal-label.sap-runtime'] = '750.12-hf1-pyrfc3.3.1-py312'
    assert ci_build.sap_runtime_base(config) == (
        ['--build-arg', 'APPLICATION_BASE_IMAGE=thermal-label-sap-base:private'], identity)


@pytest.mark.parametrize(('accepted', 'owned', 'remove'), [
    (False, True, True), (True, True, False), (False, False, False),
])
def test_cleanup_removes_only_failed_owned_candidate_without_force(monkeypatch, accepted, owned, remove):
    parent = ROOT / '.tmp'
    parent.mkdir(exist_ok=True)
    sha = 'a' * 40
    tag = 'thermal-label-studio:git-' + sha
    calls = []
    labels = {'io.thermal-label.ci.release': 'true', 'org.opencontainers.image.revision': sha} if owned else {}

    def process(args, **kwargs):
        calls.append(args)
        return SimpleNamespace(returncode=0, stdout=json.dumps([{'Config': {'Labels': labels}}]).encode())

    with tempfile.TemporaryDirectory(prefix='ci-cleanup-test-', dir=parent) as temporary:
        workspace = Path(temporary)
        reports = workspace / '.tmp' / 'ci-test'
        reports.mkdir(parents=True)
        if accepted:
            (reports / 'candidate.json').write_text(json.dumps({'status': 'PASS'}))
        monkeypatch.setattr(ci_build, 'ROOT', workspace)
        monkeypatch.setattr(ci_build, 'REPORTS', reports)
        monkeypatch.setenv('THERMAL_CI_BUILD_ID', 'synthetic-build')
        monkeypatch.setattr(ci_build, 'run', lambda args: b'')
        monkeypatch.setattr(ci_build.subprocess, 'run', process)
        ci_build.clean(sha)
        assert (['docker', 'image', 'rm', tag] in calls) is remove
        assert not reports.exists()
        assert all('-f' not in args for args in calls)
