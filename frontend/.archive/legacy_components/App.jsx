import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fabric } from 'fabric';
import TopMenuBar from './components/TopMenuBar';
import PropertyRibbon from './components/PropertyRibbon';
import LeftToolbox from './components/LeftToolbox';
import StudioCanvas from './components/StudioCanvas';
import RightInspector from './components/RightInspector';
import ThermalPreviewSplit from './components/ThermalPreviewSplit';
import PrintModal from './components/PrintModal';
import CanvasSetupModal from './components/CanvasSetupModal';
import SaveTemplateModal from './components/SaveTemplateModal';
import StatusBar from './components/StatusBar';
import ShortcutHelpModal from './components/ShortcutHelpModal';
import AiDiagnosticsModal from './components/AiDiagnosticsModal';
import { apiClient } from './utils/apiClient';
import { exportFabricToSvg } from './utils/fabricSvgExporter';
import { barcodeGenerators } from './utils/barcodeGenerators';
import { getSymbolSvg } from './utils/industrialSymbols';

const CANVAS_SERIALIZE_PROPS = [
  'id', 'dataBarcode', 'dataQr', 'dataField', 'data-barcode', 'data-qr', 'data-field',
  'isDynamic', 'isBarcode', 'barcodeType', 'barcodeValue', 'selectable', 'evented'
];

