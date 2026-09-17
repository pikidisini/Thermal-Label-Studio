/**
 * Visual Label Designer Engine (MM Precision Scale)
 * Manages vector elements in millimeter coordinates, matching standard thermal label SVG templates.
 */

export class LabelDesigner {
  constructor(svgContainerId, onSelectionChange) {
    this.container = document.getElementById(svgContainerId);
    this.onSelectionChange = onSelectionChange;
    this.widthMm = 200.0;
    this.heightMm = 80.0;
    this.dpi = 203.2;

    // Internal elements list (all coordinates stored in Millimeters - mm)
    this.elements = [];
    this.selectedId = null;
    this.dragState = null;
    this.resizeState = null;

    this.initCanvas();
  }

  get viewBoxWidth() {
    return this.widthMm;
  }

  get viewBoxHeight() {
    return this.heightMm;
  }

  initCanvas() {
    this.container.innerHTML = `
      <svg id="designerSvg" xmlns="http://www.w3.org/2000/svg" 
           width="${this.widthMm}mm" height="${this.heightMm}mm" 
           viewBox="0 0 ${this.viewBoxWidth} ${this.viewBoxHeight}"
           style="width: 100%; height: 100%; display: block; overflow: visible;">
        <defs>
          <pattern id="gridPattern" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="0.3"/>
          </pattern>
        </defs>
        <rect id="bgGrid" width="100%" height="100%" fill="url(#gridPattern)" pointer-events="all"/>
        <g id="elementsLayer"></g>
        <g id="selectionLayer" pointer-events="none"></g>
      </svg>
    `;

    this.svg = document.getElementById('designerSvg');
    this.elementsLayer = document.getElementById('elementsLayer');
    this.selectionLayer = document.getElementById('selectionLayer');

    this.attachEvents();
  }

  setDimensions(widthMm, heightMm, dpi = 203.2) {
    this.widthMm = parseFloat(widthMm);
    this.heightMm = parseFloat(heightMm);
    this.dpi = parseFloat(dpi);

    this.svg.setAttribute('width', `${this.widthMm}mm`);
    this.svg.setAttribute('height', `${this.heightMm}mm`);
    this.svg.setAttribute('viewBox', `0 0 ${this.viewBoxWidth} ${this.viewBoxHeight}`);
    this.render();
  }

