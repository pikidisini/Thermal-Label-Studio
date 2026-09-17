import React, { useState, useEffect } from 'react';
import { Bug, Copy, Download, Trash2, X, Check, Activity, AlertTriangle, Wifi } from 'lucide-react';
import { sessionRecorder } from '../utils/sessionRecorder';

export default function AiDiagnosticsModal({ isOpen, onClose, fabricCanvas }) {
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
  const failedReqCount = sessionRecorder.networkLogs.filter(n => n.status >= 400 || n.status === 'NETWORK_ERROR').length;
  const actionCount = sessionRecorder.actions.length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans select-none" data-ai-recorder="true">
      <div className="bg-surface-container-high border border-outline-variant rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-4 py-3 bg-surface-container-highest border-b border-outline-variant flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/20 text-primary rounded">
              <Bug className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-on-surface">AI Session Diagnostics &amp; Telemetry</h2>
              <p className="text-[11px] text-on-surface-variant">
                Rekaman interaksi, API request, dan console logs siap dianalisa AI
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded transition"
            title="Tutup Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Stats Banner */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-surface-container border-b border-outline-variant text-xs">
          <div className="flex items-center gap-2 p-2 bg-surface-container-low rounded border border-outline-variant/40">
            <AlertTriangle className={`w-4 h-4 ${errorCount > 0 ? 'text-error' : 'text-outline'}`} />
            <div>
              <div className="text-[10px] text-outline uppercase font-bold">Console Errors</div>
              <div className={`font-mono font-bold ${errorCount > 0 ? 'text-error' : 'text-on-surface'}`}>{errorCount} detected</div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-surface-container-low rounded border border-outline-variant/40">
            <Wifi className={`w-4 h-4 ${failedReqCount > 0 ? 'text-error' : 'text-tertiary'}`} />
            <div>
              <div className="text-[10px] text-outline uppercase font-bold">Failed Requests</div>
              <div className={`font-mono font-bold ${failedReqCount > 0 ? 'text-error' : 'text-on-surface'}`}>{failedReqCount} failed</div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-surface-container-low rounded border border-outline-variant/40">
            <Activity className="w-4 h-4 text-primary" />
            <div>
              <div className="text-[10px] text-outline uppercase font-bold">Logged Actions</div>
              <div className="font-mono font-bold text-on-surface">{actionCount} steps</div>
            </div>
          </div>
        </div>

        {/* Report Preview */}
        <div className="flex-1 p-3 overflow-y-auto bg-surface-container-lowest">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-mono uppercase text-outline tracking-wider">Preview Markdown Report:</span>
            <button
              onClick={handleRefresh}
              className="text-[11px] text-primary hover:underline"
            >
              Perbarui Data
            </button>
          </div>
          <pre className="p-3 bg-surface-container-lowest border border-outline-variant rounded font-mono text-[11px] text-on-surface leading-relaxed whitespace-pre-wrap select-text max-h-[340px] overflow-y-auto">
            {report}
          </pre>
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-surface-container-high border-t border-outline-variant flex items-center justify-between">
          <span className="text-[11px] text-outline">
            💡 Salin isi laporan ini dan paste ke ruang obrolan AI saat menemukan masalah.
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-xs bg-surface-container hover:bg-surface-bright text-on-surface border border-outline-variant rounded flex items-center gap-1.5 transition font-medium"
            >
              <Download className="w-3.5 h-3.5 text-outline" />
              <span>Download .md</span>
            </button>

            <button
              onClick={handleCopy}
              className={`px-4 py-1.5 text-xs rounded font-bold flex items-center gap-1.5 transition shadow-sm ${
                copied
                  ? 'bg-tertiary text-on-tertiary'
                  : 'bg-primary text-on-primary hover:bg-primary/90'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Tersalin ke Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin untuk Chat AI</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
