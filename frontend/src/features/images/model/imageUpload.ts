export const MAX_SVG_BYTES = 512 * 1024;
export const MAX_IMAGE_PIXELS = 4_000_000;
export const IMAGE_FORMAT_ERROR = 'Unsupported image format. Choose PNG, JPEG or WebP.';
export const IMAGE_SIZE_ERROR = 'Image is too large for this template. Use a smaller image.';
export const IMAGE_READ_ERROR = 'Image could not be read. Choose a valid PNG, JPEG or WebP file.';

export function validateImageFile(file: Pick<File, 'size' | 'type'>): void {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error(IMAGE_FORMAT_ERROR);
  if (!file.size) throw new Error(IMAGE_READ_ERROR);
  // Base64 alone must fit, before allocating a data URL or decoding pixels.
  if (4 * Math.ceil(file.size / 3) >= MAX_SVG_BYTES) throw new Error(IMAGE_SIZE_ERROR);
}

export function validateImageSignature(bytes: Uint8Array, mime: string): void {
  const matches = (offset: number, values: number[]) => values.every((value, index) => bytes[offset + index] === value);
  const valid = mime === 'image/png' ? matches(0, [137, 80, 78, 71, 13, 10, 26, 10])
    : mime === 'image/jpeg' ? matches(0, [255, 216, 255])
    : mime === 'image/webp' && matches(0, [82, 73, 70, 70]) && matches(8, [87, 69, 66, 80]);
  if (!valid) throw new Error(IMAGE_READ_ERROR);
}

export function imagePlacement(width: number, height: number, canvasWidth: number, canvasHeight: number) {
  if (![width, height, canvasWidth, canvasHeight].every(value => Number.isFinite(value) && value > 0)) throw new Error(IMAGE_READ_ERROR);
  if (Math.max(width, height) > 4096 || width * height > MAX_IMAGE_PIXELS) throw new Error(IMAGE_SIZE_ERROR);
  // Always resize, including upscaling tiny images, preserving the aspect ratio.
  const scale = Math.min(canvasWidth * 0.5 / width, canvasHeight * 0.5 / height);
  return { scaleX: scale, scaleY: scale, left: canvasWidth / 2, top: canvasHeight / 2, originX: 'center' as const, originY: 'center' as const };
}

export function validateImageBudget(svg: string, imageMarkup: string, existingPixels: number, newPixels: number): void {
  if (!svg) throw new Error('Template SVG export failed. Check text and symbol binding properties before saving.');
  if (new TextEncoder().encode(svg + imageMarkup).length > MAX_SVG_BYTES || existingPixels + newPixels > MAX_IMAGE_PIXELS) throw new Error(IMAGE_SIZE_ERROR);
}
