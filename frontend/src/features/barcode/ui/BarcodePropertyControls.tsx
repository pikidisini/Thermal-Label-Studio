import { translate as t, useTranslation } from "../../../shared/i18n";
﻿import React from 'react';

interface BarcodePropertyControlsProps {
  selectedObject: any;
  onUpdateProperty: (prop: string, val: any) => void;
}

export function BarcodePropertyControls({ selectedObject, onUpdateProperty }: BarcodePropertyControlsProps) {
  useTranslation();
  if (!selectedObject?.isBarcode) return null;

  const isQr = selectedObject.barcodeType === 'qrcode';

  return (
    <div data-testid="container-barcode-property-controls" className="flex items-center gap-2 pl-2">
      <div aria-hidden="true" className="w-px h-4 bg-outline-variant mx-1 flex-shrink-0" />
      <span
        data-testid="ribbon-barcode-icon"
        className="material-symbols-outlined text-secondary"

        title={isQr ? t("QR Code") : t("1D Barcode")}
 style={{ fontSize: "var(--ui-icon-15)" }}>
        {isQr ? "qr_code_2" : "barcode"}
      </span>
      <span data-testid="ribbon-barcode-type-label" className="text-[11px] text-secondary font-semibold">
        {isQr ? t("QR") : t("Barcode")}
      </span>
      <input
        data-testid="ribbon-input-barcode-value"
        type="text"
        value={selectedObject.barcodeValue || ''}
        onChange={(e) => onUpdateProperty('barcodeValue', e.target.value)}
        placeholder={t("Barcode value…")}
        className="w-32"
       data-ui-control="input" data-variant="default" />
    </div>
  );
}
