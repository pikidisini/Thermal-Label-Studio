/**
 * Data Inspector & Variable Binding Manager
 * Displays SAP JSON contract fields and connects them to designer elements.
 */

export class DataInspector {
  constructor(listContainerId, jsonEditorId, onAddFieldToCanvas) {
    this.listContainer = document.getElementById(listContainerId);
    this.jsonEditor = document.getElementById(jsonEditorId);
    this.onAddFieldToCanvas = onAddFieldToCanvas;
    this.contract = null;
    this.boundTokens = new Set();
  }

  setContract(contractObj) {
    this.contract = contractObj;
    if (this.jsonEditor) {
      this.jsonEditor.value = JSON.stringify(contractObj, null, 2);
    }
    this.renderFieldList();
  }

  getContract() {
    if (this.jsonEditor && this.jsonEditor.value) {
      try {
        return JSON.parse(this.jsonEditor.value);
      } catch (e) {
        console.error('Invalid JSON in editor', e);
      }
    }
    return this.contract;
  }

  updateBoundTokens(tokensList = []) {
    this.boundTokens = new Set(tokensList);
    this.renderFieldList();
  }

  renderFieldList(filterText = '') {
    if (!this.listContainer) return;
    this.listContainer.innerHTML = '';

    const contract = this.getContract();
    if (!contract) {
      this.listContainer.innerHTML = '<div class="text-muted" style="padding: 0.5rem; font-size: 0.78rem;">No contract loaded</div>';
      return;
    }

    const fields = contract.fields || {};
    const codes = contract.codes || {};

    const allKeys = [
      ...Object.keys(fields).map((k) => ({ key: k, value: fields[k], type: 'field' })),
      ...Object.keys(codes).map((k) => ({ key: k, value: codes[k], type: 'code' })),
    ];

    const filtered = allKeys.filter((item) =>
      item.key.toLowerCase().includes(filterText.toLowerCase())
    );

    if (filtered.length === 0) {
      this.listContainer.innerHTML = '<div class="text-muted" style="padding: 0.5rem; font-size: 0.78rem;">No matching fields</div>';
      return;
    }

    for (const item of filtered) {
      const isBound = this.boundTokens.has(item.key);
      const row = document.createElement('div');
      row.className = 'field-item';

      row.innerHTML = `
        <div style="display: flex; flex-direction: column; overflow: hidden; max-width: 170px;">
          <span class="field-name" title="{{${item.key}}}">{{${item.key}}}</span>
          <span style="font-size: 0.68rem; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.value}">${item.value}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.3rem;">
          <span class="field-badge ${isBound ? 'bound' : 'unbound'}">${isBound ? 'Bound' : 'Available'}</span>
          <button class="btn btn-secondary btn-sm" style="padding: 0.15rem 0.35rem; font-size: 0.7rem;" title="Add to Canvas">+</button>
        </div>
      `;

      row.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onAddFieldToCanvas) {
          const type = item.type === 'code' ? (item.key.includes('qr') ? 'qr' : 'barcode') : 'text';
          this.onAddFieldToCanvas(item.key, type, item.value);
        }
      });

      this.listContainer.appendChild(row);
    }
  }
}
