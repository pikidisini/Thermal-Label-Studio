import asyncio
import base64
import importlib.util
import os
from pathlib import Path
import sys

import httpx
import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SERVER = Path(__file__).resolve().parents[1] / 'design_server.py'
spec = importlib.util.spec_from_file_location('design_server', SERVER)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@pytest.mark.parametrize('url', ['https://127.0.0.1:8000', 'http://example.com:8000',
    'http://127.0.0.1', 'http://user:password@127.0.0.1:8000', 'http://127.0.0.1:8000/api',
    'http://127.0.0.1:8000?x=1'])
def test_target_restriction(url):
    with pytest.raises(ValueError):
        module.DesignClient(url)


def test_api_routing_preview_image_and_save_preflight():
    calls = []
    def handler(request):
        calls.append((request.method, request.url.path))
        if request.url.path.endswith('editor-preview'):
            return httpx.Response(200, json={'png_base64': base64.b64encode(b'png-fixture').decode()})
        return httpx.Response(200, json={'valid': True})
    client = module.DesignClient('http://127.0.0.1:8000', allow_save=True,
                                 transport=httpx.MockTransport(handler))
    async def check():
        server = module.create_server(client)
        await server.call_tool('preview_design', dict(svg='svg', width_mm=100, height_mm=70, data={}))
        await server.call_tool('save_template', dict(label_code='AI_LABEL', title='Label',
                               svg='svg', width_mm=100, height_mm=70, data={}))
    asyncio.run(check())
    assert calls == [('POST', '/api/v1/simulation/editor-preview'),
                     ('POST', '/api/v1/simulation/editor-preview'), ('POST', '/api/v1/layouts')]
    client.http.close()


def test_failed_preflight_never_saves_and_errors_are_sanitized():
    calls = []
    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(422, json={'detail': {'code': 'missing_field', 'svg': 'private-content'}})
    client = module.DesignClient('http://127.0.0.1:8000', allow_save=True,
                                 transport=httpx.MockTransport(handler))
    async def check():
        with pytest.raises(Exception) as failure:
            await module.create_server(client).call_tool('save_template', dict(label_code='AI',
                title='Label', svg='svg', width_mm=100, height_mm=70, data={}))
        assert 'missing_field' in str(failure.value)
        assert 'private-content' not in str(failure.value)
    asyncio.run(check())
    assert calls == ['/api/v1/simulation/editor-preview']
    client.http.close()


def test_uncertain_save_is_not_retried():
    calls = []
    def handler(request):
        calls.append(request.url.path)
        raise httpx.ReadTimeout('private-network-detail', request=request)
    client = module.DesignClient('http://127.0.0.1:8000', allow_save=True,
                                 transport=httpx.MockTransport(handler))
    with pytest.raises(ValueError, match='outcome uncertain') as failure:
        client.request('POST', 'layouts', {})
    assert 'private-network-detail' not in str(failure.value)
    assert calls == ['/api/v1/layouts']
    client.http.close()


def test_redirects_and_oversized_responses_are_rejected(monkeypatch):
    responses = iter([httpx.Response(302, headers={'location': 'http://example.com'}),
                      httpx.Response(200, content=b'x' * 33)])
    client = module.DesignClient('http://127.0.0.1:8000',
        transport=httpx.MockTransport(lambda request: next(responses)))
    with pytest.raises(ValueError, match='HTTP 302'):
        client.request('GET', 'layouts')
    monkeypatch.setattr(module, 'MAX_RESPONSE', 32)
    with pytest.raises(ValueError, match='exceeds the limit'):
        client.request('GET', 'layouts')
    client.http.close()


@pytest.mark.parametrize('save', [False, True])
def test_stdio_discovery_contract_and_no_save_by_default(save):
    async def check():
        params = StdioServerParameters(command=sys.executable, args=['-B', str(SERVER)],
            env={**os.environ, 'TLS_MCP_DESIGN_URL': 'http://127.0.0.1:1',
                 'TLS_MCP_DESIGN_ALLOW_SAVE': str(save).lower()})
        async with stdio_client(params) as (reader, writer):
            async with ClientSession(reader, writer) as session:
                await session.initialize()
                names = {tool.name for tool in (await session.list_tools()).tools}
                assert ('save_template' in names) == save
                assert names - {'save_template'} == {'get_design_contract', 'list_templates',
                    'get_template', 'list_template_versions', 'validate_design', 'preview_design'}
                contract = await session.call_tool('get_design_contract', {})
                assert not contract.isError
                assert 'viewBox' in str(contract)
                failure = await session.call_tool('list_templates', {})
                assert failure.isError
    asyncio.run(check())
