import { translate as t, useTranslation } from "../../../shared/i18n";
import React, { useEffect, useRef, useState } from 'react';
import { AnchoredOverlay } from '../../../shared/ui/layers';
import { FONT_OPTIONS } from '../model/fontOptions';

interface TextFormatControlsProps {
  selectedObject: any;
  pxPerMm: number;
  onUpdateProperty: (prop: string, val: any) => void;
}

const ALIGN_ICONS = [
  { align: 'left', icon: 'format_align_left', testId: 'ribbon-btn-align-left' },
  { align: 'center', icon: 'format_align_center', testId: 'ribbon-btn-align-center' },
  { align: 'right', icon: 'format_align_right', testId: 'ribbon-btn-align-right' },
];

function TextRibbonDivider() {
  useTranslation();
  return <div className="w-px h-4 bg-outline-variant mx-1 flex-shrink-0" />;
}

export function isFontMenuInteractionTarget(
  target: Node,
  trigger: Pick<HTMLElement, 'contains'> | null,
  menu: Pick<HTMLElement, 'contains'> | null,
) {
  return Boolean(trigger?.contains(target) || menu?.contains(target));
}

export function TextFormatControls({ selectedObject, pxPerMm, onUpdateProperty }: TextFormatControlsProps) {
  useTranslation();
  const isText = selectedObject?.type === 'text' || selectedObject?.type === 'i-text';
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const fontTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const closeWhenClickingOutside = (event: MouseEvent) => {
      if (!isFontMenuInteractionTarget(event.target as Node, fontTriggerRef.current, fontMenuRef.current)) {
        setIsFontMenuOpen(false);
      }
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFontMenuOpen(false);
    };

    document.addEventListener('mousedown', closeWhenClickingOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('mousedown', closeWhenClickingOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, []);

  useEffect(() => {
    setIsFontMenuOpen(false);
  }, [selectedObject]);

  if (!isText) return null;

  const fontPt = Math.round(((selectedObject.fontSize || 16) * 2.834) / pxPerMm);
  const selectedFont = selectedObject.fontFamily || 'Arial';
  const selectedFontOption = FONT_OPTIONS.find((font) => font.value === selectedFont);
  const styleBtn = (active: boolean, icon: string, title: string, testId: string, handler: () => void) => (
    <button
      data-testid={testId}
      onClick={handler}
      title={t(title)}
      aria-label={t(title)}

     data-ui-control="button" data-variant="icon" data-selected={active} data-tone="neutral">
      <span className="material-symbols-outlined" style={{ fontSize: "var(--ui-icon-14)" }}>{icon}</span>
    </button>
  );

  return (
    <div data-testid="container-text-format-controls" className="flex items-center gap-1.5 pl-2">
      <TextRibbonDivider />

      <div className="relative">
        <button
          ref={fontTriggerRef}
          type="button"
          data-testid="ribbon-select-font-family"
          aria-label={t("Choose font")}
          aria-haspopup="listbox"
          aria-expanded={isFontMenuOpen}
          onClick={() => setIsFontMenuOpen((open) => !open)}
          className="flex h-[var(--ui-height-compact)] min-w-32 items-center justify-between gap-2"
          title={t("Choose font")}
         data-ui-control="button" data-variant="compact">
          <span className="truncate" style={{ fontFamily: selectedFont }}>{selectedFontOption?.label || selectedFont}</span>
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "var(--ui-icon-15)" }}>expand_more</span>
        </button>

        {isFontMenuOpen && (
          <AnchoredOverlay anchorRef={fontTriggerRef} overlayRef={fontMenuRef} testId="ribbon-font-family-overlay">
          <div
            data-testid="ribbon-font-family-menu"
            role="listbox"
            aria-label={t("Font list")}
            className="max-h-72 w-56 overflow-y-auto border border-outline-variant bg-surface-container-highest py-1 shadow-xl"
           data-ui-surface="flyout">
            {FONT_OPTIONS.map((font) => {
              const selected = font.value === selectedFont;
              return (
                <button
                  key={font.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid={`ribbon-font-option-${font.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  onClick={() => {
                    onUpdateProperty('fontFamily', font.value);
                    setIsFontMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 text-left`}
                  style={{ fontFamily: font.value }}
                 data-ui-control="button" data-variant="menu" data-selected={selected} data-tone="neutral">
                  <span>{font.label}</span>
                  <span data-ui-caption="true" className="shrink-0">
                    {font.category}
                  </span>
                </button>
              );
            })}
          </div>
          </AnchoredOverlay>
        )}
      </div>

      <div data-testid="container-ribbon-font-size" className="flex items-center gap-1">
        <div data-ui-control-group="compact" className="flex items-stretch border border-outline-variant bg-surface-container focus-within:border-primary-container h-[var(--ui-height-compact)]">
          <input
            data-testid="ribbon-input-font-size-pt"
            type="number"
            min="4"
            max="72"
            value={fontPt}
            onChange={(e) => onUpdateProperty('fontSizePt', e.target.value)}
            className="w-8 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
           data-ui-control="input" data-variant="compact" />
          <div className="flex flex-col border-l border-outline-variant w-3.5 divide-y divide-outline-variant bg-surface-container-high/40">
            <button
              type="button"
              onClick={() => onUpdateProperty('fontSizePt', Math.min(72, fontPt + 1))}
              title={t("Increase Font Size (+1pt)")}
              className="flex-1 flex items-center justify-center"
             data-ui-control="button" data-variant="stepper">
              <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor"><path d="M3 0L6 4H0L3 0Z" /></svg>
            </button>
            <button
              type="button"
              onClick={() => onUpdateProperty('fontSizePt', Math.max(4, fontPt - 1))}
              title={t("Decrease Font Size (-1pt)")}
              className="flex-1 flex items-center justify-center"
             data-ui-control="button" data-variant="stepper">
              <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor"><path d="M3 4L0 0H6L3 4Z" /></svg>
            </button>
          </div>
        </div>
        <span className="text-[10px] text-on-surface-variant font-mono">{t("pt")}</span>
      </div>

      <TextRibbonDivider />
      <div data-testid="container-ribbon-font-styles" className="flex items-center">
        {styleBtn(selectedObject.fontWeight === 'bold', 'format_bold', 'Bold', 'ribbon-btn-bold',
          () => onUpdateProperty('fontWeight', selectedObject.fontWeight === 'bold' ? "normal" : "bold"))}
        {styleBtn(selectedObject.fontStyle === 'italic', 'format_italic', 'Italic', 'ribbon-btn-italic',
          () => onUpdateProperty('fontStyle', selectedObject.fontStyle === 'italic' ? "normal" : "italic"))}
        {styleBtn(!!selectedObject.underline, 'format_underlined', 'Underline', 'ribbon-btn-underline',
          () => onUpdateProperty('underline', !selectedObject.underline))}
      </div>

      <TextRibbonDivider />
      <div data-testid="container-ribbon-text-alignment" className="flex items-center">
        {ALIGN_ICONS.map(({ align, icon, testId }) =>
          styleBtn(selectedObject.textAlign === align, icon, `Align ${align}`, testId,
            () => onUpdateProperty('textAlign', align))
        )}
      </div>
    </div>
  );
}