  attachEvents() {
    this.svg.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', () => this.handleMouseUp());

    // Click canvas background to deselect
    document.getElementById('bgGrid').addEventListener('mousedown', () => {
      this.selectElement(null);
    });

    // Keyboard Shortcuts: Delete / Backspace
    window.addEventListener('keydown', (e) => {
      if (!this.selectedId) return;
      const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deleteSelectedElement();
      }
    });
  }

  getSvgCoordinates(evt) {
    const pt = this.svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = this.svg.getScreenCTM();
    if (ctm) {
      return pt.matrixTransform(ctm.inverse());
    }
    return { x: evt.offsetX, y: evt.offsetY };
  }

  addElement(type, props = {}) {
    const id = 'elem_' + Math.random().toString(36).substr(2, 9);
    let defaultItem = {
      id,
      type,
      x: props.x || 10,
      y: props.y || 15,
      width: props.width || 30,
      height: props.height || 10,
      text: props.text || 'Label Text',
      fontSize: props.fontSize || 6,
      fontFamily: props.fontFamily || 'Arial',
      fontWeight: props.fontWeight || 'normal',
      strokeWidth: props.strokeWidth || 0.5,
      dataBarcode: props.dataBarcode || '',
      dataQr: props.dataQr || '',
    };

    if (type === 'barcode') {
      defaultItem.width = props.width || 70;
      defaultItem.height = props.height || 15;
      defaultItem.dataBarcode = props.dataBarcode || 'barcode_batch';
    } else if (type === 'qr') {
      defaultItem.width = props.width || 25;
      defaultItem.height = props.height || 25;
      defaultItem.dataQr = props.dataQr || 'qr_traceability';
    } else if (type === 'rect') {
      defaultItem.width = props.width || 80;
      defaultItem.height = props.height || 40;
    } else if (type === 'line') {
      defaultItem.width = props.width || 100;
      defaultItem.height = props.height || 0.5;
    }

    this.elements.push(defaultItem);
    this.render();
    this.selectElement(id);
    return defaultItem;
  }

  selectElement(id) {
    this.selectedId = id;
    this.renderSelectionBox();
    const elem = this.elements.find((e) => e.id === id) || null;
    if (this.onSelectionChange) {
      this.onSelectionChange(elem);
    }
  }

  updateSelectedElement(newProps) {
    if (!this.selectedId) return;
    const elem = this.elements.find((e) => e.id === this.selectedId);
    if (!elem) return;

    Object.assign(elem, newProps);
    this.render();
    this.renderSelectionBox();
  }

  deleteSelectedElement() {
    if (!this.selectedId) return;
    this.elements = this.elements.filter((e) => e.id !== this.selectedId);
    this.selectElement(null);
    this.render();
  }

  bringForward() {
    if (!this.selectedId) return;
    const idx = this.elements.findIndex((e) => e.id === this.selectedId);
    if (idx < this.elements.length - 1) {
      const temp = this.elements[idx];
      this.elements[idx] = this.elements[idx + 1];
      this.elements[idx + 1] = temp;
      this.render();
      this.renderSelectionBox();
    }
  }

  sendBackward() {
    if (!this.selectedId) return;
    const idx = this.elements.findIndex((e) => e.id === this.selectedId);
    if (idx > 0) {
      const temp = this.elements[idx];
      this.elements[idx] = this.elements[idx - 1];
      this.elements[idx - 1] = temp;
      this.render();
      this.renderSelectionBox();
    }
  }

  handleMouseDown(e) {
    const handleTarget = e.target.closest('[data-resize-handle]');
    if (handleTarget && this.selectedId) {
      const handleType = handleTarget.getAttribute('data-resize-handle');
      const elem = this.elements.find((el) => el.id === this.selectedId);
      const coords = this.getSvgCoordinates(e);
      this.resizeState = {
        handleType,
        startX: coords.x,
        startY: coords.y,
        startW: elem.width,
        startH: elem.height,
        startElemX: elem.x,
        startElemY: elem.y,
      };
      e.stopPropagation();
      return;
    }

    const target = e.target.closest('[data-element-id]');
    if (target) {
      const id = target.getAttribute('data-element-id');
      this.selectElement(id);
      const coords = this.getSvgCoordinates(e);
      const elem = this.elements.find((el) => el.id === id);
      this.dragState = {
        id,
        startX: coords.x,
        startY: coords.y,
        elemStartX: elem.x,
        elemStartY: elem.y,
      };
      e.stopPropagation();
    }
  }

  handleMouseMove(e) {
    if (this.resizeState && this.selectedId) {
      const elem = this.elements.find((el) => el.id === this.selectedId);
      if (!elem) return;
      const coords = this.getSvgCoordinates(e);
      const dx = coords.x - this.resizeState.startX;
      const dy = coords.y - this.resizeState.startY;

      if (this.resizeState.handleType === 'se') {
        elem.width = Math.max(2, parseFloat((this.resizeState.startW + dx).toFixed(2)));
        elem.height = Math.max(1, parseFloat((this.resizeState.startH + dy).toFixed(2)));
      } else if (this.resizeState.handleType === 'sw') {
        const newW = Math.max(2, parseFloat((this.resizeState.startW - dx).toFixed(2)));
        elem.x = parseFloat((this.resizeState.startElemX + (this.resizeState.startW - newW)).toFixed(2));
        elem.width = newW;
        elem.height = Math.max(1, parseFloat((this.resizeState.startH + dy).toFixed(2)));
      }

      this.render();
      this.renderSelectionBox();
      if (this.onSelectionChange) this.onSelectionChange(elem);
      return;
    }

    if (!this.dragState) return;
    const coords = this.getSvgCoordinates(e);
    const dx = coords.x - this.dragState.startX;
    const dy = coords.y - this.dragState.startY;

    const elem = this.elements.find((el) => el.id === this.dragState.id);
    if (elem) {
      elem.x = Math.max(0, parseFloat((this.dragState.elemStartX + dx).toFixed(2)));
      elem.y = Math.max(0, parseFloat((this.dragState.elemStartY + dy).toFixed(2)));
      this.render();
      this.renderSelectionBox();
      if (this.onSelectionChange) this.onSelectionChange(elem);
    }
  }

  handleMouseUp() {
    this.dragState = null;
    this.resizeState = null;
  }

  renderSelectionBox() {
    this.selectionLayer.innerHTML = '';
    if (!this.selectedId) return;

    const elem = this.elements.find((e) => e.id === this.selectedId);
    if (!elem) return;

    let x = elem.x, y = elem.y, w = elem.width, h = elem.height;
    if (elem.type === 'text') {
      y = elem.y - elem.fontSize;
      h = elem.fontSize * 1.3;
      w = Math.max(10, (elem.text.length * elem.fontSize) * 0.6);
    }

    const pad = 0.8; // mm padding
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x - pad);
    rect.setAttribute('y', y - pad);
    rect.setAttribute('width', w + (pad * 2));
    rect.setAttribute('height', h + (pad * 2));
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', '#3b82f6');
    rect.setAttribute('stroke-width', '0.4');
    rect.setAttribute('stroke-dasharray', '1,1');

    this.selectionLayer.appendChild(rect);

    // Corner Resize Handles (SE & SW)
    if (elem.type !== 'text') {
      const handleSize = 2.2; // mm
      const addHandle = (hx, hy, handleType) => {
        const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        handle.setAttribute('x', hx - handleSize / 2);
        handle.setAttribute('y', hy - handleSize / 2);
        handle.setAttribute('width', handleSize);
        handle.setAttribute('height', handleSize);
        handle.setAttribute('fill', '#2563eb');
        handle.setAttribute('stroke', '#ffffff');
        handle.setAttribute('stroke-width', '0.3');
        handle.setAttribute('data-resize-handle', handleType);
        handle.setAttribute('style', 'cursor: se-resize; pointer-events: all;');
        this.selectionLayer.appendChild(handle);
      };

      addHandle(x + w + pad, y + h + pad, 'se');
      addHandle(x - pad, y + h + pad, 'sw');
    }
  }

  render() {
    this.elementsLayer.innerHTML = '';

    for (const elem of this.elements) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('data-element-id', elem.id);
      g.setAttribute('style', 'cursor: move;');

      if (elem.type === 'text') {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', elem.x);
        text.setAttribute('y', elem.y);
        text.setAttribute('font-family', elem.fontFamily || 'Arial');
        text.setAttribute('font-size', elem.fontSize);
        text.setAttribute('font-weight', elem.fontWeight || 'normal');
        text.setAttribute('fill', '#000000');
        text.textContent = elem.text;
        g.appendChild(text);
      } else if (elem.type === 'barcode') {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', elem.x);
        rect.setAttribute('y', elem.y);
        rect.setAttribute('width', elem.width);
        rect.setAttribute('height', elem.height);
        rect.setAttribute('fill', 'rgba(59, 130, 246, 0.05)');
        rect.setAttribute('stroke', '#000000');
        rect.setAttribute('stroke-width', '0.3');
        rect.setAttribute('stroke-dasharray', '1,1');
        rect.setAttribute('data-barcode', elem.dataBarcode);
        g.appendChild(rect);

        const lineCount = Math.floor(elem.width / 1.5);
        for (let i = 0; i < lineCount; i++) {
          const bar = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          const lx = elem.x + (i * 1.5) + 0.8;
          bar.setAttribute('x1', lx);
          bar.setAttribute('y1', elem.y + 1);
          bar.setAttribute('x2', lx);
          bar.setAttribute('y2', elem.y + elem.height - 3);
          bar.setAttribute('stroke', '#000000');
          bar.setAttribute('stroke-width', (i % 3 === 0) ? '0.6' : '0.3');
          g.appendChild(bar);
        }

        const tag = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tag.setAttribute('x', elem.x + elem.width / 2);
        tag.setAttribute('y', elem.y + elem.height - 0.8);
        tag.setAttribute('font-family', 'monospace');
        tag.setAttribute('font-size', '2.2');
        tag.setAttribute('text-anchor', 'middle');
        tag.setAttribute('fill', '#000000');
        tag.textContent = `[BARCODE: ${elem.dataBarcode}]`;
        g.appendChild(tag);
      } else if (elem.type === 'qr') {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', elem.x);
        rect.setAttribute('y', elem.y);
        rect.setAttribute('width', elem.width);
        rect.setAttribute('height', elem.height);
        rect.setAttribute('fill', 'rgba(16, 185, 129, 0.05)');
        rect.setAttribute('stroke', '#000000');
        rect.setAttribute('stroke-width', '0.3');
        rect.setAttribute('data-qr', elem.dataQr);
        g.appendChild(rect);

        const sz = Math.min(elem.width, elem.height);
        const markerSize = Math.max(3, sz * 0.22);

        const addMarker = (mx, my) => {
          const outer = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          outer.setAttribute('x', mx);
          outer.setAttribute('y', my);
          outer.setAttribute('width', markerSize);
          outer.setAttribute('height', markerSize);
          outer.setAttribute('fill', '#000');
          g.appendChild(outer);

          const innerW = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          innerW.setAttribute('x', mx + markerSize * 0.2);
          innerW.setAttribute('y', my + markerSize * 0.2);
          innerW.setAttribute('width', markerSize * 0.6);
          innerW.setAttribute('height', markerSize * 0.6);
          innerW.setAttribute('fill', '#fff');
          g.appendChild(innerW);

          const centerB = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          centerB.setAttribute('x', mx + markerSize * 0.35);
          centerB.setAttribute('y', my + markerSize * 0.35);
          centerB.setAttribute('width', markerSize * 0.3);
          centerB.setAttribute('height', markerSize * 0.3);
          centerB.setAttribute('fill', '#000');
          g.appendChild(centerB);
        };

        addMarker(elem.x + 0.8, elem.y + 0.8);
        addMarker(elem.x + sz - markerSize - 0.8, elem.y + 0.8);
        addMarker(elem.x + 0.8, elem.y + sz - markerSize - 0.8);

        const qrText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        qrText.setAttribute('x', elem.x + sz / 2);
        qrText.setAttribute('y', elem.y + sz / 2 + 1);
        qrText.setAttribute('font-family', 'sans-serif');
        qrText.setAttribute('font-size', '2');
        qrText.setAttribute('font-weight', 'bold');
        qrText.setAttribute('text-anchor', 'middle');
        qrText.setAttribute('fill', '#10b981');
        qrText.textContent = `QR: ${elem.dataQr}`;
        g.appendChild(qrText);
      } else if (elem.type === 'rect') {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', elem.x);
        rect.setAttribute('y', elem.y);
        rect.setAttribute('width', elem.width);
        rect.setAttribute('height', elem.height);
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', '#000000');
        rect.setAttribute('stroke-width', elem.strokeWidth || '0.5');
        g.appendChild(rect);
      } else if (elem.type === 'line') {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', elem.x);
        line.setAttribute('y1', elem.y);
        line.setAttribute('x2', elem.x + elem.width);
        line.setAttribute('y2', elem.y);
        line.setAttribute('stroke', '#000000');
        line.setAttribute('stroke-width', elem.strokeWidth || '0.5');
        g.appendChild(line);
      }

      this.elementsLayer.appendChild(g);
    }
  }

  exportToSvg() {
    let elementsXml = '';

    for (const elem of this.elements) {
      if (elem.type === 'text') {
        elementsXml += `  <text x="${elem.x.toFixed(2)}" y="${elem.y.toFixed(2)}" font-family="${elem.fontFamily || 'Arial'}" font-size="${elem.fontSize.toFixed(2)}" font-weight="${elem.fontWeight || 'normal'}" fill="#000000">${elem.text}</text>\n`;
      } else if (elem.type === 'barcode') {
        elementsXml += `  <rect x="${elem.x.toFixed(2)}" y="${elem.y.toFixed(2)}" width="${elem.width.toFixed(2)}" height="${elem.height.toFixed(2)}" data-barcode="${elem.dataBarcode}" fill="none" />\n`;
      } else if (elem.type === 'qr') {
        elementsXml += `  <rect x="${elem.x.toFixed(2)}" y="${elem.y.toFixed(2)}" width="${elem.width.toFixed(2)}" height="${elem.height.toFixed(2)}" data-qr="${elem.dataQr}" fill="none" />\n`;
      } else if (elem.type === 'rect') {
        elementsXml += `  <rect x="${elem.x.toFixed(2)}" y="${elem.y.toFixed(2)}" width="${elem.width.toFixed(2)}" height="${elem.height.toFixed(2)}" fill="none" stroke="#000000" stroke-width="${(elem.strokeWidth || 0.5).toFixed(2)}" />\n`;
      } else if (elem.type === 'line') {
        elementsXml += `  <line x1="${elem.x.toFixed(2)}" y1="${elem.y.toFixed(2)}" x2="${(elem.x + elem.width).toFixed(2)}" y2="${elem.y.toFixed(2)}" stroke="#000000" stroke-width="${(elem.strokeWidth || 0.5).toFixed(2)}" />\n`;
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.widthMm}mm" height="${this.heightMm}mm" viewBox="0 0 ${this.widthMm} ${this.heightMm}">
${elementsXml}</svg>`;
  }

  loadFromSvg(svgContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgRoot = doc.querySelector('svg');
    if (!svgRoot) return;

    const rawW = svgRoot.getAttribute('width');
    const rawH = svgRoot.getAttribute('height');
    if (rawW && rawH) {
      const matchW = rawW.match(/([\d\.]+)/);
      const matchH = rawH.match(/([\d\.]+)/);
      if (matchW && matchH) {
        this.widthMm = parseFloat(matchW[1]);
        this.heightMm = parseFloat(matchH[1]);
      }
    }

    // Determine scale factor between viewBox coordinates and target mm coordinates
    let scaleX = 1.0;
    let scaleY = 1.0;
    const viewBoxAttr = svgRoot.getAttribute('viewBox');
    if (viewBoxAttr) {
      const vbParts = viewBoxAttr.trim().split(/[\s,]+/).map(parseFloat);
      if (vbParts.length === 4 && vbParts[2] > 0 && vbParts[3] > 0) {
        scaleX = this.widthMm / vbParts[2];
        scaleY = this.heightMm / vbParts[3];
      }
    }

    this.elements = [];

    doc.querySelectorAll('text').forEach((textNode) => {
      const rawX = parseFloat(textNode.getAttribute('x') || 0);
      const rawY = parseFloat(textNode.getAttribute('y') || 0);
      const rawFs = parseFloat(textNode.getAttribute('font-size') || 5);
      const ff = textNode.getAttribute('font-family') || 'Arial';
      const fw = textNode.getAttribute('font-weight') || 'normal';
      const text = textNode.textContent.trim();

      this.elements.push({
        id: 'elem_' + Math.random().toString(36).substr(2, 9),
        type: 'text',
        x: parseFloat((rawX * scaleX).toFixed(2)),
        y: parseFloat((rawY * scaleY).toFixed(2)),
        width: 30,
        height: 10,
        text,
        fontSize: parseFloat((rawFs * scaleY).toFixed(2)),
        fontFamily: ff,
        fontWeight: fw,
      });
    });

    doc.querySelectorAll('rect').forEach((rectNode) => {
      const rawX = parseFloat(rectNode.getAttribute('x') || 0);
      const rawY = parseFloat(rectNode.getAttribute('y') || 0);
      const rawW = parseFloat(rectNode.getAttribute('width') || 10);
      const rawH = parseFloat(rectNode.getAttribute('height') || 10);
      const bc = rectNode.getAttribute('data-barcode');
      const qr = rectNode.getAttribute('data-qr');
      const rawSw = parseFloat(rectNode.getAttribute('stroke-width') || 0.5);

      const x = parseFloat((rawX * scaleX).toFixed(2));
      const y = parseFloat((rawY * scaleY).toFixed(2));
      const w = parseFloat((rawW * scaleX).toFixed(2));
      const h = parseFloat((rawH * scaleY).toFixed(2));
      const sw = parseFloat((rawSw * scaleY).toFixed(2));

      if (bc) {
        this.elements.push({
          id: 'elem_' + Math.random().toString(36).substr(2, 9),
          type: 'barcode',
          x,
          y,
          width: w,
          height: h,
          dataBarcode: bc,
        });
      } else if (qr) {
        this.elements.push({
          id: 'elem_' + Math.random().toString(36).substr(2, 9),
          type: 'qr',
          x,
          y,
          width: w,
          height: h,
          dataQr: qr,
        });
      } else if (rectNode.id !== 'bgGrid') {
        this.elements.push({
          id: 'elem_' + Math.random().toString(36).substr(2, 9),
          type: 'rect',
          x,
          y,
          width: w,
          height: h,
          strokeWidth: sw || 0.5,
        });
      }
    });

    doc.querySelectorAll('line').forEach((lineNode) => {
      const rawX1 = parseFloat(lineNode.getAttribute('x1') || 0);
      const rawY1 = parseFloat(lineNode.getAttribute('y1') || 0);
      const rawX2 = parseFloat(lineNode.getAttribute('x2') || 10);
      const rawSw = parseFloat(lineNode.getAttribute('stroke-width') || 0.5);

      const x1 = parseFloat((rawX1 * scaleX).toFixed(2));
      const y1 = parseFloat((rawY1 * scaleY).toFixed(2));
      const x2 = parseFloat((rawX2 * scaleX).toFixed(2));

      this.elements.push({
        id: 'elem_' + Math.random().toString(36).substr(2, 9),
        type: 'line',
        x: x1,
        y: y1,
        width: Math.abs(x2 - x1),
        height: parseFloat((rawSw * scaleY).toFixed(2)) || 0.5,
        strokeWidth: parseFloat((rawSw * scaleY).toFixed(2)) || 0.5,
      });
    });

    this.setDimensions(this.widthMm, this.heightMm, this.dpi);
  }
}
