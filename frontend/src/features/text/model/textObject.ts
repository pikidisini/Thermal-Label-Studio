import { fabric } from 'fabric';

export const DEFAULT_TEXT_CONTENT = 'New Label Text';
export const DEFAULT_TEXT_FONT_FAMILY = 'Arial';
export const DEFAULT_TEXT_FILL = '#000000';

export interface CreateTextObjectOptions {
  content?: string;
  left: number;
  top: number;
  fontSize: number;
}

/**
 * Creates the Fabric text primitive shared by text placement entry points.
 * Feature-specific metadata, such as an SAP token binding, is applied by the
 * caller after construction.
 */
export function createTextObject({
  content = DEFAULT_TEXT_CONTENT,
  left,
  top,
  fontSize,
}: CreateTextObjectOptions) {
  return new fabric.IText(content, {
    left,
    top,
    fontFamily: DEFAULT_TEXT_FONT_FAMILY,
    fontSize,
    fill: DEFAULT_TEXT_FILL,
  });
}
