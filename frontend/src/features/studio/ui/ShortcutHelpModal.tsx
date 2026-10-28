import { translate as t, useTranslation } from "../../../shared/i18n";
import React from 'react';
import { X, Keyboard } from 'lucide-react';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { STUDIO_SHORTCUTS, formatShortcut } from '../model/studioShortcuts';
import { Icon, Button, Dialog, DialogFooter, DialogHeader, IconButton } from '../../../shared/ui';

const GESTURES = [
  { keys: ['Ctrl/Cmd+Wheel / Pinch'], desc: 'Zoom at the pointer' },
  { keys: ['Wheel / Two-finger scroll'], desc: 'Pan canvas' },
  { keys: ['Shift+Scroll'], desc: 'Pan horizontally' },
  { keys: ['Space+Drag / Middle mouse+Drag'], desc: 'Pan canvas freely' },
];

export default function ShortcutHelpModal({ isOpen, onClose }: Readonly<{ isOpen: boolean; onClose: () => void }>) {
  useTranslation();
  const dialogRef = useModalA11y(isOpen, onClose);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const SHORTCUT_GROUPS = [...new Set(STUDIO_SHORTCUTS.map(item => item.group))].map(category => ({
    category,
    items: STUDIO_SHORTCUTS.filter(item => item.group === category).map(item => ({
      keys: [...new Set(item.bindings.map(binding => formatShortcut(binding, mac)))], desc: item.description,
    })),
  }));
  SHORTCUT_GROUPS.push({ category: 'Canvas navigation', items: GESTURES });
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[var(--ui-layer-modal)] flex items-center justify-center backdrop-blur-xs animate-fadeIn select-none p-4" data-ui-backdrop="true" data-ui-motion="true">
      <Dialog ref={dialogRef} tabIndex={-1} aria-labelledby="shortcut-help-title" data-testid="shortcut-help-dialog" onKeyDown={event => {
        if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!event.repeat) onClose(); }
      }} className="w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <DialogHeader className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 bg-primary-container/10 border border-primary-container flex items-center justify-center text-primary">
              <Icon component={Keyboard}  size="control" />
            </div>
            <div>
              <h2 id="shortcut-help-title" className="text-sm font-semibold text-on-surface">{t("Keyboard & Mouse Shortcuts")}</h2>
              <p className="text-xs text-on-surface-variant">{t("Shortcuts apply to Studio. Editing shortcuts require Design mode.")} </p>
              <p className="text-xs text-on-surface-variant">{t("Object copy/paste stays in this Studio tab until reload.")}</p>
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
          {SHORTCUT_GROUPS.map((grp) => (
            <div key={grp.category} className="space-y-2">
              <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider font-mono">
                {t(grp.category)}
              </h3>
              <div className="bg-surface-container border border-outline-variant divide-y divide-outline-variant/60">
                {grp.items.map((item) => (
                  <div key={item.desc} className="px-3.5 py-2 flex items-center justify-between text-xs">
                    <span className="text-on-surface">{t(item.desc)}</span>
                    <div className="flex flex-wrap justify-end gap-1 ml-3 max-w-[55%]">
                      {item.keys.map((k, ki) => (
                        <span
                          key={k}
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
          <span>{t("Press")} <kbd className="px-1 py-0.5 bg-surface-container border border-outline-variant font-mono text-[10px] text-on-surface">?</kbd> {t("to open or close this help. Escape also closes it.")}</span>
          <Button
            onClick={onClose}
            tone="primary"

           variant="default">{t("Got it")} </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
