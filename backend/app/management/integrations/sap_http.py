"""Persist SAP settings; separate local sample testing from explicit native RFC calls."""
import base64
import secrets
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import Field, SecretStr, field_validator
from app.sap_rfc.models import Connection, Operation
from app.sap_rfc.contract import ContractError, MissingInputError, StatusError, prepare, process_response
from ..access import require_store
from ..models import Command
from ..errors import ManagementError
from ..presentation import public_document
from .key_encryption import cipher
from app.sap_rfc import runtime as rfc_runtime

router = APIRouter()

class ConnectionCommand(Command):
    connection: Connection
    password: SecretStr | None = Field(default=None, exclude=True)

    @field_validator('connection', mode='before')
    @classmethod
    def no_ciphertext(cls, value):
        if isinstance(value, dict) and 'password_ciphertext' in value:
            raise ValueError('Passwords must use the password field.')
        return value

    @field_validator('password')
    @classmethod
    def password_length(cls, value):
        if value is not None and not 1 <= len(value.get_secret_value()) <= 256:
            raise ValueError('Invalid password length.')
        return value

class OperationCommand(Command):
    operation: Operation

class ExecutionCommand(Command):
    values: dict = Field(default_factory=dict, max_length=32)

class SampleCommand(Command):
    values: dict = Field(default_factory=dict, max_length=32)
    response: dict


def current(request, revision):
    document = require_store(request).read()
    if document.policy.revision != revision:
        raise ManagementError('management_conflict', 409)
    return document


def find_operation(document, identity):
    result = next((o for o in document.sap_rfc.operations if o.operation_id == identity), None)
    if result is None: raise ManagementError('sap_operation_not_found', 404)
    return result


@router.put('/sap-connections')
def save_connection(command: ConnectionCommand, request: Request):
    def update(document):
        values = list(document.sap_rfc.connections)
        old = next((c for c in values if c.connection_id == command.connection.connection_id), None)
        encrypted = old.password_ciphertext if old else None
        if command.password is not None:
            nonce = secrets.token_bytes(12)
            aad = ('thermal-label-studio/sap-password/v1/' + command.connection.connection_id).encode('utf-8')
            encrypted = 'v1.' + base64.urlsafe_b64encode(nonce + cipher().encrypt(nonce, command.password.get_secret_value().encode('utf-8'), aad)).decode('ascii')
        item = command.connection.model_copy(update={'password_ciphertext': encrypted})
        document.sap_rfc.connections = [c for c in values if c.connection_id != item.connection_id] + [item]
    return public_document(require_store(request).change(command.revision, 'sap.connection.upsert', command.connection.connection_id, '', update))


@router.delete('/sap-connections/{identity}')
def remove_connection(identity: str, command: Command, request: Request):
    def update(document):
        if not any(c.connection_id == identity for c in document.sap_rfc.connections):
            raise ManagementError('sap_connection_not_found', 404)
        if any(o.connection_id == identity for o in document.sap_rfc.operations):
            raise ManagementError('sap_connection_in_use', 422)
        document.sap_rfc.connections = [c for c in document.sap_rfc.connections if c.connection_id != identity]
    return public_document(require_store(request).change(command.revision, 'sap.connection.delete', identity, '', update))


@router.put('/sap-operations')
def save_operation(command: OperationCommand, request: Request):
    def update(document):
        if not any(c.connection_id == command.operation.connection_id for c in document.sap_rfc.connections):
            raise ManagementError('sap_connection_not_found', 422)
        document.sap_rfc.operations = [o for o in document.sap_rfc.operations if o.operation_id != command.operation.operation_id] + [command.operation]
    return public_document(require_store(request).change(command.revision, 'sap.operation.upsert', command.operation.operation_id, '', update))


@router.delete('/sap-operations/{identity}')
def remove_operation(identity: str, command: Command, request: Request):
    def update(document):
        find_operation(document, identity)
        document.sap_rfc.operations = [o for o in document.sap_rfc.operations if o.operation_id != identity]
    return public_document(require_store(request).change(command.revision, 'sap.operation.delete', identity, '', update))


