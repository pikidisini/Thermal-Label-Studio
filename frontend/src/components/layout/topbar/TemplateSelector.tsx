import React from 'react';
import { TemplateMetadata } from '../../../types/template';

interface TemplateSelectorProps {
  templates: TemplateMetadata[];
  activeTemplateId: string;
  onSelectTemplate: (id: string) => void;
  labelWidthMm: number;
  labelHeightMm: number;
}

export function TemplateSelector({
  templates,
  activeTemplateId,
  onSelectTemplate,
  labelWidthMm,
  labelHeightMm,
}: TemplateSelectorProps) {
  return (
    <div data-testid="container-template-selector" className="flex items-center gap-2">
      {/* Template dropdown container */}
      <div data-testid="template-selector-box" className="flex items-center gap-1.5 px-2 py-1 bg-surface-container border border-outline-variant text-xs">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: 14 }}>
          description
        </span>
        <select
          data-testid="topbar-select-template"
          value={activeTemplateId}
          onChange={(e) => onSelectTemplate(e.target.value)}
          className="bg-transparent text-on-surface text-xs font-medium focus:outline-none cursor-pointer max-w-[160px] truncate"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id} className="bg-surface-container text-on-surface">
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Canvas size badge */}
      <div
        data-testid="topbar-badge-dimensions"
        className="font-mono text-[10px] px-2 py-1 bg-surface-container-low border border-outline-variant text-on-surface-variant tracking-tight"
      >
        {labelWidthMm}&thinsp;&times;&thinsp;{labelHeightMm}&thinsp;mm
      </div>
    </div>
  );
}
