import React, { useEffect, useState } from 'react';
import {
  FileText,
  X,
  ShieldAlert,
  AlertTriangle,
  Lock,
  Server,
  RefreshCw,
  Download,
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Clock,
  ListOrdered,
  Upload,
} from 'lucide-react';
import { sapShadowSimulationApi } from '../../utils/api/sapShadowSimulationApi';
import type {
  PilotOperatorBatchSummary,
  PilotOperatorBatchDetail,
} from '../../types/sapShadowSimulation';

interface SapShadowSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SapShadowSimulationModal({
  isOpen,
  onClose,
}: SapShadowSimulationModalProps) {
  const [pilotEnabled, setPilotEnabled] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [csrfToken, setCsrfToken] = useState<string>('');
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);

  // Login form state
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Dashboard batch list state
  const [batches, setBatches] = useState<PilotOperatorBatchSummary[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState<boolean>(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [downloadingBatchId, setDownloadingBatchId] = useState<string | null>(null);

  // Batch detail / item sequence state
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<PilotOperatorBatchDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Import JSON state (B2B2O)
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setLoginError(null);
      setExpandedBatchId(null);
      setBatchDetail(null);
      setDetailError(null);
      setIsImportOpen(false);
      setImportFile(null);
      setUploadError(null);
      setUploadSuccess(null);
      return;
    }

    let isMounted = true;
    setIsCheckingSession(true);

    async function checkSession() {
      try {
        const session = await sapShadowSimulationApi.getOperatorSession();
        if (!isMounted) return;

        setPilotEnabled(Boolean(session.pilot_operator_enabled));
        setIsAuthenticated(Boolean(session.authenticated));
        if (session.csrf_token) {
          setCsrfToken(session.csrf_token);
        }

        if (session.authenticated) {
          loadBatches();
        }
      } catch {
        if (!isMounted) return;
        setPilotEnabled(false);
        setIsAuthenticated(false);
      } finally {
        if (isMounted) {
          setIsCheckingSession(false);
        }
      }
    }

    checkSession();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  async function loadBatches() {
    setIsLoadingBatches(true);
    setBatchError(null);
    try {
      const data = await sapShadowSimulationApi.listOperatorBatches();
      setBatches(data);
    } catch (err: any) {
      setBatchError(err?.message || 'Gagal memuat daftar batch simulasi.');
    } finally {
      setIsLoadingBatches(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      setLoginError('Masukkan kata sandi operator pilot.');
      return;
    }

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const resp = await sapShadowSimulationApi.loginOperator(password.trim());
      setIsAuthenticated(true);
      setCsrfToken(resp.csrf_token);
      setPassword('');
      await loadBatches();
    } catch (err: any) {
      setLoginError(err?.message || 'Kata sandi operator pilot tidak valid.');
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout() {
    try {
      await sapShadowSimulationApi.logoutOperator(csrfToken);
    } catch {
      // Ignore network logout error
    } finally {
      setIsAuthenticated(false);
      setCsrfToken('');
      setBatches([]);
      setPassword('');
      setExpandedBatchId(null);
      setBatchDetail(null);
      setDetailError(null);
      setIsImportOpen(false);
      setImportFile(null);
      setUploadError(null);
      setUploadSuccess(null);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    setUploadSuccess(null);
    const file = e.target.files?.[0] || null;
    if (!file) {
      setImportFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith('.json')) {
      setUploadError('Hanya berkas berformat .json yang diperbolehkan.');
      setImportFile(null);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError(`Ukuran berkas (${(file.size / (1024 * 1024)).toFixed(2)} MB) melebihi batas maksimum 2 MiB.`);
      setImportFile(null);
      return;
    }
    setImportFile(file);
  }

  async function handleImportSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!importFile) {
      setUploadError('Pilih berkas JSON terlebih dahulu.');
      return;
    }
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const res = await sapShadowSimulationApi.importOperatorJson(importFile, csrfToken);
      const batchId = res.batch_id || res.request_id || 'baru';
      setUploadSuccess(`Batch ${batchId} berhasil diimpor! Menampilkan hasil simulasi.`);
      setImportFile(null);
      const fileInput = document.getElementById('input-import-json-file') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
      await loadBatches();
      if (res.batch_id) {
        handleToggleDetail(res.batch_id);
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Gagal mengimpor berkas JSON SAP.');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleToggleDetail(batchId: string) {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      setBatchDetail(null);
      setDetailError(null);
      return;
    }

    setExpandedBatchId(batchId);
    setBatchDetail(null);
    setIsLoadingDetail(true);
    setDetailError(null);

    try {
      const detail = await sapShadowSimulationApi.getOperatorBatch(batchId);
      setBatchDetail(detail);
    } catch (err: any) {
      setDetailError(err?.message || 'Gagal memuat rincian urutan item.');
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function handleDownloadPdf(batchId: string) {
    setDownloadingBatchId(batchId);
    try {
      await sapShadowSimulationApi.downloadOperatorPdf(batchId);
    } catch (err: any) {
      alert(err?.message || 'Gagal mengunduh PDF bukti simulasi.');
    } finally {
      setDownloadingBatchId(null);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
      data-testid="sap-shadow-simulation-modal"
    >
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-100 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">
                  Simulasi Label
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                  Simulasi SAP DEV
                </span>
                {isAuthenticated && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1"
                    data-testid="badge-operator-active"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Operator Aktif
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Uji mandiri hasil simulasi SAP DEV & bukti PDF ber-watermark (Simulasi murni, tidak mencetak fisik)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <button
                onClick={handleLogout}
                className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
                title="Keluar Sesi Operator"
                data-testid="btn-pilot-logout"
              >
                <LogOut className="w-3.5 h-3.5" />
                Keluar
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              title="Tutup Modal"
              data-testid="btn-close-sap-simulation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Safety Warning Ribbon */}
        <div className="px-6 py-2.5 bg-red-950/40 border-b border-red-900/40 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center space-x-2 text-red-200">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>
              <strong>Batas Keamanan Fail-Closed:</strong> SIMULASI — BUKAN UNTUK CETAK FISIK.
              Zero physical socket, port 9100, atau Windows Spooler.
            </span>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-4 grow" data-testid="container-simulation-results">
          {isCheckingSession ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
              <p className="text-xs">Memeriksa status sesi operator...</p>
            </div>
          ) : !pilotEnabled ? (
            /* Fail-Closed Notice when PILOT_OPERATOR_ENABLED=false */
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
                    Mode operator pilot dinonaktifkan di server (<code>PILOT_OPERATOR_ENABLED=false</code>).
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
          ) : !isAuthenticated ? (
            /* Login Operator Card */
            <div className="max-w-md mx-auto py-4" data-testid="pilot-login-card">
              <div className="p-6 bg-slate-950/80 border border-slate-800 rounded-xl space-y-4 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">
                      Login Operator Simulasi
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Sesi terbatas untuk uji mandiri simulasi label SAP DEV (tanpa cetak fisik)
                    </p>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Masukkan kata sandi operator pilot yang telah dikonfigurasi di server untuk mengakses daftar batch simulasi dan berkas bukti PDF. Kredensial mesin SAP tetap aman di server.
                </p>

                <form onSubmit={handleLogin} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Kata Sandi Operator Pilot
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Masukkan kata sandi pilot..."
                        className="w-full px-3 py-2 pr-10 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                        data-testid="input-pilot-password"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {loginError && (
                    <div className="p-2.5 bg-red-950/50 border border-red-800/60 rounded-lg text-xs text-red-300 flex items-center gap-2">
                      <XCircle className="w-4 h-4 shrink-0 text-red-400" />
                      <span>{loginError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 shadow"
                    data-testid="btn-pilot-login"
                  >
                    {isLoggingIn ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Memverifikasi...
                      </>
                    ) : (
                      'Masuk sebagai Operator'
                    )}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            /* Dashboard Batch List */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm">
                    Daftar Batch Simulasi Label
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Memantau batch simulasi dari SAP DEV secara in-process & virtual sink (tanpa printer fisik)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setIsImportOpen(!isImportOpen);
                      setUploadError(null);
                      setUploadSuccess(null);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                      isImportOpen
                        ? 'bg-amber-600 text-white'
                        : 'text-amber-400 hover:text-amber-300 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/60'
                    }`}
                    data-testid="btn-open-import-json"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Impor JSON dari SAP
                  </button>
                  <button
                    onClick={loadBatches}
                    disabled={isLoadingBatches}
                    className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
                    data-testid="btn-refresh-batches"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBatches ? 'animate-spin' : ''}`} />
                    Segarkan
                  </button>
                </div>
              </div>

              {/* Import Local SAP JSON Panel (B2B2O) */}
              {isImportOpen && (
                <div
                  className="p-4 bg-slate-900/90 border border-amber-800/60 rounded-xl space-y-3"
                  data-testid="panel-import-json"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4 text-amber-400" />
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Impor Berkas Raw SAP Snapshot v2 (.json)
                      </h4>
                    </div>
                    <button
                      onClick={() => {
                        setIsImportOpen(false);
                        setUploadError(null);
                        setUploadSuccess(null);
                      }}
                      className="text-slate-400 hover:text-white p-1 rounded transition-colors"
                      data-testid="btn-cancel-import-json"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Pilih berkas JSON hasil ekspor program <code>ZMMR_LABEL_JSON</code> dari SAP DEV di komputer Anda untuk menjalankan simulasi label tanpa transmisi ke printer fisik.
                  </p>

                  <div className="p-2.5 bg-amber-950/40 border border-amber-800/40 rounded-lg flex items-start gap-2 text-[11px] text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-amber-300">Pemberitahuan Keamanan & Privasi:</span>{' '}
                      Berkas ini berpotensi memuat data bisnis dari SAP DEV. Berkas diunggah ke server aplikasi yang sedang digunakan untuk simulasi serta pembuatan bukti PDF; tidak dikirim ke printer fisik.
                    </div>
                  </div>

                  <form onSubmit={handleImportSubmit} className="space-y-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        Pilih Berkas JSON (Maksimum 2 MiB):
                      </label>
                      <input
                        id="input-import-json-file"
                        type="file"
                        accept=".json"
                        onChange={handleFileSelect}
                        disabled={isUploading}
                        className="w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-500 file:cursor-pointer border border-slate-700 bg-slate-950 rounded-lg p-1.5 focus:outline-none focus:border-amber-500"
                        data-testid="input-import-json-file"
                      />
                    </div>

                    {importFile && (
                      <div className="flex items-center gap-3 text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                        <span className="font-medium text-white truncate max-w-xs">{importFile.name}</span>
                        <span className="text-slate-400 text-[11px]">
                          ({(importFile.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                    )}

                    {uploadError && (
                      <div
                        className="p-2.5 bg-red-950/60 border border-red-800/60 rounded-lg text-xs text-red-300 flex items-start gap-2"
                        data-testid="alert-import-json-error"
                      >
                        <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <span>{uploadError}</span>
                      </div>
                    )}

                    {uploadSuccess && (
                      <div
                        className="p-2.5 bg-emerald-950/60 border border-emerald-800/60 rounded-lg text-xs text-emerald-300 flex items-start gap-2"
                        data-testid="alert-import-json-success"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{uploadSuccess}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsImportOpen(false);
                          setUploadError(null);
                          setUploadSuccess(null);
                        }}
                        disabled={isUploading}
                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
                      >
                        Tutup
                      </button>
                      <button
                        type="submit"
                        disabled={isUploading || !importFile}
                        className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 shadow"
                        data-testid="btn-submit-import-json"
                      >
                        {isUploading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Mengimpor & Memproses...
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            Unggah & Proses Simulasi
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {batchError && (
                <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-lg text-xs text-red-300 flex items-center justify-between">
                  <span>{batchError}</span>
                  <button
                    onClick={loadBatches}
                    className="text-xs underline hover:text-red-200"
                  >
                    Coba Lagi
                  </button>
                </div>
              )}

              {isLoadingBatches && batches.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-2 text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
                  <p className="text-xs">Memuat batch simulasi...</p>
                </div>
              ) : batches.length === 0 ? (
                <div
                  className="py-10 px-6 bg-slate-950/50 border border-slate-800 rounded-xl text-center space-y-2.5"
                  data-testid="empty-simulation-batches"
                >
                  <Clock className="w-8 h-8 text-slate-600 mx-auto" />
                  <h4 className="text-sm font-semibold text-slate-300">
                    Belum Ada Batch Simulasi Label
                  </h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    Sistem siap menerima batch simulasi. Jalankan tcode label pada SAP DEV (misalnya <code>ZLABEL</code> atau <code>ZMMR_LABEL_JSON</code>) atau gunakan tombol &apos;Impor JSON dari SAP&apos; di atas. Batch simulasi akan otomatis muncul di sini.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-800 rounded-xl overflow-hidden" data-testid="table-simulation-batches">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/90 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Waktu</th>
                        <th className="py-2.5 px-3">Request ID / Batch ID</th>
                        <th className="py-2.5 px-3">Profil Label</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Item</th>
                        <th className="py-2.5 px-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                      {batches.map((b) => (
                        <React.Fragment key={b.batch_id}>
                          <tr className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                            {new Date(b.created_at).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-mono text-white font-medium text-[11px]">
                              {b.request_id}
                            </div>
                            <div className="font-mono text-[10px] text-slate-500">
                              {b.batch_id.slice(0, 12)}...
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-mono font-medium text-slate-300 text-[11px]">
                              {b.label_code}
                            </span>
                            <span className="block text-[10px] text-slate-500 font-mono">
                              {b.profile_version}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {b.status === 'completed' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" />
                                Selesai
                              </span>
                            ) : b.status === 'failed' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                                <XCircle className="w-3 h-3" />
                                Gagal
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                <Clock className="w-3 h-3" />
                                {b.status}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-300 font-medium">
                            {b.completed_items}/{b.total_items}
                          </td>
                          <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              onClick={() => handleToggleDetail(b.batch_id)}
                              className="px-2 py-1 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors inline-flex items-center gap-1 shadow-xs"
                              title="Lihat Rincian Urutan Item"
                              data-testid={`btn-toggle-items-${b.batch_id}`}
                            >
                              <ListOrdered className="w-3.5 h-3.5 text-amber-400" />
                              {expandedBatchId === b.batch_id ? 'Tutup Item' : 'Urutan Item'}
                            </button>

                            {b.status === 'completed' && (
                              <button
                                onClick={() => handleDownloadPdf(b.batch_id)}
                                disabled={downloadingBatchId === b.batch_id}
                                className="px-2.5 py-1 text-xs font-semibold rounded bg-amber-600/90 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors inline-flex items-center gap-1 shadow-xs"
                                title="Unduh / Buka Bukti PDF Simulasi"
                                data-testid="btn-view-pdf"
                              >
                                {downloadingBatchId === b.batch_id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5" />
                                )}
                                Bukti PDF
                              </button>
                            )}
                            {b.status === 'failed' && (
                              <span className="text-[11px] text-red-400 italic">
                                {b.error || 'Simulasi gagal'}
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* Expanded Item Sequence Sub-Panel */}
                        {expandedBatchId === b.batch_id && (
                          <tr key={`${b.batch_id}-items`} className="bg-slate-950/80">
                            <td colSpan={6} className="p-4 border-t border-b border-slate-800">
                              <div
                                className="p-4 bg-slate-900/90 border border-slate-800 rounded-lg space-y-3"
                                data-testid="panel-batch-items-detail"
                              >
                                <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80">
                                  <div className="flex items-center gap-2">
                                    <ListOrdered className="w-4 h-4 text-amber-400" />
                                    <h4 className="text-xs font-bold text-white">
                                      Rincian Urutan Item (Item Sequence)
                                    </h4>
                                    <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-300">
                                      Batch: {b.batch_id.slice(0, 16)}...
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-slate-400 font-mono">
                                    Total: {batchDetail?.items?.length ?? b.total_items} item
                                  </span>
                                </div>

                                {isLoadingDetail ? (
                                  <div className="py-6 flex items-center justify-center space-x-2 text-slate-400 text-xs">
                                    <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                                    <span>Memuat urutan item...</span>
                                  </div>
                                ) : detailError ? (
                                  <div
                                    className="p-3 bg-red-950/40 border border-red-900/60 rounded text-red-300 text-xs flex items-center justify-between"
                                    data-testid="detail-error-message"
                                  >
                                    <span>{detailError}</span>
                                    <button
                                      onClick={() => handleToggleDetail(b.batch_id)}
                                      className="underline hover:text-red-200"
                                    >
                                      Coba Lagi
                                    </button>
                                  </div>
                                ) : batchDetail ? (
                                  <div className="space-y-2.5">
                                    {batchDetail.error && (
                                      <div
                                        className="p-2.5 bg-red-950/50 border border-red-800/60 rounded text-red-300 text-xs flex items-center gap-2"
                                        data-testid="batch-failure-alert"
                                      >
                                        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                                        <span>
                                          <strong>Kendala Simulasi:</strong> {batchDetail.error}
                                        </span>
                                      </div>
                                    )}

                                    <div className="overflow-x-auto">
                                      <table
                                        className="w-full text-left text-xs"
                                        data-testid="table-batch-items"
                                      >
                                        <thead className="text-[11px] text-slate-400 bg-slate-950/50 border-b border-slate-800">
                                          <tr>
                                            <th className="py-1.5 px-2.5 font-semibold">Urutan</th>
                                            <th className="py-1.5 px-2.5 font-semibold">Item ID</th>
                                            <th className="py-1.5 px-2.5 font-semibold">Template</th>
                                            <th className="py-1.5 px-2.5 font-semibold text-center">Salinan</th>
                                            <th className="py-1.5 px-2.5 font-semibold text-right">Status</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/40">
                                          {batchDetail.items && batchDetail.items.length > 0 ? (
                                            batchDetail.items.map((it) => (
                                              <tr
                                                key={it.item_id || it.item_sequence}
                                                className="hover:bg-slate-800/20"
                                                data-testid={`row-item-${it.item_sequence}`}
                                              >
                                                <td className="py-2 px-2.5">
                                                  <span className="font-mono font-bold text-amber-400 text-[11px]">
                                                    #{it.item_sequence}
                                                  </span>
                                                </td>
                                                <td className="py-2 px-2.5 font-mono text-[11px] text-slate-300">
                                                  {it.item_id}
                                                  {it.error && (
                                                    <div className="text-[10px] text-red-400 italic">
                                                      {it.error}
                                                    </div>
                                                  )}
                                                </td>
                                                <td className="py-2 px-2.5 font-mono text-[11px] text-slate-400">
                                                  {it.template_version_id}
                                                </td>
                                                <td className="py-2 px-2.5 text-[11px] text-slate-300 text-center font-mono">
                                                  {it.copies || 1}
                                                </td>
                                                <td className="py-2 px-2.5 text-right">
                                                  {it.status === 'completed' ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                                      <CheckCircle2 className="w-3 h-3" />
                                                      Selesai
                                                    </span>
                                                  ) : it.status === 'failed' ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                                                      <XCircle className="w-3 h-3" />
                                                      Gagal
                                                    </span>
                                                  ) : (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                      <Clock className="w-3 h-3" />
                                                      {it.status}
                                                    </span>
                                                  )}
                                                </td>
                                              </tr>
                                            ))
                                          ) : (
                                            <tr>
                                              <td colSpan={5} className="py-3 text-center text-slate-500 text-xs">
                                                Tidak ada rincian item untuk batch ini.
                                              </td>
                                            </tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            Thermal Label Studio — Simulasi Label Terpadu (Uji Mandiri SAP & Bukti PDF)
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
