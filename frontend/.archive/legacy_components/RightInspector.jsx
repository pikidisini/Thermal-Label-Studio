import React, { useState, useEffect, useRef } from 'react';
import {
  Layers,
  Database,
  Cpu,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  ArrowUp,
  ArrowDown,
  Barcode,
  QrCode,
  Type,
  Square,
  Minus,
  Circle,
  AlertTriangle,
  CheckCircle2,
  Copy
} from 'lucide-react';

export default function RightInspector({
  canvasRef,
  selectedObject,
  onUpdateProperty,
  onBringForward,
  onSendBackward,
  onDuplicate,
  onDelete,
  labelWidthMm = 200,
  labelHeightMm = 80,
  pxPerMm = 4,
  jsonData = {}
}) {
  const [activeTab, setActiveTab] = useState('layers');
  const [objectsList, setObjectsList] = useState([]);
  const [activeAnchor, setActiveAnchor] = useState('top-left');
  const selectedLayerRef = useRef(null);

  const updateObjectsList = () => {
    if (!canvasRef?.current) return;
    const objs = canvasRef.current.getObjects();
    setObjectsList([...objs].reverse());
  };

  useEffect(() => {
    updateObjectsList();
    const canvas = canvasRef?.current;
    if (!canvas) return;

    const handleChange = () => updateObjectsList();
    canvas.on('object:added', handleChange);
    canvas.on('object:removed', handleChange);
    canvas.on('object:modified', handleChange);
    canvas.on('selection:created', handleChange);
    canvas.on('selection:updated', handleChange);
    canvas.on('selection:cleared', handleChange);

    return () => {
      canvas.off('object:added', handleChange);
      canvas.off('object:removed', handleChange);
      canvas.off('object:modified', handleChange);
      canvas.off('selection:created', handleChange);
      canvas.off('selection:updated', handleChange);
      canvas.off('selection:cleared', handleChange);
    };
  }, [canvasRef?.current]);

  // Auto-scroll selected layer item into view when active object on canvas changes
  useEffect(() => {
    if (selectedLayerRef.current && activeTab === 'layers') {
      selectedLayerRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedObject, activeTab]);

  const isObjectSelected = (item) => {
    if (!item) return false;
    const activeCanvasObj = canvasRef?.current?.getActiveObject();
    if (activeCanvasObj && activeCanvasObj === item) return true;
    if (selectedObject) {
      if (selectedObject === item || selectedObject._target === item) return true;
      if (selectedObject.id && item.id && selectedObject.id === item.id) return true;
    }
    return false;
  };

  const handleSelectObject = (obj) => {
    if (!canvasRef?.current) return;
    canvasRef.current.discardActiveObject();
    canvasRef.current.setActiveObject(obj);
    canvasRef.current.requestRenderAll();
    canvasRef.current.fire('selection:created', { target: obj });
  };

  const toggleVisibility = (obj, e) => {
    e.stopPropagation();
    obj.visible = !obj.visible;
    if (!obj.visible && canvasRef.current.getActiveObject() === obj) {
      canvasRef.current.discardActiveObject();
    }
    canvasRef.current.requestRenderAll();
    updateObjectsList();
  };

  const toggleLock = (obj, e) => {
    e.stopPropagation();
    const isLocked = !obj.lockMovementX;
    obj.lockMovementX = isLocked;
    obj.lockMovementY = isLocked;
    obj.lockScalingX = isLocked;
    obj.lockScalingY = isLocked;
    obj.lockRotation = isLocked;
    obj.selectable = !isLocked;
    canvasRef.current.requestRenderAll();
    updateObjectsList();
  };

  const getObjectIcon = (obj) => {
    if (obj.barcodeType === 'qrcode' || obj.dataQr) return <QrCode className="w-3.5 h-3.5 text-indigo-400" />;
    if (obj.isBarcode) return <Barcode className="w-3.5 h-3.5 text-primary" />;
    if (obj.type === 'i-text' || obj.type === 'text') return <Type className="w-3.5 h-3.5 text-blue-400" />;
    if (obj.type === 'rect') return <Square className="w-3.5 h-3.5 text-emerald-400" />;
    if (obj.type === 'line') return <Minus className="w-3.5 h-3.5 text-amber-400" />;
    if (obj.type === 'circle') return <Circle className="w-3.5 h-3.5 text-rose-400" />;
    if (obj.isGhsSymbol) return <AlertTriangle className="w-3.5 h-3.5 text-secondary" />;
    return <Square className="w-3.5 h-3.5 text-teal-400" />;
  };

  const getObjectLabel = (obj) => {
    if (obj.barcodeType === 'qrcode' || obj.dataQr) {
      return obj.dataQr ? `QR: {{${obj.dataQr}}}` : '2D Matrix / QR';
    }
    if (obj.isBarcode) return `Barcode 1D (${obj.barcodeType || 'Code 128'})`;
    if (obj.dataField) return `Token: {{${obj.dataField}}}`;
    if (obj.type === 'i-text' || obj.type === 'text') {
      return obj.text ? `Text: "${obj.text.slice(0, 16)}${obj.text.length > 16 ? '...' : ''}"` : 'Text Box';
    }
    if (obj.type === 'rect') return 'Rectangle Box';
    if (obj.type === 'line') return 'Separator Line';
    if (obj.type === 'circle') return 'Circle / Badge';
    if (obj.isGhsSymbol) return 'GHS Hazard Symbol';
    if (obj.type === 'group') return 'Manifest Table / Grid';
    return obj.type || 'Object';
  };

  const getObjectBadge = (obj) => {
    if (obj.dataField || obj.dataBarcode || obj.dataQr) {
      return <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">DBIND</span>;
    }
    if (obj.isGhsSymbol) {
      return <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/20">HAZ</span>;
    }
    if (obj.lockMovementX) {
      return <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-surface-container-highest text-outline border border-outline-variant">LOCK</span>;
    }
    return <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-surface-container text-on-surface-variant">VEC</span>;
  };

  const obj = selectedObject;
  const xMm = obj ? ((obj.left || 0) / pxPerMm).toFixed(2) : '0.00';
  const yMm = obj ? ((obj.top || 0) / pxPerMm).toFixed(2) : '0.00';
  const wMm = obj ? (((obj.width || 0) * (obj.scaleX || 1)) / pxPerMm).toFixed(2) : '0.00';
  const hMm = obj ? (((obj.height || 0) * (obj.scaleY || 1)) / pxPerMm).toFixed(2) : '0.00';

  return (
    <aside className="w-[280px] bg-surface-container-low border-l border-outline-variant flex flex-col h-full select-none shrink-0 z-30">
      {/* 1. Header Tabs */}
      <div className="h-[40px] border-b border-outline-variant bg-surface-container-lowest flex items-center px-xs justify-between shrink-0">
        <div className="flex items-center gap-xxs">
          <button
            onClick={() => setActiveTab('layers')}
            className={`px-sm py-1 font-label-sm text-label-sm flex items-center gap-1.5 transition ${
              activeTab === 'layers'
                ? 'bg-surface-container-high text-primary border border-outline-variant font-semibold'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Layers</span>
          </button>

          <button
            onClick={() => setActiveTab('sap')}
            className={`px-sm py-1 font-label-sm text-label-sm flex items-center gap-1.5 transition ${
              activeTab === 'sap'
                ? 'bg-surface-container-high text-primary border border-outline-variant font-semibold'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>SAP Matrix</span>
          </button>

          <button
            onClick={() => setActiveTab('sim')}
            className={`px-sm py-1 font-label-sm text-label-sm flex items-center gap-1.5 transition ${
              activeTab === 'sim'
                ? 'bg-surface-container-high text-primary border border-outline-variant font-semibold'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Head Sim</span>
          </button>
        </div>
      </div>

      {/* 2. Main Tab Body */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === 'layers' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Layers Header & Quick Actions */}
            <div className="h-[28px] px-sm bg-surface-container flex items-center justify-between border-b border-outline-variant shrink-0">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                Hierarchy Stack ({objectsList.length})
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={onBringForward}
                  disabled={!selectedObject}
                  title="Bring Forward"
                  className="p-1 hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface disabled:opacity-30"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  onClick={onSendBackward}
                  disabled={!selectedObject}
                  title="Send Backward"
                  className="p-1 hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface disabled:opacity-30"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
                <button
                  onClick={onDuplicate}
                  disabled={!selectedObject}
                  title="Duplicate Object"
                  className="p-1 hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface disabled:opacity-30"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  onClick={onDelete}
                  disabled={!selectedObject}
                  title="Delete Layer"
                  className="p-1 hover:bg-surface-container-high text-on-surface-variant hover:text-rose-400 disabled:opacity-30"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Objects List */}
            <div className="flex-1 overflow-y-auto divide-y divide-outline-variant/40">
              {objectsList.length === 0 ? (
                <div className="p-4 text-center text-on-surface-variant font-code-matrix text-code-matrix">
                  No vector elements on canvas
                </div>
              ) : (
                objectsList.map((item, idx) => {
                  const isSelected = isObjectSelected(item);
                  const posX = ((item.left || 0) / pxPerMm).toFixed(1);
                  const posY = ((item.top || 0) / pxPerMm).toFixed(1);
                  const widthMm = (((item.width || 0) * (item.scaleX || 1)) / pxPerMm).toFixed(0);
                  const heightMm = (((item.height || 0) * (item.scaleY || 1)) / pxPerMm).toFixed(0);

                  return (
                    <div
                      key={item.id || idx}
                      ref={isSelected ? selectedLayerRef : null}
                      onClick={() => handleSelectObject(item)}
                      className={`px-sm py-2 flex items-center justify-between cursor-pointer group transition border-b border-outline-variant/30 ${
                        isSelected
                          ? 'bg-primary/20 border-l-4 border-l-primary text-on-surface shadow-sm font-semibold'
                          : 'hover:bg-surface-container text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={(e) => toggleVisibility(item, e)}
                          className="text-outline hover:text-on-surface shrink-0"
                          title={item.visible !== false ? 'Hide Element' : 'Show Element'}
                        >
                          {item.visible !== false ? (
                            <Eye className="w-3 h-3" />
                          ) : (
                            <EyeOff className="w-3 h-3 text-outline-variant" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => toggleLock(item, e)}
                          className="text-outline hover:text-on-surface shrink-0"
                          title={item.lockMovementX ? 'Unlock' : 'Lock'}
                        >
                          {item.lockMovementX ? (
                            <Lock className="w-3 h-3 text-secondary" />
                          ) : (
                            <Unlock className="w-3 h-3 opacity-20 group-hover:opacity-100" />
                          )}
                        </button>

                        <div className="shrink-0">{getObjectIcon(item)}</div>

                        <div className="flex flex-col min-w-0 flex-1">
                          <span className={`font-label-sm text-label-sm truncate max-w-[130px] ${isSelected ? 'text-primary font-bold' : 'text-on-surface'}`}>
                            {getObjectLabel(item)}
                          </span>
                          <span className="text-[9px] font-mono text-outline leading-tight">
                            X:{posX} Y:{posY} mm • {widthMm}×{heightMm}mm
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 ml-1.5">{getObjectBadge(item)}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'sap' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-xs">
            <div className="text-on-surface-variant text-[11px] uppercase tracking-wider font-semibold">
              Live SAP Contract Payload
            </div>
            <div className="bg-surface-container p-2.5 rounded border border-outline-variant space-y-1.5">
              {Object.entries(jsonData || {}).length === 0 ? (
                <div className="text-outline text-code-matrix">No contract data loaded</div>
              ) : (
                Object.entries(jsonData).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-start text-[11px] border-b border-outline-variant/30 pb-1">
                    <span className="text-primary truncate max-w-[120px]">{key}</span>
                    <span className="text-on-surface font-code-coordinate truncate max-w-[110px] text-right">
                      {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'sim' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-xs">
            <div className="text-on-surface-variant text-[11px] uppercase tracking-wider font-semibold">
              Printhead Geometry
            </div>
            <div className="bg-surface-container p-2.5 rounded border border-outline-variant space-y-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-outline">Standard Resolution:</span>
                <span className="text-tertiary">203.2 DPI</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Dot Pitch:</span>
                <span className="text-on-surface">0.125 mm / dot</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Total Printhead Width:</span>
                <span className="text-on-surface">{Math.round(labelWidthMm * 8)} dots</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline">Total Feed Length:</span>
                <span className="text-on-surface">{Math.round(labelHeightMm * 8)} dots</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Transform Inspector */}
      <div className="border-t border-outline-variant bg-surface-container-lowest p-sm shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
            Transform Inspector
          </span>
          <span className="font-code-matrix text-code-matrix text-primary bg-surface-container-high px-1 py-0.5 border border-outline-variant">
            {obj ? (obj.barcodeType === 'qrcode' || obj.dataQr ? 'QR CODE 2D' : obj.isBarcode ? 'BARCODE 1D' : obj.type?.toUpperCase()) : 'NO SELECTION'}
          </span>
        </div>

        {obj ? (
          <div className="space-y-2">
            {/* Content Value Editor (Text string / Barcode payload) */}
            {(obj.type === 'i-text' || obj.type === 'text') && (
              <div className="flex flex-col gap-1 bg-surface border border-outline-variant p-1.5 rounded-sm">
                <label className="text-outline font-label-sm text-[10px] uppercase font-bold">Text Value</label>
                <input
                  type="text"
                  data-testid="inspector-text-value"
                  value={obj.text || ''}
                  onChange={(e) => {
                    onUpdateProperty('text', e.target.value);
                  }}
                  className="w-full bg-surface-container-lowest border border-outline-variant px-1.5 py-0.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
                  placeholder="Enter text or {{token}}"
                />
              </div>
            )}

            {obj.isBarcode && (
              <div className="flex flex-col gap-1 bg-surface border border-outline-variant p-1.5 rounded-sm">
                <label className="text-outline font-label-sm text-[10px] uppercase font-bold">Barcode Data / Token</label>
                <input
                  type="text"
                  data-testid="inspector-barcode-value"
                  value={obj.barcodeValue || ''}
                  onChange={(e) => {
                    onUpdateProperty('barcodeValue', e.target.value);
                  }}
                  className="w-full bg-surface-container-lowest border border-outline-variant px-1.5 py-0.5 font-mono text-xs text-primary focus:outline-none focus:border-primary"
                  placeholder="e.g. {{material_number}}"
                />
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="w-[50px] h-[50px] bg-surface border border-outline-variant grid grid-cols-3 grid-rows-3 p-1 shrink-0">
                {[
                  'top-left', 'top-center', 'top-right',
                  'center-left', 'center', 'center-right',
                  'bottom-left', 'bottom-center', 'bottom-right'
                ].map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setActiveAnchor(pos)}
                    className="flex items-center justify-center group"
                    title={`Anchor: ${pos}`}
                  >
                    <span
                      className={`w-[6px] h-[6px] rounded-full transition ${
                        activeAnchor === pos
                          ? 'bg-primary scale-125'
                          : 'bg-outline-variant group-hover:bg-outline'
                      }`}
                    />
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-x-2 gap-y-1 flex-1 font-mono text-xs">
                <div className="flex items-center bg-surface border border-outline-variant px-1.5 py-0.5">
                  <span className="text-outline font-label-sm text-[10px] w-3">X</span>
                  <input
                    type="number"
                    step="0.5"
                    data-testid="inspector-x"
                    value={xMm}
                    onChange={(e) => onUpdateProperty('left', parseFloat(e.target.value || 0) * pxPerMm)}
                    className="w-full bg-transparent text-right text-on-surface focus:outline-none text-[11px]"
                  />
                  <span className="text-outline-variant text-[9px] pl-1">mm</span>
                </div>

                <div className="flex items-center bg-surface border border-outline-variant px-1.5 py-0.5">
                  <span className="text-outline font-label-sm text-[10px] w-3">Y</span>
                  <input
                    type="number"
                    step="0.5"
                    data-testid="inspector-y"
                    value={yMm}
                    onChange={(e) => onUpdateProperty('top', parseFloat(e.target.value || 0) * pxPerMm)}
                    className="w-full bg-transparent text-right text-on-surface focus:outline-none text-[11px]"
                  />
                  <span className="text-outline-variant text-[9px] pl-1">mm</span>
                </div>

                <div className="flex items-center bg-surface border border-outline-variant px-1.5 py-0.5">
                  <span className="text-outline font-label-sm text-[10px] w-3">W</span>
                  <input
                    type="number"
                    step="0.5"
                    data-testid="inspector-w"
                    value={wMm}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value || 0) * pxPerMm;
                      onUpdateProperty('scaleX', val / (obj.width || 1));
                    }}
                    className="w-full bg-transparent text-right text-on-surface focus:outline-none text-[11px]"
                  />
                  <span className="text-outline-variant text-[9px] pl-1">mm</span>
                </div>

                <div className="flex items-center bg-surface border border-outline-variant px-1.5 py-0.5">
                  <span className="text-outline font-label-sm text-[10px] w-3">H</span>
                  <input
                    type="number"
                    step="0.5"
                    data-testid="inspector-h"
                    value={hMm}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value || 0) * pxPerMm;
                      onUpdateProperty('scaleY', val / (obj.height || 1));
                    }}
                    className="w-full bg-transparent text-right text-on-surface focus:outline-none text-[11px]"
                  />
                  <span className="text-outline-variant text-[9px] pl-1">mm</span>
                </div>
              </div>
            </div>

            {obj.isBarcode && (
              <div className="bg-surface border border-outline-variant p-1.5 space-y-1 text-[10px] font-mono">
                <div className="flex justify-between text-outline">
                  <span>Narrow Bar Ratio:</span>
                  <span className="text-on-surface font-semibold">1 : 2.5 (High Density)</span>
                </div>
                <div className="flex justify-between text-outline">
                  <span>Check Digit (Mod 103):</span>
                  <span className="text-tertiary flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Auto-Computed [OK]
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 text-center text-outline-variant font-code-matrix text-code-matrix border border-dashed border-outline-variant/60">
            Select an element to view CAD transform matrix
          </div>
        )}
      </div>
    </aside>
  );
}
