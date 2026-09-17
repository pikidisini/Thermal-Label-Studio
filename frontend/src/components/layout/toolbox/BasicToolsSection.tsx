import React from 'react';
import { ActiveTool } from '../../../types/label';
import { DockButton } from './DockButton';

interface BasicToolsSectionProps {
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  onAddText: () => void;
  onAddBarcode: () => void;
  onAddQrCode: () => void;
  onAddBox: () => void;
  onAddLine: () => void;
  onAddCircle: () => void;
  onAddTable: () => void;
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
  onAddBox,
  onAddLine,
  onAddCircle,
  onAddTable,
  onUploadImage,
}: BasicToolsSectionProps) {
  const tools: ToolDef[] = [
    { id: 'select',  label: 'Select & Move',  icon: 'near_me',         action: () => setActiveTool('select'), testId: 'btn-tool-select'  },
    { id: 'text',    label: 'Add Text (T)',    icon: 'title',           action: onAddText,                     testId: 'btn-add-text'     },
    { id: 'barcode', label: '1D Barcode (B)',  icon: 'barcode',         action: onAddBarcode,                  testId: 'btn-add-barcode'  },
    { id: 'qrcode',  label: '2D QR Code',     icon: 'qr_code_2',       action: onAddQrCode,                   testId: 'btn-add-qrcode'   },
    { id: 'rect',    label: 'Rectangle (R)',   icon: 'crop_square',     action: onAddBox,                      testId: 'btn-add-rect'     },
    { id: 'line',    label: 'Line Divider',    icon: 'horizontal_rule', action: onAddLine,                     testId: 'btn-add-line'     },
    { id: 'circle',  label: 'Circle (C)',      icon: 'circle',          action: onAddCircle,                   testId: 'btn-add-circle'   },
    { id: 'table',   label: 'Table Grid',      icon: 'table',           action: onAddTable,                    testId: 'btn-add-table'    },
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
        <span className="absolute left-full ml-2 px-2 py-1 bg-surface-container-highest text-on-surface text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 border border-outline-variant">
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
