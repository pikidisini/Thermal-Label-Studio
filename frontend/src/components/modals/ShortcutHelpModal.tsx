import { translate as t, useTranslation } from "../../shared/i18n";
import React from 'react';
import { X, Keyboard, Command, MousePointer, Move, ZoomIn, Undo, Redo, Copy, Trash2 } from 'lucide-react';
import { Icon, Button, Dialog, DialogFooter, DialogHeader, IconButton } from '../../shared/ui';

const SHORTCUT_GROUPS = [
  {
    category: 'Vector Creation Tools (Click or Drag to Size)',
    items: [
      { keys: ['V'], desc: 'Vector Select Tool' },
      { keys: ['T'], desc: 'Text Tool (Click or Drag to define box)' },
      { keys: ['B'], desc: '1D Barcode Tool (Click or Drag to define size)' },
      { keys: ['M'], desc: '2D QR / DataMatrix Tool (Click or Drag to define size)' },
      { keys: ['L'], desc: 'Separator Line Tool (Click or Drag endpoints, Shift snaps)' },
      { keys: ['G'], desc: 'Manifest Table Grid Tool (Click or Drag to define size)' },
      { keys: ['Esc'], desc: 'Cancel active tool & return to Select [V]' },
    ]
  },
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
  useTranslation();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[var(--ui-layer-modal)] flex items-center justify-center backdrop-blur-xs animate-fadeIn select-none p-4" data-ui-backdrop="true" data-ui-motion="true">
      <Dialog className="w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <DialogHeader className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 bg-primary-container/10 border border-primary-container flex items-center justify-center text-primary">
              <Icon component={Keyboard}  size="control" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-on-surface">{t("Keyboard & Mouse Shortcuts")}</h2>
              <p className="text-xs text-on-surface-variant">{t("Professional CAD / Vector workflows (Photoshop, Inkscape, Illustrator style)")} </p>
            </div>
          </div>
          <IconButton
            onClick={onClose}

            label={t("Close keyboard shortcuts")}
          >
            <Icon component={X}  size="control" />
          </IconButton>
        </DialogHeader>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {SHORTCUT_GROUPS.map((grp, idx) => (
            <div key={idx} className="space-y-2">
              <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider font-mono">
                {t(grp.category)}
              </h3>
              <div className="bg-surface-container border border-outline-variant divide-y divide-outline-variant/60">
                {grp.items.map((item, i) => (
                  <div key={i} className="px-3.5 py-2 flex items-center justify-between text-xs">
                    <span className="text-on-surface">{t(item.desc)}</span>
                    <div className="flex items-center space-x-1 shrink-0 ml-3">
                      {item.keys.map((k, ki) => (
                        <span
                          key={ki}
                          className={`${
                            k === '+' || k === '/'
                              ? 'text-outline text-[10px]'
                              : 'px-1.5 py-0.5 bg-surface-container-lowest border border-outline-variant text-on-surface font-mono text-[11px] shadow-xs'
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
        <DialogFooter className="flex items-center justify-between">
          <span>{t("Press")} <kbd className="px-1 py-0.5 bg-surface-container border border-outline-variant font-mono text-[10px] text-on-surface">?</kbd> {t("to toggle this dialog anytime")}</span>
          <Button
            onClick={onClose}
            tone="primary"

           variant="default">{t("Got it")} </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
