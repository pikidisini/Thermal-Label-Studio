import React from 'react';
import { X, Keyboard, Command, MousePointer, Move, ZoomIn, Undo, Redo, Copy, Trash2 } from 'lucide-react';

const SHORTCUT_GROUPS = [
  {
    category: 'Canvas Navigation & Viewport (Photoshop/Inkscape)',
    items: [
      { keys: ['Touchpad Pinch', '/', 'Ctrl+Wheel'], desc: 'Fluid Zoom In / Out anchored at pointer (60–120 FPS)' },
      { keys: ['Touchpad 2 Fingers', '/', 'Mouse Wheel'], desc: 'Natural 2D Pan / Scroll canvas' },
      { keys: ['Shift', '+', 'Scroll'], desc: 'Horizontal scroll pan' },
      { keys: ['Space', '+', 'Drag'], desc: 'Hand Tool: Pan canvas freely' },
      { keys: ['Middle Click', '+', 'Drag'], desc: 'Quick Pan with middle mouse button' },
      { keys: ['Ctrl', '+', '0'], desc: 'Fit canvas perfectly to screen and center' },
      { keys: ['Ctrl', '+', '1'], desc: 'Reset zoom to 100% and center' },
      { keys: ['Auto-Fit Icon'], desc: 'Fit canvas perfectly to screen' },
    ]
  },
  {
    category: 'History & Edit Actions',
    items: [
      { keys: ['Ctrl', '+', 'Z'], desc: 'Undo last change' },
      { keys: ['Ctrl', '+', 'Y'], desc: 'Redo previously undone change' },
      { keys: ['Ctrl', '+', 'Shift', '+', 'Z'], desc: 'Alternative Redo' },
      { keys: ['Ctrl', '+', 'D'], desc: 'Duplicate selected element (+10mm)' },
      { keys: ['Delete', '/', 'Backspace'], desc: 'Delete selected element' },
      { keys: ['Ctrl', '+', 'A'], desc: 'Select all elements on canvas' },
      { keys: ['Esc', '/', 'Click Empty'], desc: 'Deselect active element' },
    ]
  },
  {
    category: 'Precision Element Nudge (Millimeters)',
    items: [
      { keys: ['Arrow Keys (↑ ↓ ← →)'], desc: 'Nudge element by exactly 1.0 mm' },
      { keys: ['Shift', '+', 'Arrows'], desc: 'Fast nudge by 5.0 mm' },
      { keys: ['Alt', '+', 'Arrows'], desc: 'Sub-millimeter micro nudge by 0.2 mm' },
    ]
  }
];

export default function ShortcutHelpModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs animate-fadeIn select-none p-4">
      <div className="bg-studio-darkest border border-studio-border rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-studio-border flex items-center justify-between bg-studio-darker">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Keyboard & Mouse Shortcuts</h2>
              <p className="text-xs text-gray-400">
                Professional CAD / Vector workflows (Photoshop, Inkscape, Illustrator style)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-studio-hover transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {SHORTCUT_GROUPS.map((grp, idx) => (
            <div key={idx} className="space-y-2">
              <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider font-mono">
                {grp.category}
              </h3>
              <div className="bg-studio-panel/50 border border-studio-border rounded-lg divide-y divide-studio-border/60">
                {grp.items.map((item, i) => (
                  <div key={i} className="px-3.5 py-2 flex items-center justify-between text-xs">
                    <span className="text-gray-300">{item.desc}</span>
                    <div className="flex items-center space-x-1 shrink-0 ml-3">
                      {item.keys.map((k, ki) => (
                        <span
                          key={ki}
                          className={`${
                            k === '+' || k === '/'
                              ? 'text-gray-500 text-[10px]'
                              : 'px-1.5 py-0.5 rounded bg-studio-darker border border-gray-600 text-gray-200 font-mono text-[11px] shadow-xs'
                          }`}
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-studio-border bg-studio-darker flex items-center justify-between text-xs text-gray-400">
          <span>Press <kbd className="px-1 py-0.5 rounded bg-studio-panel border border-gray-600 font-mono text-[10px] text-white">?</kbd> to toggle this dialog anytime</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-medium transition text-xs"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
