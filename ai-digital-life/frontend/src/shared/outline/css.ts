import type { OutlineDraft } from './types';
import { countChars } from './utils';

export function parseCss(content: string): OutlineDraft[] {
  let braceDepth = 0;
  return content.split(/\r?\n/).flatMap((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      return [];
    }
    const sanitized = lineText.replace(/\/\*.*?\*\//g, '');
    const items: OutlineDraft[] = [];
    const openIndex = sanitized.indexOf('{');
    if (openIndex >= 0) {
      const label = sanitized.slice(0, openIndex).trim();
      if (label && !label.includes(':')) {
        items.push({
          label,
          kind: 'heading',
          line,
          depth: Math.max(1, braceDepth + 1),
        });
      }
    }
    braceDepth = Math.max(0, braceDepth + countChars(sanitized, '{') - countChars(sanitized, '}'));
    return items;
  });
}
