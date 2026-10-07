import { create } from 'zustand';

interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  isLocked: boolean;
  undoStack: string[];
  redoStack: string[];

  // Actions
  setCanUndo: (canUndo: boolean) => void;
  setCanRedo: (canRedo: boolean) => void;
  lockHistory: () => void;
  unlockHistory: () => void;
  pushState: (stateJson: string) => void;
  popUndo: () => string | undefined;
  popRedo: () => string | undefined;
  pushRedo: (stateJson: string) => void;
  pushUndo: (stateJson: string) => void;
  undo: () => string | undefined;
  redo: () => string | undefined;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  canUndo: false,
  canRedo: false,
  isLocked: false,
  undoStack: [],
  redoStack: [],

  setCanUndo: (canUndo) => set({ canUndo }),
  setCanRedo: (canRedo) => set({ canRedo }),
  lockHistory: () => set({ isLocked: true }),
  unlockHistory: () => set({ isLocked: false }),

  pushState: (stateJson: string) => {
    const { isLocked, undoStack } = get();
    if (isLocked) return;
    const newStack = [...undoStack, stateJson];
    if (newStack.length > 50) newStack.shift();
    set({
      undoStack: newStack,
      redoStack: [],
      canUndo: newStack.length > 1,
      canRedo: false,
    });
  },

  popUndo: () => {
    const { undoStack } = get();
    if (undoStack.length <= 1) return undefined;
    const newStack = [...undoStack];
    const item = newStack.pop();
    set({
      undoStack: newStack,
      canUndo: newStack.length > 1,
    });
    return item;
  },

  popRedo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return undefined;
    const newStack = [...redoStack];
    const item = newStack.pop();
    set({
      redoStack: newStack,
      canRedo: newStack.length > 0,
    });
    return item;
  },

  undo: () => {
    const { undoStack, redoStack, isLocked } = get();
    if (undoStack.length <= 1 || isLocked) return undefined;
    const newUndo = [...undoStack];
    const currentState = newUndo.pop();
    if (!currentState) return undefined;
    const newRedo = [...redoStack, currentState];
    const prevState = newUndo[newUndo.length - 1];
    set({
      undoStack: newUndo,
      redoStack: newRedo,
      canUndo: newUndo.length > 1,
      canRedo: newRedo.length > 0,
    });
    return prevState;
  },

  redo: () => {
    const { undoStack, redoStack, isLocked } = get();
    if (redoStack.length === 0 || isLocked) return undefined;
    const newRedo = [...redoStack];
    const nextState = newRedo.pop();
    if (!nextState) return undefined;
    const newUndo = [...undoStack, nextState];
    set({
      undoStack: newUndo,
      redoStack: newRedo,
      canUndo: newUndo.length > 1,
      canRedo: newRedo.length > 0,
    });
    return nextState;
  },

  pushRedo: (stateJson: string) => {
    const { redoStack } = get();
    const newStack = [...redoStack, stateJson];
    set({
      redoStack: newStack,
      canRedo: newStack.length > 0,
    });
  },

  pushUndo: (stateJson: string) => {
    const { undoStack } = get();
    const newStack = [...undoStack, stateJson];
    set({
      undoStack: newStack,
      canUndo: newStack.length > 0,
    });
  },

  clearHistory: () => {
    set({
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
    });
  },
}));
