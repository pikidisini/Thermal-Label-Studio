"""Single-call RFC worker. Secrets enter stdin only; never retry or commit."""
import json
import sys

MAX_INPUT = 256 * 1024
MAX_OUTPUT = 8 * 1024 * 1024


def invoke(payload):
    try:
        from pyrfc import Connection, LogonError, CommunicationError, ABAPApplicationError, ABAPRuntimeError
    except (ImportError, OSError):
        return {'error': 'sap_runtime_unavailable'}
    connection = None
    try:
        connection = Connection(**payload['connection'])
        attributes = connection.get_connection_attributes()
        if attributes.get('client') != payload['connection']['client']:
            return {'error': 'sap_target_mismatch'}
        result = connection.call(payload['function'], **payload['parameters'])
        return {'result': result, 'system_id': attributes.get('sysId', '')}
    except LogonError:
        return {'error': 'sap_logon_failed'}
    except CommunicationError:
        return {'error': 'sap_communication_failed'}
    except (ABAPApplicationError, ABAPRuntimeError):
        return {'error': 'sap_function_failed'}
    except Exception:
        return {'error': 'sap_function_failed'}
    finally:
        if connection is not None:
            try: connection.close()
            except Exception: pass


def main():
    try:
        data = sys.stdin.buffer.read(MAX_INPUT + 1)
        if len(data) > MAX_INPUT: raise ValueError()
        payload = json.loads(data)
        output = json.dumps(invoke(payload), ensure_ascii=True, allow_nan=False)
        if len(output) > MAX_OUTPUT: raise ValueError()
    except Exception:
        output = '{"error":"sap_response_invalid"}'
    sys.stdout.write(output)

if __name__ == '__main__':
    main()
