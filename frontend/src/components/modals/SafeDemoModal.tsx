import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Play,
  RotateCcw,
  X,
  CheckCircle2,
  Clock,
  Layers,
  FileCode,
  HardDrive,
  Info,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { safeDemoApi } from '../../utils/api/safeDemoApi';
import type { SafeDemoBatch } from '../../types/safeDemo';

interface SafeDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SafeDemoModal({ isOpen, onClose }: SafeDemoModalProps) {
  const [batch, setBatch] = useState<SafeDemoBatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchBatch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await safeDemoApi.getBatch();
      setBatch(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat data demo';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchBatch();
      setSuccessMessage(null);
    }
  }, [isOpen, fetchBatch]);

  if (!isOpen) return null;

  const handleRunSimulation = async () => {
    setRunning(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const updated = await safeDemoApi.runDemo();
      setBatch(updated);
      setSuccessMessage('Simulasi batch selesai: Seluruh label berhasil dikirim ke simulator (tidak dicetak fisik).');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Simulasi demo mengalami kegagalan.';
      setError(msg);
    } finally {
      setRunning(false);
    }
  };

  const handleReset = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await safeDemoApi.resetDemo();
      setBatch(res.batch);
      setSuccessMessage('State simulasi berhasil direset ke kondisi awal.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mereset demo.';
      setError(msg);
    } finally {
      setRunning(false);
    }
  };

  const isCompleted = batch?.status === 'completed';

  return (
    <div
      data-testid="safe-demo-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 font-sans select-none animate-in fade-in duration-150"
    >
      <div className="bg-surface-container-high border border-outline-variant rounded-lg shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-on-surface">
        {/* Header */}
        <div className="px-5 py-3.5 bg-surface-container-highest border-b border-outline-variant flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-md">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-on-surface">
                  Safe Demo Mode — Batch Simulation &amp; Monitoring
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                  Simulator Only
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-blue-950 text-blue-300 border border-blue-500/40">
                  In-Memory State
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">
                Simulasi alur batch multi-item label tanpa SAP perusahaan, printer fisik, IP, atau Port 9100.
              </p>
            </div>
          </div>
          <button
            data-testid="btn-close-safe-demo"
            onClick={onClose}
            className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded transition"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Safety & Educational Notice Banner */}
        <div className="bg-surface-container px-5 py-3 border-b border-outline-variant flex flex-col gap-2 text-xs">
          <div className="flex items-start gap-2 text-emerald-300">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="leading-relaxed">
              <span className="font-semibold text-emerald-200">Prinsip Keselamatan: </span>
              Mode ini beroperasi penuh secara lokal dalam memori. Transport diarahkan ke{' '}
              <code className="px-1 py-0.5 bg-black/40 rounded font-mono text-[11px] text-emerald-400">
                SimulatorSocketTransport
              </code>
              . Tidak ada socket jaringan dibuka dan tidak ada printer fisik yang dihubungi.
            </div>
          </div>
          <div className="flex items-start gap-2 text-amber-300/90 text-[11px]">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
            <div data-testid="safe-demo-restart-loss-notice" className="leading-relaxed">
              <span className="font-semibold text-amber-200">Karakteristik Penyimpanan: </span>
              State demo hanya berada di memori dan akan kembali ke awal saat backend direstart.
            </div>
          </div>
          <div className="flex items-start gap-2 text-on-surface-variant text-[11px]">
            <HardDrive className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <div data-testid="safe-demo-synthetic-disclaimer" className="leading-relaxed">
              <span className="font-medium text-on-surface">Data Sintetis: </span>
              <span className="font-mono text-emerald-300 font-semibold">{batch?.disclaimer || 'Demo data / not SAP production data'}</span>. Seluruh data material, nomor roll, dan lot adalah data peragaan buatan.
            </div>
          </div>
          <div className="flex items-start gap-2 text-on-surface-variant text-[11px]">
            <div className="w-4 shrink-0" />
            <div className="leading-relaxed">
              <span className="font-medium text-on-surface">Konsep Batch vs Copies: </span>
              Satu batch permintaan memuat <strong className="text-emerald-300">3 label berbeda</strong>. Nilai{' '}
              <code className="px-1 py-0.5 bg-black/30 rounded font-mono text-on-surface">copies=1</code> menyatakan 1
              lembar fisik per label, bukan jumlah variasi label.
            </div>
          </div>
        </div>


        {/* Modal Body / Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {error && (
            <div
              data-testid="safe-demo-error-banner"
              className="p-3 bg-red-950/50 border border-red-500/40 text-red-200 text-xs rounded-md flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div
              data-testid="safe-demo-success-banner"
              className="p-3 bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs rounded-md flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs">Memuat data batch demo...</span>
            </div>
          ) : batch ? (
            <>
              {/* Panel 1: Contoh Batch */}
              <div data-testid="panel-batch-overview" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">
                      Panel 1: Definisi &amp; Contoh Batch ({batch.total_items} Item Berbeda)
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span data-testid="batch-disclaimer-badge" className="text-[10px] font-mono px-2 py-0.5 bg-amber-950/60 text-amber-300 border border-amber-500/30 rounded">
                      {batch.disclaimer}
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 bg-surface-container rounded border border-outline-variant/50 text-on-surface-variant">
                      Batch ID: {batch.batch_id}
                    </span>
                  </div>
                </div>


                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {batch.items.map((item) => (
                    <div
                      key={item.item_id}
                      data-testid={`demo-item-card-${item.item_sequence}`}
                      className="p-3.5 bg-surface-container rounded border border-outline-variant/60 flex flex-col justify-between hover:border-outline transition-colors"
                    >
                      <div>
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-outline-variant/40">
                          <span className="text-xs font-mono font-bold text-emerald-400">
                            Item #{item.item_sequence}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-surface-container-highest rounded text-on-surface">
                            copies: {item.copies} (1 lembar)
                          </span>
                        </div>
                        <div className="text-xs font-bold text-on-surface truncate">
                          {item.canonical_item_data.material_desc}
                        </div>
                        <div className="text-[11px] font-mono text-primary truncate mb-2">
                          {item.canonical_item_data.material_code}
                        </div>

                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] font-mono text-on-surface-variant">
                          <div>
                            <span className="text-outline text-[10px] block">ROLL NO</span>
                            <span className="text-on-surface">{item.canonical_item_data.roll_number}</span>
                          </div>
                          <div>
                            <span className="text-outline text-[10px] block">BATCH / LOT</span>
                            <span className="text-on-surface">{item.canonical_item_data.batch_number}</span>
                          </div>
                          <div className="mt-1">
                            <span className="text-outline text-[10px] block">BERAT KOTOR</span>
                            <span className="text-on-surface">{item.canonical_item_data.gross_weight}</span>
                          </div>
                          <div className="mt-1">
                            <span className="text-outline text-[10px] block">BERAT BERSIH</span>
                            <span className="text-on-surface">{item.canonical_item_data.net_weight}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-outline-variant/30 flex items-center justify-between text-[11px]">
                        <span className="text-outline text-[10px] uppercase">Status Item:</span>
                        <span
                          className={`font-semibold ${
                            item.status === 'sent_to_simulator'
                              ? 'text-emerald-400'
                              : item.status === 'ready'
                              ? 'text-on-surface-variant'
                              : 'text-primary'
                          }`}
                        >
                          {item.status_display}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Panel 2: Progress & Lifecycle Timeline */}
              <div data-testid="panel-lifecycle-timeline" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">
                      Panel 2: Progress &amp; Siklus Hidup Dispatch
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-on-surface-variant">Status Batch:</span>
                    <span
                      data-testid="batch-status-badge"
                      className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                        batch.status === 'completed'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                          : batch.status === 'running'
                          ? 'bg-blue-950 text-blue-300 border border-blue-500/40'
                          : 'bg-surface-container text-on-surface-variant border border-outline-variant'
                      }`}
                    >
                      {batch.status_display}
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-surface-container rounded border border-outline-variant/60 space-y-4">
                  {batch.items.map((item) => (
                    <div
                      key={`timeline-${item.item_id}`}
                      data-testid={`item-timeline-row-${item.item_sequence}`}
                      className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 bg-surface-container-low rounded border border-outline-variant/30"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-xs ${
                            item.status === 'sent_to_simulator'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-surface-container text-on-surface-variant'
                          }`}
                        >
                          #{item.item_sequence}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-on-surface">
                            {item.canonical_item_data.material_code} — {item.canonical_item_data.roll_number}
                          </div>
                          <div className="text-[11px] text-on-surface-variant">
                            Format: <span className="font-mono text-on-surface">ZPL Vector (203 DPI)</span> • Target:{' '}
                            <span className="font-mono text-emerald-400">Simulator</span>
                          </div>
                        </div>
                      </div>

                      {/* State Pills Pipeline */}
                      <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                        {['accepted', 'rendered', 'queued', 'claimed', 'sending', 'sent_to_simulator'].map(
                          (stage, idx) => {
                            const isDone =
                              item.status === 'sent_to_simulator' ||
                              item.history.some((h) => h.state === stage);
                            return (
                              <React.Fragment key={stage}>
                                {idx > 0 && <span className="text-outline">→</span>}
                                <span
                                  className={`px-1.5 py-0.5 rounded ${
                                    isDone
                                      ? stage === 'sent_to_simulator'
                                        ? 'bg-emerald-950 text-emerald-300 font-bold border border-emerald-500/30'
                                        : 'bg-surface-container-highest text-on-surface'
                                      : 'bg-surface-container text-outline'
                                  }`}
                                >
                                  {stage}
                                </span>
                              </React.Fragment>
                            );
                          }
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          data-testid={`item-status-text-${item.item_sequence}`}
                          className={`text-xs font-semibold ${
                            item.status === 'sent_to_simulator' ? 'text-emerald-400' : 'text-on-surface-variant'
                          }`}
                        >
                          {item.status_display}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Panel 3: Preview Hasil & Verifikasi Keselamatan */}
              <div data-testid="panel-results-verification" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">
                      Panel 3: Hasil Simulator &amp; Verifikasi Keselamatan
                    </h3>
                  </div>
                </div>

                {/* Prominent Safety Banner */}
                <div className="p-3 bg-emerald-950/30 border border-emerald-500/40 rounded flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold text-emerald-300">
                      Simulator only — tidak ada printer fisik diakses
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400/90">
                    Transport: SimulatorSocketTransport
                  </span>
                </div>

                {/* Results Table */}
                <div className="border border-outline-variant/60 rounded overflow-hidden">
                  <table className="w-full text-left text-xs font-sans">
                    <thead className="bg-surface-container-highest border-b border-outline-variant/60 text-[11px] text-on-surface-variant font-mono">
                      <tr>
                        <th className="py-2 px-3">Item Seq</th>
                        <th className="py-2 px-3">Data Identifikasi</th>
                        <th className="py-2 px-3">Ukuran Payload</th>
                        <th className="py-2 px-3">Payload SHA-256</th>
                        <th className="py-2 px-3 text-right">Hasil Transmisi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/40 bg-surface-container">
                      {batch.items.map((item) => (
                        <tr key={`result-${item.item_id}`} className="hover:bg-surface-container-high/50">
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">
                            #{item.item_sequence}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-on-surface">{item.canonical_item_data.roll_number}</div>
                            <div className="text-[11px] text-on-surface-variant font-mono">
                              {item.canonical_item_data.material_code}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-on-surface">
                            {item.byte_count !== null ? `${item.byte_count} bytes` : '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-on-surface-variant">
                            {item.payload_sha256 ? (
                              <span title={item.payload_sha256}>
                                {item.payload_sha256.substring(0, 16)}...
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span
                              className={`text-xs font-semibold ${
                                item.status === 'sent_to_simulator'
                                  ? 'text-emerald-400 font-bold'
                                  : 'text-on-surface-variant'
                              }`}
                            >
                              {item.status === 'sent_to_simulator'
                                ? 'Terkirim ke simulator — tidak dicetak fisik'
                                : 'Menunggu simulasi'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-5 py-3.5 bg-surface-container-highest border-t border-outline-variant flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Mode Demo Aktif • Bebas Risiko Perangkat Keras</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              data-testid="btn-reset-safe-demo"
              onClick={handleReset}
              disabled={running || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded border border-outline-variant transition disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset demo</span>
            </button>

            <button
              data-testid="btn-run-safe-demo"
              onClick={handleRunSimulation}
              disabled={running || loading || isCompleted}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded shadow transition disabled:opacity-50"
            >
              {running ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Memproses simulasi...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Jalankan demo aman</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
