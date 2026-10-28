import React from 'react';
import { Button, Input, Field, Select } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import { COLOR_KEYS, CUSTOM_PRESETS, contrastRatio, isHexColor, newCustomTheme, type ColorKey, type CustomBase, type CustomTheme } from '../model/customTheme';

const groups = [
  {"id": "bars", "label": "Bars & panels", "keys": ["bar", "tools", "panel", "status"]},
  {"id": "workspace", "label": "Surfaces & workspace", "keys": ["canvasSurface", "baseSurface", "workspace", "grid", "inputSurface", "dialogSurface", "overlaySurface", "tooltipSurface"]},
  {"id": "text", "label": "Text & borders", "keys": ["text", "textSecondary", "textDisabled", "border", "outline", "focus"]},
  {"id": "controls", "label": "Actions", "keys": ["primary", "primaryText", "action", "actionText", "actionHover", "actionFixed"]},
  {"id": "status", "label": "Status colors", "keys": ["success", "successFill", "successText", "successFixed", "tertiaryText", "warning", "warningFill", "warningText", "danger"]},
] as const;
const labels: Record<ColorKey, string> = {
  "bar": "Menu bar",
  "tools": "Toolbar & ribbon",
  "panel": "Inspector panel",
  "status": "Status bar",
  "workspace": "Workspace background",
  "grid": "Grid dots",
  "text": "Primary text & icons",
  "action": "Button / selected",
  "actionText": "Button text",
  "warning": "Warning text / outline",
  "warningFill": "Warning selected fill",
  "warningText": "Warning selected text",
  "canvasSurface": "Lowest surface",
  "baseSurface": "Application background",
  "inputSurface": "Input / low surface",
  "dialogSurface": "Dialog / flyout",
  "overlaySurface": "Header / overlay",
  "tooltipSurface": "Tooltip / highest surface",
  "textSecondary": "Secondary text & icons",
  "textDisabled": "Disabled text",
  "border": "Default border",
  "outline": "Outline / hover border",
  "focus": "Keyboard focus",
  "primary": "Primary accent",
  "primaryText": "On primary accent",
  "actionHover": "Button hover",
  "actionFixed": "Supporting action accent",
  "success": "Success text / outline",
  "successFill": "Success selected fill",
  "successText": "Success selected text",
  "successFixed": "Supporting success accent",
  "tertiaryText": "On success accent",
  "danger": "Error / destructive"
};

