import { translate as t, useTranslation } from "../../../shared/i18n";
import React from 'react';
import { TRANSFORM_ANCHORS, type TransformAnchor } from '../../../features/canvas';
import { Icon, IconButton } from '../../../shared/ui';

interface TransformMatrixTabProps {
  selectedObject: any;
  activeAnchor?: string;
  setActiveAnchor: (anchor: TransformAnchor) => void;
  labelWidthMm: number;
  labelHeightMm: number;
  pxPerMm: number;
  canvasRef: React.MutableRefObject<any>;
  onUpdateProperty: (prop: string, val: any) => void;
}

const ANCHORS = Object.keys(TRANSFORM_ANCHORS) as TransformAnchor[];

type AlignType = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

interface AlignBtnProps {
  icon: string;
  title: string;
  caption: string;
  testId: string;
  disabled: boolean;
  onClick: () => void;
}

function AlignBtn({ icon, title, caption, testId, disabled, onClick }: AlignBtnProps) {
  useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-center">
    <IconButton
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      label={title}
      variant="default"
      className="w-full disabled:cursor-not-allowed"
    >
      <Icon  size="control" glyph={icon} />
    </IconButton>
    <span className="text-[11px] text-on-surface-variant">{t(caption)}</span>
    </div>
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
  useTranslation();
  const noSel = !selectedObject;

  const handleAlign = (type: AlignType) => {
    if (!selectedObject || !canvasRef.current) return;
    onUpdateProperty('labelAlignment', { type, width: labelWidthMm * pxPerMm, height: labelHeightMm * pxPerMm });
  };

  const ALIGN_BTNS: { type: AlignType; icon: string; title: string; testId: string }[] = [
    { type: 'left',   icon: 'align_horizontal_left',   title: 'Align Left',         testId: 'align-btn-left'    },
    { type: 'center', icon: 'align_horizontal_center',  title: 'Center Horizontal',  testId: 'align-btn-center-h'},
    { type: 'right',  icon: 'align_horizontal_right',   title: 'Align Right',        testId: 'align-btn-right'   },
    { type: 'top',    icon: 'align_vertical_top',       title: 'Align Top',          testId: 'align-btn-top'     },
    { type: 'middle', icon: 'align_vertical_center',    title: 'Center Vertical',    testId: 'align-btn-center-v'},
    { type: 'bottom', icon: 'align_vertical_bottom',    title: 'Align Bottom',       testId: 'align-btn-bottom'  },
  ];

  const captions = ['Left', 'Center', 'Right', 'Top', 'Middle', 'Bottom'];
  const anchorLabel = activeAnchor?.replace(/-/g, ' ');
  return (
    <div data-testid="container-transform-matrix-tab" className="p-3 text-xs">
      <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
        <Icon size={16} glyph="title" />
        <span>{noSel ? t('Select an object to align') : `${t('Selected object')} · ${t('Selected')}`}</span>
      </div>
      <div data-testid="container-canvas-alignment-section" className="mt-4">
        <div className="flex items-center gap-1.5 font-medium">
          <Icon size={16} glyph="format_shapes" />
          <span>{t('Align to label')}</span>
        </div>
        <div data-testid="canvas-alignment-btn-grid">
          {[0, 3].map((start) => (
            <div key={start} className="mt-2">
              <p className="text-[11px] text-on-surface-variant">{t(start === 0 ? 'Horizontal' : 'Vertical')}</p>
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                {ALIGN_BTNS.slice(start, start + 3).map((b, index) => (
                  <AlignBtn key={b.type} icon={b.icon} title={b.title} caption={captions[start + index]} testId={b.testId} disabled={noSel} onClick={() => handleAlign(b.type)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div data-testid="container-origin-anchor-section" className="mt-4 border-t border-outline-variant pt-4">
        <div className="flex items-center gap-1.5 font-medium">
          <Icon size={16} glyph="my_location" />
          <span>{t('Reference point')}</span>
        </div>
        <p className="mt-1.5 text-[11px] text-on-surface-variant">{t('Origin for X / Y coordinates')}</p>
        <div className="mt-2 flex items-center gap-3">
          <div data-testid="origin-anchor-grid" role="group" aria-label={t('Reference point')} className="grid shrink-0 grid-cols-3 gap-0.5">
            {ANCHORS.map((anc) => (
              <IconButton key={anc} data-testid={`anchor-btn-${anc}`} onClick={() => setActiveAnchor(anc)} disabled={noSel}
                label={anc.replace(/-/g, ' ')} variant="compact" selected={activeAnchor === anc} aria-pressed={activeAnchor === anc}>
                <Icon size={16} glyph={anc === 'center' ? 'my_location' : 'radio_button_unchecked'} />
              </IconButton>
            ))}
          </div>
          <div className="min-w-0 text-[11px]">
            <p data-testid="origin-anchor-active-label" className="capitalize">{anchorLabel ? t(anchorLabel) : '—'}</p>
            <p className="text-on-surface-variant">{t('Keeps object in place')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}