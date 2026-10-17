import * as fabric from 'fabric';

/** Refresh full symbol pixels while preserving the four design corners. */
export async function replaceSymbolImage(object: fabric.FabricImage, url: string, isCurrent: () => boolean = () => true): Promise<boolean> {
  const element=await fabric.util.loadImage(url);
  if(!isCurrent()) return false;
  const oldWidth=object.width, oldHeight=object.height;
  const matrix=object.calcOwnMatrix().slice() as fabric.TMat2D;
  object.setElement(element);
  if (!object.width || !object.height) throw new Error('Invalid symbol image dimensions.');
  matrix[0]*=oldWidth/object.width; matrix[1]*=oldWidth/object.width;
  matrix[2]*=oldHeight/object.height; matrix[3]*=oldHeight/object.height;
  fabric.util.applyTransformToObject(object,matrix);
  object.setCoords();
  return true;
}
