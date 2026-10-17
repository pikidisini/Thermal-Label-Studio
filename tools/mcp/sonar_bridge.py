"""Short-lived local STDIO bridge to the singleton loopback Sonar MCP server."""
from __future__ import annotations

import asyncio
from pathlib import Path
import sys

import httpx
from dotenv import dotenv_values
from mcp import ClientSession, types
from mcp.client.streamable_http import streamable_http_client
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server


UPSTREAM = "http://127.0.0.1:9005/mcp"
HEALTH = "http://127.0.0.1:9005/health"
ALLOWED_TOOLS = frozenset((
    "search_my_sonarqube_projects", "search_sonar_issues_in_projects",
    "get_project_quality_gate_status", "show_rule", "list_quality_gates",
    "get_component_measures", "search_files_by_coverage",
    "get_file_coverage_details", "search_metrics", "list_pull_requests",
))
SAFE_ERROR = "SonarQube inspection is temporarily unavailable."


def filter_tools(tools: list[types.Tool]) -> list[types.Tool]:
    return [tool for tool in tools if tool.name in ALLOWED_TOOLS]


def _settings(values: dict[str, str | None]) -> str:
    token = values.get("SONARQUBE_TOKEN") or ""
    if not token or token.startswith("replace-"):
        raise ValueError("SonarQube MCP credentials are unavailable.")
    if values.get("SONARQUBE_URL") != "http://host.docker.internal:9004":
        raise ValueError("SonarQube MCP endpoint is not approved.")
    if values.get("SONARQUBE_READ_ONLY") != "true":
        raise ValueError("SonarQube MCP read-only mode is required.")
    return token


def settings() -> str:
    """Read only the ignored local credential file; ambient env is not trusted."""
    return _settings(dotenv_values(Path(__file__).with_name(".env.sonar")))


class Upstream:
    def __init__(self, token: str):
        self.headers = {
            "Authorization": f"Bearer {token}",
            "SONARQUBE_TOOLSETS": "issues,quality-gates,rules,measures,coverage",
            "SONARQUBE_READ_ONLY": "true",
        }

    async def healthy(self) -> bool:
        try:
            async with httpx.AsyncClient(trust_env=False, follow_redirects=False, timeout=2.0) as client:
                response = await client.get(HEALTH)
                return response.status_code == 200
        except httpx.HTTPError:
            return False

    async def session(self):
        client = httpx.AsyncClient(headers=self.headers, trust_env=False, follow_redirects=False, timeout=15.0)
        return client, streamable_http_client(UPSTREAM, http_client=client, terminate_on_close=True)

    async def list_tools(self) -> list[types.Tool]:
        client, transport = await self.session()
        async with client, transport as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                return filter_tools((await session.list_tools()).tools)

    async def call(self, name: str, arguments: dict) -> types.CallToolResult:
        if name not in ALLOWED_TOOLS:
            return types.CallToolResult(content=[types.TextContent(type="text", text="Tool is not permitted.")], isError=True)
        try:
            client, transport = await self.session()
            async with client, transport as (read, write, _):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    allowed = {tool.name for tool in (await session.list_tools()).tools}
                    if name not in allowed:
                        return types.CallToolResult(content=[types.TextContent(type="text", text="Tool is not available.")], isError=True)
                    return await session.call_tool(name, arguments)
        except Exception:
            return types.CallToolResult(content=[types.TextContent(type="text", text=SAFE_ERROR)], isError=True)


def create_server(upstream: Upstream) -> Server:
    server = Server("thermal-label-sonar")

    @server.list_tools()
    async def list_tools() -> list[types.Tool]:
        if not await upstream.healthy():
            return []
        try:
            return await upstream.list_tools()
        except Exception:
            return []

    @server.call_tool(validate_input=True)
    async def call_tool(name: str, arguments: dict) -> types.CallToolResult:
        if not await upstream.healthy():
            return types.CallToolResult(content=[types.TextContent(type="text", text=SAFE_ERROR)], isError=True)
        return await upstream.call(name, arguments)

    return server


async def run() -> None:
    try:
        upstream = Upstream(settings())
    except ValueError as exc:
        sys.stderr.write(f"{exc}\n")
        raise SystemExit(1)
    server = create_server(upstream)
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(run())
