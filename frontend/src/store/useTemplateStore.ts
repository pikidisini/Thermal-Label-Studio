import { create } from 'zustand';
import type { TemplateMetadata } from '../types/template';

interface TemplateState {
  templates: TemplateMetadata[];
  activeTemplateId: string;
  labelWidthMm: number;
  labelHeightMm: number;
  isCanvasModalOpen: boolean;
  canvasModalMode: 'resize' | 'new';
  isSaveModalOpen: boolean;
  isShortcutModalOpen: boolean;
  isDiagnosticsModalOpen: boolean;
  isDirty: boolean;

  // Actions
  setTemplates: (templates: TemplateMetadata[]) => void;
  setActiveTemplateId: (id: string) => void;
  setDimensions: (widthMm: number, heightMm: number) => void;
  setLabelWidthMm: (w: number) => void;
  setLabelHeightMm: (h: number) => void;
  setCanvasModalOpen: (open: boolean, mode?: 'resize' | 'new') => void;
  setCanvasModalMode: (mode: 'resize' | 'new') => void;
  setSaveModalOpen: (open: boolean) => void;
  setShortcutModalOpen: (open: boolean) => void;
  setDiagnosticsModalOpen: (open: boolean) => void;
  setIsDirty: (dirty: boolean) => void;
}

export const useTemplateStore = create<TemplateState>((set) => ({
  templates: [],
  activeTemplateId: 'standard_goods_receipt',
  labelWidthMm: 200,
  labelHeightMm: 80,
  isCanvasModalOpen: false,
  canvasModalMode: 'resize',
  isSaveModalOpen: false,
  isShortcutModalOpen: false,
  isDiagnosticsModalOpen: false,
  isDirty: false,

  setTemplates: (templates) => set({ templates }),
  setActiveTemplateId: (activeTemplateId) => set({ activeTemplateId }),
  setDimensions: (labelWidthMm, labelHeightMm) => set({ labelWidthMm, labelHeightMm }),
  setLabelWidthMm: (labelWidthMm) => set({ labelWidthMm }),
  setLabelHeightMm: (labelHeightMm) => set({ labelHeightMm }),
  setCanvasModalOpen: (isCanvasModalOpen, canvasModalMode = 'resize') =>
    set({ isCanvasModalOpen, canvasModalMode }),
  setCanvasModalMode: (canvasModalMode) => set({ canvasModalMode }),
  setSaveModalOpen: (isSaveModalOpen) => set({ isSaveModalOpen }),
  setShortcutModalOpen: (isShortcutModalOpen) => set({ isShortcutModalOpen }),
  setDiagnosticsModalOpen: (isDiagnosticsModalOpen) => set({ isDiagnosticsModalOpen }),
  setIsDirty: (isDirty) => set({ isDirty }),
}));
