"""Pure SVG design admission for external authoring clients, including MCP."""
from fastapi import APIRouter, HTTPException

from app.engine.editor_request import EditorDraft
from app.template_binding import admit_template, TemplateAdmissionError

router = APIRouter()


@router.post('/design/validate', responses={422: {'description': 'Unprocessable Content'}})
def validate_design(draft: EditorDraft) -> dict:
    try:
        manifest = admit_template(draft.svg)
        if (manifest.width_mm != draft.width_mm or manifest.height_mm != draft.height_mm
                or manifest.view_box != (0, 0, draft.width_mm * 4, draft.height_mm * 4)):
            raise TemplateAdmissionError('invalid_media')
    except TemplateAdmissionError as exc:
        raise HTTPException(status_code=422, detail={'code': exc.code}) from None
    return {'valid': True, 'binding_version': manifest.binding_version,
            'template_sha256': manifest.svg_sha256,
            'required_keys': list(manifest.required_keys), 'node_count': manifest.node_count}
