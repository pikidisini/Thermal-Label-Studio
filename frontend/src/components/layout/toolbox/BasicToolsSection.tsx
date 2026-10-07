import React from 'react';
import { ActiveTool } from '../../../types/label';
import { DockButton } from './DockButton';

interface BasicToolsSectionProps {
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  onAddText: () => void;
  onAddBarcode: () => void;
  onAddQrCode: () => void;
  onAddLine: () => void;
  onUploadImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

interface ToolDef {
  id: string;
  label: string;
  icon: string;
  action: () => void;
  testId: string;
}

export function BasicToolsSection({
  activeTool,
  setActiveTool,
  onAddText,
  onAddBarcode,
  onAddQrCode,
  onAddLine,
  onUploadImage,
}: BasicToolsSectionProps) {
  const tools: ToolDef[] = [
    { id: 'select',  label: 'Select & Move',  icon: 'near_me',         action: () => setActiveTool('select'), testId: 'btn-tool-select'  },
    { id: 'text',    label: 'Add Text (T)',    icon: 'title',           action: onAddText,                     testId: 'btn-add-text'     },
    { id: 'barcode', label: '1D Barcode (B)',  icon: 'barcode',         action: onAddBarcode,                  testId: 'btn-add-barcode'  },
    { id: 'qrcode',  label: '2D QR Code',     icon: 'qr_code_2',       action: onAddQrCode,                   testId: 'btn-add-qrcode'   },
    { id: 'line',    label: 'Draw line · Shift 45° · Esc finish · Alt new line',          icon: 'horizontal_rule', action: () => setActiveTool('line'),    testId: 'btn-add-line'     },
  ];

  return (
    <div data-testid="container-basic-tools-section" className="flex flex-col items-center">
      {/* Tool buttons */}
      {tools.map((t) => (
        <DockButton
          key={t.id}
          icon={t.icon}
          label={t.label}
          active={activeTool === t.id}
          onClick={t.action}
          testId={t.testId}
        />
      ))}

      {/* Separator */}
      <div className="w-8 my-1.5 h-px bg-outline-variant" />

      {/* Image upload */}
      <label
        data-testid="btn-upload-image"
        className="w-12 h-12 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer group relative"
        title="Upload Image / Logo"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>image</span>
        <span className="absolute left-full ml-2 px-2 py-1 bg-surface-container-highest text-on-surface text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[var(--ui-layer-tooltip)] border border-outline-variant">
          Upload Image / Logo
        </span>
        <input
          data-testid="input-upload-image-file"
          type="file"
          accept="image/*,.svg"
          onChange={onUploadImage}
          className="hidden"
        />
      </label>
    </div>
  );
}
