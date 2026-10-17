import asyncio
from pathlib import Path
import sys

import pytest
from mcp import types

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sonar_bridge


def test_explicit_ten_tool_allowlist_is_stable():
    assert len(sonar_bridge.ALLOWED_TOOLS) == 10
    assert "get_project_quality_gate_status" in sonar_bridge.ALLOWED_TOOLS


def test_settings_rejects_unapproved_configuration(monkeypatch):
    with pytest.raises(ValueError, match="not approved"):
        sonar_bridge._settings({"SONARQUBE_TOKEN": "fixture-token", "SONARQUBE_URL": "http://unapproved.example", "SONARQUBE_READ_ONLY": "true"})


def test_settings_require_values_from_the_credential_file():
    with pytest.raises(ValueError, match="credentials"):
        sonar_bridge._settings({"SONARQUBE_URL": "http://host.docker.internal:9004", "SONARQUBE_READ_ONLY": "true"})


def test_unknown_or_write_tool_is_rejected_without_upstream_call():
    upstream = sonar_bridge.Upstream("secret-must-not-appear")

    async def forbidden():
        pytest.fail("unknown tool reached the upstream server")

    upstream.session = forbidden
    result = asyncio.run(upstream.call("change_issue_status", {}))
    assert result.isError
    assert "secret-must-not-appear" not in str(result)
    assert "not permitted" in result.content[0].text


def test_upstream_exception_is_sanitized(monkeypatch):
    upstream = sonar_bridge.Upstream("secret-must-not-appear")

    async def broken():
        raise RuntimeError("secret-must-not-appear")

    monkeypatch.setattr(upstream, "session", broken)
    result = asyncio.run(upstream.call("show_rule", {}))
    assert result.isError and result.content[0].text == sonar_bridge.SAFE_ERROR
    assert "secret-must-not-appear" not in str(result)


def test_discovery_filters_non_allowlisted_upstream_tools(monkeypatch):
    tools = sonar_bridge.filter_tools([
        types.Tool(name="show_rule", description="read", inputSchema={}),
        types.Tool(name="change_issue_status", description="write", inputSchema={}),
    ])
    assert [tool.name for tool in tools] == ["show_rule"]
