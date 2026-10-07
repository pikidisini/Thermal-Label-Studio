import { useEffect, useLayoutEffect } from 'react';

/**
 * Preserves layout-timed browser effects while allowing server rendering and
 * Node-based component tests to use a non-layout effect safely.
 */
export const useIsomorphicLayoutEffect = typeof window !== 'undefined' && typeof window.document !== 'undefined'
  ? useLayoutEffect
  : useEffect;
