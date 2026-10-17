"""Authenticated loopback HTTP service with a durable no-replay print ledger."""
import argparse
from contextlib import closing
import base64
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
import ipaddress
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
from urllib.parse import urlsplit
from uuid import UUID

from .transport import BeforeSendError, submit

MAX_BODY = 18 * 1024 * 1024
TOKENS = {'STX': 2, 'ETX': 3, 'ESC': 27, 'DEL': 127, 'CAN': 24, 'RS': 30, 'US': 31, 'ETB': 23}


class AgentError(ValueError):
    def __init__(self, code, status=422):
        self.code, self.status = code, status


def wire_payload(item):
    if not isinstance(item, dict) or set(item) != {'payload_base64', 'sha256'}:
        raise AgentError('invalid_payload')
    try:
        payload = base64.b64decode(item['payload_base64'], validate=True)
        if not 1 <= len(payload) <= 8_000_000 or hashlib.sha256(payload).hexdigest() != item['sha256']:
            raise ValueError()
        source = payload.decode('ascii')
        if any(not 32 <= ord(c) <= 126 and c not in '\r\n' for c in source): raise ValueError()
        if not source.startswith('<STX><ESC>C<ETX>\r\n') or not source.endswith('<STX><ETB><ETX>\r\n'):
            raise ValueError()
        if len(re.findall(r'<STX><RS>(?:[1-9][0-9]{0,2})<ETX>', source)) != 1:
            raise ValueError()
        for name, number in TOKENS.items():
            source = source.replace('<' + name + '>', chr(number))
        if '<' in source or '>' in source: raise ValueError()
        return source.encode('ascii')
    except (ValueError, TypeError, UnicodeError):
        raise AgentError('invalid_payload') from None


def configuration(value):
    if not isinstance(value, dict) or set(value) != {'allowed_origins', 'printers'}:
        raise ValueError('Invalid agent configuration.')
    if not isinstance(value['allowed_origins'], list) or not value['allowed_origins']:
        raise ValueError('Explicit web origins are required.')
    for origin in value['allowed_origins']:
        url = urlsplit(origin)
        if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password or url.path or url.query or url.fragment:
            raise ValueError('Invalid web origin.')
    printers = value['printers']
    if not isinstance(printers, list) or len(printers) > 100: raise ValueError('Invalid printers.')
    ids = set()
    for printer in printers:
        if printer.get('language') != 'IPL' or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', printer.get('target_id', '')) or printer['target_id'] in ids:
            raise ValueError('Invalid printer identity/language.')
        ids.add(printer['target_id'])
        if printer.get('connection') == 'Ethernet':
            if set(printer) != {'target_id', 'language', 'connection', 'host', 'port'}: raise ValueError('Invalid Ethernet printer.')
            address = ipaddress.ip_address(printer['host'])
            if address.is_unspecified or address.is_multicast or type(printer['port']) is not int or not 1 <= printer['port'] <= 65535:
                raise ValueError('Invalid Ethernet address.')
        elif printer.get('connection') == 'USB':
            if set(printer) != {'target_id', 'language', 'connection', 'queue'} or not isinstance(printer['queue'], str) or not 1 <= len(printer['queue']) <= 256 or any(ord(c) < 32 for c in printer['queue']):
                raise ValueError('Invalid Windows queue.')
        else:
            raise ValueError('Unsupported connection.')
    return value


