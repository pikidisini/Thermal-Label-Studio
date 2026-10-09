import { translate as t, useTranslation } from "../../../shared/i18n";
import { useTemplateStore } from '../../../store/useTemplateStore';
import React, { useState, useEffect } from 'react';
import { Save, X, Layers, HardDrive, CheckCircle2, AlertCircle, FileCode } from 'lucide-react';
import { Icon, Badge, Button, Dialog, DialogBody, DialogFooter, DialogHeader, ErrorState, Field, IconButton, Input, Status } from '../../../shared/ui';

export default function SaveTemplateModal({
  isOpen,
  onClose,
  activeTemplateId,
  widthMm,
  heightMm,
  existingTemplates = [],
  onSave
}) {
  useTranslation();
  const templateTitle = useTemplateStore(state => state.templateTitle);
  const [templateName, setTemplateName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      const initialId = activeTemplateId || 'custom_label';
      const initialName = initialId.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      setTemplateName(templateTitle || initialName);
      setTemplateId(initialId);
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen, activeTemplateId, templateTitle]);

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
    <div className="fixed inset-0 z-[var(--ui-layer-modal)] flex items-center justify-center backdrop-blur-sm animate-fade-in p-4" data-ui-backdrop="true" data-ui-motion="true">
      <Dialog
        className="w-full max-w-[560px] flex flex-col overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
       data-ui-motion="true">
        {/* Header */}
        <DialogHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-tertiary/15 border border-tertiary/40 flex items-center justify-center text-tertiary">
              <Icon component={Save}  size="control" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-on-surface font-mono tracking-wide uppercase">{t("Save Template to Repository")} </h2>
                <Badge>{t("STORAGE // SVG")} </Badge>
              </div>
              <p className="text-[11px] text-on-surface-variant">{t("Store current label canvas, placeholders, and vector geometry to server")} </p>
            </div>
          </div>
          <IconButton
            onClick={onClose}
            label={t("Close dialog")}

          >
            <Icon component={X}  size="control" />
          </IconButton>
        </DialogHeader>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && <ErrorState title={errorMsg} />}

          {/* Template Display Name */}
          <Field label={t("Template Display Name")} className="space-y-1.5">
            <Input
              type="text"
              value={templateName}
              onChange={handleNameChange}
              placeholder={t("e.g. Shipping Pallet 100x150")}
              autoFocus
              className="w-full h-8"
            />
          </Field>

          {/* System Template ID / Slug */}
          <div className="space-y-1.5">
            <label data-ui-label="true" className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant flex items-center justify-between">
              <span>{t("System Slug / Filename")}</span>
              <span className="text-[9px] text-outline">{t("API & Batch Dispatch ID")}</span>
            </label>
            <div className="flex items-center">
              <span className="h-8 px-2.5 bg-surface-container-highest border border-r-0 border-outline-variant text-[11px] font-mono text-on-surface-variant flex items-center select-none">{t("templates/")} </span>
              <Input
                type="text"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_'))}
                placeholder={t("label_custom_name")}
                className="flex-1 h-8"
              />
              <span className="h-8 px-2.5 bg-surface-container-highest border border-l-0 border-outline-variant text-[11px] font-mono text-on-surface-variant flex items-center select-none">{t(".svg")} </span>
            </div>
          </div>

          {/* Geometry & Overwrite Status Card */}
          <div className="bg-surface border border-outline-variant/50 p-3 flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <Icon component={Layers} className=" text-primary"  size={14} />
                <span>{t("Size:")}</span>
                <span className="text-on-surface font-bold">{widthMm} × {heightMm} {t("mm")}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {isExisting ? (
                <Status tone="warning">
                  <Icon component={HardDrive}  size="small" />
                  {matchedTemplate?.is_builtin ? t("Will Save as Custom Override") : t("Will Create New Version")}
                </Status>
              ) : (
                <Status tone="success">
                  <Icon component={CheckCircle2}  size="small" />{t("New Custom Template")} </Status>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <DialogFooter className="flex items-center justify-end gap-2">
            <Button
              type="button"
              onClick={onClose}
              className="h-8 uppercase tracking-wider"
             variant="default">{t("Cancel")} </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !templateId.trim()}
              tone="success" className="h-8 uppercase tracking-wider flex items-center gap-1.5"
             variant="default">
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-surface-container-lowest border-t-transparent rounded-full animate-spin"  data-ui-motion="true" />
                  <span>{t("Saving...")}</span>
                </>
              ) : (
                <>
                  <Icon component={Save}  size={14} />
                  <span>{t("Save to Server")}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
