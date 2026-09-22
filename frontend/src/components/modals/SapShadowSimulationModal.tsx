import React from 'react';
import {
  FileText,
  X,
  ShieldAlert,
  AlertTriangle,
  Lock,
  Server,
  ArrowRight,
} from 'lucide-react';

interface SapShadowSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SapShadowSimulationModal({
  isOpen,
  onClose,
}: SapShadowSimulationModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
      data-testid="sap-shadow-simulation-modal"
    >
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                SAP Shadow Print Simulation
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                  PPIC Pipeline
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Simulasi virtual SAP ZLABEL / ZMM_LABEL_JSON & bukti PDF ber-watermark
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title="Tutup Modal"
            data-testid="btn-close-sap-simulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Safety Banner */}
        <div className="px-6 py-3 bg-red-950/40 border-b border-red-900/40 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-red-200">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>
              <strong>Batas Keamanan Fail-Closed:</strong> SIMULASI — BUKAN UNTUK CETAK FISIK.
              Zero physical socket, port 9100, atau Windows Spooler.
            </span>
          </div>
        </div>

        {/* Main Content: Fail-Closed Identity Provider Requirement Notice */}
        <div className="p-6 space-y-5" data-testid="container-simulation-results">
          <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 mt-0.5 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white text-sm">
                    Monitoring Membutuhkan Identity Provider
                  </h3>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30"
                    data-testid="status-batch-badge"
                  >
                    Fail-Closed
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Akses browser anonim ke data kanonikal SAP dan bukti PDF evidence dinonaktifkan secara fail-closed.
                  Kredensial rahasia SAP sengaja tidak dimasukkan atau disimpan di browser pengguna.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs space-y-2 text-slate-300">
              <div className="flex items-center gap-2 font-semibold text-slate-200">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Rencana Penerapan Access Control & RBAC:</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Aplikasi belum memiliki integrasi enterprise Identity Provider (SSO/OIDC/RBAC).
                UI monitoring PPIC interaktif akan diaktifkan pada fase access-control/RBAC setelah mekanisme
                autentikasi pengguna berbasis sesi/peran tersedia.
              </p>
            </div>

            <div className="p-3.5 bg-slate-900/50 border border-slate-800 rounded-lg text-xs space-y-2 text-slate-400">
              <div className="flex items-center gap-2 font-semibold text-slate-300">
                <Server className="w-4 h-4 text-emerald-400" />
                <span>Jalur Ingestion SAP Tetap Aktif (Machine-to-Machine):</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Sistem SAP (ZLABEL / ZMM_LABEL_JSON) tetap dapat mendorong payload simulasi secara langsung
                ke API backend melalui endpoint terotentikasi:
              </p>
              <code className="block p-2 bg-slate-950 font-mono text-[11px] text-amber-300 rounded border border-slate-800">
                POST /api/v1/simulation/sap-batches (Header: X-SAP-Simulation-Token)
              </code>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Thermal Label Studio — Fail-Closed Boundary (P1-A)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            data-testid="btn-close-modal-action"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