class Agent:
    def __init__(self, config, database, *, transport=submit):
        self.config = configuration(config)
        self.database, self.transport = str(database), transport
        self.lock = threading.Lock()
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, result TEXT NOT NULL)')
            # A crash never makes an in-flight job safe to replay.
            for identity, raw in db.execute('SELECT id, result FROM jobs').fetchall():
                result = json.loads(raw)
                if result['status'] == 'RUNNING':
                    result['status'] = 'UNCERTAIN'
                    db.execute('UPDATE jobs SET result=? WHERE id=?', (json.dumps(result), identity))

    def catalog(self):
        return {'protocol': 1, 'printers': self.config['printers'], 'status': 'READY', 'confirmed': False}

    def job(self, body):
        if not isinstance(body, dict) or set(body) != {'job_id', 'target_id', 'language', 'items'} or body['language'] != 'IPL':
            raise AgentError('invalid_job')
        try:
            if str(UUID(body['job_id'])) != body['job_id']: raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise AgentError('invalid_job') from None
        printer = next((p for p in self.config['printers'] if p['target_id'] == body['target_id']), None)
        if printer is None: raise AgentError('printer_not_registered')
        if not isinstance(body['items'], list) or not 1 <= len(body['items']) <= 100: raise AgentError('invalid_job')
        payloads = [wire_payload(item) for item in body['items']]
        if sum(map(len, payloads)) > 12 * 1024 * 1024: raise AgentError('job_too_large', 413)
        if not self.lock.acquire(blocking=False): raise AgentError('agent_busy', 409)
        try:
            result = {'job_id': body['job_id'], 'target_id': body['target_id'], 'status': 'RUNNING', 'confirmed': False, 'items': []}
            with closing(sqlite3.connect(self.database)) as db, db:
                try:
                    db.execute('INSERT INTO jobs VALUES (?, ?)', (body['job_id'], json.dumps(result)))
                except sqlite3.IntegrityError:
                    raise AgentError('job_already_exists', 409) from None
            stopped = False
            for index, payload in enumerate(payloads):
                status = 'NOT_ATTEMPTED'
                if not stopped:
                    try:
                        self.transport(printer, payload)
                        status = 'SUBMITTED'
                    except BeforeSendError:
                        status, stopped = 'FAILED_BEFORE_SEND', True
                    except Exception:
                        status, stopped = 'UNCERTAIN', True
                result['items'].append({'index': index, 'status': status})
                with closing(sqlite3.connect(self.database)) as db, db:
                    db.execute('UPDATE jobs SET result=? WHERE id=?', (json.dumps(result), body['job_id']))
            result['status'] = 'SUBMITTED' if not stopped else 'STOPPED'
            with closing(sqlite3.connect(self.database)) as db, db:
                db.execute('UPDATE jobs SET result=? WHERE id=?', (json.dumps(result), body['job_id']))
            return result
        finally:
            self.lock.release()

    def get_job(self, identity):
        try:
            if str(UUID(identity)) != identity: raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise AgentError('invalid_job') from None
        with closing(sqlite3.connect(self.database)) as db, db:
            row = db.execute('SELECT result FROM jobs WHERE id=?', (identity,)).fetchone()
        if row is None: raise AgentError('job_not_found', 404)
        return json.loads(row[0])


def handler_for(agent, token):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'TLSLocalAgent/1'
        def log_message(self, *args):
            pass  # Do not log tokens, payloads, queue names or batch data.

        def allowed(self):
            return (self.client_address[0] == '127.0.0.1'
                    and self.headers.get('Host') == '127.0.0.1:' + str(self.server.server_port)
                    and self.headers.get('Origin') in agent.config['allowed_origins'])

        def answer(self, status, body):
            data = json.dumps(body).encode('utf-8')
            self.send_response(status)
            if self.allowed():
                self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
                self.send_header('Vary', 'Origin')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self):
            if not self.allowed(): return self.answer(403, {'code': 'origin_denied'})
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
            self.send_header('Vary', 'Origin')
            self.end_headers()

        def authorized(self):
            return self.allowed() and hmac.compare_digest(self.headers.get('Authorization', '').encode('utf-8'), ('Bearer ' + token).encode('ascii'))

        def do_GET(self):
            if not self.authorized(): return self.answer(403, {'code': 'agent_access_denied'})
            if self.path == '/v1/status': return self.answer(200, agent.catalog())
            if self.path.startswith('/v1/jobs/'):
                try:
                    return self.answer(200, agent.get_job(self.path.removeprefix('/v1/jobs/')))
                except AgentError as exc:
                    return self.answer(exc.status, {'code': exc.code})
            self.answer(404, {'code': 'not_found'})

        def do_POST(self):
            if not self.authorized(): return self.answer(403, {'code': 'agent_access_denied'})
            if self.path != '/v1/jobs': return self.answer(404, {'code': 'not_found'})
            try:
                if self.headers.get('Content-Type') != 'application/json' or self.headers.get('Transfer-Encoding'):
                    raise AgentError('invalid_media', 415)
                length = int(self.headers.get('Content-Length', '0'))
                if not 1 <= length <= MAX_BODY: raise AgentError('job_too_large', 413)
                self.connection.settimeout(10)
                data = self.rfile.read(length)
                if len(data) != length: raise AgentError('invalid_job')
                def unique(pairs):
                    result = {}
                    for key, value in pairs:
                        if key in result: raise ValueError()
                        result[key] = value
                    return result
                body = json.loads(data, object_pairs_hook=unique)
                self.answer(200, agent.job(body))
            except AgentError as exc:
                self.answer(exc.status, {'code': exc.code})
            except (ValueError, TypeError, KeyError):
                self.answer(422, {'code': 'invalid_job'})
            except Exception:
                self.answer(503, {'code': 'agent_result_uncertain'})
    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--database', type=Path, required=True)
    args = parser.parse_args()
    token = os.environ.get('TLS_AGENT_TOKEN', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{32,128}', token):
        raise SystemExit('Set TLS_AGENT_TOKEN to a random 32-128 character URL-safe secret.')
    # Reserve the loopback listener before recovering the ledger. A second
    # instance must fail before touching an active agent's RUNNING records.
    server = HTTPServer(('127.0.0.1', 18191), BaseHTTPRequestHandler)
    try:
        agent = Agent(json.loads(args.config.read_text(encoding='utf-8')), args.database)
        server.RequestHandlerClass = handler_for(agent, token)
    except Exception:
        server.server_close()
        raise
    server.timeout = 10
    print('Local print agent listening on 127.0.0.1:18191. No printer probe was made.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
