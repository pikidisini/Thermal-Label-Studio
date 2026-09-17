import React from 'react';
import { RibbonDivider } from './RibbonDivider';

interface BarcodePropertyControlsProps {
  selectedObject: any;
  onUpdateProperty: (prop: string, val: any) => void;
}

export function BarcodePropertyControls({ selectedObject, onUpdateProperty }: BarcodePropertyControlsProps) {
  if (!selectedObject?.isBarcode) return null;

  const isQr = selectedObject.barcodeType === 'qrcode';

  return (
    <div data-testid="container-barcode-property-controls" className="flex items-center gap-2 pl-2">
      <RibbonDivider />
      <span
        data-testid="ribbon-barcode-icon"
        className="material-symbols-outlined text-secondary"
        style={{ fontSize: 15 }}
        title={isQr ? 'QR Code' : '1D Barcode'}
      >
        {isQr ? 'qr_code_2' : 'barcode'}
      </span>
      <span data-testid="ribbon-barcode-type-label" className="text-[11px] text-secondary font-semibold">
        {isQr ? 'QR' : 'Barcode'}
      </span>
      <input
        data-testid="ribbon-input-barcode-value"
        type="text"
        value={selectedObject.barcodeValue || ''}
        onChange={(e) => onUpdateProperty('barcodeValue', e.target.value)}
        placeholder="Barcode value…"
        className="w-32 bg-surface-container border border-outline-variant px-2 py-0.5 text-[11px] text-on-surface font-mono focus:outline-none focus:border-primary"
      />
    </div>
  );
}
