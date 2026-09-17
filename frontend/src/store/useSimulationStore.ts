import { create } from 'zustand';
import type { SvgInspectionResponse } from '../types/api';

interface SimulationState {
  isRendering: boolean;
  previewImage: string | null;
  thermalImage: string | null;
  inspectionData: SvgInspectionResponse | null;
  renderError: string | null;
  dpi: number;
  threshold: number;
  isPrintModalOpen: boolean;

  // Actions
  setIsRendering: (isRendering: boolean) => void;
  setPreviewImage: (previewImage: string | null) => void;
  setThermalImage: (thermalImage: string | null) => void;
  setInspectionData: (inspectionData: SvgInspectionResponse | null) => void;
  setRenderError: (renderError: string | null) => void;
  setDpi: (dpi: number) => void;
  setThreshold: (threshold: number) => void;
  setPrintModalOpen: (isPrintModalOpen: boolean) => void;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  isRendering: false,
  previewImage: null,
  thermalImage: null,
  inspectionData: null,
  renderError: null,
  dpi: 203.2,
  threshold: 128,
  isPrintModalOpen: false,

  setIsRendering: (isRendering) => set({ isRendering }),
  setPreviewImage: (previewImage) => set({ previewImage }),
  setThermalImage: (thermalImage) => set({ thermalImage }),
  setInspectionData: (inspectionData) => set({ inspectionData }),
  setRenderError: (renderError) => set({ renderError }),
  setDpi: (dpi) => set({ dpi }),
  setThreshold: (threshold) => set({ threshold }),
  setPrintModalOpen: (isPrintModalOpen) => set({ isPrintModalOpen }),
}));
