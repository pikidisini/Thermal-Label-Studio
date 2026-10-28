import React from 'react';
import { layoutApi } from '../../templates';
import type { Editor } from '../model/navigation';

export function useTemplatePreview(editor: Editor | null) {
  const [preview, setPreview] = React.useState<string | null>(null);
  const [previewError, setPreviewError] = React.useState('');
  React.useEffect(() => {
    setPreview(null); setPreviewError('');
    if (editor?.kind !== 'template') return;
    let cancelled = false, url: string | null = null;
    layoutApi.get(editor.value.label_code, editor.value.version).then(layout => {
      if (cancelled) return;
      if (layout.version !== editor.value.version || layout.svg_sha256 !== editor.value.svg_sha256) { setPreviewError('The stored template changed. Refresh before saving again.'); return; }
      url = URL.createObjectURL(new Blob([layout.svg], { type: 'image/svg+xml' })); setPreview(url);
    }).catch(() => { if (!cancelled) setPreviewError('Template preview is unavailable.'); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [editor]);
  return { preview, previewError };
}
