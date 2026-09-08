"""
API Routes for Label Rendering, Preview, and File Downloads.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, Response

from ..models.schemas import PreviewRequest, RenderRequest, RenderResponse
from ..services.render_service import RenderService

router = APIRouter(prefix="/render", tags=["Render & Preview"])


@router.post("", response_model=RenderResponse, summary="Execute full label rendering pipeline")
def render_label(req: RenderRequest, request: Request) -> RenderResponse:
    """
    Renders dynamic label from JSON data + SVG template into target formats
    (SVG, PNG, 1-bit BMP, PDF, ZPL, TSPL, IPL).
    """
    try:
        base_url = str(request.base_url)
        return RenderService.execute_render_job(req, base_url=base_url)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Rendering failed: {str(e)}",
        )


@router.post("/preview", summary="Generate immediate in-memory preview image")
def generate_preview(req: PreviewRequest) -> Response:
    """
    Generates a live in-memory preview (PNG, 1-Bit Otsu Monochrome, or SVG)
    streamed directly back as binary image content.
    """
    try:
        image_bytes, media_type = RenderService.generate_preview_image(req)
        return Response(content=image_bytes, media_type=media_type)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Preview generation error: {str(e)}",
        )


@router.get("/download/{job_id}/{filename}", summary="Download rendered output artifact")
def download_artifact(job_id: str, filename: str) -> FileResponse:
    """Downloads a specific rendered artifact file from a previous render job."""
    file_path = RenderService.get_job_file(job_id, filename)
    if not file_path or not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested file not found or expired.",
        )

    # Determine media type
    suffix = file_path.suffix.lower()
    media_types = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".bmp": "image/bmp",
        ".svg": "image/svg+xml",
        ".zpl": "text/plain",
        ".tspl": "application/octet-stream",
        ".ipl": "text/plain",
    }
    media_type = media_types.get(suffix, "application/octet-stream")

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type=media_type,
    )
