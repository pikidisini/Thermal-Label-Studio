import type { EditorOutputSnapshot } from '../../canvas';
import { translate as t, useTranslation } from "../../../shared/i18n";
import React from 'react';
import { Button, Dialog, DialogFooter, DialogHeader, ErrorState, IconButton } from '../../../shared/ui';
import { editorPreviewUrl, runEditorPreview, type EditorPreviewResult } from '../api/editorPreviewApi';

export interface EditorSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  getSnapshot: (copies?: number) => EditorOutputSnapshot;
  widthMm: number;
  heightMm: number;
  dpi: number;

}

export function EditorSimulationModal({ isOpen, onClose, getSnapshot, widthMm, heightMm, dpi }: Readonly<EditorSimulationModalProps>) {
  useTranslation();
  const [encoder, setEncoder] = React.useState<"IPL">("IPL");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<EditorPreviewResult | null>(null);
  const controller = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => controller.current?.abort(), []);
  React.useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    setLoading(false);
    setError(null);
    setResult(null);
  }, [isOpen, getSnapshot, widthMm, heightMm, dpi]);

  const preview = async () => {
    setResult(null);
    let snapshot: EditorOutputSnapshot;
    try { snapshot = getSnapshot(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Simulation preview failed.'); return; }
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setLoading(true);
    setError(null);
    try {
      const next = await runEditorPreview({ ...snapshot, encoder }, active.signal, 'simulation');
      if (!active.signal.aborted && JSON.stringify(getSnapshot()) === JSON.stringify(snapshot)) setResult(next);
    } catch (cause) {
      if (!active.signal.aborted) setError(cause instanceof Error ? cause.message : 'Simulation preview failed.');
    } finally {
      if (controller.current === active) {
        controller.current = null;
        setLoading(false);
      }
    }
  };

  if (!isOpen) return null;
  let actionLabel = 'Run simulation';
  if (result) actionLabel = 'Render again';
  if (loading) actionLabel = 'Rendering…';
  return (
    <div className="fixed inset-0 z-[var(--ui-layer-modal)] flex items-center justify-center p-4" data-ui-backdrop="true">
      <Dialog className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex items-center justify-between">
          <div><h2 className="text-base font-semibold">{t("Label Simulation")}</h2><p className="mt-1 text-xs text-on-surface-variant">{t("Render the current Studio canvas through the server renderer.")}</p></div>
          <IconButton label={t("Close simulation")} onClick={onClose}>×</IconButton>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto p-5 space-y-4">
          <p className="text-sm text-on-surface-variant">{t("Preview uses the current design and label data. Nothing is sent to a printer.")}</p>
          <label className="flex items-center gap-3 text-sm">
            <span>{t("Output language")}</span>
            <select aria-label={t("Output language")} value={encoder} onChange={() => setEncoder("IPL")} disabled={loading} data-ui-field="true" className="rounded border border-outline-variant bg-surface px-3 py-2 text-on-surface">
              <option value="IPL">IPL</option>
            </select>
          </label>
          {error && <ErrorState title={error} />}
          {result && <section className="space-y-3 border border-outline-variant p-4"><p className="text-xs text-on-surface-variant">{t("Request ID:")} <code>{result.requestId}</code> · {result.widthPx} × {result.heightPx} {t("px ·")} {result.dpi} {t("DPI")}</p><img src={editorPreviewUrl(result)} alt={t("Backend bitmap preview of the current Studio canvas")} className="max-h-[55vh] max-w-full bg-white object-contain" /></section>}
        </div>
        <DialogFooter className="flex items-center justify-end gap-3"><Button onClick={onClose} variant="default">{t("Close")}</Button><Button tone="primary" onClick={() => void preview()} disabled={loading} variant="default">{t(actionLabel)}</Button></DialogFooter>
      </Dialog>
    </div>
  );
}
