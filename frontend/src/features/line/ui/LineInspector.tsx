import { translate as t, useTranslation } from "../../../shared/i18n";
import React from 'react';
import { clampLineWidthMm, lineStyleFromObject, LINE_STYLE_DASH, type LineStyle } from '../model/lineModel';
import { lineEndpointMm, type LineEndpoint } from '../editor/lineGeometry';

export function LineInspector({ selectedObject, pxPerMm, onUpdateProperty }: { selectedObject: any; pxPerMm: number; onUpdateProperty: (prop: string, value: any) => void }) {
  useTranslation();
  const endpoints: LineEndpoint[] = ['x1', 'y1', 'x2', 'y2'];
  const [draft, setDraft] = React.useState<Record<LineEndpoint, string>>(() => Object.fromEntries(endpoints.map(key => [key, String(lineEndpointMm(selectedObject, key, pxPerMm))])) as Record<LineEndpoint, string>);
  React.useEffect(() => setDraft(Object.fromEntries(endpoints.map(key => [key, lineEndpointMm(selectedObject, key, pxPerMm).toFixed(1)])) as Record<LineEndpoint, string>), [selectedObject, selectedObject.x1, selectedObject.y1, selectedObject.x2, selectedObject.y2, pxPerMm]);
  const commitPoint = (key: LineEndpoint) => {
    const value = Number(draft[key]);
    if (Number.isFinite(value) && value>= 0 && value <= 10000) onUpdateProperty(key, value * pxPerMm);
    else setDraft(d => ({ ...d, [key]: lineEndpointMm(selectedObject, key, pxPerMm).toFixed(1) }));
  };
  const style = lineStyleFromObject(selectedObject);
  const width = clampLineWidthMm((selectedObject.strokeWidth || 0) / pxPerMm);
  const [widthDraft, setWidthDraft] = React.useState(String(width));
  React.useEffect(() => setWidthDraft(width.toFixed(2)), [selectedObject, width]);
  const commitWidth = () => {
    const value = Number(widthDraft);
    if (Number.isFinite(value)) onUpdateProperty('strokeWidthMm', clampLineWidthMm(value));
    else setWidthDraft(width.toFixed(2));
  };
  return <section data-testid="line-inspector" className="space-y-2 border-t border-outline-variant pt-3">
    <div className="font-semibold text-[11px]">{t("Line")}</div>
    <div className="grid grid-cols-2 gap-2">
      {endpoints.map((key) => <label data-ui-label="true" key={key} className="text-[9px]">{key.toUpperCase()} {t("(mm, line coordinates)")}<input aria-label={`Line ${key}`} type="number" step="0.1" value={draft[key]} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} onBlur={() => commitPoint(key)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitPoint(key); e.currentTarget.blur(); } }} className="w-full"  data-ui-control="input" data-variant="default" /></label>)}
    </div>
    <label data-ui-label="true" className="block text-[9px]">{t("Color")}<input aria-label={t("Line color")} type="color" value={selectedObject.stroke || '#000000'} onChange={e => onUpdateProperty('stroke', e.target.value)} className="w-full h-7"  data-ui-control="input" data-variant="default" /></label>
    <label data-ui-label="true" className="block text-[9px]">{t("Line thickness (mm)")}<input aria-label={t("Line width")} type="number" min="0.05" max="5" step="0.05" value={widthDraft} onChange={e => setWidthDraft(e.target.value)} onBlur={commitWidth} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitWidth(); e.currentTarget.blur(); } }} className="w-full"  data-ui-control="input" data-variant="default" /></label>
    <label data-ui-label="true" className="block text-[9px]">{t("Line style")}<select aria-label={t("Line style")} value={style} onChange={e => onUpdateProperty('lineStyle', e.target.value as LineStyle)} className="w-full" data-ui-control="select" data-variant="default"><option value="solid">{t("Solid")}</option><option value="dashed">{t("Dashed")}</option><option value="dotted">{t("Dotted")}</option></select></label>
  </section>;
}
