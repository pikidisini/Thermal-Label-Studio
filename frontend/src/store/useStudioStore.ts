import { create } from 'zustand';
import type { ViewMode, ActiveTool, ActiveTab, CursorPosition } from '../types/label';
import type { ExtendedFabricObject } from '../types/fabric-custom';

interface StudioState {
  zoom: number;
  viewMode: ViewMode;
  activeTool: ActiveTool;
  activeTab: ActiveTab;
  isSnapEnabled: boolean;
  areGuidesEnabled: boolean;
  cursorPos: CursorPosition;
  selectedObject: ExtendedFabricObject | null;
  selectedObjectProps: Record<string, any> | null;
  fitTrigger: number;
  reset100Trigger: number;

  // Actions
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  setViewMode: (mode: ViewMode) => void;
  setActiveTool: (tool: ActiveTool) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setIsSnapEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void;
  setAreGuidesEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void;
  toggleSnap: () => void;
  toggleGuides: () => void;
  setCursorPos: (pos: CursorPosition) => void;
  setSelectedObject: (obj: ExtendedFabricObject | null) => void;
  setSelectedObjectProps: (props: Record<string, any> | null) => void;
  triggerFit: () => void;
  triggerReset100: () => void;
}

export const useStudioStore = create<StudioState>((set) => ({
  zoom: 1.0,
  viewMode: 'design',
  activeTool: 'select',
  activeTab: 'tools',
  isSnapEnabled: true,
  areGuidesEnabled: true,
  cursorPos: { xMm: '0.0', yMm: '0.0' },
  selectedObject: null,
  selectedObjectProps: null,
  fitTrigger: 0,
  reset100Trigger: 0,

  setZoom: (zoom) =>
    set((state) => ({
      zoom: typeof zoom === 'function' ? zoom(state.zoom) : zoom,
    })),
  setViewMode: (viewMode) => set({ viewMode }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setIsSnapEnabled: (isSnapEnabled) =>
    set((state) => ({
      isSnapEnabled:
        typeof isSnapEnabled === 'function'
          ? isSnapEnabled(state.isSnapEnabled)
          : isSnapEnabled,
    })),
  setAreGuidesEnabled: (areGuidesEnabled) =>
    set((state) => ({
      areGuidesEnabled:
        typeof areGuidesEnabled === 'function'
          ? areGuidesEnabled(state.areGuidesEnabled)
          : areGuidesEnabled,
    })),
  toggleSnap: () => set((state) => ({ isSnapEnabled: !state.isSnapEnabled })),
  toggleGuides: () => set((state) => ({ areGuidesEnabled: !state.areGuidesEnabled })),
  setCursorPos: (cursorPos) => set({ cursorPos }),
  setSelectedObject: (selectedObject) => set({ selectedObject }),
  setSelectedObjectProps: (selectedObjectProps) => set({ selectedObjectProps }),
  triggerFit: () => set((state) => ({ fitTrigger: state.fitTrigger + 1 })),
  triggerReset100: () => set((state) => ({ reset100Trigger: state.reset100Trigger + 1 })),
}));
