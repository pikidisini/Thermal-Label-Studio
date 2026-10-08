import { translate as t, useTranslation } from "../../../shared/i18n";
import React, { useState, useEffect } from 'react';
import { Bug, Copy, Download, Trash2, X, Check, Activity, AlertTriangle, Wifi } from 'lucide-react';
import { sessionRecorder } from '../model/sessionRecorder';
import { Button, Dialog, DialogFooter, DialogHeader, IconButton } from '../../../shared/ui';

export default function AiDiagnosticsModal({ isOpen, onClose, fabricCanvas }) {
  useTranslation();
  const [report, setReport] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const rep = sessionRecorder.generateReport(fabricCanvas);
      setReport(rep);
    }
  }, [isOpen, fabricCanvas]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    const success = await sessionRecorder.copyReportToClipboard(fabricCanvas);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownload = () => {
    sessionRecorder.downloadReport(fabricCanvas);
  };

  const handleRefresh = () => {
    setReport(sessionRecorder.generateReport(fabricCanvas));
  };

  const errorCount = sessionRecorder.logs.filter(l => l.level === 'ERROR').length;
  const failedReqCount = sessionRecorder.networkLogs.filter(n => (typeof n.status === 'number' && n.status>= 400) || n.status === 'NETWORK_ERROR').length;
  const actionCount = sessionRecorder.actions.length;

  return (
    <div className="fixed inset-0 z-[var(--ui-layer-modal)] flex items-center justify-center backdrop-blur-sm select-none p-4" data-ai-recorder="true" data-ui-backdrop="true">
      <Dialog className="w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95" data-ui-motion="true">

        {/* Header */}
        <DialogHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/20 text-primary rounded">
              <Bug className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-on-surface">{t("AI Session Diagnostics & Telemetry")}</h2>
              <p className="text-[11px] text-on-surface-variant">{t("Interaction records, API requests, and console logs are ready for AI analysis.")} </p>
            </div>
          </div>
          <IconButton
            onClick={onClose}

            label={t("Close diagnostics")}
          >
            <X className="w-4 h-4" />
          </IconButton>
        </DialogHeader>

        {/* Quick Stats Banner */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-surface-container border-b border-outline-variant text-xs">
          <div className="flex items-center gap-2 p-2 bg-surface-container-low rounded border border-outline-variant/40">
            <AlertTriangle className={`w-4 h-4 ${errorCount> 0 ? 'text-studio-rose' : 'text-outline'}`} />
            <div>
              <div className="text-[10px] text-outline uppercase font-bold">{t("Console Errors")}</div>
              <div className={`font-mono font-bold ${errorCount> 0 ? 'text-studio-rose' : 'text-on-surface'}`}>{errorCount} {t("detected")}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-surface-container-low rounded border border-outline-variant/40">
            <Wifi className={`w-4 h-4 ${failedReqCount> 0 ? 'text-studio-rose' : 'text-tertiary'}`} />
            <div>
              <div className="text-[10px] text-outline uppercase font-bold">{t("Failed Requests")}</div>
              <div className={`font-mono font-bold ${failedReqCount> 0 ? 'text-studio-rose' : 'text-on-surface'}`}>{failedReqCount} {t("failed")}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-surface-container-low rounded border border-outline-variant/40">
            <Activity className="w-4 h-4 text-primary" />
            <div>
              <div className="text-[10px] text-outline uppercase font-bold">{t("Logged Actions")}</div>
              <div className="font-mono font-bold text-on-surface">{actionCount} {t("steps")}</div>
            </div>
          </div>
        </div>

        {/* Report Preview */}
        <div className="flex-1 p-3 overflow-y-auto bg-surface-container-lowest">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-mono uppercase text-outline tracking-wider">{t("Preview Markdown Report:")}</span>
            <Button
              onClick={handleRefresh}
              className="hover:underline"
             variant="default">{t("Refresh data")} </Button>
          </div>
          <pre className="p-3 bg-surface-container-lowest border border-outline-variant rounded font-mono text-[11px] text-on-surface leading-relaxed whitespace-pre-wrap select-text max-h-[340px] overflow-y-auto">
            {report}
          </pre>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="flex items-center justify-between">
          <span className="text-[11px] text-outline">{t("Copy this report into an AI chat when you need help investigating an issue.")} </span>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleDownload}
              className="flex items-center gap-1.5"
             variant="default">
              <Download className="w-3.5 h-3.5 text-outline" />
              <span>{t("Download .md")}</span>
            </Button>

            <Button
              onClick={handleCopy}
              className={`flex items-center gap-1.5`}
             variant="default"  selected={copied} tone="success">
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{t("Copied to clipboard")}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t("Copy for AI chat")}</span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>

      </Dialog>
    </div>
  );
}
