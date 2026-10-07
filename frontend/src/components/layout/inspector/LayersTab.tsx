import React from 'react';
import { Badge, IconButton } from '../../../shared/ui';

interface LayersTabProps {
  objectsList: any[];
  selectedObject: any;
  canvasRef: React.MutableRefObject<any>;
  onBringForward: () => void;
  onSendBackward: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onSelectLayer: (obj: any) => void;
}

function getObjIcon(obj: any): string {
  if (obj.isBarcode) return obj.barcodeType === 'qrcode' ? 'qr_code_2' : 'barcode';
  if (obj.type === 'text' || obj.type === 'i-text') return 'title';
  if (obj.type === 'rect')   return 'crop_square';
  if (obj.type === 'line')   return 'horizontal_rule';
  if (obj.type === 'circle') return 'circle';
  if (obj.type === 'image')  return 'image';
  return 'layers';
}

function getObjColor(obj: any): string {
  if (obj.isBarcode) return obj.barcodeType === 'qrcode' ? 'text-tertiary' : 'text-primary';
  if (obj.type === 'text' || obj.type === 'i-text') return 'text-secondary';
  if (obj.type === 'rect')   return 'text-primary';
  if (obj.type === 'circle') return 'text-secondary';
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
    <IconButton
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      label={title}
      className={`h-auto w-auto border-transparent p-1 disabled:cursor-not-allowed disabled:opacity-25 ${
        danger ? 'text-on-surface-variant hover:border-secondary-container hover:bg-surface-container-high hover:text-secondary'
               : 'text-on-surface-variant hover:border-transparent hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>
    </IconButton>
  );
}

export function LayersTab({
  objectsList, selectedObject, canvasRef,
  onBringForward, onSendBackward, onDuplicate, onDelete, onGroup, onUngroup, onSelectLayer,
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
          <LayerActionBtn icon="group_work" title="Group selection" testId="layers-btn-group" onClick={onGroup} disabled={selectedObject?.type !== 'activeselection'} />
          <LayerActionBtn icon="ungroup" title="Ungroup" testId="layers-btn-ungroup" onClick={onUngroup} disabled={selectedObject?.type !== 'group'} />
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
              <React.Fragment key={obj.id || idx}>
              <div
                data-testid={`layer-item-${idx}`}
                className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer text-xs transition-colors ${
                  isSelected
                    ? 'border-l-2 border-primary bg-primary-container text-on-primary-container'
                    : 'hover:bg-surface-container-high border-l-2 border-transparent'
                }`}
              >
                <button
                  type="button"
                  data-testid={`layer-select-${idx}`}
                  aria-label={`Select ${getObjName(obj)}`}
                  aria-pressed={Boolean(isSelected)}
                  onClick={() => onSelectLayer(obj)}
                  className="flex flex-1 min-w-0 items-center gap-2 text-left"
                >
                <span className={`material-symbols-outlined shrink-0 ${getObjColor(obj)}`} style={{ fontSize: 15 }}>
                  {getObjIcon(obj)}
                </span>

                <span className="flex-1 min-w-0 flex items-center gap-1.5">
                  <span className={`truncate font-mono text-[11px] ${isHidden ? 'opacity-40' : ''} ${isSelected ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                    {getObjName(obj)}
                  </span>
                  {isSapBound && (
                    <Badge data-testid={`layer-item-bound-badge-${idx}`} tone="success" className="shrink-0 px-1 text-[8px] font-semibold">
                      BOUND
                    </Badge>
                  )}
                </span>


                </button>

                <div data-testid={`layer-item-controls-${idx}`} className="flex items-center gap-0 opacity-50 hover:opacity-100">
                  <IconButton
                    data-testid={`layer-btn-visibility-${idx}`}
                    onClick={(e) => toggleVisibility(obj, e)}
                    label={isHidden ? 'Show' : 'Hide'}
                    className="h-auto w-auto border-transparent p-0.5 text-on-surface-variant hover:border-transparent hover:bg-surface-container-high hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                      {isHidden ? 'visibility_off' : 'visibility'}
                    </span>
                  </IconButton>
                  <IconButton
                    data-testid={`layer-btn-lock-${idx}`}
                    onClick={(e) => toggleLock(obj, e)}
                    label={isLocked ? 'Unlock' : 'Lock'}
                    className={`h-auto w-auto border-transparent p-0.5 ${isLocked ? 'text-secondary' : 'text-on-surface-variant hover:border-transparent hover:bg-surface-container-high hover:text-on-surface'}`}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                      {isLocked ? 'lock' : 'lock_open'}
                    </span>
                  </IconButton>
                </div>
              </div>
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}
