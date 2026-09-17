/**
 * API Client for interacting with the Thermal Label Engine FastAPI backend.
 */

const API_BASE = '/api/v1';

export const ApiClient = {
  /**
   * Fetches all available label templates (builtin and uploaded).
   */
  async getTemplates() {
    const res = await fetch(`${API_BASE}/templates`);
    if (!res.ok) throw new Error(`Failed to load templates: ${res.statusText}`);
    return await res.json();
  },

  /**
   * Fetches detailed information, dimensions, tokens, and raw SVG for a template.
   */
  async getTemplateDetail(templateId) {
    const res = await fetch(`${API_BASE}/templates/${encodeURIComponent(templateId)}`);
    if (!res.ok) throw new Error(`Failed to load template ${templateId}: ${res.statusText}`);
    return await res.json();
  },

  /**
   * Uploads a new custom SVG template.
   */
  async uploadTemplate(file, templateName) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('template_name', templateName);

    const res = await fetch(`${API_BASE}/templates/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Upload failed');
    }
    return await res.json();
  },

  /**
   * Fetches the sample SAP JSON data contract.
   */
  async getSampleContract() {
    const res = await fetch(`${API_BASE}/inspect/sample-contract`);
    if (!res.ok) throw new Error('Failed to load sample contract');
    return await res.json();
  },

  /**
   * Validates data contract compatibility and detects orphan tokens.
   */
  async validateContract({ data, templateId, templateSvg }) {
    const res = await fetch(`${API_BASE}/inspect/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data,
        template_id: templateId || undefined,
        template_svg: templateSvg || undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Validation request failed');
    }
    return await res.json();
  },

  /**
   * Executes full rendering pipeline to generate ZPL, TSPL, IPL, PDF, PNG, BMP.
   */
  async renderLabel({
    data,
    templateId,
    templateSvg,
    formats = ['png', 'pdf', 'zpl', 'tspl', 'ipl', 'bmp'],
    dpi = 203.2,
    rotation = 0,
    binarizationThreshold = null,
    widthMm = 200.0,
    heightMm = 80.0,
  }) {
    const res = await fetch(`${API_BASE}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data,
        template_id: templateId || undefined,
        template_svg: templateSvg || undefined,
        formats,
        dpi,
        rotation,
        binarization_threshold: binarizationThreshold,
        width_mm: widthMm,
        height_mm: heightMm,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Rendering failed');
    }
    return await res.json();
  },

  /**
   * Generates live preview image blob (PNG or 1-bit Monochrome).
   */
  async getPreviewBlob({
    data,
    templateId,
    templateSvg,
    previewType = 'png',
    dpi = 203.2,
    rotation = 0,
    binarizationThreshold = null,
    widthMm = 200.0,
    heightMm = 80.0,
  }) {
    const res = await fetch(`${API_BASE}/render/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data,
        template_id: templateId || undefined,
        template_svg: templateSvg || undefined,
        preview_type: previewType,
        dpi,
        rotation,
        binarization_threshold: binarizationThreshold,
        width_mm: widthMm,
        height_mm: heightMm,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Preview generation failed');
    }
    return await res.blob();
  },

  /**
   * Fetches installed Windows printers.
   */
  async listPrinters() {
    const res = await fetch(`${API_BASE}/print/printers`);
    if (!res.ok) return [];
    return await res.json();
  },

  /**
   * Sends raw label commands to a network thermal printer over TCP.
   */
  async printTcp({ host, port = 9100, printerFormat = 'zpl', data, templateId, templateSvg, rawCommand }) {
    const res = await fetch(`${API_BASE}/print/tcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host,
        port: parseInt(port, 10),
        printer_format: printerFormat,
        data,
        template_id: templateId || undefined,
        template_svg: templateSvg || undefined,
        raw_command: rawCommand || undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'TCP Print failed');
    }
    return await res.json();
  },

  /**
   * Sends raw label commands to Windows Print Spooler.
   */
  async printSpooler({ printerName, printerFormat = 'zpl', data, templateId, templateSvg, rawCommand }) {
    const res = await fetch(`${API_BASE}/print/spooler`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printer_name: printerName,
        printer_format: printerFormat,
        data,
        template_id: templateId || undefined,
        template_svg: templateSvg || undefined,
        raw_command: rawCommand || undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Spooler Print failed');
    }
    return await res.json();
  },
};
