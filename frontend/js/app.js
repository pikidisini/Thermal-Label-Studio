/**
 * Main Application Controller
 * Connects Designer, Data Inspector, Simulator, and API Client into a cohesive SPA.
 */

import { ApiClient } from './api_client.js';
import { LabelDesigner } from './designer.js';
import { DataInspector } from './data_inspector.js';
import { ThermalSimulator } from './simulator.js';

class App {
  constructor() {
    this.designer = null;
    this.inspector = null;
    this.simulator = null;
    this.currentTemplateId = 'label_roll_80x200';

    this.init();
  }

  async init() {
    // 1. Initialize Simulator
    this.simulator = new ThermalSimulator('previewWrap', 'simulationImg');

    // 2. Initialize Designer
    this.designer = new LabelDesigner('canvasArtboard', (selectedElem) => {
      this.handleElementSelected(selectedElem);
    });

    // 3. Initialize Data Inspector
    this.inspector = new DataInspector('fieldList', 'jsonEditorTextarea', (key, type, sampleVal) => {
      this.handleQuickAddField(key, type, sampleVal);
    });

    // 4. Setup Event Listeners
    this.setupUIEvents();

    // 5. Load Initial Data
    await this.loadInitialData();

    this.showToast('Thermal Label Engine Web App ready!', 'success');
  }

