from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Body
from fastapi.responses import Response
from ..auth.dependencies import get_current_user, verify_csrf_token
from ..services.graphics_service import GraphicsService
router=APIRouter(prefix="/graphics", tags=["Graphics"], dependencies=[Depends(get_current_user)])
def _type(file: UploadFile):
    return (file.content_type or {".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp"}.get("."+file.filename.rsplit(".",1)[-1].lower(), ""))
@router.get("")
def list_graphics(): return GraphicsService.list()
@router.get("/{graphic_id}")
def get_graphic(graphic_id: str):
    try: return GraphicsService.embedded(graphic_id)
    except KeyError as exc: raise HTTPException(404, str(exc)) from exc
@router.get("/{graphic_id}/content")
def graphic_content(graphic_id: str):
    try:
        import base64
        item=GraphicsService.get(graphic_id)
        return Response(base64.b64decode(item["payload"]), media_type=item["content_type"])
    except KeyError as exc: raise HTTPException(404, str(exc)) from exc
@router.post("", dependencies=[Depends(verify_csrf_token)])
async def upload_graphic(name: str=Form(...), file: UploadFile=File(...)):
    try: return GraphicsService.add(name, await file.read(), _type(file))
    except ValueError as exc: raise HTTPException(400, str(exc)) from exc
@router.post("/{graphic_id}/versions", dependencies=[Depends(verify_csrf_token)])
async def upload_version(graphic_id: str, file: UploadFile=File(...)):
    try: return GraphicsService.update(graphic_id, await file.read(), _type(file))
    except KeyError as exc: raise HTTPException(404, str(exc)) from exc
    except ValueError as exc: raise HTTPException(400, str(exc)) from exc
@router.get("/{graphic_id}/impact")
def graphic_impact(graphic_id: str):
    try: GraphicsService.get(graphic_id); return {"templates":GraphicsService.impact(graphic_id)}
    except KeyError as exc: raise HTTPException(404, str(exc)) from exc
@router.post("/{graphic_id}/bulk-update", dependencies=[Depends(verify_csrf_token)])
def bulk_update(graphic_id: str, body: dict=Body(...)):
    try: return GraphicsService.bulk_update(graphic_id, body.get("template_ids",[]), bool(body.get("dry_run",False)))
    except KeyError as exc: raise HTTPException(404, str(exc)) from exc
@router.delete("/{graphic_id}", dependencies=[Depends(verify_csrf_token)])
def delete_graphic(graphic_id: str):
    if not GraphicsService.delete(graphic_id): raise HTTPException(404, "Graphic not found")
    return {"status":"success"}
