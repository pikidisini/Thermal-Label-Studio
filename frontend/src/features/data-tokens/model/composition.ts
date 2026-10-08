export type CompositionPart = { kind: 'field' | 'literal'; value: string };

export function parseComposition(template: string): CompositionPart[] {
  const parts: CompositionPart[] = [];
  const pattern = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;
  let position = 0;
  for (const match of template.matchAll(pattern)) {
    if (match.index! > position) parts.push({ kind: 'literal', value: template.slice(position, match.index) });
    parts.push({ kind: 'field', value: match[1] });
    position = match.index! + match[0].length;
  }
  if (position < template.length) parts.push({ kind: 'literal', value: template.slice(position) });
  return parts;
}

export function compileComposition(parts: CompositionPart[]): string {
  return parts.map((part) => part.kind === 'field' ? `{{${part.value}}}` : part.value).join('');
}

export function compositionFields(template: string): string[] {
  return parseComposition(template).filter((part) => part.kind === 'field').map((part) => part.value);
}
