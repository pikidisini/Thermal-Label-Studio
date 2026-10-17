import type { KeyboardEvent } from 'react';
import { Button } from '../../../shared/ui/primitives';
import { useTranslation } from '../../../shared/i18n';

export function PrintTabs<T extends string>({ id, label, tabs, value, onChange }: {
  id: string; label: string; tabs: ReadonlyArray<{ value: T; label: string }>;
  value: T; onChange: (value: T) => void;
}) {
  const t = useTranslation();
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus(); onChange(tabs[next].value);
  }
  return <div className="label-print-tabs" role="tablist" aria-label={t(label)} onKeyDown={navigate}>
    {tabs.map(tab => <Button key={tab.value} variant="compact" selected={value === tab.value} role="tab" id={`${id}-tab-${tab.value}`} aria-selected={value === tab.value} aria-controls={`${id}-panel-${tab.value}`} tabIndex={value === tab.value ? 0 : -1} onClick={() => onChange(tab.value)}>{t(tab.label)}</Button>)}
  </div>;
}
