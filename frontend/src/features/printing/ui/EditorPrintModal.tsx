import React from 'react';
import { Info, Minus, Plus, Printer } from 'lucide-react';
import { translate as t, useTranslation } from '../../../shared/i18n';
import { Icon, Button, Dialog, DialogBody, DialogFooter, DialogHeader, ErrorState, Field, IconButton, Input, Select } from '../../../shared/ui';
import { getPrintTarget, printEditorLabel, PrintFailure, type EditorPrintResult } from '../api/printingApi';
import { isNumericPrinterHost, loadPrinterTarget, rememberPrinterTarget, targetFromFields } from '../model/printerTarget';

interface EditorPrintModalProps {
  isOpen: boolean; onClose: () => void; getSvg: () => string;
  widthMm: number; heightMm: number; dpi: number; validate?: () => string[];
}
const failureMessages = {
  unavailable: 'Enter a printer IP address and TCP port.',
  copies: 'Copies must be an integer from 1 to 999.',
  target: 'Enter a valid numeric printer IP address and TCP port (1-65535).',
  invalid: 'The current canvas cannot be printed. Check the layout and label data.',
  preparation: 'The print payload could not be prepared. Nothing was submitted.',
  uncertain: 'Delivery is uncertain. Check the printer before sending again to avoid duplicate labels.',
};