export function CustomThemeEditor({ draft, onChange }: Readonly<{ draft: CustomTheme; onChange: (value: CustomTheme) => void }>) {
  const t = useTranslation();
  const [tab, setTab] = React.useState(0);
  const color = (key: ColorKey) => isHexColor(draft.colors[key]) ? draft.colors[key] : CUSTOM_PRESETS[draft.base][key];
  const change = (key: ColorKey, value: string) => onChange({ ...draft, version: 2, colors: { ...draft.colors, [key]: value } });
  const previewColors = Object.fromEntries(COLOR_KEYS.map(key => [`--preview-${key}`, color(key)])) as React.CSSProperties;
  const contrasts = [contrastRatio(color('text'), color('bar')), contrastRatio(color('text'), color('tools')), contrastRatio(color('text'), color('panel')), contrastRatio(color('text'), color('status')), contrastRatio(color('actionText'), color('action')), contrastRatio(color('warning'), color('panel')), contrastRatio(color('warningText'), color('warningFill')), contrastRatio(color('text'), color('inputSurface')), contrastRatio(color('textSecondary'), color('dialogSurface')), contrastRatio(color('actionText'), color('actionHover')), contrastRatio(color('successText'), color('successFill')), contrastRatio(color('primaryText'), color('primary')), contrastRatio(color('tertiaryText'), color('success'))];
  const score = Math.min(...contrasts);
  return <>
    <Field label={t('Base theme')}><Select className="w-full min-w-0" data-testid="preferences-custom-base" value={draft.base} onChange={event => onChange(newCustomTheme(event.target.value as CustomBase))}><option value="industrial-light">{t('Industrial Light')}</option><option value="industrial-dark">{t('Industrial Dark')}</option></Select></Field>
    <div className="grid grid-cols-1 min-[640px]:grid-cols-2 gap-5">
      <section className="min-w-0" aria-label={t('Colors by area')}>
        <h3 className="mb-2 font-medium">{t('Colors by area')}</h3>
        <div role="tablist" aria-label={t('Color groups')} className="grid grid-cols-2 min-[640px]:grid-cols-3 gap-1 mb-3" data-testid="custom-color-tabs">
          {groups.map((group, index) => <Button key={group.id} role="tab" selected={tab === index} aria-selected={tab === index} aria-controls={`custom-colors-${group.id}`} id={`custom-tab-${group.id}`} tabIndex={tab === index ? 0 : -1} className="min-w-0 px-1 whitespace-normal text-center leading-tight" onClick={() => setTab(index)} onKeyDown={event => {
            let next: number;
            if (event.key === 'ArrowRight') next = (index + 1) % groups.length;
            else if (event.key === 'ArrowLeft') next = (index + groups.length - 1) % groups.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = groups.length - 1;
            else return;
            event.preventDefault(); setTab(next); document.getElementById(`custom-tab-${groups[next].id}`)?.focus();
          }}>{t(group.label)}</Button>)}
        </div>
        {groups.map((group, index) => <div key={group.id} id={`custom-colors-${group.id}`} role="tabpanel" aria-labelledby={`custom-tab-${group.id}`} hidden={tab !== index} className="space-y-2">
          {group.keys.map(key => <div key={key} className="grid grid-cols-[minmax(0,1fr)_28px_80px] items-center gap-2">
            <label htmlFor={`custom-color-${key}`}>{t(labels[key])}</label>
            <Input id={`custom-color-${key}`} type="color" className="w-7 p-0 min-w-0" aria-label={t(labels[key])} value={color(key)} onChange={event => change(key, event.target.value)} />
            <Input data-testid={`custom-hex-${key}`} aria-label={t('{area} HEX', { area: t(labels[key]) })} aria-invalid={!isHexColor(draft.colors[key])} aria-describedby={!isHexColor(draft.colors[key]) ? 'custom-color-error' : undefined} className="w-full min-w-0 font-mono" maxLength={7} value={draft.colors[key]} spellCheck={false} autoComplete="off" onChange={event => change(key, event.target.value)} />
          </div>)}
        </div>)}
        <output data-ui-status-block  className="mt-3 text-on-surface-variant" data-testid="custom-contrast">{t('Lowest text contrast: {ratio}:1', { ratio: score.toFixed(1) })} · {t(score >= 4.5 ? 'Readable' : 'Low contrast')}</output>
        {!COLOR_KEYS.every(key => isHexColor(draft.colors[key])) && <p id="custom-color-error" role="alert" style={{ color: color('danger') }}>{t('Use a six-digit HEX color, for example #8496A4.')}</p>}
      </section>
      <section className="min-w-0" aria-label={t('Theme preview')}><h3 className="mb-2 font-medium">{t('Live preview')}</h3>
        <div className="custom-theme-preview border border-outline-variant" style={{ ...previewColors, borderColor: color('border') }} data-testid="custom-theme-preview">
          <div className="p-2 bg-[var(--preview-bar)]">Thermal Label Studio · {t('View')}</div>
          <div className="p-2 bg-[var(--preview-tools)]">200 × 80 mm · {t('Design')} · {t('Preview')}</div>
          <div className="custom-theme-preview-workspace p-5 flex items-center justify-center min-h-32">
            <div className="custom-theme-preview-label flex items-center justify-around gap-2 p-2 w-full aspect-[2.5]" data-testid="custom-preview-label"><div className="custom-theme-preview-barcode w-12 h-7 shrink-0" /><span className="text-center text-[10px]">LABEL SAMPLE<br />200 × 80 mm</span></div>
          </div>
          <div className="p-2 bg-[var(--preview-panel)] flex items-center justify-between gap-2">{t('Properties')}<span className="px-2 py-1 bg-[var(--preview-action)] text-[var(--preview-actionText)]">{t('Selected')}</span></div>
          <div className="p-2 bg-[var(--preview-status)]">{t('Ready')} · 100%</div>
          <div className="p-2 bg-[var(--preview-panel)] flex flex-wrap items-center gap-2"><span className="border px-1" style={{ color: color('warning'), borderColor: color('warning') }}>{t('Warning')}</span><span className="px-2 py-1" style={{ color: color('warningText'), backgroundColor: color('warningFill') }}>{t('Warning selected')}</span></div>
        </div>
        <div className="mt-2 border p-2 space-y-2" data-testid="custom-preview-controls" style={{ background: color('baseSurface'), color: color('text'), borderColor: color('border') }}>
          <div className="border p-2" style={{ background: color('dialogSurface'), borderColor: color('border') }}>
            <div className="p-1" style={{ background: color('overlaySurface') }}>{t('Dialog / flyout')}</div>
            <p style={{ color: color('textSecondary') }}>{t('Secondary text & icons')}</p>
            <div className="border p-1" style={{ background: color('inputSurface'), borderColor: color('outline'), outline: `2px solid ${color('focus')}`, outlineOffset: 1 }}>{t('Keyboard focus')}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span style={{ background: color('actionHover'), color: color('actionText') }}>{t('Button hover')}</span>
              <span style={{ background: color('inputSurface'), color: color('textDisabled') }}>{t('Disabled text')}</span>
              <span style={{ background: color('tooltipSurface') }}>{t('Tooltip / highest surface')}</span>
              <span style={{ background: color('primary'), color: color('primaryText') }}>{t('Primary accent')}</span>
              <span style={{ background: color('success'), color: color('tertiaryText') }}>{t('Success text / outline')}</span>
              <span style={{ background: color('successFill'), color: color('successText') }}>{t('Success selected fill')}</span>
              <span style={{ color: color('danger') }}>{t('Error / destructive')}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1" aria-label={t('Color samples')}>
            {groups[tab].keys.map(key => <div key={key} className="flex items-center gap-1 min-w-0 text-[10px]" data-testid={`custom-sample-${key}`}><span className="w-4 h-4 shrink-0 border" style={{ background: color(key), borderColor: color('outline') }} /><span>{t(labels[key])}</span></div>)}
          </div>
        </div>
        <p className="mt-2 text-on-surface-variant">{t('White label, SVG content, and print output stay unchanged.')}</p>
      </section>
    </div>
    <p className="text-on-surface-variant">{t('Preview · changes not applied')}</p>
  </>;
}
