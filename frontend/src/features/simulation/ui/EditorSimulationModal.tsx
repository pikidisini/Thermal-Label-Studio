import { translate as t, useTranslation } from "../../../shared/i18n";
import React from 'react';
import { Button, Dialog, DialogFooter, DialogHeader, ErrorState, IconButton } from '../../../shared/ui';
import { editorPreviewUrl, runEditorPreview, type EditorPreviewResult } from '../api/editorPreviewApi';

export interface EditorSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  getSvg: () => string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  validate?: () => string[];
}

export function EditorSimulationModal({ isOpen, onClose, getSvg, widthMm, heightMm, dpi, validate }: EditorSimulationModalProps) {
  useTranslation();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<EditorPreviewResult | null>(null);
  const controller = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => controller.current?.abort(), []);
  React.useEffect(() => {
    if (isOpen) return;
    controller.current?.abort();
    controller.current = null;
    setLoading(false);
    setError(null);
    setResult(null);
  }, [isOpen]);

  const preview = async () => {
    setResult(null);
    const errors = validate?.() || [];
    if (errors.length) { setError(`Label data is incomplete or invalid: ${errors.join(' ')}`); return; }
    const svg = getSvg();
    if (!svg) {
      setError('Add an element to the canvas before running a simulation.');
      return;
    }
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setLoading(true);
    setError(null);
    try {
      const next = await runEditorPreview({ svg, widthMm, heightMm, dpi }, active.signal);
      if (!active.signal.aborted) setResult(next);
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
  return (
    <div className="fixed inset-0 z-[var(--ui-layer-modal)] flex items-center justify-center p-4" role="presentation" data-ui-backdrop="true">
      <Dialog className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex items-center justify-between">
          <div><h2 className="text-base font-semibold">{t("Label Simulation")}</h2><p className="mt-1 text-xs text-on-surface-variant">{t("Render the current Studio canvas through the server renderer.")}</p></div>
          <IconButton label={t("Close simulation")} onClick={onClose}>×</IconButton>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto p-5 space-y-4">
          <p className="text-sm text-on-surface-variant">{t("The server receives the current SVG canvas and returns a 1-bit PNG bitmap. Nothing is sent to a printer.")}</p>
          {error && <ErrorState title={error} />}
          {result && <section className="space-y-3 border border-outline-variant p-4"><p className="text-xs text-on-surface-variant">{t("Request ID:")} <code>{result.requestId}</code> · {result.widthPx} × {result.heightPx} {t("px ·")} {result.dpi} {t("DPI")}</p><img src={editorPreviewUrl(result)} alt={t("Backend bitmap preview of the current Studio canvas")} className="max-h-[55vh] max-w-full bg-white object-contain" /></section>}
        </div>
        <DialogFooter className="flex items-center justify-end gap-3"><Button onClick={onClose} variant="default">{t("Close")}</Button><Button tone="primary" onClick={() => void preview()} disabled={loading} variant="default">{loading ? t("Rendering…") : result ? t("Render again") : t("Run simulation")}</Button></DialogFooter>
      </Dialog>
    </div>
  );
}
