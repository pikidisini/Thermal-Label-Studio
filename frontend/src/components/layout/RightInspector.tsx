import React, { useState, useEffect } from 'react';
import { InspectorTab } from './inspector/InspectorTab';
import { LayersTab } from './inspector/LayersTab';
import { TransformMatrixTab } from './inspector/TransformMatrixTab';
import { ObjectPropertyForm } from './inspector/ObjectPropertyForm';

type Tab = 'properties' | 'layers' | 'transform';

interface RightInspectorProps {
  canvasRef: React.MutableRefObject<any>;
  selectedObject: any;
  onUpdateProperty: (prop: string, val: any) => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  labelWidthMm?: number;
  labelHeightMm?: number;
  pxPerMm?: number;
  jsonData?: Record<string, any>;
}

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'properties', icon: 'tune',         label: 'Props'  },
  { id: 'layers',     icon: 'layers',        label: 'Layers' },
  { id: 'transform',  icon: 'format_shapes', label: 'Align'  },
];

export function RightInspector({
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
  jsonData = {},
}: RightInspectorProps) {
  const [activeTab, setActiveTab] = useState<Tab>('properties');
  const [objectsList, setObjectsList] = useState<any[]>([]);
  const [activeAnchor, setActiveAnchor] = useState('center');

  const updateObjectsList = () => {
    if (!canvasRef.current) return;
    setObjectsList([...canvasRef.current.getObjects()].reverse());
  };

  useEffect(() => {
    updateObjectsList();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handlers = ['object:added', 'object:removed', 'object:modified',
                      'selection:created', 'selection:updated', 'selection:cleared'];
    handlers.forEach((ev) => canvas.on(ev, updateObjectsList));
    return () => handlers.forEach((ev) => canvas.off(ev, updateObjectsList));
  }, [canvasRef]);

  const handleSelectLayer = (obj: any) => {
    if (!canvasRef.current) return;
    canvasRef.current.setActiveObject(obj);
    canvasRef.current.renderAll();
  };

  return (
    <aside
      data-testid="container-right-inspector"
      className="w-80 bg-surface-container-low border-l border-outline-variant flex flex-col h-full select-none z-10 shadow-xl"
    >
      {/* Tab bar */}
      <div
        data-testid="inspector-tab-bar"
        className="flex border-b border-outline-variant bg-surface-container-lowest shrink-0"
      >
        {TABS.map((t) => (
          <InspectorTab
            key={t.id}
            id={t.id}
            icon={t.icon}
            label={t.label}
            active={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
          />
        ))}
      </div>

      {/* Tab content */}
      <div data-testid="inspector-tab-content" className="flex-1 overflow-y-auto">
        {activeTab === 'properties' && (
          <ObjectPropertyForm
            selectedObject={selectedObject}
            pxPerMm={pxPerMm}
            jsonData={jsonData}
            onUpdateProperty={onUpdateProperty}
          />
        )}
        {activeTab === 'layers' && (
          <LayersTab
            objectsList={objectsList}
            selectedObject={selectedObject}
            canvasRef={canvasRef}
            onBringForward={onBringForward}
            onSendBackward={onSendBackward}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onSelectLayer={handleSelectLayer}
          />
        )}
        {activeTab === 'transform' && (
          <TransformMatrixTab
            selectedObject={selectedObject}
            activeAnchor={activeAnchor}
            setActiveAnchor={setActiveAnchor}
            labelWidthMm={labelWidthMm}
            labelHeightMm={labelHeightMm}
            pxPerMm={pxPerMm}
            canvasRef={canvasRef}
            onUpdateProperty={onUpdateProperty}
          />
        )}
      </div>
    </aside>
  );
}
