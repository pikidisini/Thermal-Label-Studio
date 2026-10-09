export { StudioCanvas } from './ui/StudioCanvas';
export { CanvasViewport } from './ui/CanvasViewport';
export { CanvasRuler } from './ruler/CanvasRuler';
export { useRulers } from './ruler/useRulers';
export { getMajorStepMm } from './ruler/rulerScale';
export { useFabricCanvas } from './editor/useFabricCanvas';
export { useAutoFitZoom } from './editor/useAutoFitZoom';
export { useWheelZoom } from './editor/useWheelZoom';
export { useTouchpadGestures } from './editor/useTouchpadGestures';
export { importSvgIntoFabricCanvas } from './svg/fabricSvgImporter';
export { exportFabricToSvg } from './svg/fabricSvgExporter';
export { useEditorDraftRecovery } from './draft/useEditorDraftRecovery';

export { TRANSFORM_ANCHORS, getTransformAnchor, setTransformAnchor, alignObjectToLabel } from './editor/objectGeometry';
export type { TransformAnchor, LabelAlignment } from './editor/objectGeometry';
