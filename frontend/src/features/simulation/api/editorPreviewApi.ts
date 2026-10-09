import { API_BASE } from '../../../shared/api';

export interface EditorPreviewRequest {
  svg: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  encoder?: "IPL";
}

export interface EditorPreviewResult {
  requestId: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
  pngBase64: string;
}

export async function runEditorPreview(request: EditorPreviewRequest, signal?: AbortSignal): Promise<EditorPreviewResult> {
  const response = await fetch(`${API_BASE}/simulation/editor-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      svg: request.svg,
      width_mm: request.widthMm,
      height_mm: request.heightMm,
      dpi: request.dpi,
      encoder: request.encoder ?? "IPL",
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(response.status === 422
      ? 'The current canvas cannot be simulated by the server renderer.'
      : 'The server could not create the simulation preview.');
  }
  const payload = await response.json() as {
    request_id: string; width_px: number; height_px: number; dpi: number; png_base64: string;
  };
  return {
    requestId: payload.request_id,
    widthPx: payload.width_px,
    heightPx: payload.height_px,
    dpi: payload.dpi,
    pngBase64: payload.png_base64,
  };
}

export function editorPreviewUrl(result: EditorPreviewResult): string {
  return `data:image/png;base64,${result.pngBase64}`;
}
