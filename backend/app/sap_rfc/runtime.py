"""Opt-in bounded RFC worker; target and function permissions are server-owned."""
import json
import os
from pathlib import Path
import subprocess
import threading

WORKER = Path(__file__).with_name('worker.py')
MAX_OUTPUT = 8 * 1024 * 1024
_SLOTS = threading.BoundedSemaphore(2)
ERRORS = {'sap_runtime_unavailable', 'sap_target_mismatch', 'sap_logon_failed',
          'sap_communication_failed', 'sap_function_failed', 'sap_response_invalid'}

class RfcError(RuntimeError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def available():
    return (os.environ.get('TLS_SAP_RFC_ENABLED') == 'true'
        and Path(os.environ.get('TLS_SAP_RFC_PYTHON', '')).is_file()
        and bool(os.environ.get('TLS_SAP_RFC_TARGETS'))
        and bool(os.environ.get('TLS_SAP_RFC_FUNCTIONS')))


def call(connection, operation, parameters, password):
    if not available(): raise RfcError('sap_runtime_unavailable')
    targets = {v.strip().lower() for v in os.environ['TLS_SAP_RFC_TARGETS'].split(';') if v.strip()}
    functions = {v.strip() for v in os.environ['TLS_SAP_RFC_FUNCTIONS'].split(';') if v.strip()}
    if f'{connection.host}/{connection.client}'.lower() not in targets or operation.function_name not in functions:
        raise RfcError('sap_execution_not_allowed')
    if not _SLOTS.acquire(blocking=False): raise RfcError('sap_busy')
    try:
        payload = {'connection': {'ashost': connection.host, 'sysnr': connection.system_number,
            'client': connection.client, 'user': connection.username, 'passwd': password, 'lang': connection.language},
            'function': operation.function_name, 'parameters': parameters}
        # Do not place credentials in arguments, environment, files or diagnostics.
        result = subprocess.run([os.environ['TLS_SAP_RFC_PYTHON'], '-B', str(WORKER)],
            input=json.dumps(payload).encode('utf-8'), capture_output=True, timeout=30,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
            env={key: value for key, value in os.environ.items() if key.upper() in {'PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'SAPNWRFC_HOME'}})
        if result.returncode or len(result.stdout) > MAX_OUTPUT: raise RfcError('sap_function_failed')
        response = json.loads(result.stdout)
        if type(response) is not dict: raise RfcError('sap_response_invalid')
        if 'error' in response:
            raise RfcError(response['error'] if response['error'] in ERRORS else 'sap_function_failed')
        if type(response.get('result')) is not dict: raise RfcError('sap_response_invalid')
        return response
    except subprocess.TimeoutExpired:
        raise RfcError('sap_timeout') from None
    except RfcError:
        raise
    except Exception:
        raise RfcError('sap_runtime_unavailable') from None
    finally:
        _SLOTS.release()
