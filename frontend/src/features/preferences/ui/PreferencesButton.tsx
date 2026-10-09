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
export function PreferencesButton() {
  const [open, setOpen] = React.useState(false);
  const t = useTranslation();
  return <><Button data-testid="preferences-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>{t('Preference')}</Button><PreferencesDialog open={open} onClose={() => setOpen(false)} /></>;
}
export function PreferencesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslation();
  const preferences = usePreferencesStore();
  const [selectedTheme, setSelectedTheme] = React.useState<Theme>(preferences.theme);
  const [draft, setDraft] = React.useState(() => preferences.customTheme ?? newCustomTheme());
  React.useEffect(() => {
    if (open) { setSelectedTheme(preferences.theme); setDraft(preferences.customTheme ?? newCustomTheme()); }
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
          <Field label={t('Theme')}><Select data-testid="preferences-theme" value={selectedTheme} onChange={event => { const value = event.target.value as Theme; setSelectedTheme(value); if (value !== 'custom') preferences.setTheme(value); }}><option value="dark">{t('Dark')}</option><option value="light">{t('Light')}</option><option value="industrial-dark">{t('Industrial Dark')}</option><option value="industrial-light">{t('Industrial Light')}</option><option value="system">{t('System')}</option><option value="custom">{t('Custom')}</option></Select></Field>
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
