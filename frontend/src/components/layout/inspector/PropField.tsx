import React from 'react';

interface PropFieldProps {
  /** Single-char or short prefix badge shown left of input: X, Y, W, H, ∠, S */
  badge: string;
  label: string;
  value: string | number;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  step?: number;
  testId?: string;
}

/**
 * Monospace numeric input with a left prefix badge.
 * CAD aesthetic: no border-radius, JetBrains Mono, surface-container-low bg.
 */
export function PropField({ badge, label, value, onChange, readOnly = false, step = 0.5, testId }: PropFieldProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-semibold text-on-surface-variant uppercase tracking-widest">{label}</span>
      <div className="flex items-stretch border border-outline-variant overflow-hidden">
        {/* Prefix badge */}
        <div className="px-1.5 flex items-center bg-surface-container-high border-r border-outline-variant">
          <span className="font-mono text-[11px] font-bold text-primary">{badge}</span>
        </div>
        {/* Numeric input */}
        <input
          type="number"
          step={step}
          value={value}
          readOnly={readOnly}
          data-testid={testId}
          onChange={(e) => onChange?.(e.target.value)}
          className={`flex-1 min-w-0 font-mono text-[11px] px-1.5 py-1 focus:outline-none bg-surface-container text-on-surface tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
            readOnly ? 'text-on-surface-variant cursor-not-allowed bg-surface-container-low' : 'focus:bg-surface-container-high'
          }`}
        />
        {/* CAD Themed Up/Down Stepper */}
        {!readOnly && onChange && (
          <div className="flex flex-col border-l border-outline-variant w-3.5 divide-y divide-outline-variant bg-surface-container-high/40">
            <button
              type="button"
              onClick={() => {
                const num = Number(value) || 0;
                onChange(String(Number((num + step).toFixed(2))));
              }}
              className="flex-1 flex items-center justify-center text-outline hover:text-primary hover:bg-surface-bright transition-colors"
              title={`Increase (+${step})`}
            >
              <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor">
                <path d="M3 0L6 4H0L3 0Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                const num = Number(value) || 0;
                onChange(String(Number(Math.max(0, num - step).toFixed(2))));
              }}
              className="flex-1 flex items-center justify-center text-outline hover:text-primary hover:bg-surface-bright transition-colors"
              title={`Decrease (-${step})`}
            >
              <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor">
                <path d="M3 4L0 0H6L3 4Z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
