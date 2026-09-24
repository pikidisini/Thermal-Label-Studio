import { API_BASE } from './apiConfig';
import { getCsrfHeaders } from './csrfHelper';

export const sapApi = {
  async getSampleContracts() {
    try {
      const res = await fetch(`${API_BASE}/inspect/sample-contract`, {
        credentials: 'same-origin',
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Backend inspect service unreachable, using fallback sample contracts.');
    }
    return {
      goods_receipt: {
        contract_version: '1.1',
        label_type: 'ROLL',
        label_code: 'SAMPLE-ROLL',
        source: { source_system: 'fallback' },
        fields: {
          material_number: 'MAT-770921-X',
          material_description: 'Industrial Sensor Module V2',
          batch_number: 'BATCH-2026-09-A',
          production_date: '2026-09-10',
          net_weight: '24.50 KG',
          plant_code: 'PLANT-1001',
          storage_location: 'SLOC-WH01',
          vendor_code: 'VEND-88902',
        },
        codes: {
          barcode_batch: '77092120260901',
          qr_traceability: 'https://trace.enterprise.internal/mat/MAT-770921-X/b/BATCH-2026-09-A'
        }
      },
      pallet_shipment: {
        contract_version: '1.1',
        label_type: 'PALLET',
        label_code: 'SAMPLE-PALLET',
        source: { source_system: 'fallback' },
        fields: {
          sscc: '003761234500000018',
          destination_hub: 'CENTRAL DISTRIBUTION HUB - WEST',
          carrier_code: 'LOG-EXP-099',
          gross_weight: '480.00 KG',
          package_count: '24 BOXES'
        },
        codes: {}
      }
    };
  },

  async validateSapPayload(templateId: string, jsonData = {}) {
    const res = await fetch(`${API_BASE}/inspect/validate`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...getCsrfHeaders(),
      },
      body: JSON.stringify({
        template_id: templateId,
        data: jsonData
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Contract validation failed' }));
      throw new Error(err.detail || 'Contract validation failed');
    }
    return res.json();
  }
};
