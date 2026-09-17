import React from 'react';
import { RibbonDivider } from './RibbonDivider';

interface TextFormatControlsProps {
  selectedObject: any;
  pxPerMm: number;
  onUpdateProperty: (prop: string, val: any) => void;
}

const FONTS = ['Arial', 'Courier New', 'Roboto', 'Impact', 'Times New Roman'];
const ALIGN_ICONS = [
  { align: 'left',   icon: 'format_align_left',   testId: 'ribbon-btn-align-left'   },
  { align: 'center', icon: 'format_align_center', testId: 'ribbon-btn-align-center' },
  { align: 'right',  icon: 'format_align_right',  testId: 'ribbon-btn-align-right'  },
];

export function TextFormatControls({ selectedObject, pxPerMm, onUpdateProperty }: TextFormatControlsProps) {
  const isText = selectedObject?.type === 'text' || selectedObject?.type === 'i-text';
  if (!isText) return null;

  const fontPt = Math.round(((selectedObject.fontSize || 16) * 2.834) / pxPerMm);

  const styleBtn = (active: boolean, icon: string, title: string, testId: string, handler: () => void) => (
    <button
      data-testid={testId}
      onClick={handler}
      title={title}
      aria-label={title}
      className={`p-1 transition-colors ${active ? 'bg-primary text-surface' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>
    </button>
  );

  return (
    <div data-testid="container-text-format-controls" className="flex items-center gap-1.5 pl-2">
      <RibbonDivider />

      {/* Font family */}
      <select
        data-testid="ribbon-select-font-family"
        value={selectedObject.fontFamily || 'Arial'}
        onChange={(e) => onUpdateProperty('fontFamily', e.target.value)}
        className="bg-surface-container border border-outline-variant px-2 py-0.5 text-[11px] text-on-surface focus:outline-none cursor-pointer"
      >
        {FONTS.map((f) => <option key={f} value={f} className="bg-surface-container">{f}</option>)}
      </select>

      {/* Font size with themed CAD stepper */}
      <div data-testid="container-ribbon-font-size" className="flex items-center gap-1">
        <div className="flex items-stretch border border-outline-variant bg-surface-container focus-within:border-primary-container h-[22px]">
          <input
            data-testid="ribbon-input-font-size-pt"
            type="number"
            min="4"
            max="72"
            value={fontPt}
            onChange={(e) => onUpdateProperty('fontSizePt', e.target.value)}
            className="w-8 bg-transparent px-1 text-[11px] text-on-surface text-center font-mono focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <div className="flex flex-col border-l border-outline-variant w-3.5 divide-y divide-outline-variant bg-surface-container-high/40">
            <button
              type="button"
              onClick={() => onUpdateProperty('fontSizePt', Math.min(72, fontPt + 1))}
              title="Increase Font Size (+1pt)"
              className="flex-1 flex items-center justify-center text-outline hover:text-primary hover:bg-surface-bright transition-colors"
            >
              <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor">
                <path d="M3 0L6 4H0L3 0Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onUpdateProperty('fontSizePt', Math.max(4, fontPt - 1))}
              title="Decrease Font Size (-1pt)"
              className="flex-1 flex items-center justify-center text-outline hover:text-primary hover:bg-surface-bright transition-colors"
            >
              <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor">
                <path d="M3 4L0 0H6L3 4Z" />
              </svg>
            </button>
          </div>
        </div>
        <span className="text-[10px] text-on-surface-variant font-mono">pt</span>
      </div>

      <RibbonDivider />

      {/* Bold / Italic / Underline */}
      <div data-testid="container-ribbon-font-styles" className="flex items-center">
        {styleBtn(selectedObject.fontWeight === 'bold', 'format_bold', 'Bold', 'ribbon-btn-bold',
          () => onUpdateProperty('fontWeight', selectedObject.fontWeight === 'bold' ? 'normal' : 'bold'))}
        {styleBtn(selectedObject.fontStyle === 'italic', 'format_italic', 'Italic', 'ribbon-btn-italic',
          () => onUpdateProperty('fontStyle', selectedObject.fontStyle === 'italic' ? 'normal' : 'italic'))}
        {styleBtn(!!selectedObject.underline, 'format_underlined', 'Underline', 'ribbon-btn-underline',
          () => onUpdateProperty('underline', !selectedObject.underline))}
      </div>

      <RibbonDivider />

      {/* Alignment */}
      <div data-testid="container-ribbon-text-alignment" className="flex items-center">
        {ALIGN_ICONS.map(({ align, icon, testId }) =>
          styleBtn(selectedObject.textAlign === align, icon, `Align ${align}`, testId,
            () => onUpdateProperty('textAlign', align))
        )}
      </div>
    </div>
  );
}
