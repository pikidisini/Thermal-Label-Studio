/**
 * Thermal Printhead Simulator & Live Preview Manager
 */

import { ApiClient } from './api_client.js';

export class ThermalSimulator {
  constructor(previewContainerId, imgElementId) {
    this.container = document.getElementById(previewContainerId);
    this.previewImg = document.getElementById(imgElementId);
    this.spinner = document.getElementById('previewSpinner');
    this.currentBlobUrl = null;
    this.zoomLevel = 1.0;
    this.rotation = 0;
    this.currentMode = 'design'; // 'design', 'vector_preview', 'thermal_1bit'
  }

  setZoom(zoom) {
    this.zoomLevel = Math.max(0.2, Math.min(4.0, zoom));
    const artboards = document.querySelectorAll('.label-artboard, .preview-artboard');
    artboards.forEach((ab) => {
      ab.style.transform = `scale(${this.zoomLevel})`;
    });
    const zoomText = document.getElementById('zoomDisplay');
    if (zoomText) {
      zoomText.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }
  }

  setRotation(angle) {
    this.rotation = angle % 360;
  }

  async updateSimulation({ data, templateSvg, dpi = 203.2, binarizationThreshold = null, widthMm = 200, heightMm = 80 }) {
    if (this.currentMode === 'design') return;

    const previewType = this.currentMode === 'thermal_1bit' ? 'monochrome_1bit' : 'png';

    try {
      if (this.spinner) this.spinner.style.display = 'flex';
      if (this.previewImg) this.previewImg.style.opacity = '0.4';

      const blob = await ApiClient.getPreviewBlob({
        data,
        templateSvg,
        previewType,
        dpi,
        rotation: this.rotation,
        binarizationThreshold,
        widthMm,
        heightMm,
      });

      if (this.currentBlobUrl) {
        URL.revokeObjectURL(this.currentBlobUrl);
      }

      this.currentBlobUrl = URL.createObjectURL(blob);
      if (this.previewImg) {
        this.previewImg.src = this.currentBlobUrl;
        this.previewImg.style.opacity = '1.0';
      }
    } catch (e) {
      console.error('Simulation preview failed:', e);
    } finally {
      if (this.spinner) this.spinner.style.display = 'none';
    }
  }
}
