import React from 'react';
import { createPortal } from 'react-dom';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, Field, Select } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import { usePreferencesStore } from '../model/usePreferencesStore';
import type { Language, Theme } from '../model/preferences';
export function PreferencesButton() {
  const [open, setOpen] = React.useState(false);
  const t = useTranslation();
  const preferences = usePreferencesStore();
  const dialogRef = useModalA11y(open, () => setOpen(false));
  return <>
    <Button data-testid="preferences-button" aria-haspopup="dialog" onClick={() => setOpen(true)} variant="default">{t('Settings')}</Button>
    {open && createPortal(<div className="fixed inset-0 z-[var(--ui-layer-modal)] flex items-center justify-center p-4" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }} data-ui-backdrop="true">
      <Dialog ref={dialogRef} tabIndex={-1} aria-labelledby="preferences-title" data-testid="preferences-dialog" className="w-full max-w-sm" onKeyDown={event => {
        // Chrome can undo a previously focused canvas field while a button is
        // focused here. Settings contains only selects/buttons; consume browser
        // history shortcuts as well as keeping them out of editor shortcuts.
        if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) event.preventDefault();
      }}>
        <DialogHeader><h2 id="preferences-title">{t('Settings')}</h2></DialogHeader>
        <DialogBody className="space-y-4">
          <Field label={t('Language')}><Select data-testid="preferences-language" value={preferences.language} onChange={event => preferences.setLanguage(event.target.value as Language)}><option value="en">English</option><option value="id">Bahasa Indonesia</option></Select></Field>
          <Field label={t('Theme')}><Select data-testid="preferences-theme" value={preferences.theme} onChange={event => preferences.setTheme(event.target.value as Theme)}><option value="dark">{t('Dark')}</option><option value="light">{t('Light')}</option><option value="system">{t('System')}</option></Select></Field>
          <p className="text-xs text-on-surface-variant">{t('Preferences are saved in this browser. Label content and exports are unchanged.')}</p>
        </DialogBody>
        <DialogFooter><Button data-testid="preferences-close" onClick={() => setOpen(false)} variant="default">{t('Close')}</Button></DialogFooter>
      </Dialog>
    </div>, document.body)}
  </>;
}