  async loadInitialData() {
    try {
      // Load Templates
      const templates = await ApiClient.getTemplates();
      const templateSelect = document.getElementById('templateSelect');
      if (templateSelect) {
        templateSelect.innerHTML = '';
        templates.forEach((t) => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = `${t.name} (${t.width_mm}x${t.height_mm}mm)`;
          templateSelect.appendChild(opt);
        });
      }

      // Load Sample Contract
      const contract = await ApiClient.getSampleContract();
      this.inspector.setContract(contract);

      // Load Default Template
      if (templates.length > 0) {
        await this.loadTemplate(templates[0].id);
      }
    } catch (e) {
      console.error('Failed to load initial data:', e);
      this.showToast(`Initialization note: ${e.message}`, 'warning');
    }
  }

  async loadTemplate(templateId) {
    try {
      const detail = await ApiClient.getTemplateDetail(templateId);
      this.currentTemplateId = templateId;
      this.designer.loadFromSvg(detail.raw_svg);
      this.inspector.updateBoundTokens(detail.tokens);

      const wInput = document.getElementById('labelWidthInput');
      const hInput = document.getElementById('labelHeightInput');
      if (wInput) wInput.value = detail.width_mm || 200;
      if (hInput) hInput.value = detail.height_mm || 80;

      this.updateBoundTokensList();
    } catch (e) {
      this.showToast(`Failed to load template: ${e.message}`, 'danger');
    }
  }

  updateBoundTokensList() {
    const tokens = this.designer.elements
      .map((el) => {
        if (el.type === 'text') {
          const m = el.text.match(/\{\{([a-zA-Z0-9_]+)\}\}/);
          return m ? m[1] : null;
        }
        if (el.type === 'barcode') return el.dataBarcode;
        if (el.type === 'qr') return el.dataQr;
        return null;
      })
      .filter(Boolean);

    this.inspector.updateBoundTokens(tokens);
  }

  handleQuickAddField(key, type, sampleVal) {
    if (type === 'text') {
      this.designer.addElement('text', {
        text: `{{${key}}}`,
        x: 10,
        y: 20,
        fontSize: 6,
      });
    } else if (type === 'barcode') {
      this.designer.addElement('barcode', {
        dataBarcode: key,
        x: 10,
        y: 35,
        width: 70,
        height: 15,
      });
    } else if (type === 'qr') {
      this.designer.addElement('qr', {
        dataQr: key,
        x: 160,
        y: 25,
        width: 25,
        height: 25,
      });
    }
    this.updateBoundTokensList();
    this.showToast(`Added {{${key}}} to canvas`, 'info');
  }

  handleElementSelected(elem) {
    const propPanel = document.getElementById('propertiesForm');
    const emptyState = document.getElementById('emptyProperties');
    if (!propPanel || !emptyState) return;

    if (!elem) {
      propPanel.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    propPanel.style.display = 'flex';
    emptyState.style.display = 'none';

    document.getElementById('propType').textContent = elem.type.toUpperCase();
    document.getElementById('propX').value = elem.x;
    document.getElementById('propY').value = elem.y;
    document.getElementById('propWidth').value = elem.width;
    document.getElementById('propHeight').value = elem.height;

    // Show/hide specific controls
    const textGroup = document.getElementById('propTextGroup');
    const fontGroup = document.getElementById('propFontGroup');
    const barcodeGroup = document.getElementById('propBarcodeGroup');
    const qrGroup = document.getElementById('propQrGroup');

    textGroup.style.display = elem.type === 'text' ? 'flex' : 'none';
    fontGroup.style.display = elem.type === 'text' ? 'flex' : 'none';
    barcodeGroup.style.display = elem.type === 'barcode' ? 'flex' : 'none';
    qrGroup.style.display = elem.type === 'qr' ? 'flex' : 'none';

    if (elem.type === 'text') {
      document.getElementById('propText').value = elem.text;
      document.getElementById('propFontSize').value = elem.fontSize;
      document.getElementById('propFontFamily').value = elem.fontFamily || 'Arial';
    } else if (elem.type === 'barcode') {
      document.getElementById('propBarcodeKey').value = elem.dataBarcode;
    } else if (elem.type === 'qr') {
      document.getElementById('propQrKey').value = elem.dataQr;
    }
  }

  setupUIEvents() {
    // Mode Switcher (Design vs High-Res vs Thermal 1-Bit)
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.getAttribute('data-mode');
        this.simulator.currentMode = mode;

        const designView = document.getElementById('canvasArtboard');
        const simView = document.getElementById('previewWrap');

        if (mode === 'design') {
          designView.style.display = 'block';
          simView.style.display = 'none';
        } else {
          designView.style.display = 'none';
          simView.style.display = 'flex';
          await this.triggerSimulation();
        }
      });
    });

    // Preset & Dimension Change
    document.getElementById('presetSelect')?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === '200x80') {
        document.getElementById('labelWidthInput').value = 200;
        document.getElementById('labelHeightInput').value = 80;
      } else if (val === '100x150') {
        document.getElementById('labelWidthInput').value = 100;
        document.getElementById('labelHeightInput').value = 150;
      } else if (val === '80x50') {
        document.getElementById('labelWidthInput').value = 80;
        document.getElementById('labelHeightInput').value = 50;
      } else if (val === '50x30') {
        document.getElementById('labelWidthInput').value = 50;
        document.getElementById('labelHeightInput').value = 30;
      }
      this.applyDimensions();
    });

    document.getElementById('btnApplyDimensions')?.addEventListener('click', () => {
      this.applyDimensions();
    });

    // Toolbox Add Elements (MM scale defaults)
    document.getElementById('btnAddDynamicText')?.addEventListener('click', () => {
      this.designer.addElement('text', { text: '{{material_number}}', x: 10, y: 20, fontSize: 6 });
      this.updateBoundTokensList();
    });

    document.getElementById('btnAddStaticText')?.addEventListener('click', () => {
      this.designer.addElement('text', { text: 'STATIC TITLE', x: 10, y: 10, fontSize: 5, fontWeight: 'bold' });
    });

    document.getElementById('btnAddBarcode')?.addEventListener('click', () => {
      this.designer.addElement('barcode', { dataBarcode: 'barcode_batch', x: 10, y: 35, width: 70, height: 15 });
      this.updateBoundTokensList();
    });

    document.getElementById('btnAddQr')?.addEventListener('click', () => {
      this.designer.addElement('qr', { dataQr: 'qr_traceability', x: 160, y: 25, width: 25, height: 25 });
      this.updateBoundTokensList();
    });

    document.getElementById('btnAddRect')?.addEventListener('click', () => {
      this.designer.addElement('rect', { x: 5, y: 5, width: 190, height: 70, strokeWidth: 0.5 });
    });

    document.getElementById('btnAddLine')?.addEventListener('click', () => {
      this.designer.addElement('line', { x: 5, y: 30, width: 190, strokeWidth: 0.5 });
    });

    // Layer Ordering & Delete Element
    document.getElementById('btnBringForward')?.addEventListener('click', () => {
      this.designer.bringForward();
    });

    document.getElementById('btnSendBackward')?.addEventListener('click', () => {
      this.designer.sendBackward();
    });

    document.getElementById('btnDeleteElement')?.addEventListener('click', () => {
      this.designer.deleteSelectedElement();
      this.updateBoundTokensList();
    });

    // Copy ZPL Button
    document.getElementById('btnCopyZpl')?.addEventListener('click', () => {
      const zplText = document.getElementById('rawZplPreview').value;
      if (zplText) {
        navigator.clipboard.writeText(zplText);
        this.showToast('ZPL code copied to clipboard!', 'success');
      } else {
        this.showToast('No ZPL generated yet. Click "Render All".', 'warning');
      }
    });

    // Property Inputs Sync
    ['propX', 'propY', 'propWidth', 'propHeight', 'propFontSize', 'propText', 'propFontFamily', 'propBarcodeKey', 'propQrKey'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', () => {
        this.syncPropertiesToElement();
      });
    });

    // Template Dropdown Change
    document.getElementById('templateSelect')?.addEventListener('change', (e) => {
      this.loadTemplate(e.target.value);
    });

    // Search Field Filter
    document.getElementById('fieldSearchInput')?.addEventListener('input', (e) => {
      this.inspector.renderFieldList(e.target.value);
    });

    // Zoom Controls
    document.getElementById('btnZoomIn')?.addEventListener('click', () => {
      this.simulator.setZoom(this.simulator.zoomLevel + 0.15);
    });
    document.getElementById('btnZoomOut')?.addEventListener('click', () => {
      this.simulator.setZoom(this.simulator.zoomLevel - 0.15);
    });
    document.getElementById('btnZoomFit')?.addEventListener('click', () => {
      this.simulator.setZoom(1.0);
    });

    // Rotation Control
    document.getElementById('rotationSelect')?.addEventListener('change', (e) => {
      this.simulator.setRotation(parseInt(e.target.value, 10));
      if (this.simulator.currentMode !== 'design') {
        this.triggerSimulation();
      }
    });

    // Render & Export Actions
    document.getElementById('btnRenderAll')?.addEventListener('click', () => this.handleRenderAll());
    document.getElementById('btnOpenPrintDialog')?.addEventListener('click', () => this.openPrintModal());

    // Print Modal Events
    document.getElementById('btnCloseModal')?.addEventListener('click', () => this.closePrintModal());
    document.getElementById('btnSendPrintTcp')?.addEventListener('click', () => this.handleSendPrintTcp());
    document.getElementById('btnSendPrintSpooler')?.addEventListener('click', () => this.handleSendPrintSpooler());
  }

  applyDimensions() {
    const w = parseFloat(document.getElementById('labelWidthInput').value) || 200;
    const h = parseFloat(document.getElementById('labelHeightInput').value) || 80;
    const dpi = parseFloat(document.getElementById('dpiSelect').value) || 203.2;
    this.designer.setDimensions(w, h, dpi);
    this.showToast(`Canvas resized to ${w}x${h} mm`, 'info');
  }

  syncPropertiesToElement() {
    if (!this.designer.selectedId) return;

    const props = {
      x: parseFloat(document.getElementById('propX').value) || 0,
      y: parseFloat(document.getElementById('propY').value) || 0,
      width: parseFloat(document.getElementById('propWidth').value) || 10,
      height: parseFloat(document.getElementById('propHeight').value) || 10,
      text: document.getElementById('propText').value,
      fontSize: parseFloat(document.getElementById('propFontSize').value) || 5,
      fontFamily: document.getElementById('propFontFamily').value,
      dataBarcode: document.getElementById('propBarcodeKey').value,
      dataQr: document.getElementById('propQrKey').value,
    };

    this.designer.updateSelectedElement(props);
    this.updateBoundTokensList();
  }

  async triggerSimulation() {
    const svg = this.designer.exportToSvg();
    const data = this.inspector.getContract();
    const dpi = parseFloat(document.getElementById('dpiSelect').value) || 203.2;

    await this.simulator.updateSimulation({
      data,
      templateSvg: svg,
      dpi,
      widthMm: this.designer.widthMm,
      heightMm: this.designer.heightMm,
    });
  }

  async handleRenderAll() {
    try {
      this.showToast('Rendering multi-format outputs...', 'info');
      const svg = this.designer.exportToSvg();
      const data = this.inspector.getContract();
      const dpi = parseFloat(document.getElementById('dpiSelect').value) || 203.2;
      const rotation = parseInt(document.getElementById('rotationSelect').value, 10) || 0;

      const res = await ApiClient.renderLabel({
        data,
        templateSvg: svg,
        formats: ['png', 'pdf', 'zpl', 'tspl', 'ipl', 'bmp'],
        dpi,
        rotation,
        widthMm: this.designer.widthMm,
        heightMm: this.designer.heightMm,
      });

      this.renderOutputLinks(res.files, res.raw_preview_text);
      this.showToast(`Rendering completed in ${res.elapsed_ms} ms!`, 'success');
    } catch (e) {
      this.showToast(`Render failed: ${e.message}`, 'danger');
    }
  }

  renderOutputLinks(filesMap, rawPreviews) {
    const listContainer = document.getElementById('renderedArtifactsList');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    for (const [fmt, url] of Object.entries(filesMap)) {
      const item = document.createElement('div');
      item.className = 'field-item';
      item.innerHTML = `
        <span style="font-weight: 700; text-transform: uppercase;">${fmt}</span>
        <a href="${url}" target="_blank" download class="btn btn-secondary btn-sm" style="font-size: 0.7rem;">Download</a>
      `;
      listContainer.appendChild(item);
    }

    if (rawPreviews && rawPreviews.zpl) {
      const zplBox = document.getElementById('rawZplPreview');
      if (zplBox) zplBox.value = rawPreviews.zpl;
    }
  }

  async openPrintModal() {
    const modal = document.getElementById('printModal');
    if (!modal) return;
    modal.classList.add('active');

    try {
      const printers = await ApiClient.listPrinters();
      const select = document.getElementById('spoolerPrinterSelect');
      if (select) {
        select.innerHTML = '';
        if (printers.length === 0) {
          select.innerHTML = '<option value="">(No Windows printers found)</option>';
        } else {
          printers.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            select.appendChild(opt);
          });
        }
      }
    } catch (e) {
      console.warn('Could not load spooler printers:', e);
    }
  }

  closePrintModal() {
    document.getElementById('printModal')?.classList.remove('active');
  }

  async handleSendPrintTcp() {
    const host = document.getElementById('tcpHostInput').value;
    const port = document.getElementById('tcpPortInput').value || 9100;
    const format = document.getElementById('tcpFormatSelect').value || 'zpl';

    if (!host) {
      this.showToast('Printer IP Address is required', 'warning');
      return;
    }

    try {
      this.showToast(`Sending to ${host}:${port}...`, 'info');
      const svg = this.designer.exportToSvg();
      const data = this.inspector.getContract();

      const res = await ApiClient.printTcp({
        host,
        port,
        printerFormat: format,
        data,
        templateSvg: svg,
        dpi: parseFloat(document.getElementById('dpiSelect').value) || 203.2,
      });

      this.showToast(res.message, 'success');
      this.closePrintModal();
    } catch (e) {
      this.showToast(`Print Error: ${e.message}`, 'danger');
    }
  }

  async handleSendPrintSpooler() {
    const printerName = document.getElementById('spoolerPrinterSelect').value;
    const format = document.getElementById('spoolerFormatSelect').value || 'zpl';

    if (!printerName) {
      this.showToast('Select a printer first', 'warning');
      return;
    }

    try {
      this.showToast(`Sending to Spooler '${printerName}'...`, 'info');
      const svg = this.designer.exportToSvg();
      const data = this.inspector.getContract();

      const res = await ApiClient.printSpooler({
        printerName,
        printerFormat: format,
        data,
        templateSvg: svg,
        dpi: parseFloat(document.getElementById('dpiSelect').value) || 203.2,
      });

      this.showToast(res.message, 'success');
      this.closePrintModal();
    } catch (e) {
      this.showToast(`Spooler Error: ${e.message}`, 'danger');
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast alert-${type}`;
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 4000);
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
