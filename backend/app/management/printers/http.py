from fastapi import APIRouter, Request
from ..access import require_store
from ..presentation import public_document
from .models import TargetCommand
from ..models import Command
from .service import upsert_target, delete_target
router = APIRouter()

@router.put('/printers')
def save_target(command: TargetCommand, request: Request):
    return public_document(require_store(request).change(command.revision, 'printer.upsert', command.target.target_id,
        command.note, lambda document: upsert_target(document, command.target)))



@router.delete('/printers/{target_id}')
def remove_target(target_id: str, command: Command, request: Request):
    return public_document(require_store(request).change(command.revision, 'printer.delete', target_id,
        command.note, lambda document: delete_target(document, target_id)))
