import { Point, util, type FabricObject } from 'fabric';

export const TRANSFORM_ANCHORS = {
  'top-left': ['left', 'top'], 'top-center': ['center', 'top'], 'top-right': ['right', 'top'],
  'middle-left': ['left', 'center'], center: ['center', 'center'], 'middle-right': ['right', 'center'],
  'bottom-left': ['left', 'bottom'], 'bottom-center': ['center', 'bottom'], 'bottom-right': ['right', 'bottom'],
} as const;
export type TransformAnchor = keyof typeof TRANSFORM_ANCHORS;
export type LabelAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export function getTransformAnchor(object: Pick<FabricObject, 'originX' | 'originY'>): TransformAnchor | undefined {
  return (Object.keys(TRANSFORM_ANCHORS) as TransformAnchor[]).find(key => {
    const [x, y] = TRANSFORM_ANCHORS[key];
    return object.originX === x && object.originY === y;
  });
}

/** Change the coordinate reference while keeping the object's scene geometry fixed. */
export function setTransformAnchor(object: FabricObject, anchor: TransformAnchor): void {
  const [originX, originY] = TRANSFORM_ANCHORS[anchor];
  const center = object.getRelativeCenterPoint();
  object.set({ originX, originY });
  object.setPositionByOrigin(center, 'center', 'center');
  object.setCoords();
}

/** Translate transformed bounds in scene units; viewport zoom never participates. */
export function alignObjectToLabel(object: FabricObject, alignment: LabelAlignment, width: number, height: number): void {
  object.setCoords();
  const bounds = object.getBoundingRect();
  let dx = 0;
  let dy = 0;
  if (alignment === 'left') dx = -bounds.left;
  if (alignment === 'center') dx = width / 2 - (bounds.left + bounds.width / 2);
  if (alignment === 'right') dx = width - (bounds.left + bounds.width);
  if (alignment === 'top') dy = -bounds.top;
  if (alignment === 'middle') dy = height / 2 - (bounds.top + bounds.height / 2);
  if (alignment === 'bottom') dy = height - (bounds.top + bounds.height);
  // A selected child has parent coordinates; convert the translation vector,
  // excluding the parent's translation, before changing left/top.
  const delta = object.group
    ? new Point(dx, dy).transform(util.invertTransform(object.group.calcTransformMatrix()), true)
    : new Point(dx, dy);
  object.set({ left: object.left + delta.x, top: object.top + delta.y });
  object.setCoords();
}
