"""Template metadata management; review workflow endpoints are retired."""
from fastapi import APIRouter, Request
import logging
from app.layouts.service import LayoutConflictError, LayoutNotFoundError
from ..access import require_store
from ..presentation import public_document
from ..errors import ManagementError
from .models import TemplateCommand
from .service import update_template_references

router = APIRouter()

@router.post('/templates/{label_code}')
def manage_template(label_code: str, command: TemplateCommand, request: Request):
    store = require_store(request)
    layouts = getattr(request.app.state, 'layout_service', None)
    if layouts is None or layouts.settings.database_url != store.database_url:
        raise ManagementError()
    if command.label_code != label_code:
        raise ManagementError('layout_changed', 409)
    moves = []
    try:
        result = public_document(store.change(command.revision, 'template.' + command.action, label_code,
            command.note, lambda document: update_template_references(document, command),
            storage_operation=lambda cursor: layouts.manage_template(cursor, label_code,
                version=command.version, checksum=command.svg_sha256, title=command.title,
                previous_title=command.previous_title,
                new_code=command.new_code, delete=command.action == 'delete', relocations=moves)))
    except LayoutNotFoundError:
        raise ManagementError('template_not_found', 404) from None
    except LayoutConflictError as exc:
        raise ManagementError('template_conflict', 409) from exc
    if moves:
        try:
            layouts.cleanup_relocated_objects(moves)
        except Exception:
            # Database commit succeeded. Preserve remaining copies for inspection;
            # never report the identity update as failed or retry it automatically.
            logging.getLogger(__name__).warning('Template object cleanup incomplete after committed identity update.')
    return result
