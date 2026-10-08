"""Real MCP handshake without database access or storage writes."""
import asyncio
import os
from pathlib import Path
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def test_stdio_handshake_and_safe_failure():
    async def check():
        env = {**os.environ, 'TLS_MCP_DB_HOST': '127.0.0.1', 'TLS_MCP_DB_PORT': '1',
               'TLS_MCP_DB_NAME': 'fixture', 'TLS_MCP_DB_USER': 'fixture',
               'TLS_MCP_DB_PASSWORD': 'secret-must-not-appear', 'TLS_MCP_DB_SCHEMA': 'label_studio'}
        params = StdioServerParameters(command=sys.executable,
            args=['-B', str(Path(__file__).resolve().parents[1] / 'server.py')], env=env)
        async with stdio_client(params) as (reader, writer):
            async with ClientSession(reader, writer) as session:
                await session.initialize()
                result = await session.list_tools()
                assert {t.name for t in result.tools} == {'list_tables', 'describe_table', 'read_table'}
                response = await session.call_tool('list_tables', {})
                assert response.isError
                assert 'secret-must-not-appear' not in str(response)
    asyncio.run(check())


def test_jenkins_stdio_handshake_and_safe_failure():
    async def check():
        env = {**os.environ, 'TLS_MCP_JENKINS_URL': 'http://127.0.0.1:1',
               'TLS_MCP_JENKINS_USER': 'fixture-reader', 'TLS_MCP_JENKINS_TOKEN': 'secret-must-not-appear',
               'TLS_MCP_JENKINS_JOBS': 'thermal-label-source-quality', 'TLS_MCP_JENKINS_ALLOW_LOGS': 'false'}
        params = StdioServerParameters(command=sys.executable,
            args=['-B', str(Path(__file__).resolve().parents[1] / 'jenkins_server.py')], env=env)
        async with stdio_client(params) as (reader, writer):
            async with ClientSession(reader, writer) as session:
                await session.initialize()
                tools = await session.list_tools()
                assert {t.name for t in tools.tools} == {'list_jobs', 'get_build_status', 'read_build_log'}
                response = await session.call_tool('list_jobs', {})
                assert response.isError
                assert 'secret-must-not-appear' not in str(response)
    asyncio.run(check())


def test_minio_stdio_handshake_and_safe_failure():
    async def check():
        env = {**os.environ, 'TLS_MCP_MINIO_ENDPOINT': '127.0.0.1:1',
               'TLS_MCP_MINIO_ACCESS_KEY': 'fixture-reader',
               'TLS_MCP_MINIO_SECRET_KEY': 'secret-must-not-appear',
               'TLS_MCP_MINIO_BUCKET': 'thermal-label-layouts', 'TLS_MCP_MINIO_SECURE': 'false'}
        params = StdioServerParameters(command=sys.executable,
            args=['-B', str(Path(__file__).resolve().parents[1] / 'minio_server.py')], env=env)
        async with stdio_client(params) as (reader, writer):
            async with ClientSession(reader, writer) as session:
                await session.initialize()
                tools = await session.list_tools()
                assert {t.name for t in tools.tools} == {'list_objects', 'stat_object', 'read_layout_svg'}
                response = await session.call_tool('list_objects', {})
                assert response.isError
                assert 'secret-must-not-appear' not in str(response)
    asyncio.run(check())
