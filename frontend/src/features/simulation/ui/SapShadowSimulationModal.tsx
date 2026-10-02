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
import { useAuthStore } from '../../../store/useAuthStore';
import { sapShadowSimulationApi } from '../api/sapShadowSimulationApi';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { Badge, Button, Dialog, DialogFooter, DialogHeader, IconButton } from '../../../shared/ui';
import type {
  PilotOperatorBatchSummary,
  PilotOperatorBatchDetail,
} from '../../../types/sapShadowSimulation';

interface SapShadowSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SapShadowSimulationModal({
  isOpen,
  onClose,
}: SapShadowSimulationModalProps) {
  const dialogRef = useModalA11y(isOpen, onClose);
  const { user, csrfToken: authCsrfToken } = useAuthStore();
  const [pilotEnabled, setPilotEnabled] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [csrfToken, setCsrfToken] = useState<string>('');
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);

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
  const [uploadWarnings, setUploadWarnings] = useState<Array<{ item_sequence: number; field: string; reason: 'missing' | 'invalid'; message: string }>>([]);

  useEffect(() => {
    if (!isOpen) {
      setExpandedBatchId(null);
      setBatchDetail(null);
      setDetailError(null);
      setIsImportOpen(false);
      setImportFile(null);
      setUploadError(null);
      setUploadSuccess(null);
      setUploadWarnings([]);
      return;
    }

    let isMounted = true;
    setIsCheckingSession(true);

    async function checkSession() {
      try {
        const session = await sapShadowSimulationApi.getOperatorSession();
        if (!isMounted) return;

        setPilotEnabled(Boolean(session.pilot_operator_enabled));
        const authed = Boolean(session.authenticated) || Boolean(user);
        setIsAuthenticated(authed);
        if (session.csrf_token) {
          setCsrfToken(session.csrf_token);
        } else if (authCsrfToken) {
          setCsrfToken(authCsrfToken);
        }

        if (authed) {
          loadBatches();
        }
      } catch {
        if (!isMounted) return;
        setIsAuthenticated(Boolean(user));
        if (user) {
          loadBatches();
        }
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
  }, [isOpen, user, authCsrfToken]);

  async function loadBatches() {
    setIsLoadingBatches(true);
    setBatchError(null);
    try {
      const data = await sapShadowSimulationApi.listOperatorBatches();
      setBatches(data);
    } catch (err: any) {
      setBatchError(err?.message || 'Unable to load the simulation batch list.');
    } finally {
      setIsLoadingBatches(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    setUploadSuccess(null);
    setUploadWarnings([]);
    const file = e.target.files?.[0] || null;
    if (!file) {
      setImportFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith('.json')) {
      setUploadError('Only .json files are allowed.');
      setImportFile(null);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError(`The file size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 2 MiB limit.`);
      setImportFile(null);
      return;
    }
    setImportFile(file);
  }

  async function handleImportSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!importFile) {
      setUploadError('Choose a JSON file first.');
      return;
    }
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const res = await sapShadowSimulationApi.importOperatorJson(importFile, csrfToken);
      const batchId = res.batch_id || res.request_id || 'new';
      const warnings = Array.isArray(res.warnings) ? res.warnings : [];
      setUploadWarnings(warnings);
      setUploadSuccess(
        warnings.length
          ? `Batch ${batchId} was processed with ${warnings.length} warning(s). Unavailable values are displayed as --.`
          : `Batch ${batchId} was imported successfully. Displaying simulation results.`
      );
      setImportFile(null);
      const fileInput = document.getElementById('input-import-json-file') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
      await loadBatches();
      if (res.batch_id) {
        handleToggleDetail(res.batch_id);
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Unable to import the SAP JSON file.');
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
      setDetailError(err?.message || 'Unable to load item-sequence details.');
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function handleDownloadPdf(batchId: string) {
    setDownloadingBatchId(batchId);
    try {
      await sapShadowSimulationApi.downloadOperatorPdf(batchId);
    } catch (err: any) {
      alert(err?.message || 'Unable to download the simulation evidence PDF.');
    } finally {
      setDownloadingBatchId(null);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--ui-layer-modal)] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
      data-testid="sap-shadow-simulation-modal"
      role="presentation"
    >
      <Dialog ref={dialogRef} aria-labelledby="sap-shadow-simulation-title" tabIndex={-1} className="relative w-full max-w-3xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <DialogHeader className="flex items-center justify-between px-6 py-4 bg-surface-container shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-secondary-container/10 border border-secondary-container/30 rounded-lg text-secondary">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="sap-shadow-simulation-title" className="text-lg font-bold text-on-surface">
                  Label Simulation
                </h2>
                <Badge tone="warning" className="text-xs font-semibold">DEV Data Simulation</Badge>
                {user && (
                  <Badge
                    tone={user.role === 'IT' ? 'primary' : 'success'}
                    className="text-[10px] font-bold uppercase gap-1"
                    data-testid="badge-operator-active"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    [{user.role}] {user.username}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-on-surface-variant">
                Review SAP DEV simulation results and watermarked PDF evidence. Simulation only; no physical printing.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <IconButton
              onClick={onClose}
              className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
              label="Close label simulation"
              data-testid="btn-close-sap-simulation"
            >
              <X className="w-5 h-5" />
            </IconButton>
          </div>
        </DialogHeader>

        {/* Safety Warning Ribbon */}
        <div className="px-6 py-2.5 bg-studio-rose/10 border-b border-studio-rose/40 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center space-x-2 text-studio-rose">
            <AlertTriangle className="w-4 h-4 text-studio-rose shrink-0" />
            <span>
              <strong>Fail-closed safety boundary:</strong> SIMULATION — NOT FOR PHYSICAL PRINTING.
              No physical socket, port 9100, or Windows Spooler.
            </span>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-4 grow" data-testid="container-simulation-results">
          {isCheckingSession ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-on-surface-variant">
              <RefreshCw className="w-6 h-6 animate-spin text-secondary" />
              <p className="text-xs">Checking simulation session status...</p>
            </div>
          ) : !isAuthenticated && !user ? (
            <div className="p-6 bg-surface-container-lowest/80 border border-outline-variant rounded-xl space-y-4 max-w-md mx-auto text-center" data-testid="simulation-auth-required">
              <div className="p-3 bg-studio-rose/10 border border-studio-rose/50 rounded-lg text-studio-rose inline-block">
                <Lock className="w-6 h-6 mx-auto" />
              </div>
              <h3 className="font-bold text-on-surface text-sm">
                Application session is unavailable or has expired
              </h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Sign in with a PPIC or IT account to access Label Simulation.
              </p>
            </div>
          ) : (
            /* Dashboard Batch List */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-on-surface text-sm">
                    Label Simulation Batches
                  </h3>
                  <p className="text-[11px] text-on-surface-variant">
                    Monitor SAP DEV simulation batches through the in-process virtual sink. No physical printer is used.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setIsImportOpen(!isImportOpen);
                      setUploadError(null);
                      setUploadSuccess(null);
                      setUploadWarnings([]);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                      isImportOpen
                        ? 'bg-secondary-container text-on-surface'
                        : 'text-secondary hover:text-secondary bg-secondary-container/10 hover:bg-secondary-container/20 border border-secondary-container/60'
                    }`}
                    data-testid="btn-open-import-json"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import JSON Data
                  </button>
                  <button
                    onClick={loadBatches}
                    disabled={isLoadingBatches}
                    className="px-3 py-1.5 text-xs font-medium text-on-surface hover:text-on-surface bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant rounded-lg transition-colors flex items-center gap-1.5"
                    data-testid="btn-refresh-batches"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBatches ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Import Local SAP JSON Panel (B2B2O) */}
              {isImportOpen && (
                <div
                  className="p-4 bg-surface-container/90 border border-secondary-container/60 rounded-xl space-y-3"
                  data-testid="panel-import-json"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4 text-secondary" />
                      <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                        Import Raw Data Snapshot v2 (.json)
                      </h4>
                    </div>
                    <button
                      onClick={() => {
                        setIsImportOpen(false);
                        setUploadError(null);
                        setUploadSuccess(null);
                      }}
                      className="text-on-surface-variant hover:text-on-surface p-1 rounded transition-colors"
                      data-testid="btn-cancel-import-json"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-[11px] text-on-surface leading-relaxed">
                    Choose a JSON file exported by <code>ZMMR_LABEL_JSON</code> from SAP DEV on your computer to run label simulation without sending data to a physical printer.
                  </p>

                  <div className="p-2.5 bg-secondary-container/10 border border-secondary-container/40 rounded-lg flex items-start gap-2 text-[11px] text-secondary">
                    <AlertTriangle className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-secondary">Security and privacy notice:</span>{' '}
                      This file may contain SAP DEV business data. It is uploaded to the current application server for simulation and PDF evidence generation; it is never sent to a physical printer.
                    </div>
                  </div>

                  <form onSubmit={handleImportSubmit} className="space-y-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-medium text-on-surface mb-1">
                        Choose JSON file (maximum 2 MiB):
                      </label>
                      <input
                        id="input-import-json-file"
                        type="file"
                        accept=".json"
                        onChange={handleFileSelect}
                        disabled={isUploading}
                        className="w-full text-xs text-on-surface file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-secondary-container file:text-on-surface hover:file:bg-secondary-container file:cursor-pointer border border-outline-variant bg-surface-container-lowest rounded-lg p-1.5 focus:outline-none focus:border-secondary-container"
                        data-testid="input-import-json-file"
                      />
                    </div>

                    {importFile && (
                      <div className="flex items-center gap-3 text-xs text-on-surface bg-surface-container-lowest/60 p-2.5 rounded-lg border border-outline-variant">
                        <span className="font-medium text-on-surface truncate max-w-xs">{importFile.name}</span>
                        <span className="text-on-surface-variant text-[11px]">
                          ({(importFile.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                    )}

                    {uploadError && (
                      <div
                        className="p-2.5 bg-studio-rose/10 border border-studio-rose/60 rounded-lg text-xs text-studio-rose flex items-start gap-2"
                        data-testid="alert-import-json-error"
                      >
                        <XCircle className="w-4 h-4 text-studio-rose shrink-0 mt-0.5" />
                        <span>{uploadError}</span>
                      </div>
                    )}

                    {uploadSuccess && (
                      <div
                        className="p-2.5 bg-tertiary-container/10 border border-tertiary-container/60 rounded-lg text-xs text-tertiary flex items-start gap-2"
                        data-testid="alert-import-json-success"
                      >
                        <CheckCircle2 className="w-4 h-4 text-tertiary shrink-0 mt-0.5" />
                        <span>{uploadSuccess}</span>
                      </div>
                    )}

                    {uploadWarnings.length > 0 && (
                      <div
                        className="p-3 bg-secondary-container/10 border border-secondary-container/60 rounded-lg text-xs text-secondary space-y-2"
                        role="status"
                        data-testid="alert-import-json-warnings"
                      >
                        <div className="flex items-center gap-2 font-semibold text-secondary">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>Simulation completed; review unavailable information:</span>
                        </div>
                        <ul className="list-disc pl-6 space-y-1">
                          {uploadWarnings.map((warning, index) => (
                            <li key={`${warning.item_sequence}-${warning.field}-${index}`}>
                              Item {warning.item_sequence}: <code>{warning.field}</code> — {warning.reason === 'invalid' ? 'invalid value' : 'not found'}; the label displays <code>--</code>.
                            </li>
                          ))}
                        </ul>
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
                        className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant rounded-lg transition-colors"
                      >
                        Close
                      </button>
                      <button
                        type="submit"
                        disabled={isUploading || !importFile}
                        className="px-4 py-1.5 text-xs font-semibold text-on-surface bg-secondary-container hover:bg-secondary-container disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 shadow"
                        data-testid="btn-submit-import-json"
                      >
                        {isUploading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Importing and processing...
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            Upload and run simulation
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {batchError && (
                <div className="p-3 bg-studio-rose/10 border border-studio-rose/60 rounded-lg text-xs text-studio-rose flex items-center justify-between">
                  <span>{batchError}</span>
                  <button
                    onClick={loadBatches}
                    className="text-xs underline hover:text-studio-rose"
                  >
                    Try again
                  </button>
                </div>
              )}

              {isLoadingBatches && batches.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-2 text-on-surface-variant">
                  <RefreshCw className="w-6 h-6 animate-spin text-secondary" />
                  <p className="text-xs">Loading simulation batches...</p>
                </div>
              ) : batches.length === 0 ? (
                <div
                  className="py-10 px-6 bg-surface-container-lowest/50 border border-outline-variant rounded-xl text-center space-y-2.5"
                  data-testid="empty-simulation-batches"
                >
                  <Clock className="w-8 h-8 text-outline mx-auto" />
                  <h4 className="text-sm font-semibold text-on-surface">
                    No Label Simulation Batches Yet
                  </h4>
                  <p className="text-xs text-on-surface-variant max-w-md mx-auto leading-relaxed">
                    The system is ready to receive a simulation batch. Run a label transaction in SAP DEV (for example, <code>ZLABEL</code> or <code>ZMMR_LABEL_JSON</code>) or use the Import JSON Data button above. Simulation batches appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="border border-outline-variant rounded-xl overflow-hidden" data-testid="table-simulation-batches">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-container-lowest/90 text-on-surface-variant font-semibold border-b border-outline-variant">
                      <tr>
                        <th className="py-2.5 px-3">Time</th>
                        <th className="py-2.5 px-3">Request ID / Batch ID</th>
                        <th className="py-2.5 px-3">Label Profile</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Item</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-surface-container/50">
                      {batches.map((b) => (
                        <React.Fragment key={b.batch_id}>
                          <tr className="hover:bg-surface-container-high/40 transition-colors">
                            <td className="py-3 px-3 text-on-surface-variant text-[11px] whitespace-nowrap">
                            {new Date(b.created_at).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-mono text-on-surface font-medium text-[11px]">
                              {b.request_id}
                            </div>
                            <div className="font-mono text-[10px] text-outline">
                              {b.batch_id.slice(0, 12)}...
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-mono font-medium text-on-surface text-[11px]">
                              {b.label_code}
                            </span>
                            <span className="block text-[10px] text-outline font-mono">
                              {b.profile_version}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {b.status === 'completed' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-tertiary-container/20 text-tertiary border border-tertiary-container/30">
                                <CheckCircle2 className="w-3 h-3" />
                                Selesai
                              </span>
                            ) : b.status === 'failed' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-studio-rose/20 text-studio-rose border border-studio-rose/30">
                                <XCircle className="w-3 h-3" />
                                Failed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary-container/20 text-secondary border border-secondary-container/30">
                                <Clock className="w-3 h-3" />
                                {b.status}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-on-surface font-medium">
                            {b.completed_items}/{b.total_items}
                            {(b.warning_count ?? 0) > 0 && (
                              <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-secondary" data-testid={`batch-warning-count-${b.batch_id}`}>
                                <AlertTriangle className="w-3 h-3" /> {b.warning_count} warning
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              onClick={() => handleToggleDetail(b.batch_id)}
                              className="px-2 py-1 text-xs font-semibold rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant transition-colors inline-flex items-center gap-1 shadow-xs"
                              title="View item-sequence details"
                              data-testid={`btn-toggle-items-${b.batch_id}`}
                            >
                              <ListOrdered className="w-3.5 h-3.5 text-secondary" />
                              {expandedBatchId === b.batch_id ? 'Close Item' : 'Item Sequence'}
                            </button>

                            {b.status === 'completed' && (
                              <button
                                onClick={() => handleDownloadPdf(b.batch_id)}
                                disabled={downloadingBatchId === b.batch_id}
                                className="px-2.5 py-1 text-xs font-semibold rounded bg-secondary-container/90 hover:bg-secondary-container text-on-surface disabled:opacity-50 transition-colors inline-flex items-center gap-1 shadow-xs"
                                title="Download / open simulation evidence PDF"
                                data-testid="btn-view-pdf"
                              >
                                {downloadingBatchId === b.batch_id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5" />
                                )}
                                Evidence PDF
                              </button>
                            )}
                            {b.status === 'failed' && (
                              <span className="text-[11px] text-studio-rose italic">
                                {b.error || 'Simulation failed'}
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* Expanded Item Sequence Sub-Panel */}
                        {expandedBatchId === b.batch_id && (
                          <tr key={`${b.batch_id}-items`} className="bg-surface-container-lowest/80">
                            <td colSpan={6} className="p-4 border-t border-b border-outline-variant">
                              <div
                                className="p-4 bg-surface-container/90 border border-outline-variant rounded-lg space-y-3"
                                data-testid="panel-batch-items-detail"
                              >
                                <div className="flex items-center justify-between pb-2.5 border-b border-outline-variant/80">
                                  <div className="flex items-center gap-2">
                                    <ListOrdered className="w-4 h-4 text-secondary" />
                                    <h4 className="text-xs font-bold text-on-surface">
                                      Item Sequence Details
                                    </h4>
                                    <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-surface-container-high text-on-surface">
                                      Batch: {b.batch_id.slice(0, 16)}...
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-on-surface-variant font-mono">
                                    Total: {batchDetail?.items?.length ?? b.total_items} item
                                  </span>
                                </div>

                                {isLoadingDetail ? (
                                  <div className="py-6 flex items-center justify-center space-x-2 text-on-surface-variant text-xs">
                                    <RefreshCw className="w-4 h-4 animate-spin text-secondary" />
                                    <span>Loading item sequence...</span>
                                  </div>
                                ) : detailError ? (
                                  <div
                                    className="p-3 bg-studio-rose/10 border border-studio-rose/60 rounded text-studio-rose text-xs flex items-center justify-between"
                                    data-testid="detail-error-message"
                                  >
                                    <span>{detailError}</span>
                                    <button
                                      onClick={() => handleToggleDetail(b.batch_id)}
                                      className="underline hover:text-studio-rose"
                                    >
                                      Try again
                                    </button>
                                  </div>
                                ) : batchDetail ? (
                                  <div className="space-y-2.5">
                                    {batchDetail.error && (
                                      <div
                                        className="p-2.5 bg-studio-rose/10 border border-studio-rose/60 rounded text-studio-rose text-xs flex items-center gap-2"
                                        data-testid="batch-failure-alert"
                                      >
                                        <XCircle className="w-4 h-4 text-studio-rose shrink-0" />
                                        <span>
                                          <strong>Simulation issue:</strong> {batchDetail.error}
                                        </span>
                                      </div>
                                    )}

                                    {batchDetail.warnings && batchDetail.warnings.length > 0 && (
                                      <div
                                        className="p-3 bg-secondary-container/10 border border-secondary-container/60 rounded text-secondary text-xs space-y-2"
                                        role="status"
                                        data-testid="batch-detail-warnings"
                                      >
                                        <div className="font-semibold text-secondary flex items-center gap-2">
                                          <AlertTriangle className="w-4 h-4 shrink-0" />
                                          Unavailable information in this batch:
                                        </div>
                                        <ul className="list-disc pl-6 space-y-1">
                                          {batchDetail.warnings.map((warning, index) => (
                                            <li key={`${warning.item_sequence}-${warning.field}-${index}`}>
                                              Item {warning.item_sequence}: <code>{warning.field}</code> — {warning.reason === 'invalid' ? 'invalid value' : 'not found'}; ditampilkan sebagai <code>--</code>.
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}

                                    <div className="overflow-x-auto">
                                      <table
                                        className="w-full text-left text-xs"
                                        data-testid="table-batch-items"
                                      >
                                        <thead className="text-[11px] text-on-surface-variant bg-surface-container-lowest/50 border-b border-outline-variant">
                                          <tr>
                                            <th className="py-1.5 px-2.5 font-semibold">Sequence</th>
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
                                                className="hover:bg-surface-container-high/20"
                                                data-testid={`row-item-${it.item_sequence}`}
                                              >
                                                <td className="py-2 px-2.5">
                                                  <span className="font-mono font-bold text-secondary text-[11px]">
                                                    #{it.item_sequence}
                                                  </span>
                                                </td>
                                                <td className="py-2 px-2.5 font-mono text-[11px] text-on-surface">
                                                  {it.item_id}
                                                  {it.error && (
                                                    <div className="text-[10px] text-studio-rose italic">
                                                      {it.error}
                                                    </div>
                                                  )}
                                                </td>
                                                <td className="py-2 px-2.5 font-mono text-[11px] text-on-surface-variant">
                                                  {it.template_version_id}
                                                </td>
                                                <td className="py-2 px-2.5 text-[11px] text-on-surface text-center font-mono">
                                                  {it.copies || 1}
                                                </td>
                                                <td className="py-2 px-2.5 text-right">
                                                  {it.status === 'completed' ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-tertiary-container/20 text-tertiary border border-tertiary-container/30">
                                                      <CheckCircle2 className="w-3 h-3" />
                                                      Selesai
                                                    </span>
                                                  ) : it.status === 'failed' ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-studio-rose/20 text-studio-rose border border-studio-rose/30">
                                                      <XCircle className="w-3 h-3" />
                                                      Failed
                                                    </span>
                                                  ) : (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary-container/20 text-secondary border border-secondary-container/30">
                                                      <Clock className="w-3 h-3" />
                                                      {it.status}
                                                    </span>
                                                  )}
                                                </td>
                                              </tr>
                                            ))
                                          ) : (
                                            <tr>
                                              <td colSpan={5} className="py-3 text-center text-outline text-xs">
                                                No item details are available for this batch.
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
        <DialogFooter className="px-6 py-4 bg-surface-container flex items-center justify-between shrink-0">
          <span className="text-xs text-outline">
            Thermal Label Studio — Label Simulation (Self-service and PDF evidence)
          </span>
          <Button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors"
            data-testid="btn-close-modal-action"
          >
            Close
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
