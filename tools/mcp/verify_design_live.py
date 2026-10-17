"""Explicit live MCP acceptance: retain one unique synthetic template in Studio storage."""
import argparse
import asyncio
import base64
import hashlib
import json
import os
from pathlib import Path
import struct
import sys
import uuid
from xml.etree import ElementTree as ET
from datetime import datetime, timezone

import httpx
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from design_server import DesignClient, ROOT


def decoded(result):
    if result.isError:
        raise RuntimeError('MCP operation failed: ' + str(result.content))
    value = result.structuredContent
    if value is None:
        value = json.loads(next(item.text for item in result.content if item.type == 'text'))
    return value['result'] if isinstance(value, dict) and set(value) == {'result'} else value


async def verify(url, output, studio_url=None, resume_run=None):
    # Reuse the sidecar's numeric loopback target validation before any request.
    target = DesignClient(url)
    target.http.close()
    code = 'MCP_TEST_' + datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_') + uuid.uuid4().hex[:8]
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="70mm" '
           'viewBox="0 0 400 280" data-binding-version="1">'
           '<rect x="8" y="8" width="384" height="264" fill="white" stroke="black" stroke-width="2"/>'
           '<text x="24" y="46" font-family="Arial" font-size="22" font-weight="bold">MCP DESIGN TEST</text>'
           '<line x1="24" y1="60" x2="376" y2="60" stroke="black"/>'
           '<text x="24" y="96" font-family="Arial" font-size="15">Synthetic acceptance label</text>'
           '<text x="24" y="128" font-family="Arial" font-size="12">' + code + '</text>'
           '<text x="24" y="166" font-family="Arial" font-size="15">100 x 70 mm / 203 dpi</text>'
           '<text x="24" y="236" font-family="Arial" font-size="13">SVG - Preview - Save - Read back</text></svg>')
    if resume_run:
        previous = ROOT / '.tmp' / resume_run
        prior_report = json.loads((previous / 'report.json').read_text(encoding='utf-8'))
        if prior_report['target'] != url:
            raise ValueError('Resume target must match the previous attempt.')
        code = prior_report['label_code']
        svg = (previous / 'design.svg').read_text(encoding='utf-8')
    output.mkdir(parents=True, exist_ok=False)
    (output / 'design.svg').write_text(svg, encoding='utf-8')
    report = {'target': url, 'label_code': code, 'synthetic': True, 'status': 'PENDING',
              'template_sha256': hashlib.sha256(svg.encode()).hexdigest(), 'steps': []}
    report_file = output / 'report.json'
    if resume_run:
        report['resume_from'] = resume_run

    def step(name):
        report['steps'].append(name)
        report_file.write_text(json.dumps(report, indent=2), encoding='utf-8')

    params = StdioServerParameters(command=sys.executable,
        args=['-B', str(Path(__file__).with_name('design_server.py'))],
        env={**os.environ, 'TLS_MCP_DESIGN_URL': url, 'TLS_MCP_DESIGN_ALLOW_SAVE': 'true'})
    try:
        with httpx.Client(trust_env=False, timeout=10) as http:
            health = http.get(url + '/health')
            health.raise_for_status()
            if studio_url:
                ui_target = DesignClient(studio_url)
                ui_target.http.close()
                assert http.get(studio_url.rstrip('/') + '/studio').status_code == 200
                report['studio_url'] = studio_url.rstrip('/') + '/studio'
        step('application_http_available')
        async with stdio_client(params) as (reader, writer):
            async with ClientSession(reader, writer) as session:
                await session.initialize()
                names = {item.name for item in (await session.list_tools()).tools}
                assert 'save_template' in names
                report['tools'] = sorted(names)
                step('stdio_discovery_with_save')
                templates = decoded(await session.call_tool('list_templates', {}))
                report['existing_template_count'] = len(templates)
                if not resume_run:
                    assert all(item['label_code'] != code for item in templates)
                step('existing_storage_read')
                contract = decoded(await session.call_tool('get_design_contract', {}))
                assert contract['save_enabled']
                draft = dict(svg=svg, width_mm=100, height_mm=70, dpi=203)
                validation = decoded(await session.call_tool('validate_design', draft))
                assert validation['template_sha256'] == report['template_sha256']
                step('draft_validated')
                preview = await session.call_tool('preview_design', {**draft, 'data': {}})
                assert not preview.isError
                png = base64.b64decode(next(item.data for item in preview.content if item.type == 'image'), validate=True)
                assert png[:8] == b'\x89PNG\r\n\x1a\n'
                report['preview_dimensions'] = list(struct.unpack('>II', png[16:24]))
                report['preview_sha256'] = hashlib.sha256(png).hexdigest()
                (output / 'preview.png').write_bytes(png)
                step('native_renderer_png_preview')
                # Exactly one save. A timeout is ambiguous and must never trigger an automatic retry.
                if resume_run:
                    existing = decoded(await session.call_tool('get_template', {'label_code': code}))
                    saved = {key: value for key, value in existing.items() if key != 'svg'}
                    step('existing_save_reconciled_without_retry')
                else:
                    step('save_attempt_started_no_automatic_retry')
                    saved = decoded(await session.call_tool('save_template', {**draft, 'data': {},
                        'label_code': code, 'title': 'MCP synthetic acceptance - ' + code}))
                report['saved'] = saved
                assert saved['version'] == 1
                step('template_saved')
                stored = decoded(await session.call_tool('get_template', {'label_code': code}))
                assert hashlib.sha256(stored['svg'].encode()).hexdigest() == saved['svg_sha256']
                assert ET.canonicalize(stored['svg'], rewrite_prefixes=True) == ET.canonicalize(svg, rewrite_prefixes=True)
                (output / 'stored.svg').write_text(stored['svg'], encoding='utf-8')
                versions = decoded(await session.call_tool('list_template_versions', {'label_code': code}))
                assert len(versions) == 1 and versions[0]['version'] == 1
                step('stored_checksum_semantic_svg_and_version_read_back')
        async with stdio_client(params) as (reader, writer):
            async with ClientSession(reader, writer) as session:
                await session.initialize()
                stored = decoded(await session.call_tool('get_template', {'label_code': code, 'version': 1}))
                assert stored['svg'] == (output / 'stored.svg').read_text(encoding='utf-8')
                assert stored['svg_sha256'] == report['saved']['svg_sha256']
                saved_preview = await session.call_tool('preview_design', {**draft, 'svg': stored['svg'], 'data': {}})
                assert not saved_preview.isError
                saved_png = base64.b64decode(next(item.data for item in saved_preview.content if item.type == 'image'))
                assert hashlib.sha256(saved_png).hexdigest() == report['preview_sha256']
                step('stored_svg_preview_pixel_identity')
                step('fresh_mcp_process_read_back')
        report['status'] = 'PASS'
    except BaseException:
        report['status'] = 'FAIL'
        raise
    finally:
        report_file.write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps({'report': str(report_file), 'status': report['status'], 'label_code': code}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True)
    parser.add_argument('--studio-url', help='Optional separate Vite origin for development UI availability.')
    parser.add_argument('--resume-run', help='Existing .tmp run child: reconcile its template without another save.')
    parser.add_argument('--allow-storage-write', action='store_true',
                        help='Confirm authorization to retain one unique synthetic active template on this target.')
    parser.add_argument('--output-name', default='design-live-' + uuid.uuid4().hex)
    args = parser.parse_args()
    if not args.allow_storage_write:
        parser.error('This live check writes a retained template; --allow-storage-write is required.')
    for name in (args.output_name, args.resume_run):
        if name is not None and (not name or Path(name).name != name or name in {'.', '..'}):
            parser.error('Run names must be one project .tmp child name.')
    asyncio.run(verify(args.url.rstrip('/'), ROOT / '.tmp' / args.output_name, args.studio_url, args.resume_run))
