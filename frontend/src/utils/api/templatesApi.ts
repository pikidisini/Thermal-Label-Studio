import { API_BASE, FALLBACK_TEMPLATES, FALLBACK_SVGS } from './apiConfig';
import { getCsrfHeaders } from './csrfHelper';

export const templatesApi = {
  async listTemplates() {
    try {
      const res = await fetch(`${API_BASE}/templates`, {
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = await res.json();
        return { templates: data };
      }
    } catch (e) {
      console.warn('Backend templates API unreachable, using built-in offline templates fallback.');
    }
    return { templates: FALLBACK_TEMPLATES };
  },

  async getTemplate(templateId: string) {
    try {
      const res = await fetch(`${API_BASE}/templates/${templateId}`, {
        credentials: 'same-origin',
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`Backend template ${templateId} unreachable, using built-in offline fallback.`);
    }

    const fallbackSvg = FALLBACK_SVGS[templateId] || FALLBACK_SVGS.standard_goods_receipt;
    const match = FALLBACK_TEMPLATES.find((t) => t.id === templateId) || FALLBACK_TEMPLATES[0];
    return {
      id: match.id,
      name: match.name,
      filename: match.filename,
      is_builtin: true,
      width_mm: match.width_mm,
      height_mm: match.height_mm,
      raw_svg: fallbackSvg,
      svg_content: fallbackSvg,
      tokens: ['material_number', 'material_description', 'batch_number', 'production_date', 'net_weight'],
      barcode_fields: ['barcode_batch'],
      qr_fields: ['qr_traceability']
    };
  },

  async saveTemplate(templateId: string, svgContent: string, metadata: any = {}) {
    const res = await fetch(`${API_BASE}/templates`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...getCsrfHeaders(),
      },
      body: JSON.stringify({
        template_id: templateId,
        svg_content: svgContent,
        width_mm: metadata.width_mm || 200,
        height_mm: metadata.height_mm || 80
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to save template' }));
      throw new Error(err.detail || 'Failed to save template');
    }
    return res.json();
  },

  async deleteTemplate(templateId: string) {
    const res = await fetch(`${API_BASE}/templates/${encodeURIComponent(templateId)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: {
        ...getCsrfHeaders(),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to delete template' }));
      throw new Error(err.detail || 'Failed to delete template');
    }
    return res.json();
  },

  async uploadTemplate(file: File, templateName = '') {
    const formData = new FormData();
    formData.append('file', file);
    if (templateName) formData.append('template_name', templateName);

    const res = await fetch(`${API_BASE}/templates/upload`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        ...getCsrfHeaders(),
      },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to upload template' }));
      throw new Error(err.detail || 'Failed to upload template');
    }
    return res.json();
  }
};
