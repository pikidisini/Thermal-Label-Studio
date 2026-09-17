import React from 'react';

interface LayersTabProps {
  objectsList: any[];
  selectedObject: any;
  canvasRef: React.MutableRefObject<any>;
  onBringForward: () => void;
  onSendBackward: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSelectLayer: (obj: any) => void;
}

function getObjIcon(obj: any): string {
  if (obj.isBarcode) return obj.barcodeType === 'qrcode' ? 'qr_code_2' : 'barcode';
  if (obj.type === 'text' || obj.type === 'i-text') return 'title';
  if (obj.type === 'rect')   return 'crop_square';
  if (obj.type === 'line')   return 'horizontal_rule';
  if (obj.type === 'circle') return 'circle';
  if (obj.type === 'image')  return 'image';
  if (obj.isGhsSymbol)       return 'warning';
  return 'layers';
}

function getObjColor(obj: any): string {
  if (obj.isBarcode) return obj.barcodeType === 'qrcode' ? 'text-tertiary' : 'text-primary';
  if (obj.type === 'text' || obj.type === 'i-text') return 'text-secondary';
  if (obj.type === 'rect')   return 'text-primary';
  if (obj.type === 'circle') return 'text-secondary';
  if (obj.isGhsSymbol)       return 'text-secondary';
  return 'text-on-surface-variant';
}

function getObjName(obj: any): string {
  if (obj.dataField) return `{{${obj.dataField}}}`;
  if (obj.dataBarcode) return `Bar: ${obj.dataBarcode}`;
  if (obj.dataQr) return `QR: ${obj.dataQr}`;
  if (obj.text) return `"${obj.text.substring(0, 18)}"`;
  if (obj.isBarcode) return `Barcode (${obj.barcodeType || '1D'})`;
  if (obj.type === 'rect')   return 'Rectangle';
  if (obj.type === 'line')   return 'Line';
  if (obj.type === 'circle') return 'Circle';
  if (obj.type === 'group')  return 'Vector Group';
  return obj.type || 'Object';
}

function LayerActionBtn({ icon, title, testId, onClick, disabled, danger }: {
  icon: string; title: string; testId: string; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`p-1 transition-colors disabled:opacity-25 disabled:cursor-not-allowed ${
        danger ? 'text-on-surface-variant hover:text-secondary hover:bg-secondary/10'
               : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
      }`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>
    </button>
  );
}

export function LayersTab({
  objectsList, selectedObject, canvasRef,
  onBringForward, onSendBackward, onDuplicate, onDelete, onSelectLayer,
}: LayersTabProps) {
  const noSel = !selectedObject;

  const toggleVisibility = (obj: any, e: React.MouseEvent) => {
    e.stopPropagation();
    obj.visible = !obj.visible;
    canvasRef.current?.renderAll();
  };

  const toggleLock = (obj: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const locked = !obj.lockMovementX;
    obj.lockMovementX = locked; obj.lockMovementY  = locked;
    obj.lockRotation  = locked; obj.lockScalingX   = locked;
    obj.lockScalingY  = locked; obj.selectable     = !locked;
    canvasRef.current?.renderAll();
  };

  return (
    <div data-testid="container-layers-tab" className="flex flex-col h-full">
      {/* Header with actions */}
      <div
        data-testid="layers-tab-header"
        className="flex items-center justify-between px-2 py-1.5 border-b border-outline-variant bg-surface-container shrink-0"
      >
        <span data-testid="layers-count-label" className="text-[11px] font-semibold text-on-surface">
          Hierarchy Stack ({objectsList.length})
        </span>
        <div data-testid="layers-header-actions" className="flex items-center gap-0">
          <LayerActionBtn icon="flip_to_front"  title="Bring Forward" testId="layers-btn-bring-forward" onClick={onBringForward} disabled={noSel} />
          <LayerActionBtn icon="flip_to_back"   title="Send Backward" testId="layers-btn-send-backward" onClick={onSendBackward} disabled={noSel} />
          <LayerActionBtn icon="content_copy"   title="Duplicate"     testId="layers-btn-duplicate"     onClick={onDuplicate}    disabled={noSel} />
          <LayerActionBtn icon="delete"         title="Delete"        testId="layers-btn-delete"        onClick={onDelete}        disabled={noSel} danger />
        </div>
      </div>

      {/* Layer list */}
      <div data-testid="container-layers-list" className="flex-1 overflow-y-auto divide-y divide-outline-variant/40">
        {objectsList.length === 0 ? (
          <div data-testid="layers-empty-state" className="p-6 flex flex-col items-center gap-2 text-center">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: 28 }}>layers_clear</span>
            <p className="text-[11px] text-on-surface-variant">No vector elements on canvas</p>
          </div>
        ) : (
          objectsList.map((obj, idx) => {
            const isSelected = selectedObject && (selectedObject._target === obj || selectedObject.id === obj.id);
            const isSapBound = !!obj.dataField;
            const isHidden   = obj.visible === false;
            const isLocked   = !!obj.lockMovementX;

            return (
              <div
                key={obj.id || idx}
                data-testid={`layer-item-${idx}`}
                onClick={() => onSelectLayer(obj)}
                className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer text-xs transition-colors ${
                  isSelected
                    ? 'bg-primary/10 border-l-2 border-primary'
                    : 'hover:bg-surface-container-high border-l-2 border-transparent'
                }`}
              >
                <span className={`material-symbols-outlined shrink-0 ${getObjColor(obj)}`} style={{ fontSize: 15 }}>
                  {getObjIcon(obj)}
                </span>

                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                  <span className={`truncate font-mono text-[11px] ${isHidden ? 'opacity-40' : ''} ${isSelected ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                    {getObjName(obj)}
                  </span>
                  {isSapBound && (
                    <span data-testid={`layer-item-bound-badge-${idx}`} className="shrink-0 text-[8px] px-1 py-0.5 bg-tertiary/15 text-tertiary font-semibold">
                      BOUND
                    </span>
                  )}
                </div>

                <div data-testid={`layer-item-controls-${idx}`} className="flex items-center gap-0 opacity-50 hover:opacity-100">
                  <button
                    data-testid={`layer-btn-visibility-${idx}`}
                    onClick={(e) => toggleVisibility(obj, e)}
                    title={isHidden ? 'Show' : 'Hide'}
                    className="p-0.5 text-on-surface-variant hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                      {isHidden ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                  <button
                    data-testid={`layer-btn-lock-${idx}`}
                    onClick={(e) => toggleLock(obj, e)}
                    title={isLocked ? 'Unlock' : 'Lock'}
                    className={`p-0.5 ${isLocked ? 'text-secondary' : 'text-on-surface-variant hover:text-on-surface'}`}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                      {isLocked ? 'lock' : 'lock_open'}
                    </span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
