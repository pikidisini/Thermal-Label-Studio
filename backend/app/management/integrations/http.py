import secrets
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from ..access import require_store
from ..presentation import public_document
from ..errors import ManagementError
from .models import SourceCommand, KeyCommand
from ..models import Command
from .service import upsert_source, change_key, delete_source
from .key_encryption import reveal
router = APIRouter()

@router.put('/sources')
def save_source(command: SourceCommand, request: Request):
    if command.create_key:
        raw_key = secrets.token_urlsafe(32)
        def create(document):
            if any(item.identity == command.source.identity for item in document.policy.sources):
                raise ManagementError('source_exists', 422)
            upsert_source(document, command.source.model_copy(update={'enabled': False}))
            change_key(document, command.source.identity, 'create', raw_key)
            upsert_source(document, command.source)
        document = require_store(request).change(command.revision, 'source.create_with_key',
            command.source.identity, command.note, create)
        return JSONResponse(content={'document': public_document(document), 'key': raw_key,
            'source': command.source.identity}, headers={'Cache-Control': 'no-store'})
    document = require_store(request).change(command.revision, 'source.upsert', command.source.identity,
        command.note, lambda document: upsert_source(document, command.source))
    return public_document(document)


@router.post('/sources/{identity}/key')
def manage_key(identity: str, command: KeyCommand, request: Request):
    store = require_store(request)
    if command.action == 'reveal':
        document = store.read()
        if document.policy.revision != command.revision:
            raise ManagementError('management_conflict', 409)
        source = next((item for item in document.policy.sources if item.identity == identity), None)
        if source is None or source.deleted:
            raise ManagementError('source_not_found', 404)
        return JSONResponse(content={'document': public_document(document), 'key': reveal(source),
            'source': identity}, headers={'Cache-Control': 'no-store'})
    raw_key = secrets.token_urlsafe(32) if command.action in ('create', 'rotate') else None
    document = store.change(command.revision, 'source.key.' + command.action, identity, '',
                            lambda state: change_key(state, identity, command.action, raw_key))
    # Only return the new secret after state AND audit have committed with acknowledgement.
    return JSONResponse(content={'document': public_document(document), 'key': raw_key,
                                 'source': identity}, headers={'Cache-Control': 'no-store'})


@router.delete('/sources/{identity}')
def remove_source(identity: str, command: Command, request: Request):
    document = require_store(request).change(command.revision, 'source.delete', identity,
        command.note, lambda state: delete_source(state, identity))
    return public_document(document)
