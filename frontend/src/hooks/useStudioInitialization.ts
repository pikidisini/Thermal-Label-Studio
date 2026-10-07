import { useEffect } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { useTemplateStore } from '../store/useTemplateStore';
import { useAutoFit } from './useAutoFit';

interface UseStudioInitializationProps {
  templateMgr: {
    initData: () => void;
  };
  pxPerMm?: number;
}

export function useStudioInitialization({
  templateMgr,
  pxPerMm = 4,
}: UseStudioInitializationProps) {
  const { viewMode, setZoom } = useStudioStore();
  const { labelWidthMm, labelHeightMm } = useTemplateStore();

  const { calculateAutoFitZoom } = useAutoFit({
    labelWidthMm,
    labelHeightMm,
    viewMode,
    pxPerMm,
  });

  useEffect(() => {
    templateMgr.initData();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setZoom(calculateAutoFitZoom(labelWidthMm, labelHeightMm, viewMode));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateAutoFitZoom, labelWidthMm, labelHeightMm, viewMode, setZoom]);

  return { calculateAutoFitZoom };
}
