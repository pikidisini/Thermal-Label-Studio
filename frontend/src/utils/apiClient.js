const API_BASE = '/api/v1';

export const apiClient = {
  // Templates
  async listTemplates() {
    const res = await fetch(`${API_BASE}/templates`);
    if (!res.ok) throw new Error('Failed to list templates');
    const data = await res.json();
    return { templates: data };
  },

  async getTemplate(templateId) {
    const res = await fetch(`${API_BASE}/templates/${templateId}`);
    if (!res.ok) throw new Error('Failed to get template');
    return res.json();
  },

  async saveTemplate(templateId, svgContent, metadata = {}) {
    const res = await fetch(`${API_BASE}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  async uploadTemplate(file, templateName = '') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('template_name', templateName || file.name.replace(/\.svg$/i, ''));
    const res = await fetch(`${API_BASE}/templates/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(err.detail || 'Failed to upload template');
    }
    return res.json();
  },

  // Contracts & Sample Data
  async getSampleContracts() {
    try {
      const res = await fetch(`${API_BASE}/inspect/sample-contract`);
      if (res.ok) {
        const data = await res.json();
        return {
          goods_receipt: data.fields ? { ...data.fields, ...(data.codes || {}) } : data,
          dispatch_box: {
            material_number: 'RM-ST-00129',
            material_description: 'Cold Rolled Steel Coil 1.2mm x 1200mm',
            batch_number: 'B260819001',
            gross_weight: '2,450.50 KG',
            net_weight: '2,430.00 KG',
            quantity: '1',
            unit: 'ROL',
            storage_location: 'SL01',
            vendor_name: 'PT Krakatau Steel Tbk',
            production_date: '2026-08-19',
            expiration_date: '2027-08-19'
          },
          chemical_ghs: {
            material_number: 'CHEM-H2SO4-98',
            material_description: 'Sulfuric Acid 98% Technical Grade',
            batch_number: 'LOT-99281',
            gross_weight: '1,050.00 KG',
            net_weight: '1,000.00 KG',
            hazard_warning: 'CORROSIVE / DANGER',
            storage_location: 'HAZMAT-BAY-3'
          }
        };
      }
    } catch (e) {
      console.warn('Could not fetch sample contract, using fallback', e);
    }
    return {
      goods_receipt: {
        material_number: 'RM-ST-00129',
        material_description: 'Cold Rolled Steel Coil 1.2mm x 1200mm',
        batch_number: 'B260819001',
        gross_weight: '2,450.50 KG',
        net_weight: '2,430.00 KG',
        quantity: '1',
        unit: 'ROL',
        storage_location: 'SL01',
        vendor_name: 'PT Krakatau Steel Tbk',
        production_date: '2026-08-19',
        expiration_date: '2027-08-19'
      }
    };
  },

  async inspectTemplate(svgContent, sampleJson = null) {
    try {
      const res = await fetch(`${API_BASE}/inspect/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: sampleJson || {},
          template_svg: svgContent
        })
      });
      if (res.ok) {
        return res.json();
      }
    } catch (e) {
      console.warn('Validation call error', e);
    }
    return { is_valid: true, bound_tokens: [], orphan_tokens: [] };
  },

  // Immediate Preview rendering
  async renderPreview(svgContent, jsonData, dpi = 203.2) {
    const res = await fetch(`${API_BASE}/render/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: jsonData || {},
        template_svg: svgContent,
        preview_type: 'png',
        dpi: dpi
      })
    });
    if (!res.ok) throw new Error('Render preview failed');
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve({ image_base64: base64 });
      };
      reader.readAsDataURL(blob);
    });
  },

  // 1-Bit Thermal simulation rendering
  async renderThermalSimulation(svgContent, jsonData, dpi = 203.2, threshold = 128) {
    const res = await fetch(`${API_BASE}/render/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: jsonData || {},
        template_svg: svgContent,
        preview_type: 'monochrome_1bit',
        dpi: dpi,
        binarization_threshold: threshold
      })
    });
    if (!res.ok) throw new Error('Thermal simulation failed');
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve({ simulation_base64: base64 });
      };
      reader.readAsDataURL(blob);
    });
  },

  // Full export formats
  async renderFormats(svgContent, jsonData, dpi = 203.2) {
    const res = await fetch(`${API_BASE}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: jsonData || {},
        template_svg: svgContent,
        formats: ['png', 'pdf', 'zpl', 'tspl', 'ipl'],
        dpi: dpi
      })
    });
    if (!res.ok) throw new Error('Export formats failed');
    const data = await res.json();
    return {
      zpl: data.raw_preview_text?.zpl || null,
      tspl: data.raw_preview_text?.tspl || null,
      ipl: data.raw_preview_text?.ipl || null,
      files: data.files || {}
    };
  },

  // Printing
  async listSpoolerPrinters() {
    try {
      const res = await fetch(`${API_BASE}/print/printers`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return { printers: data, default_printer: data[0] || null };
        }
        return data;
      }
    } catch (e) {
      console.warn('Printer list failed', e);
    }
    return { printers: [], default_printer: null };
  },

  async printDirect(payload) {
    let endpoint = `${API_BASE}/print/tcp`;
    let body = {
      host: payload.host,
      port: payload.port || 9100,
      printer_format: payload.protocol || 'zpl',
      template_svg: payload.svg_content,
      data: payload.json_data,
      dpi: payload.dpi || 203.2
    };

    if (payload.method === 'spooler') {
      endpoint = `${API_BASE}/print/spooler`;
      body = {
        printer_name: payload.printer_name,
        printer_format: payload.protocol || 'zpl',
        template_svg: payload.svg_content,
        data: payload.json_data,
        dpi: payload.dpi || 203.2
      };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Print failed' }));
      throw new Error(err.detail || 'Print failed');
    }
    return res.json();
  },

  async printBatch(payload) {
    const res = await fetch(`${API_BASE}/print/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Batch print failed' }));
      throw new Error(err.detail || 'Batch print failed');
    }
    return res.json();
  }
};

