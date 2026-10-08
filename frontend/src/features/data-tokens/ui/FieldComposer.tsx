import { translate as t, useTranslation } from "../../../shared/i18n";
import { useFieldLabel } from '../model/useFieldLabel';
import React from 'react';
import { compileComposition, parseComposition } from '../model/composition';

export function FieldComposer({ template, fields, onChange }: {
  template: string; fields: string[]; onChange: (template: string) => void;
}) {
  useTranslation();
  const fieldLabel = useFieldLabel();
  const [field, setField] = React.useState('');
  const [literal, setLiteral] = React.useState('');
  const parts = parseComposition(template);
  const available = Array.from(new Set([...fields, ...parts.filter((part) => part.kind === 'field').map((part) => part.value)]))
    .filter((key) => /^[A-Za-z0-9_-]+$/.test(key)).sort();
  return <div className="space-y-2" data-testid="field-composer">
    <p className="text-[10px] text-on-surface-variant">{t("Build the content in order with data fields and fixed text.")}</p>
    <div className="flex flex-wrap gap-1" data-testid="composition-parts">
      {parts.map((part, index) => <span key={index} className="inline-flex items-center gap-1 border border-outline-variant rounded px-1.5 py-1 text-[10px] max-w-full">
        {part.kind === 'field' ? <span className="text-tertiary">{fieldLabel(part.value)}</span>
          : <input aria-label={t("Fixed text {number}", { number: index + 1 })} className="min-w-0 w-24" value={part.value} onChange={(event) => onChange(compileComposition(parts.map((item, i) => i === index ? { ...item, value: event.target.value } : item)))}  data-ui-control="input" data-variant="default" />}
        <button type="button" aria-label={t("Remove part {number}", { number: index + 1 })} onClick={() => onChange(compileComposition(parts.filter((_, i) => i !== index)))} data-ui-control="button" data-variant="default">×</button>
      </span>)}
      {parts.length === 0 && <span className="text-[10px] text-on-surface-variant">{t("No content yet")}</span>}
    </div>
    <div className="flex gap-1">
      <select aria-label={t("Composition field")} value={field} onChange={(event) => setField(event.target.value)} className="min-w-0 flex-1" data-ui-control="select" data-variant="default">
        <option value="">{t("Choose a field")}</option>
        {available.map((key) => <option key={key} value={key}>{fieldLabel(key)}</option>)}
      </select>
      <button type="button" disabled={!field} onClick={() => { onChange(compileComposition([...parts, { kind: 'field', value: field }])); setField(''); }}  data-ui-control="button" data-variant="default">{t("Add field")}</button>
    </div>
    <div className="flex gap-1">
      <textarea rows={1} aria-label={t("Fixed text to add")} placeholder={t("e.g. mm × ")} value={literal} onChange={(event) => setLiteral(event.target.value)} className="min-w-0 flex-1"  data-ui-control="textarea" data-variant="default" />
      <button type="button" disabled={!literal || /[{}]/.test(literal)} onClick={() => { onChange(compileComposition([...parts, { kind: 'literal', value: literal }])); setLiteral(''); }}  data-ui-control="button" data-variant="default">{t("Add text")}</button>
    </div>
  </div>;
}