export function EditorPrintModal({ isOpen, onClose, getSvg, widthMm, heightMm, dpi, validate }: EditorPrintModalProps) {
  useTranslation();
  const [host, setHost] = React.useState('');
  const [port, setPort] = React.useState('9100');
  const [copies, setCopies] = React.useState('1');
  const edited = React.useRef(false);
  const [targetLoading, setTargetLoading] = React.useState(true);
  const [targetError, setTargetError] = React.useState(false);
  const [encoder, setEncoder] = React.useState<'IPL'>('IPL');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<EditorPrintResult | null>(null);
  const [attempted, setAttempted] = React.useState(false);
  const sending = React.useRef(false);
  const attemptedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    const remembered = loadPrinterTarget();
    setHost(remembered?.host || ''); setPort(String(remembered?.port || 9100));
    edited.current = false; setTargetLoading(true); setTargetError(false);
    setCopies('1'); setError(null); setResult(null); setAttempted(false); attemptedRef.current = false;
    void getPrintTarget(controller.signal).then(value => {
      if (!controller.signal.aborted && !edited.current && !remembered && value.available && value.host && value.port) {
        setHost(value.host); setPort(String(value.port));
      }
    }).catch(() => {
      if (!controller.signal.aborted) setTargetError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setTargetLoading(false);
    });
    return () => controller.abort();
  }, [isOpen]);
  const target = targetFromFields(host, port);
  const hostInvalid = !!host && !isNumericPrinterHost(host.trim());
  const portInvalid = !/^[0-9]{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535;
  const copiesInvalid = !/^[0-9]{1,3}$/.test(copies) || Number(copies) < 1 || Number(copies) > 999;
  const controlsLocked = busy || attempted;
  const changeCopies = (delta: number) => {
    if (controlsLocked || copiesInvalid) return;
    setCopies(String(Math.min(999, Math.max(1, Number(copies) + delta))));
  };
  const printAction = copiesInvalid ? t('Print label') : t(Number(copies) === 1 ? 'Print {count} label' : 'Print {count} labels', { count: Number(copies) });
  const remember = () => { if (target) rememberPrinterTarget(target); };
  const close = () => { if (!sending.current) onClose(); };
  const print = async () => {
    if (sending.current || attemptedRef.current || !target || copiesInvalid) return;
    setError(null); setResult(null);
    const errors = validate?.() || [];
    if (errors.length) { setError('The current canvas cannot be printed. Check the layout and label data.'); return; }
    const svg = getSvg();
    if (!svg) { setError('Add an element to the canvas before printing.'); return; }
    sending.current = true; attemptedRef.current = true;
    rememberPrinterTarget(target);
    setBusy(true); setAttempted(true);
    try {
      setResult(await printEditorLabel({ svg, widthMm, heightMm, dpi, encoder, target, copies: Number(copies) }));
      attemptedRef.current = false; setAttempted(false);
    } catch (cause) {
      const kind = cause instanceof PrintFailure ? cause.kind : 'uncertain';
      setError(failureMessages[kind]);
      if (kind !== 'uncertain') { attemptedRef.current = false; setAttempted(false); }
    }
    finally { sending.current = false; setBusy(false); }
  };
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-[var(--ui-layer-modal)] flex items-center justify-center p-4" data-ui-backdrop="true">
    <Dialog aria-labelledby="print-dialog-title" className="w-full max-w-lg overflow-hidden" data-testid="editor-print-dialog">
      <DialogHeader className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3"><Icon component={Printer} aria-hidden="true"  size="control" /><div>
          <h2 id="print-dialog-title" className="text-[length:var(--ui-font-title)] font-medium">{t('Print label')}</h2>
          <p className="text-on-surface-variant">{t('Print from the current canvas')}</p>
        </div></div>
        <IconButton label={t('Close print dialog')} onClick={close} disabled={busy}>×</IconButton>
      </DialogHeader>
      <DialogBody className="grid gap-[15px] p-[var(--ui-space-4)]">
        <div><p className="text-on-surface-variant">{t('Label size')}</p>
          <p data-testid="print-layout-summary" className="font-medium tabular-nums">{widthMm} × {heightMm} mm <span className="font-normal text-on-surface-variant">· {dpi} DPI</span></p>
        </div>
        <div className="grid grid-cols-1 min-[440px]:grid-cols-[140px_minmax(0,1fr)] gap-3">
          <Field label={t('Print format')} className="min-w-0"><Select aria-label={t('Print format')} value={encoder} onChange={() => setEncoder('IPL')} disabled={controlsLocked} className="w-full min-w-0"><option value="IPL">IPL</option><option value="ZPL" disabled>ZPL — planned</option></Select></Field>
          <Field label={t('Communication method')} className="min-w-0"><Select aria-label={t('Communication method')} value="TCP/RAW" onChange={() => {}} disabled={controlsLocked} className="w-full min-w-0"><option value="TCP/RAW">TCP/RAW</option>{['Shared Printer', 'USB', 'SERIAL'].map(method => <option key={method} value={method} disabled>{method} — planned</option>)}</Select></Field>
        </div>
        <section className="grid gap-2" aria-labelledby="print-target-title">
          <h3 id="print-target-title" className="font-medium">{t('Printer target')}</h3>
          <div className="grid grid-cols-[minmax(0,1fr)_5rem] min-[440px]:grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <Field label={t('Printer IP address')} className="min-w-0">
              <Input className="w-full min-w-0 font-mono" aria-label={t('Printer IP address')} aria-invalid={hostInvalid} aria-describedby={hostInvalid ? 'print-host-error' : undefined} placeholder="192.168.88.84" value={host} disabled={controlsLocked} onChange={event => { edited.current = true; setHost(event.target.value); }} onBlur={remember} autoComplete="off" spellCheck={false} />
            </Field>
            <Field label={t('TCP port')} className="min-w-0">
              <Input className="w-full min-w-0 font-mono" aria-label={t('TCP port')} aria-invalid={portInvalid} aria-describedby={portInvalid ? 'print-port-error' : undefined} value={port} disabled={controlsLocked} onChange={event => { edited.current = true; setPort(event.target.value); }} onBlur={remember} inputMode="numeric" autoComplete="off" />
            </Field>
          </div>
          <p className="text-on-surface-variant">{t('The last valid target is remembered in this browser. Editing these fields does not contact the printer.')}</p>
        </section>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="print-copies" className="text-[length:var(--ui-font-label)] text-on-surface-variant">{t('Copies')}</label>
          <div className="flex items-center gap-1">
            <IconButton label={t('Decrease copies')} disabledTreatment="subtle" disabled={controlsLocked || copiesInvalid || Number(copies) <= 1} onClick={() => changeCopies(-1)}><Icon component={Minus} aria-hidden="true"  size="control" /></IconButton>
            <Input id="print-copies" className="w-[68px] min-w-0 text-center tabular-nums" aria-label={t('Copies')} aria-invalid={copiesInvalid} aria-describedby={copiesInvalid ? 'print-copies-error' : undefined} value={copies} disabled={controlsLocked} onChange={event => setCopies(event.target.value)} inputMode="numeric" autoComplete="off" />
            <IconButton label={t('Increase copies')} disabledTreatment="subtle" disabled={controlsLocked || copiesInvalid || Number(copies) >= 999} onClick={() => changeCopies(1)}><Icon component={Plus} aria-hidden="true"  size="control" /></IconButton>
          </div>
        </div>
        {copiesInvalid && <p id="print-copies-error" role="alert" className="text-sm text-secondary">{t('Copies must be an integer from 1 to 999.')}</p>}
        {hostInvalid && <p id="print-host-error" role="alert" className="text-sm text-secondary">{t('Use a numeric IPv4 or IPv6 address. Names, URLs and scoped addresses are unsupported.')}</p>}
        {portInvalid && <p id="print-port-error" role="alert" className="text-sm text-secondary">{t('TCP port must be an integer from 1 to 65535.')}</p>}
        {targetLoading && <p className="text-xs text-on-surface-variant">{t('Loading optional server default… You can enter a target now.')}</p>}
        {targetError && !target && <p className="text-xs text-on-surface-variant">{t('The server default could not be loaded. Enter a printer IP address and port to continue.')}</p>}
        <div className="flex items-start gap-2 text-on-surface-variant"><Icon component={Info} className="mt-0.5 shrink-0" aria-hidden="true"  size="control" /><p>{t('Submission sends bytes to the selected printer. It does not confirm that a label was printed.')}</p></div>
        {busy && <p role="status">{t('Sending labels… Keep this dialog open until the request finishes.')}</p>}
        {error && <ErrorState title={error} />}
        {result && <div role="status" data-testid="print-submitted" className="text-sm space-y-2">
          <p>{t('Sent to printer; physical delivery is unconfirmed.')}</p>
          <p data-testid="print-submitted-copies">{t('Copies')}: {result.copies}</p>
          <p className="font-mono">{result.widthPx} × {result.heightPx} px · {result.dpi} DPI · {result.payloadBytes} bytes</p>
          <p data-testid="print-effective-target">{t('Printer target:')} {result.target.host.includes(':') ? `[${result.target.host}]` : result.target.host}:{result.target.port}</p>
          <p>{t('Request ID:')} <code>{result.requestId}</code></p>
        </div>}
        {attempted && !busy && <p className="text-xs text-on-surface-variant">{t('To send another label, close and reopen this dialog after checking the printer.')}</p>}
      </DialogBody>
      <DialogFooter className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-on-surface-variant">{copiesInvalid ? t('Check the copy count') : t(Number(copies) === 1 ? '{count} label' : '{count} labels', { count: Number(copies) })}</span>
        <div className="ml-auto flex gap-2">
        <Button onClick={close} disabled={busy}>{t('Cancel')}</Button>
        <Button tone="primary" className="inline-flex items-center gap-2" onClick={() => void print()} disabled={!target || copiesInvalid || busy || attempted} data-testid="btn-print-one-label"><Icon component={Printer} aria-hidden="true"  size="control" />{printAction}</Button>
        </div>
      </DialogFooter>
    </Dialog>
  </div>;
}
