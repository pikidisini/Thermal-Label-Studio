import React, { useState, useEffect } from 'react';
import { Save, X, Layers, HardDrive, CheckCircle2, AlertCircle, FileCode } from 'lucide-react';

export default function SaveTemplateModal({
  isOpen,
  onClose,
  activeTemplateId,
  widthMm,
  heightMm,
  existingTemplates = [],
  onSave
}) {
  const [templateName, setTemplateName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      const initialId = activeTemplateId || 'custom_label';
      const initialName = initialId.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      setTemplateName(initialName);
      setTemplateId(initialId);
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen, activeTemplateId]);

  if (!isOpen) return null;

  const handleNameChange = (e) => {
    const val = e.target.value;
    setTemplateName(val);
    const slug = val.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    setTemplateId(slug);
  };

  const isExisting = existingTemplates.some(t => t.id === templateId && !t.is_draft);
  const matchedTemplate = existingTemplates.find(t => t.id === templateId && !t.is_draft);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!templateId || !templateId.trim()) {
      setErrorMsg('Template ID cannot be empty');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      await onSave(templateId.trim(), templateName.trim());
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save template');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans animate-fade-in">
      <div 
        className="w-full max-w-[560px] bg-surface-container-low border border-outline-variant shadow-2xl flex flex-col overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-surface-container border-b border-outline-variant/60">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-tertiary/15 border border-tertiary/40 flex items-center justify-center text-tertiary">
              <Save className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-on-surface font-mono tracking-wide uppercase">
                  Save Template to Repository
                </h2>
                <span className="px-1.5 py-0.2 bg-surface-container-highest border border-outline-variant text-[9px] font-mono text-on-surface-variant">
                  STORAGE // SVG
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Store current label canvas, placeholders, and vector geometry to server
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high p-1 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-2.5 bg-red-950/40 border border-red-500/50 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Template Display Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant flex items-center justify-between">
              <span>Template Display Name</span>
              <span className="text-[9px] text-outline">Visible in Dropdown</span>
            </label>
            <input
              type="text"
              value={templateName}
              onChange={handleNameChange}
              placeholder="e.g. Shipping Pallet 100x150"
              autoFocus
              className="w-full h-8 px-3 bg-surface border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary text-xs text-on-surface font-sans outline-none transition"
            />
          </div>

          {/* System Template ID / Slug */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant flex items-center justify-between">
              <span>System Slug / Filename</span>
              <span className="text-[9px] text-outline">API &amp; Batch Dispatch ID</span>
            </label>
            <div className="flex items-center">
              <span className="h-8 px-2.5 bg-surface-container-highest border border-r-0 border-outline-variant text-[11px] font-mono text-on-surface-variant flex items-center select-none">
                templates/
              </span>
              <input
                type="text"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_'))}
                placeholder="label_custom_name"
                className="flex-1 h-8 px-3 bg-surface border border-outline-variant focus:border-primary text-xs text-on-surface font-mono outline-none"
              />
              <span className="h-8 px-2.5 bg-surface-container-highest border border-l-0 border-outline-variant text-[11px] font-mono text-on-surface-variant flex items-center select-none">
                .svg
              </span>
            </div>
          </div>

          {/* Geometry & Overwrite Status Card */}
          <div className="bg-surface border border-outline-variant/50 p-3 flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <Layers className="w-3.5 h-3.5 text-primary" />
                <span>Size:</span>
                <span className="text-on-surface font-bold">{widthMm} × {heightMm} mm</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {isExisting ? (
                <span className="text-[10px] text-amber-400 bg-amber-950/40 border border-amber-500/40 px-2 py-0.5 flex items-center gap-1">
                  <HardDrive className="w-3 h-3" />
                  {matchedTemplate?.is_builtin ? 'Will Save as Custom Override' : 'Will Overwrite Existing'}
                </span>
              ) : (
                <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/40 px-2 py-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  New Custom Template
                </span>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-outline-variant/40">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-4 bg-surface-container hover:bg-surface-container-high border border-outline-variant text-xs font-mono uppercase tracking-wider text-on-surface transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !templateId.trim()}
              className="h-8 px-5 bg-tertiary hover:bg-tertiary/90 text-surface-container-lowest font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-surface-container-lowest border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save to Server</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
