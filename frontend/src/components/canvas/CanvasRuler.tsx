import React, { forwardRef } from 'react';

interface CanvasRulerProps {
  orientation: 'horizontal' | 'vertical';
}

export const CanvasRuler = forwardRef<HTMLCanvasElement, CanvasRulerProps>(
  ({ orientation }, ref) => {
    if (orientation === 'horizontal') {
      return (
        <canvas
          ref={ref}
          height={20}
          className="absolute top-0 left-6 right-0 h-5 z-20 pointer-events-none"
        />
      );
    }

    return (
      <canvas
        ref={ref}
        width={24}
        className="absolute top-5 left-0 bottom-0 w-6 z-20 pointer-events-none"
      />
    );
  }
);

CanvasRuler.displayName = 'CanvasRuler';
