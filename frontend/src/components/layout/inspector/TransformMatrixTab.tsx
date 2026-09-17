import React from 'react';

interface TransformMatrixTabProps {
  selectedObject: any;
  activeAnchor: string;
  setActiveAnchor: (anchor: string) => void;
  labelWidthMm: number;
  labelHeightMm: number;
  pxPerMm: number;
  canvasRef: React.MutableRefObject<any>;
  onUpdateProperty: (prop: string, val: any) => void;
}

const ANCHORS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

type AlignType = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

interface AlignBtnProps {
  icon: string;
  title: string;
  testId: string;
  disabled: boolean;
  onClick: () => void;
}

function AlignBtn({ icon, title, testId, disabled, onClick }: AlignBtnProps) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex items-center justify-center p-1.5 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-outline-variant"
    >
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
    </button>
  );
}

export function TransformMatrixTab({
  selectedObject,
  activeAnchor,
  setActiveAnchor,
  labelWidthMm,
  labelHeightMm,
  pxPerMm,
  canvasRef,
  onUpdateProperty,
}: TransformMatrixTabProps) {
  const noSel = !selectedObject;

  const handleAlign = (type: AlignType) => {
    if (!selectedObject || !canvasRef.current) return;
    const canvasW = labelWidthMm * pxPerMm;
    const canvasH = labelHeightMm * pxPerMm;
    const objW = (selectedObject.width  || 0) * (selectedObject.scaleX || 1);
    const objH = (selectedObject.height || 0) * (selectedObject.scaleY || 1);
    const margin = 4;

    const map: Record<AlignType, [string, number]> = {
      left:   ['leftMm',  margin / pxPerMm],
      center: ['leftMm',  ((canvasW - objW) / 2) / pxPerMm],
      right:  ['leftMm',  (canvasW - objW - margin) / pxPerMm],
      top:    ['topMm',   margin / pxPerMm],
      middle: ['topMm',   ((canvasH - objH) / 2) / pxPerMm],
      bottom: ['topMm',   (canvasH - objH - margin) / pxPerMm],
    };
    onUpdateProperty(map[type][0], map[type][1]);
  };

  const ALIGN_BTNS: { type: AlignType; icon: string; title: string; testId: string }[] = [
    { type: 'left',   icon: 'align_horizontal_left',   title: 'Align Left',         testId: 'align-btn-left'    },
    { type: 'center', icon: 'align_horizontal_center',  title: 'Center Horizontal',  testId: 'align-btn-center-h'},
    { type: 'right',  icon: 'align_horizontal_right',   title: 'Align Right',        testId: 'align-btn-right'   },
    { type: 'top',    icon: 'align_vertical_top',       title: 'Align Top',          testId: 'align-btn-top'     },
    { type: 'middle', icon: 'align_vertical_center',    title: 'Center Vertical',    testId: 'align-btn-center-v'},
    { type: 'bottom', icon: 'align_vertical_bottom',    title: 'Align Bottom',       testId: 'align-btn-bottom'  },
  ];

  return (
    <div data-testid="container-transform-matrix-tab" className="p-3 space-y-5 text-xs">
      {/* 9-Point Origin Anchor */}
      <div data-testid="container-origin-anchor-section">
        <div className="flex items-center gap-1.5 mb-3">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 13 }}>my_location</span>
          <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest">
            9-Point Transform Origin
          </span>
        </div>
        <div
          data-testid="origin-anchor-grid"
          className="grid grid-cols-3 gap-1 w-[84px] mx-auto p-1.5 bg-surface-container-lowest border border-outline-variant"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)' }}
        >
          {ANCHORS.map((anc) => {
            const isActive = activeAnchor === anc;
            const isCenter = anc === 'center';
            return (
              <button
                key={anc}
                data-testid={`anchor-btn-${anc}`}
                onClick={() => setActiveAnchor(anc)}
                title={anc.replace(/-/g, ' ')}
                className={`w-6 h-6 flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-primary'
                    : 'bg-surface-container-high hover:bg-surface-container-highest'
                }`}
              >
                {isCenter && !isActive && (
                  <span className="w-1.5 h-1.5 bg-on-surface-variant block" />
                )}
                {isCenter && isActive && (
                  <span className="w-1.5 h-1.5 bg-surface block" />
                )}
              </button>
            );
          })}
        </div>
        <p data-testid="origin-anchor-active-label" className="text-center text-[9px] text-on-surface-variant mt-1.5 font-mono">
          {activeAnchor.replace(/-/g, ' ')}
        </p>
      </div>

      {/* Canvas Auto Alignment */}
      <div data-testid="container-canvas-alignment-section" className="border-t border-outline-variant pt-4">
        <div className="flex items-center gap-1.5 mb-3">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 13 }}>format_shapes</span>
          <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest">
            Canvas Alignment
          </span>
        </div>
        <div data-testid="canvas-alignment-btn-grid" className="grid grid-cols-3 gap-1">
          {ALIGN_BTNS.map((b) => (
            <AlignBtn key={b.type} icon={b.icon} title={b.title} testId={b.testId} disabled={noSel} onClick={() => handleAlign(b.type)} />
          ))}
        </div>
        {noSel && (
          <p data-testid="align-no-selection-hint" className="text-center text-[10px] text-on-surface-variant mt-2">
            Select an element first
          </p>
        )}
      </div>
    </div>
  );
}