@router.post('/sap-operations/{identity}/sample')
def sample(identity: str, command: SampleCommand, request: Request):
    operation = find_operation(current(request, command.revision), identity)
    try:
        parameters = prepare(operation, command.values)
    except MissingInputError:
        raise ManagementError('sap_input_required', 422) from None
    except ContractError:
        raise ManagementError('sap_input_invalid', 422) from None
    try:
        result = process_response(operation, command.response)
    except StatusError:
        raise ManagementError('sap_status_failed', 422) from None
    except ContractError:
        raise ManagementError('sap_response_invalid', 422) from None
    return JSONResponse({'evidence': 'synthetic', 'sap_contacted': False,
        'function_name': operation.function_name, 'parameters': parameters, **result}, headers={'Cache-Control': 'no-store'})


@router.get('/sap-operations')
def operation_catalog(request: Request):
    document = require_store(request).read()
    connections = {c.connection_id: c for c in document.sap_rfc.connections}
    return {'revision': document.policy.revision, 'runtime_available': rfc_runtime.available(),
        'operations': [{'operation_id': o.operation_id, 'name': o.name, 'enabled': o.enabled and connections[o.connection_id].enabled, 'response_mode': o.response_mode,
            'parameters': [p.model_dump(exclude={'constant'}) for p in o.parameters if p.source == 'operator']}
            for o in document.sap_rfc.operations]}


@router.post('/sap-operations/{identity}/execute')
def execute(identity: str, command: ExecutionCommand, request: Request):
    return JSONResponse(execute_operation(identity, command.revision, command.values, request), headers={'Cache-Control': 'no-store'})


def execute_operation(identity: str, revision: str, values: dict, request: Request, *, on_stage=None):
    document = current(request, revision)
    operation = find_operation(document, identity)
    if not rfc_runtime.available(): raise ManagementError('sap_runtime_unavailable', 503)
    connection = next(c for c in document.sap_rfc.connections if c.connection_id == operation.connection_id)
    if not operation.enabled or not connection.enabled:
        raise ManagementError('sap_configuration_disabled', 422)
    try:
        parameters = prepare(operation, values)
    except MissingInputError:
        raise ManagementError('sap_input_required', 422) from None
    except ContractError:
        raise ManagementError('sap_input_invalid', 422) from None
    if not connection.password_ciphertext:
        raise ManagementError('sap_password_required', 422)
    try:
        encoded = connection.password_ciphertext
        if not encoded.startswith('v1.'): raise ValueError()
        encrypted = base64.b64decode(encoded[3:], altchars=b'-_', validate=True)
        aad = ('thermal-label-studio/sap-password/v1/' + connection.connection_id).encode('utf-8')
        password = cipher().decrypt(encrypted[:12], encrypted[12:], aad).decode('utf-8')
    except ManagementError:
        raise
    except Exception:
        raise ManagementError('key_decryption_failed', 503) from None
    try:
        response = rfc_runtime.call(connection, operation, parameters, password)
    except rfc_runtime.RfcError as exc:
        status = {'sap_execution_not_allowed': 403, 'sap_logon_failed': 422}.get(exc.code, 503)
        raise ManagementError(exc.code, status) from None
    finally:
        password = None
    if on_stage is not None:
        on_stage('FETCHED')
    # Configuration changes during the call invalidate its result, without retry.
    current(request, revision)
    try:
        result = process_response(operation, response['result'], limit=4 * 1024 * 1024)
    except StatusError:
        raise ManagementError('sap_status_failed', 422) from None
    except ContractError:
        raise ManagementError('sap_response_invalid', 422) from None
    return {'evidence': 'sap', 'sap_contacted': True,
        'function_name': operation.function_name, 'parameters': parameters,
        'target': {'host': connection.host, 'client': connection.client, 'system_id': response.get('system_id', '')},
        'response': response['result'], **result}
