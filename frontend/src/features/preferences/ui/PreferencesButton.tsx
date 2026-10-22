import React from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw } from 'lucide-react';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { Icon, Button, Dialog, DialogBody, DialogFooter, DialogHeader, Field, IconButton, Select } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import { usePreferencesStore } from '../model/usePreferencesStore';
import type { Language, Theme } from '../model/preferences';
import { COLOR_KEYS, isHexColor, newCustomTheme } from '../model/customTheme';
import { CustomThemeEditor } from './CustomThemeEditor';
import { AnchoredOverlay } from '../../../shared/ui/layers';
import { signatureDraft } from '../model/signatureTheme';
export function PreferencesButton() {
  const [open, setOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const overlay = React.useRef<HTMLDivElement>(null);
  const item = React.useRef<HTMLButtonElement>(null);
  const t = useTranslation();
  React.useEffect(() => {
    if (!menuOpen) return;
    const focusFrame = requestAnimationFrame(() => item.current?.focus());
    const outside = (event: MouseEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !overlay.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); trigger.current?.focus(); }
      if (event.key === 'Tab') setMenuOpen(false);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); item.current?.focus(); }
    };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', key);
    return () => { cancelAnimationFrame(focusFrame); document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', key); };
  }, [menuOpen]);
  return <><Button ref={trigger} data-testid="topbar-menu-btn-view" variant="toolbar" aria-haspopup="menu" aria-expanded={menuOpen}
    onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setMenuOpen(true); } }}
    onClick={() => setMenuOpen(value => !value)}>{t('View')}</Button>
    {menuOpen && <AnchoredOverlay anchorRef={trigger} overlayRef={overlay}><div role="menu" aria-label={t('View')} className="min-w-44 border border-outline-variant bg-surface-container-lowest py-1 shadow-xl" data-ui-surface="flyout">
      <Button ref={item} role="menuitem" variant="menu" className="block w-full text-left" data-testid="preferences-button" onClick={() => { trigger.current?.focus(); setMenuOpen(false); setOpen(true); }}>{t('Preference')}</Button>
    </div></AnchoredOverlay>}
    <PreferencesDialog open={open} onClose={() => setOpen(false)} /></>;
}

export function PreferencesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslation();
  const preferences = usePreferencesStore();
  const [selectedTheme, setSelectedTheme] = React.useState<Theme>(preferences.theme);
  const [draft, setDraft] = React.useState(() => preferences.theme === 'label-studio-signature' ? signatureDraft() : preferences.customTheme ?? newCustomTheme());
  React.useEffect(() => {
    if (open) { setSelectedTheme(preferences.theme); setDraft(preferences.theme === 'label-studio-signature' ? signatureDraft() : preferences.customTheme ?? newCustomTheme()); }
  }, [open]);
  const dialogRef = useModalA11y(open, onClose);
  return <>
    {open && createPortal(<div className="fixed inset-0 z-[var(--ui-layer-modal)] flex items-center justify-center p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} data-ui-backdrop="true">
      <Dialog ref={dialogRef} tabIndex={-1} aria-labelledby="preferences-title" data-testid="preferences-dialog" className="w-full max-w-[710px] max-h-[calc(100dvh-2rem)] overflow-y-auto" onKeyDown={event => {
        // Chrome can undo a previously focused canvas field while a button is
        // focused here. Settings contains only selects/buttons; consume browser
        // history shortcuts outside editable custom HEX fields as well as
        // keeping them out of editor shortcuts.
        if (!(event.target instanceof HTMLInputElement) && (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) event.preventDefault();
      }}>
        <DialogHeader><h2 id="preferences-title">{t('Preference')}</h2></DialogHeader>
        <DialogBody className="space-y-4">
          <Field label={t('Language')}><Select data-testid="preferences-language" value={preferences.language} onChange={event => preferences.setLanguage(event.target.value as Language)}><option value="en">English</option><option value="id">Bahasa Indonesia</option></Select></Field>
          <Field label={t('Theme')}><Select data-testid="preferences-theme" value={selectedTheme} onChange={event => { const value = event.target.value as Theme; setSelectedTheme(value); if (value === 'label-studio-signature') setDraft(signatureDraft()); if (value !== 'custom') preferences.setTheme(value); }}><option value="label-studio-signature">Label Studio Signature</option><option value="dark">{t('Dark')}</option><option value="light">{t('Light')}</option><option value="industrial-dark">{t('Industrial Dark')}</option><option value="industrial-light">{t('Industrial Light')}</option><option value="system">{t('System')}</option><option value="custom">{t('Custom')}</option></Select></Field>
          <CustomThemeEditor draft={draft} onChange={value => { setDraft(value); setSelectedTheme('custom'); }} />
          <p className="text-xs text-on-surface-variant">{t('Preferences are saved in this browser. Label content and exports are unchanged.')}</p>
        </DialogBody>
        <DialogFooter className="flex items-center justify-between gap-2">
          <IconButton label={t('Reset colors')} data-testid="custom-theme-reset" onClick={() => { setDraft(newCustomTheme(draft.base)); setSelectedTheme('custom'); }}><Icon component={RotateCcw} aria-hidden="true"  size="control" /></IconButton><div className="ml-auto flex gap-2"><Button data-testid="preferences-close" onClick={onClose}>{t('Cancel')}</Button><Button tone="primary" data-testid="custom-theme-apply" disabled={selectedTheme === 'custom' && !COLOR_KEYS.every(key => isHexColor(draft.colors[key]))} onClick={() => { preferences.applyTheme(selectedTheme, selectedTheme === 'custom' ? draft : undefined); onClose(); }}>{t('Apply')}</Button></div>
        </DialogFooter>
      </Dialog>
    </div>, document.body)}
  </>;
}