export default function App() {
  // State
  const [templates, setTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState('standard_goods_receipt');
  const [labelWidthMm, setLabelWidthMm] = useState(200);
  const [labelHeightMm, setLabelHeightMm] = useState(80);
  const [isCanvasModalOpen, setIsCanvasModalOpen] = useState(false);
  const [canvasModalMode, setCanvasModalMode] = useState('resize'); // 'resize' | 'new'
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false);
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState(false);
  const [cursorPos, setCursorPos] = useState({ xMm: '0.0', yMm: '0.0' });

  // Viewport Fit & Reset Triggers
  const [fitTrigger, setFitTrigger] = useState(0);
  const [reset100Trigger, setReset100Trigger] = useState(0);

  // History (Undo / Redo) States
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const isHistoryLockedRef = useRef(false);

  const [viewMode, setViewMode] = useState('design'); // 'design' | 'split' | 'preview'
  const [zoom, setZoom] = useState(() => {
    const leftSidebarW = 320;
    const rawAvailW = Math.max(300, (typeof window !== 'undefined' ? window.innerWidth : 1200) - leftSidebarW - 48);
    const availableH = Math.max(200, (typeof window !== 'undefined' ? window.innerHeight : 800) - 56 - 44 - 24 - 70);
    const targetW = 200 * 4;
    const targetH = 80 * 4;
    const calculatedZoom = Math.min((rawAvailW * 0.9) / targetW, (availableH * 0.9) / targetH);
    return Math.round(Math.min(3.0, Math.max(0.25, calculatedZoom)) * 20) / 20;
  });
  const [selectedObject, setSelectedObject] = useState(null);
  const [activeTab, setActiveTab] = useState('tools'); // 'tools' | 'data'
  const [activeTool, setActiveTool] = useState('select');
  const [isSnapEnabled, setIsSnapEnabled] = useState(true);
  const [areGuidesEnabled, setAreGuidesEnabled] = useState(true);
  const [usedTokens, setUsedTokens] = useState(new Set());

  // SAP JSON Contract Data
  const [sampleContracts, setSampleContracts] = useState({});
  const [activeContractKey, setActiveContractKey] = useState('goods_receipt');
  const [jsonData, setJsonData] = useState({});

  // Render & Simulation States
  const [isRendering, setIsRendering] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [thermalImage, setThermalImage] = useState(null);
  const [inspectionData, setInspectionData] = useState(null);
  const [dpi, setDpi] = useState(203.2);
  const [threshold, setThreshold] = useState(128);

  // Print Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // References
  const canvasRef = useRef(null);
  const pendingSvgRef = useRef(null);
  const lastLoadedSvgRef = useRef(null);
  const pxPerMm = 4; // Standard visual canvas ratio: 1mm = 4px

  // Auto-Fit Zoom Calculation
  const calculateAutoFitZoom = (wMm = labelWidthMm, hMm = labelHeightMm, mode = viewMode) => {
    const leftSidebarW = 320;
    const isSplit = mode === 'split';
    const rawAvailW = Math.max(300, (typeof window !== 'undefined' ? window.innerWidth : 1200) - leftSidebarW - 48);
    const availableW = isSplit ? (rawAvailW / 2) - 32 : rawAvailW;
    const availableH = Math.max(200, (typeof window !== 'undefined' ? window.innerHeight : 800) - 56 - 44 - 24 - 70);

    const targetW = (wMm || 200) * pxPerMm;
    const targetH = (hMm || 80) * pxPerMm;

    if (targetW <= 0 || targetH <= 0) return 1.0;

    const fitZoomX = (availableW * 0.90) / targetW;
    const fitZoomY = (availableH * 0.90) / targetH;
    const calculatedZoom = Math.min(fitZoomX, fitZoomY);

    const clampedZoom = Math.min(3.0, Math.max(0.25, calculatedZoom));
    return Math.round(clampedZoom * 20) / 20; // 0.05 step
  };

  const handleZoomChange = useCallback((newZ) => {
    setZoom(newZ);
  }, []);

  const handleAutoFit = useCallback((autoZ) => {
    setZoom(autoZ);
  }, []);

  const handleCanvasReady = (fabricCanvas) => {
    canvasRef.current = fabricCanvas;
    setZoom(calculateAutoFitZoom(labelWidthMm, labelHeightMm, viewMode));
    if (pendingSvgRef.current) {
      const { svg, wMm, hMm } = pendingSvgRef.current;
      pendingSvgRef.current = null;
      loadSvgIntoCanvas(svg, wMm, hMm);
    }
  };

  const updateUsedTokens = useCallback(() => {
    if (!canvasRef.current) return;
    const set = new Set();
    canvasRef.current.getObjects().forEach(obj => {
      if (obj.dataField) set.add(obj.dataField);
      if (obj.barcodeValue && typeof obj.barcodeValue === 'string') {
        const matches = obj.barcodeValue.match(/{{(.*?)}}/g);
        if (matches) {
          matches.forEach(m => set.add(m.replace(/[{}]/g, '').trim()));
        }
      }
      if (obj.text && typeof obj.text === 'string') {
        const matches = obj.text.match(/{{(.*?)}}/g);
        if (matches) {
          matches.forEach(m => set.add(m.replace(/[{}]/g, '').trim()));
        }
      }
    });
    setUsedTokens(set);
  }, []);

  // Recalculate Fabric offset when returning from hidden preview, and handle window resize auto-fit
  useEffect(() => {
    const currentAutoZoom = calculateAutoFitZoom(labelWidthMm, labelHeightMm, viewMode);
    setZoom(currentAutoZoom);

    if (viewMode !== 'preview' && canvasRef.current) {
      const timer = setTimeout(() => {
        canvasRef.current.calcOffset();
        canvasRef.current.renderAll();
      }, 50);
      return () => clearTimeout(timer);
    }

    const handleResize = () => {
      setZoom(calculateAutoFitZoom(labelWidthMm, labelHeightMm, viewMode));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode, labelWidthMm, labelHeightMm]);

  // Load initial templates and sample contracts from backend
  useEffect(() => {
    async function initData() {
      try {
        const tList = await apiClient.listTemplates();
        setTemplates(tList.templates || []);

        const cData = await apiClient.getSampleContracts();
        setSampleContracts(cData);
        if (cData.goods_receipt) {
          setJsonData(cData.goods_receipt);
        }

        if (tList.templates && tList.templates.length > 0) {
          loadTemplateById(tList.templates[0].id);
        }
      } catch (err) {
        console.error('Initialization error:', err);
      }
    }
    initData();
  }, []);

  // Load template content into Fabric canvas
  const loadTemplateById = async (templateId) => {
    try {
      setSelectedObject(null);
      setActiveTemplateId(templateId);
      const data = await apiClient.getTemplate(templateId);
      const svg = data?.raw_svg || data?.svg_content;
      if (svg) {
        const wMm = data.width_mm || 200;
        const hMm = data.height_mm || 80;
        setLabelWidthMm(wMm);
        setLabelHeightMm(hMm);
        setZoom(calculateAutoFitZoom(wMm, hMm, viewMode));
        loadSvgIntoCanvas(svg, wMm, hMm);
      }
    } catch (err) {
      console.error('Failed to load template:', err);
    }
  };

  const loadSvgIntoCanvas = (svgString, widthMm, heightMm) => {
    lastLoadedSvgRef.current = { svg: svgString, wMm: widthMm, hMm: heightMm };
    if (!canvasRef.current) {
      pendingSvgRef.current = { svg: svgString, wMm: widthMm, hMm: heightMm };
      return;
    }
    const canvas = canvasRef.current;
    const targetWidthPx = widthMm * pxPerMm;
    const targetHeightPx = heightMm * pxPerMm;
    const currentZoom = calculateAutoFitZoom(widthMm, heightMm, viewMode);

    canvas.setDimensions({
      width: targetWidthPx * currentZoom,
      height: targetHeightPx * currentZoom,
    });
    canvas.setZoom(currentZoom);
    canvas.clear();
    canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));

    fabric.loadSVGFromString(
      svgString,
      (objects, options) => {
        if (objects && objects.length > 0) {
          const group = fabric.util.groupSVGElements(objects, options);
          const origW = group.width || targetWidthPx;
          const origH = group.height || targetHeightPx;
          const fitScale = Math.min(targetWidthPx / origW, targetHeightPx / origH) || 1.0;

          // Align group to origin (0, 0)
          group.set({
            left: 0,
            top: 0,
            originX: 'left',
            originY: 'top',
          });

          // Extract individual objects with their exact restored absolute coordinates
          const items = group.getObjects();
          group._restoreObjectsState();
          canvas.clear();
          canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));

          items.forEach((obj) => {
            if (!obj) return;
            // Fix hollow/stroked text from Inkscape tspan
            if (obj.type === 'text' || obj.type === 'i-text') {
              if (obj.stroke && (obj.fill === 'none' || obj.fill === 'transparent' || !obj.fill)) {
                obj.set({
                  fill: '#000000',
                  stroke: null,
                  strokeWidth: 0,
                });
              }
            }
            obj.scaleX = (obj.scaleX || 1) * fitScale;
            obj.scaleY = (obj.scaleY || 1) * fitScale;
            obj.left = (obj.left || 0) * fitScale;
            obj.top = (obj.top || 0) * fitScale;
            obj.setCoords();
            canvas.add(obj);
          });
        } else {
          // Fallback for complex monolithic SVG documents
          const blob = new Blob([svgString], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          fabric.Image.fromURL(url, (img) => {
            img.set({
              left: 0,
              top: 0,
              scaleX: targetWidthPx / (img.width || 1),
              scaleY: targetHeightPx / (img.height || 1),
            });
            canvas.add(img);
            canvas.renderAll();
            URL.revokeObjectURL(url);
          });
        }

        canvas.calcOffset();
        canvas.renderAll();
        updateUsedTokens();

        try {
          const initJson = JSON.stringify(canvas.toJSON(CANVAS_SERIALIZE_PROPS));
          undoStackRef.current = [initJson];
          redoStackRef.current = [];
          setCanUndo(false);
          setCanRedo(false);
        } catch (e) {
          console.warn('Initial history snapshot notice:', e);
        }
        triggerRenderSimulation();
      },
      (elem, obj) => {
        if (!elem || !obj) return;
        const barcodeAttr = elem.getAttribute('data-barcode') || elem.getAttribute('data-barcode-value');
        const qrAttr = elem.getAttribute('data-qr');
        const fieldAttr = elem.getAttribute('data-field');
        const elemId = elem.getAttribute('id') || '';
        const barcodeType = elem.getAttribute('data-barcode-type') || elem.getAttribute('barcodeType');
        const isBarcodeAttr = elem.getAttribute('data-is-barcode') === 'true' || !!barcodeAttr || !!qrAttr;
        const isDynamicAttr = elem.getAttribute('data-is-dynamic') === 'true' || !!fieldAttr;

        if (elemId) obj.set('id', elemId);

        if (barcodeAttr) {
          obj.set('dataBarcode', barcodeAttr);
          obj.set('barcodeValue', barcodeAttr);
          obj.set('isBarcode', true);
          obj.set('barcodeType', barcodeType || 'code128');
        }
        if (qrAttr) {
          obj.set('dataQr', qrAttr);
          obj.set('barcodeValue', qrAttr);
          obj.set('isBarcode', true);
          obj.set('barcodeType', 'qrcode');
        }
        if (fieldAttr) {
          obj.set('dataField', fieldAttr);
          obj.set('isDynamic', true);
        }
        if (isBarcodeAttr) obj.set('isBarcode', true);
        if (isDynamicAttr) obj.set('isDynamic', true);
        if (barcodeType) obj.set('barcodeType', barcodeType);

        const anchor = elem.getAttribute('text-anchor') || elem.style?.textAnchor;
        const textAlign = elem.getAttribute('text-align') || elem.style?.textAlign;
        if (anchor === 'end' || textAlign === 'end' || textAlign === 'right') {
          obj.set('textAlign', 'right');
        } else if (anchor === 'middle' || textAlign === 'center') {
          obj.set('textAlign', 'center');
        }
      }
    );
  };

  const handleSelectionChanged = (obj) => {
    setSelectedObject(obj ? {
      ...obj,
      _target: obj,
      id: obj.id || null,
      left: obj.left,
      top: obj.top,
      scaleX: obj.scaleX,
      scaleY: obj.scaleY,
      angle: obj.angle,
      strokeWidth: obj.strokeWidth,
      fontSize: obj.fontSize,
      fill: obj.fill,
      fontFamily: obj.fontFamily,
      fontWeight: obj.fontWeight,
      fontStyle: obj.fontStyle,
      textAlign: obj.textAlign || 'left',
      underline: !!obj.underline,
      type: obj.type,
      isBarcode: obj.isBarcode,
      barcodeType: obj.barcodeType,
      barcodeValue: obj.barcodeValue,
      dataQr: obj.dataQr,
      dataBarcode: obj.dataBarcode,
      dataField: obj.dataField,
      isGhsSymbol: obj.isGhsSymbol,
      isDynamic: obj.isDynamic,
    } : null);
    updateUsedTokens();
  };

  const saveCanvasHistory = () => {
    if (!canvasRef.current || isHistoryLockedRef.current) return;
    try {
      const json = canvasRef.current.toJSON(CANVAS_SERIALIZE_PROPS);
      const jsonStr = JSON.stringify(json);
      const last = undoStackRef.current[undoStackRef.current.length - 1];
      if (last === jsonStr) return;

      undoStackRef.current.push(jsonStr);
      if (undoStackRef.current.length > 50) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      setCanUndo(undoStackRef.current.length > 1);
      setCanRedo(false);
    } catch (err) {
      console.warn('History snapshot notice:', err);
    }
  };

  const handleUndo = () => {
    if (!canvasRef.current || undoStackRef.current.length <= 1 || isHistoryLockedRef.current) return;
    isHistoryLockedRef.current = true;
    const currentState = undoStackRef.current.pop();
    redoStackRef.current.push(currentState);
    const prevState = undoStackRef.current[undoStackRef.current.length - 1];

    canvasRef.current.loadFromJSON(JSON.parse(prevState), () => {
      canvasRef.current.backgroundColor = '#ffffff';
      canvasRef.current.renderAll();
      setSelectedObject(canvasRef.current.getActiveObject() || null);
      isHistoryLockedRef.current = false;
      setCanUndo(undoStackRef.current.length > 1);
      setCanRedo(redoStackRef.current.length > 0);
      triggerRenderSimulation();
    });
  };

  const handleRedo = () => {
    if (!canvasRef.current || redoStackRef.current.length === 0 || isHistoryLockedRef.current) return;
    isHistoryLockedRef.current = true;
    const nextState = redoStackRef.current.pop();
    undoStackRef.current.push(nextState);

    canvasRef.current.loadFromJSON(JSON.parse(nextState), () => {
      canvasRef.current.backgroundColor = '#ffffff';
      canvasRef.current.renderAll();
      setSelectedObject(canvasRef.current.getActiveObject() || null);
      isHistoryLockedRef.current = false;
      setCanUndo(undoStackRef.current.length > 1);
      setCanRedo(redoStackRef.current.length > 0);
      triggerRenderSimulation();
    });
  };

  const handleCanvasModified = () => {
    saveCanvasHistory();
    if (canvasRef.current && canvasRef.current.getActiveObject()) {
      handleSelectionChanged(canvasRef.current.getActiveObject());
    }
  };

  const handleUpdateProperty = async (prop, value) => {
    if (!canvasRef.current) return;
    const active = canvasRef.current.getActiveObject();
    if (!active) return;

    active.set(prop, value);
    if (prop === 'barcodeValue') {
      const tokenKey = String(value).replace(/[{}]/g, '').trim();
      let resolvedVal = String(value);
      if (jsonData) {
        if (jsonData[tokenKey] !== undefined) resolvedVal = String(jsonData[tokenKey]);
        else if (jsonData.fields && jsonData.fields[tokenKey] !== undefined) resolvedVal = String(jsonData.fields[tokenKey]);
        else if (jsonData.codes && jsonData.codes[tokenKey] !== undefined) resolvedVal = String(jsonData.codes[tokenKey]);
      }
      if (active.barcodeType === 'qrcode' || active.dataQr) {
        active.set('dataQr', tokenKey);
        const dataUrl = await barcodeGenerators.generateQrDataUrl(resolvedVal, { size: 120 });
        if (dataUrl) {
          active.setSrc(dataUrl, () => {
            if (canvasRef.current) canvasRef.current.renderAll();
          });
        }
      } else if (active.isBarcode || active.barcodeType === 'code128') {
        active.set('dataBarcode', tokenKey);
        const dataUrl = barcodeGenerators.generateCode128DataUrl(resolvedVal, { barWidth: 2, barHeight: 40 });
        if (dataUrl) {
          active.setSrc(dataUrl, () => {
            if (canvasRef.current) canvasRef.current.renderAll();
          });
        }
      }
    }
    active.setCoords();
    canvasRef.current.renderAll();
    handleSelectionChanged(active);
    saveCanvasHistory();
  };

  const handleBringForward = () => {
    if (!canvasRef.current) return;
    const active = canvasRef.current.getActiveObject();
    if (active) {
      canvasRef.current.bringForward(active);
      canvasRef.current.renderAll();
      saveCanvasHistory();
    }
  };

  const handleSendBackward = () => {
    if (!canvasRef.current) return;
    const active = canvasRef.current.getActiveObject();
    if (active) {
      canvasRef.current.sendBackwards(active);
      canvasRef.current.renderAll();
      saveCanvasHistory();
    }
  };

  const handleDuplicate = () => {
    if (!canvasRef.current) return;
    const active = canvasRef.current.getActiveObject();
    if (active) {
      active.clone((cloned) => {
        cloned.set({
          left: cloned.left + 15,
          top: cloned.top + 15,
          evented: true,
        });
        canvasRef.current.add(cloned);
        canvasRef.current.setActiveObject(cloned);
        canvasRef.current.renderAll();
        saveCanvasHistory();
      });
    }
  };

  const handleDelete = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects && activeObjects.length > 0) {
      const active = canvas.getActiveObject();
      if (active && active.isEditing) return;

      activeObjects.forEach((obj) => {
        canvas.remove(obj);
      });
      canvas.discardActiveObject();
      canvas.renderAll();
      setSelectedObject(null);
      saveCanvasHistory();
      updateUsedTokens();
    }
  };

  // Strategic auto-positioning within active label boundaries
  const getStrategicPlacement = (elementWidthMm = 30, elementHeightMm = 15, preferredQuadrant = 'center') => {
    const marginMm = 4;
    const availWMm = Math.max(10, labelWidthMm - (2 * marginMm));
    const availHMm = Math.max(10, labelHeightMm - (2 * marginMm));

    // Stagger offset to prevent stacking when adding multiple elements sequentially
    const objCount = canvasRef.current ? canvasRef.current.getObjects().length : 0;
    const stagger = (objCount % 5) * 4; // 0, 4, 8, 12, 16 mm

    let leftMm = marginMm;
    let topMm = marginMm;

    if (preferredQuadrant === 'top-left') {
      leftMm = Math.min(availWMm - elementWidthMm + marginMm, marginMm + stagger);
      topMm = Math.min(availHMm - elementHeightMm + marginMm, marginMm + stagger);
    } else if (preferredQuadrant === 'top-right') {
      leftMm = Math.max(marginMm, labelWidthMm - marginMm - elementWidthMm - (stagger % 12));
      topMm = Math.min(availHMm - elementHeightMm + marginMm, marginMm + stagger);
    } else {
      leftMm = Math.max(marginMm, Math.min(labelWidthMm - marginMm - elementWidthMm, ((labelWidthMm - elementWidthMm) / 2) + (stagger - 6)));
      topMm = Math.max(marginMm, Math.min(labelHeightMm - marginMm - elementHeightMm, ((labelHeightMm - elementHeightMm) / 2) + (stagger - 6)));
    }

    return {
      leftPx: Math.max(marginMm * pxPerMm, leftMm * pxPerMm),
      topPx: Math.max(marginMm * pxPerMm, topMm * pxPerMm),
    };
  };

  // Add Vector Objects
  const handleAddText = (text = 'Label Text') => {
    if (!canvasRef.current) return;
    const { leftPx, topPx } = getStrategicPlacement(30, 8, 'top-left');
    const t = new fabric.IText(text, {
      left: leftPx,
      top: topPx,
      fontFamily: 'Arial',
      fontSize: 4 * pxPerMm,
      fill: '#000000',
    });
    canvasRef.current.add(t);
    canvasRef.current.setActiveObject(t);
    handleSelectionChanged(t);
    canvasRef.current.renderAll();
  };

  const handleAddDynamicField = (token, label, leftPx = null, topPx = null) => {
    if (!canvasRef.current) return;
    const pos = (leftPx !== null && topPx !== null) ? { leftPx, topPx } : getStrategicPlacement(35, 8, 'top-left');
    const t = new fabric.IText(token, {
      left: pos.leftPx,
      top: pos.topPx,
      fontFamily: 'Arial',
      fontSize: 4.5 * pxPerMm,
      fontWeight: 'bold',
      fill: '#000000',
      isDynamic: true,
      dataField: token.replace(/[{}]/g, '').trim(),
    });
    canvasRef.current.add(t);
    canvasRef.current.setActiveObject(t);
    handleSelectionChanged(t);
    canvasRef.current.renderAll();
    updateUsedTokens();
  };

  const handleAddBarcode = (tokenOrValue = '12345678', leftPx = null, topPx = null) => {
    if (!canvasRef.current) return;
    const tokenKey = tokenOrValue.replace(/[{}]/g, '').trim();
    let resolvedVal = tokenOrValue;
    if (jsonData) {
      if (jsonData[tokenKey] !== undefined) resolvedVal = String(jsonData[tokenKey]);
      else if (jsonData.fields && jsonData.fields[tokenKey] !== undefined) resolvedVal = String(jsonData.fields[tokenKey]);
      else if (jsonData.codes && jsonData.codes[tokenKey] !== undefined) resolvedVal = String(jsonData.codes[tokenKey]);
    }
    const dataUrl = barcodeGenerators.generateCode128DataUrl(resolvedVal, {
      barWidth: 2,
      barHeight: 40,
    });
    if (dataUrl) {
      fabric.Image.fromURL(dataUrl, (img) => {
        const barWMm = Math.min(60, Math.max(20, labelWidthMm * 0.6));
        const barHMm = 16;
        const pos = (leftPx !== null && topPx !== null) ? { leftPx, topPx } : getStrategicPlacement(barWMm, barHMm, 'center');
        img.set({
          left: pos.leftPx,
          top: pos.topPx,
          scaleX: 0.8,
          scaleY: 0.8,
          isBarcode: true,
          barcodeType: 'code128',
          barcodeValue: tokenOrValue,
          dataBarcode: tokenKey,
        });
        canvasRef.current.add(img);
        canvasRef.current.setActiveObject(img);
        handleSelectionChanged(img);
        canvasRef.current.renderAll();
        updateUsedTokens();
      });
    }
  };

  const handleAddQrCode = async (tokenOrValue = 'https://sap.corp', leftPx = null, topPx = null) => {
    if (!canvasRef.current) return;
    const tokenKey = tokenOrValue.replace(/[{}]/g, '').trim();
    let resolvedVal = tokenOrValue;
    if (jsonData) {
      if (jsonData[tokenKey] !== undefined) resolvedVal = String(jsonData[tokenKey]);
      else if (jsonData.fields && jsonData.fields[tokenKey] !== undefined) resolvedVal = String(jsonData.fields[tokenKey]);
      else if (jsonData.codes && jsonData.codes[tokenKey] !== undefined) resolvedVal = String(jsonData.codes[tokenKey]);
    }
    const dataUrl = await barcodeGenerators.generateQrDataUrl(resolvedVal, { size: 120 });
    if (dataUrl) {
      fabric.Image.fromURL(dataUrl, (img) => {
        const qrSizeMm = Math.min(22, Math.max(12, labelHeightMm * 0.35));
        const pos = (leftPx !== null && topPx !== null) ? { leftPx, topPx } : getStrategicPlacement(qrSizeMm, qrSizeMm, 'top-right');
        const scale = (qrSizeMm * pxPerMm) / (img.width || 120);
        img.set({
          left: pos.leftPx,
          top: pos.topPx,
          scaleX: scale,
          scaleY: scale,
          isBarcode: true,
          barcodeType: 'qrcode',
          barcodeValue: tokenOrValue,
          dataQr: tokenKey,
        });
        canvasRef.current.add(img);
        canvasRef.current.setActiveObject(img);
        handleSelectionChanged(img);
        canvasRef.current.renderAll();
        updateUsedTokens();
      });
    }
  };

  const handleAddRect = () => {
    if (!canvasRef.current) return;
    const rWMm = Math.min(40, Math.max(15, labelWidthMm * 0.4));
    const rHMm = Math.min(25, Math.max(10, labelHeightMm * 0.35));
    const { leftPx, topPx } = getStrategicPlacement(rWMm, rHMm, 'top-left');
    const r = new fabric.Rect({
      left: leftPx,
      top: topPx,
      width: rWMm * pxPerMm,
      height: rHMm * pxPerMm,
      fill: 'transparent',
      stroke: '#000000',
      strokeWidth: 0.5 * pxPerMm,
    });
    canvasRef.current.add(r);
    canvasRef.current.setActiveObject(r);
    handleSelectionChanged(r);
    canvasRef.current.renderAll();
  };

  const handleAddLine = () => {
    if (!canvasRef.current) return;
    const lineLenMm = Math.max(10, labelWidthMm - 16);
    const { topPx } = getStrategicPlacement(lineLenMm, 2, 'center');
    const l = new fabric.Line([8 * pxPerMm, topPx, (8 + lineLenMm) * pxPerMm, topPx], {
      stroke: '#000000',
      strokeWidth: 0.5 * pxPerMm,
    });
    canvasRef.current.add(l);
    canvasRef.current.setActiveObject(l);
    handleSelectionChanged(l);
    canvasRef.current.renderAll();
  };

  const handleAddCircle = () => {
    if (!canvasRef.current) return;
    const diamMm = Math.min(20, Math.max(8, labelHeightMm * 0.35));
    const { leftPx, topPx } = getStrategicPlacement(diamMm, diamMm, 'top-right');
    const c = new fabric.Circle({
      left: leftPx,
      top: topPx,
      radius: (diamMm / 2) * pxPerMm,
      fill: 'transparent',
      stroke: '#000000',
      strokeWidth: 0.5 * pxPerMm,
    });
    canvasRef.current.add(c);
    canvasRef.current.setActiveObject(c);
    handleSelectionChanged(c);
    canvasRef.current.renderAll();
  };

  const handleAddTable = () => {
    if (!canvasRef.current) return;
    const tWMm = Math.min(80, Math.max(20, labelWidthMm - 16));
    const tHMm = Math.min(25, Math.max(12, labelHeightMm * 0.35));
    const { leftPx, topPx } = getStrategicPlacement(tWMm, tHMm, 'center');
    const tWPx = tWMm * pxPerMm;
    const tHPx = tHMm * pxPerMm;

    const groupItems = [];
    const border = new fabric.Rect({
      left: 0,
      top: 0,
      width: tWPx,
      height: tHPx,
      fill: 'transparent',
      stroke: '#000000',
      strokeWidth: 0.5 * pxPerMm,
    });
    groupItems.push(border);

    // Header divider line
    groupItems.push(new fabric.Line([0, tHPx / 3, tWPx, tHPx / 3], {
      stroke: '#000000',
      strokeWidth: 0.5 * pxPerMm,
    }));

    // Column divider line
    groupItems.push(new fabric.Line([tWPx / 2, 0, tWPx / 2, tHPx], {
      stroke: '#000000',
      strokeWidth: 0.5 * pxPerMm,
    }));

    const group = new fabric.Group(groupItems, {
      left: leftPx,
      top: topPx,
    });
    canvasRef.current.add(group);
    canvasRef.current.setActiveObject(group);
    handleSelectionChanged(group);
    canvasRef.current.renderAll();
  };

  const handleAddIsoSymbol = (symbolId, name, leftPx = null, topPx = null) => {
    if (!canvasRef.current) return;
    const symSvg = getSymbolSvg(symbolId, 20, 20);
    if (!symSvg) {
      handleAddText(`[${name}]`);
      return;
    }

    fabric.loadSVGFromString(symSvg, (objects, options) => {
      if (!objects || objects.length === 0) return;
      const group = fabric.util.groupSVGElements(objects, options);
      const symMm = Math.min(18, Math.max(8, labelHeightMm * 0.3));
      const targetPx = symMm * pxPerMm;
      const origMax = Math.max(group.width || 100, group.height || 100);
      const scale = targetPx / origMax;
      const pos = (leftPx !== null && topPx !== null) ? { leftPx, topPx } : getStrategicPlacement(symMm, symMm, 'top-left');
      group.set({
        left: pos.leftPx,
        top: pos.topPx,
        scaleX: scale,
        scaleY: scale,
      });
      group.isGhsSymbol = true;
      canvasRef.current.add(group);
      canvasRef.current.setActiveObject(group);
      handleSelectionChanged(group);
      canvasRef.current.renderAll();
      updateUsedTokens();
    });
  };

  const handleDropElement = (data) => {
    if (!data) return;
    const { token, label, targetType, symbolId, leftPx, topPx } = data;
    if (targetType === 'barcode') {
      handleAddBarcode(`{{${token}}}`, leftPx, topPx);
    } else if (targetType === 'qr') {
      handleAddQrCode(`{{${token}}}`, leftPx, topPx);
    } else if (targetType === 'symbol') {
      handleAddIsoSymbol(symbolId, label, leftPx, topPx);
    } else {
      handleAddDynamicField(`{{${token}}}`, label, leftPx, topPx);
    }
  };

  const handleSelectDimensionPreset = (wMm, hMm) => {
    setLabelWidthMm(wMm);
    setLabelHeightMm(hMm);
    const matching = templates.find(t => t.width_mm === wMm && t.height_mm === hMm);
    if (matching) {
      loadTemplateById(matching.id);
    } else {
      const currentZoom = calculateAutoFitZoom(wMm, hMm, viewMode);
      setZoom(currentZoom);
      if (canvasRef.current) {
        canvasRef.current.setDimensions({
          width: wMm * pxPerMm * currentZoom,
          height: hMm * pxPerMm * currentZoom,
        });
        canvasRef.current.setZoom(currentZoom);
        canvasRef.current.calcOffset();
        canvasRef.current.renderAll();
      }
    }
  };


  const handleUploadImage = (e) => {
    const file = e.target.files[0];
    if (!file || !canvasRef.current) return;

    const reader = new FileReader();
    reader.onload = (f) => {
      fabric.Image.fromURL(f.target.result, (img) => {
        img.set({
          left: 10 * pxPerMm,
          top: 10 * pxPerMm,
          scaleX: 0.3,
          scaleY: 0.3,
        });
        canvasRef.current.add(img);
        canvasRef.current.setActiveObject(img);
        canvasRef.current.renderAll();
      });
    };
    reader.readAsDataURL(file);
  };

  // Render Simulation Engine
  const triggerRenderSimulation = async () => {
    if (!canvasRef.current) return;
    setIsRendering(true);

    try {
      const svg = exportFabricToSvg(canvasRef.current, labelWidthMm, labelHeightMm, pxPerMm);
      if (!svg) {
        throw new Error('Canvas is empty or export failed.');
      }

      // Hi-Res Preview
      const previewRes = await apiClient.renderPreview(svg, jsonData, dpi, labelWidthMm, labelHeightMm);
      if (typeof previewRes === 'string') {
        setPreviewImage(previewRes);
      } else if (previewRes?.image_base64) {
        setPreviewImage(`data:image/png;base64,${previewRes.image_base64}`);
      }

      // 1-Bit Thermal Simulation
      const thermalRes = await apiClient.renderThermalSimulation(svg, jsonData, dpi, threshold, labelWidthMm, labelHeightMm);
      if (thermalRes?.simulation_base64) {
        setThermalImage(`data:image/png;base64,${thermalRes.simulation_base64}`);
      } else if (typeof previewRes === 'string') {
        setThermalImage(previewRes);
      }

      // Token Inspection
      const inspectRes = await apiClient.inspectTemplate(svg, jsonData);
      setInspectionData(inspectRes);
    } catch (err) {
      console.warn('Render simulation notice:', err);
    } finally {
      setIsRendering(false);
    }
  };

  const handleSaveTemplate = async () => {
    const currentT = templates.find(t => t.id === activeTemplateId);
    const isBuiltin = currentT ? currentT.is_builtin : true;
    const isDraft = currentT ? currentT.is_draft : false;

    if (isBuiltin || isDraft || !activeTemplateId) {
      setIsSaveModalOpen(true);
      return;
    }
    // Direct overwrite for already custom templates
    await handleExecuteSave(activeTemplateId, currentT?.name || activeTemplateId);
  };

  const handleSaveAsTemplate = () => {
    setIsSaveModalOpen(true);
  };

  const handleExecuteSave = async (idToSave, nameToSave) => {
    if (!canvasRef.current) return;
    const svg = exportFabricToSvg(canvasRef.current, labelWidthMm, labelHeightMm, pxPerMm);
    try {
      const saved = await apiClient.saveTemplate(idToSave, svg, {
        width_mm: labelWidthMm,
        height_mm: labelHeightMm,
      });
      const tList = await apiClient.listTemplates();
      const updatedList = tList.templates || [];
      setTemplates(updatedList);
      if (saved && saved.id) {
        setActiveTemplateId(saved.id);
      }
      alert(`Template "${nameToSave || saved?.name || idToSave}" saved successfully to server!`);
    } catch (err) {
      alert(`Save failed: ${err.message}`);
      throw err;
    }
  };

  const handleExportSvg = () => {
    if (!canvasRef.current) return;
    const svg = exportFabricToSvg(canvasRef.current, labelWidthMm, labelHeightMm, pxPerMm);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeTemplateId || 'custom_label'}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenDimensionModal = (mode = 'resize') => {
    setCanvasModalMode(mode);
    setIsCanvasModalOpen(true);
  };

  const handleUpdateCanvasDimensions = (newWMm, newHMm, newDpi = null) => {
    const w = Math.max(10, Math.min(1000, parseFloat(newWMm) || 200));
    const h = Math.max(10, Math.min(1000, parseFloat(newHMm) || 80));
    setLabelWidthMm(w);
    setLabelHeightMm(h);
    if (newDpi) {
      setDpi(newDpi);
    }

    const currentZoom = calculateAutoFitZoom(w, h, viewMode);
    setZoom(currentZoom);

    if (canvasRef.current) {
      canvasRef.current.setDimensions({
        width: w * pxPerMm * currentZoom,
        height: h * pxPerMm * currentZoom,
      });
      canvasRef.current.setZoom(currentZoom);
      canvasRef.current.calcOffset();
      canvasRef.current.renderAll();
    }

    setTimeout(() => {
      triggerRenderSimulation();
    }, 150);
  };

  const handleCreateNewTemplate = ({ name, widthMm, heightMm }) => {
    const cleanId = name.trim().toLowerCase().replace(/[^a-z0-9_\-]+/g, '_');
    setActiveTemplateId(cleanId);
    setLabelWidthMm(widthMm);
    setLabelHeightMm(heightMm);

    // Clear any cached or pending SVGs
    pendingSvgRef.current = null;
    lastLoadedSvgRef.current = null;
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setSelectedObject(null);
    setUsedTokens(new Set());

    // Add draft entry into templates list if not exists
    setTemplates(prev => {
      const filtered = prev.filter(t => t.id !== cleanId);
      return [
        {
          id: cleanId,
          name: name.trim() || cleanId.replace(/_/g, ' ').toUpperCase(),
          filename: `${cleanId}.svg`,
          is_builtin: false,
          is_draft: true,
          width_mm: widthMm,
          height_mm: heightMm,
        },
        ...filtered
      ];
    });

    const currentZoom = calculateAutoFitZoom(widthMm, heightMm, viewMode);
    setZoom(currentZoom);

    if (canvasRef.current) {
      canvasRef.current.clear();
      canvasRef.current.setDimensions({
        width: widthMm * pxPerMm * currentZoom,
        height: heightMm * pxPerMm * currentZoom,
      });
      canvasRef.current.setZoom(currentZoom);
      canvasRef.current.calcOffset();
      canvasRef.current.setBackgroundColor('#ffffff', canvasRef.current.renderAll.bind(canvasRef.current));
    }

    setTimeout(() => {
      triggerRenderSimulation();
    }, 150);
  };

  const handleNewTemplate = () => {
    handleOpenDimensionModal('new');
  };

  const handleUploadTemplate = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (f) => {
      const svgStr = f.target.result;
      if (!svgStr) return;

      // Parse width and height in mm
      let wMm = 200;
      let hMm = 80;
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgStr, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (svgEl) {
          const wAttr = svgEl.getAttribute('width');
          const hAttr = svgEl.getAttribute('height');
          if (wAttr && wAttr.includes('mm')) wMm = parseFloat(wAttr);
          if (hAttr && hAttr.includes('mm')) hMm = parseFloat(hAttr);
        }
      } catch (err) {
        console.warn('Dimension parsing notice:', err);
      }

      setLabelWidthMm(wMm);
      setLabelHeightMm(hMm);
      setZoom(calculateAutoFitZoom(wMm, hMm, viewMode));
      loadSvgIntoCanvas(svgStr, wMm, hMm);

      // Background upload to backend
      try {
        const result = await apiClient.uploadTemplate(file);
        const tList = await apiClient.listTemplates();
        setTemplates(tList.templates || []);
        if (result && result.id) {
          setActiveTemplateId(result.id);
        }
      } catch (err) {
        console.warn('Backend upload notice:', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Global Keyboard Shortcuts (Photoshop / Inkscape standard)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
      const isFabricEditing = canvasRef.current && canvasRef.current.getActiveObject() && canvasRef.current.getActiveObject().isEditing;

      // Question mark (?) or F1 opens shortcut modal
      if ((e.key === '?' || e.key === 'F1') && !isInput && !isFabricEditing) {
        e.preventDefault();
        setIsShortcutModalOpen(prev => !prev);
        return;
      }

      // Ctrl + Z: Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isInput && !isFabricEditing) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      // Ctrl + Y: Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !isInput && !isFabricEditing) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Ctrl + S: Save / Save As
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !isInput && !isFabricEditing) {
        e.preventDefault();
        if (e.shiftKey) {
          handleSaveAsTemplate();
        } else {
          handleSaveTemplate();
        }
        return;
      }

      // Ctrl + N: New Label Modal
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !isInput && !isFabricEditing) {
        e.preventDefault();
        handleNewTemplate();
        return;
      }

      // Ctrl + A: Select All
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !isInput && !isFabricEditing) {
        if (canvasRef.current) {
          e.preventDefault();
          canvasRef.current.discardActiveObject();
          const allObjs = canvasRef.current.getObjects();
          if (allObjs.length > 0) {
            const sel = new fabric.ActiveSelection(allObjs, { canvas: canvasRef.current });
            canvasRef.current.setActiveObject(sel);
            canvasRef.current.renderAll();
          }
        }
        return;
      }

      // Vector Tool Activation Shortcuts (Photoshop / Illustrator style)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !isInput && !isFabricEditing) {
        const k = e.key.toLowerCase();
        if (k === 'v') {
          setActiveTool('select');
        } else if (k === 't') {
          setActiveTool('text');
        } else if (k === 'b') {
          setActiveTool('barcode');
        } else if (k === 'm') {
          setActiveTool('qrcode');
        } else if (k === 'r') {
          setActiveTool('rect');
        } else if (k === 'l') {
          setActiveTool('line');
        } else if (k === 'c') {
          setActiveTool('circle');
        } else if (k === 'g') {
          setActiveTool('table');
        }
      }

      // Esc: Deselect & revert tool to select
      if (e.key === 'Escape' && !isInput && !isFabricEditing) {
        setActiveTool('select');
        if (canvasRef.current) {
          canvasRef.current.discardActiveObject();
          canvasRef.current.renderAll();
          setSelectedObject(null);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleUndo, handleRedo]);

  const currentSvg = canvasRef.current
    ? exportFabricToSvg(canvasRef.current, labelWidthMm, labelHeightMm, pxPerMm)
    : '';

  return (
    <div className="h-screen w-screen flex flex-col bg-studio-darkest text-gray-200 overflow-hidden font-sans">
      {/* 1. Top Application Bar (Clean Inkscape-Style Header) */}
      <TopMenuBar
        templates={templates}
        activeTemplateId={activeTemplateId}
        onSelectTemplate={loadTemplateById}
        onNewTemplate={handleNewTemplate}
        onUploadTemplate={handleUploadTemplate}
        onSaveTemplate={handleSaveTemplate}
        onSaveAsTemplate={handleSaveAsTemplate}
        onExportSvg={handleExportSvg}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenShortcuts={() => setIsShortcutModalOpen(true)}
        onOpenDiagnostics={() => setIsDiagnosticsModalOpen(true)}
        onRenderAll={triggerRenderSimulation}
        onOpenPrintModal={() => setIsPrintModalOpen(true)}
        viewMode={viewMode}
        setViewMode={(newMode) => {
          setViewMode(newMode);
          setZoom(calculateAutoFitZoom(labelWidthMm, labelHeightMm, newMode));
          if (newMode === 'split' || newMode === 'preview') {
            triggerRenderSimulation();
          }
        }}
        isRendering={isRendering}
      />

      {/* 2. Millimeter CAD Property Ribbon */}
      <PropertyRibbon
        selectedObject={selectedObject}
        onUpdateProperty={handleUpdateProperty}
        onBringForward={handleBringForward}
        onSendBackward={handleSendBackward}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        labelWidthMm={labelWidthMm}
        labelHeightMm={labelHeightMm}
        onUpdateCanvasDimensions={handleUpdateCanvasDimensions}
        onOpenDimensionModal={handleOpenDimensionModal}
        pxPerMm={pxPerMm}
        isSnapEnabled={isSnapEnabled}
        onToggleSnap={() => setIsSnapEnabled(!isSnapEnabled)}
        areGuidesEnabled={areGuidesEnabled}
        onToggleGuides={() => setAreGuidesEnabled(!areGuidesEnabled)}
      />

      {/* 3. Main CAD Studio Workspace Layout */}
      <div className="fixed top-[76px] bottom-[24px] left-0 right-0 flex overflow-hidden bg-surface-dim">
        {/* Left Vector Toolbox & SAP Data Contract */}
        <LeftToolbox
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onAddText={handleAddText}
          onAddDynamicField={handleAddDynamicField}
          onAddBarcode={handleAddBarcode}
          onAddQrCode={handleAddQrCode}
          onAddRect={handleAddRect}
          onAddLine={handleAddLine}
          onAddCircle={handleAddCircle}
          onAddTable={handleAddTable}
          onAddIsoSymbol={handleAddIsoSymbol}
          onUploadImage={handleUploadImage}
          sampleContracts={sampleContracts}
          activeContractKey={activeContractKey}
          onSelectContract={(key) => {
            setActiveContractKey(key);
            if (sampleContracts[key]) setJsonData(sampleContracts[key]);
          }}
          jsonData={jsonData}
          onUpdateJsonData={(data) => setJsonData(data)}
          onResetZoom={() => setReset100Trigger(prev => prev + 1)}
          usedTokens={usedTokens}
        />

        {/* Center Vector Canvas */}
        <div
          className="flex-1 flex flex-col overflow-hidden relative"
          style={{ display: viewMode === 'preview' ? 'none' : 'flex' }}
        >
          <StudioCanvas
            labelWidthMm={labelWidthMm}
            labelHeightMm={labelHeightMm}
            zoom={zoom}
            onZoomChange={handleZoomChange}
            onSelectionChanged={handleSelectionChanged}
            onCanvasModified={handleCanvasModified}
            onCanvasReady={handleCanvasReady}
            onAutoFit={handleAutoFit}
            onCursorPosChange={setCursorPos}
            onDropElement={handleDropElement}
            canvasRef={canvasRef}
            pxPerMm={pxPerMm}
            fitTrigger={fitTrigger}
            reset100Trigger={reset100Trigger}
            activeTool={activeTool}
            onFinishDrawing={() => setActiveTool('select')}
            isSnapEnabled={isSnapEnabled}
            areGuidesEnabled={areGuidesEnabled}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
        </div>

        {/* Right Inspector: Layers Hierarchy & 9-Point Transform Matrix (Active in Design Mode) */}
        {viewMode === 'design' && (
          <RightInspector
            canvasRef={canvasRef}
            selectedObject={selectedObject}
            onUpdateProperty={handleUpdateProperty}
            onBringForward={handleBringForward}
            onSendBackward={handleSendBackward}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            labelWidthMm={labelWidthMm}
            labelHeightMm={labelHeightMm}
            pxPerMm={pxPerMm}
            jsonData={jsonData}
          />
        )}

        {/* Right / Split Thermal Printhead Simulation */}
        <div
          className="flex-1 flex flex-col overflow-hidden relative"
          style={{ display: viewMode === 'design' ? 'none' : 'flex' }}
        >
          <ThermalPreviewSplit
            previewImage={previewImage}
            thermalImage={thermalImage}
            inspectionData={inspectionData}
            dpi={dpi}
            setDpi={setDpi}
            threshold={threshold}
            setThreshold={setThreshold}
            onRefresh={triggerRenderSimulation}
            isLoading={isRendering}
            onPrintTest={() => setIsPrintModalOpen(true)}
          />
        </div>
      </div>

      {/* 4. Bottom Inkscape-Style Status Bar */}
      <StatusBar
        cursorPos={cursorPos}
        labelWidthMm={labelWidthMm}
        labelHeightMm={labelHeightMm}
        selectedObject={selectedObject}
        activeContractKey={activeContractKey}
        zoom={zoom}
        setZoom={setZoom}
        onFitZoom={() => setFitTrigger(prev => prev + 1)}
        onResetZoom={() => setReset100Trigger(prev => prev + 1)}
        onOpenShortcuts={() => setIsShortcutModalOpen(true)}
        isRendering={isRendering}
      />

      {/* Print & Export Center Modal */}
      <PrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        svgContent={currentSvg}
        jsonData={jsonData}
        dpi={dpi}
      />

      {/* Canvas Setup & Custom Dimensions Modal */}
      <CanvasSetupModal
        isOpen={isCanvasModalOpen}
        onClose={() => setIsCanvasModalOpen(false)}
        mode={canvasModalMode}
        currentWidthMm={labelWidthMm}
        currentHeightMm={labelHeightMm}
        onApplyDimensions={handleUpdateCanvasDimensions}
        onCreateNewTemplate={handleCreateNewTemplate}
      />

      {/* Save Template to Repository Modal */}
      <SaveTemplateModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        activeTemplateId={activeTemplateId}
        widthMm={labelWidthMm}
        heightMm={labelHeightMm}
        existingTemplates={templates}
        onSave={handleExecuteSave}
      />

      {/* Keyboard & Mouse Shortcuts Cheat Sheet Modal */}
      <ShortcutHelpModal
        isOpen={isShortcutModalOpen}
        onClose={() => setIsShortcutModalOpen(false)}
      />

      {/* AI Diagnostics & Session Telemetry Modal */}
      <AiDiagnosticsModal
        isOpen={isDiagnosticsModalOpen}
        onClose={() => setIsDiagnosticsModalOpen(false)}
        fabricCanvas={canvasRef.current}
      />
    </div>
  );
}
