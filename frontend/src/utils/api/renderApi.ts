import { API_BASE } from './apiConfig';
import { getCsrfHeaders } from './csrfHelper';
import type {
  JsonObject,
  PreviewRequest,
  RenderOptions,
  RenderRequest,
  RenderResponse,
  RenderFormat,
  SvgInspectionResponse,
} from '../../types/api';

function buildPreviewRequest(svgContent: string, jsonData: JsonObject, options: RenderOptions = {}): PreviewRequest {
  return {
    data: jsonData,
    template_svg: svgContent,
    preview_type: options.previewType ?? 'png',
    dpi: options.dpi ?? 203.2,
    rotation: options.rotation ?? 0,
    binarization_threshold: options.threshold ?? null,
    width_mm: options.widthMm ?? 200,
    height_mm: options.heightMm ?? 80,
  };
}

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  const errorBody: unknown = await response.json().catch(() => null);
  if (typeof errorBody === 'object' && errorBody !== null && 'detail' in errorBody) {
    const detail = (errorBody as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

export const renderApi = {
  async renderSimulation(svgContent: string, jsonData: JsonObject = {}, options: RenderOptions = {}): Promise<Blob> {
    const res = await fetch(`${API_BASE}/render/preview`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...getCsrfHeaders(),
      },
      body: JSON.stringify(buildPreviewRequest(svgContent, jsonData, { ...options, previewType: 'png' })),
    });
    if (!res.ok) {
      throw new Error(await getErrorMessage(res, 'Simulation rendering failed'));
    }
    return res.blob();
  },

  async renderPreviewBlob(svgContent: string, jsonData: JsonObject = {}, options: RenderOptions = {}): Promise<Blob> {
    const res = await fetch(`${API_BASE}/render/preview`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...getCsrfHeaders(),
      },
      body: JSON.stringify(buildPreviewRequest(svgContent, jsonData, { ...options, previewType: 'monochrome_1bit' })),
    });
    if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to generate monochrome preview'));
    return res.blob();
  },

  async exportRenderJob(
    svgContent: string,
    jsonData: JsonObject = {},
    exportFormat: RenderFormat = 'zpl',
    options: RenderOptions = {},
  ): Promise<RenderResponse> {
    const request: RenderRequest = {
      data: jsonData,
      template_svg: svgContent,
      formats: [exportFormat],
      dpi: options.dpi ?? 203.2,
      rotation: options.rotation ?? 0,
      binarization_threshold: options.threshold ?? null,
      width_mm: options.widthMm ?? 200,
      height_mm: options.heightMm ?? 80,
    };
    const res = await fetch(`${API_BASE}/render`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...getCsrfHeaders(),
      },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      throw new Error(await getErrorMessage(res, 'Export render job failed'));
    }
    return res.json() as Promise<RenderResponse>;
  },

  async inspectSvgTokens(svgContent: string): Promise<SvgInspectionResponse> {
    const res = await fetch(`${API_BASE}/templates/parse-raw`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...getCsrfHeaders(),
      },
      body: JSON.stringify({ svg_content: svgContent })
    });
    if (!res.ok) {
      throw new Error(await getErrorMessage(res, 'Failed to inspect SVG'));
    }
    return res.json() as Promise<SvgInspectionResponse>;
  }
};
