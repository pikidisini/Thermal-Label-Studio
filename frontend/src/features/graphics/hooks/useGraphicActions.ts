import { useCallback } from 'react';
import type { GraphicAsset } from '../model/graphicTypes';
import { graphicsApi } from '../api/graphicsApi';

/** Insert an independent copy through the same bounded image admission as local upload. */
export function useGraphicActions({ addImageFile }: { addImageFile: (file: File) => Promise<void> }) {
  const handleAddGraphic = useCallback(async (asset: GraphicAsset) => {
    const full = await graphicsApi.get(asset.id);
    const uri = full.data_uri;
    if (!uri || uri.length >= 512 * 1024) throw new Error('Invalid graphic response.');
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(uri);
    if (!match) throw new Error('Invalid graphic response.');
    const binary = atob(match[2]);
    const bytes = Uint8Array.from(binary, char => char.codePointAt(0)!);
    await addImageFile(new File([bytes], full.name, { type: match[1] }));
  }, [addImageFile]);
  return { handleAddGraphic };
}
