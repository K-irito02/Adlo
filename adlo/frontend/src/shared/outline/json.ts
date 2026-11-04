import type { OutlineDraft } from './types';
import { countChars, countLeadingClosers, stripQuotedText } from './utils';

export function parseJson(content: string): OutlineDraft[] {
  let braceDepth = 0;
  return content.split(/\r?\n/).flatMap((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed) {
      return [];
    }
    const sanitized = stripQuotedText(lineText);
    const effectiveDepth = Math.max(0, braceDepth - countLeadingClosers(sanitized, '}]'));
    const keyMatch = trimmed.match(/^"([^"]+)"\s*:\s*(.*)$/);
    const items: OutlineDraft[] = [];
    if (keyMatch?.[1]) {
      const value = keyMatch[2].trim();
      if (!value || value.startsWith('{') || value.startsWith('[')) {
        items.push({
          label: keyMatch[1],
          kind: 'heading',
          line,
          depth: effectiveDepth + 1,
        });
      }
    }
    braceDepth = Math.max(
      0,
      braceDepth + countChars(sanitized, '{[') - countChars(sanitized, '}]'),
    );
    return items;
  });
}
