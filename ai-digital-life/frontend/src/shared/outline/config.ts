import type { OutlineDraft } from './types';

export function parseConfig(content: string): OutlineDraft[] {
  const sectionDepths = new Map<string, number>();
  let currentSectionDepth = 0;
  return content.split(/\r?\n/).flatMap((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      return [];
    }

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch?.[1]) {
      const parts = sectionMatch[1]
        .split('.')
        .map((part) => part.trim())
        .filter(Boolean);
      currentSectionDepth = parts.length || 1;
      sectionDepths.set(sectionMatch[1], currentSectionDepth);
      return [
        {
          label: sectionMatch[1].trim(),
          kind: 'heading',
          line,
          depth: currentSectionDepth,
        },
      ];
    }

    const entryMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (entryMatch?.[1]) {
      const value = entryMatch[2].trim();
      if (!value.startsWith('{') && !value.startsWith('[') && value !== '') {
        return [];
      }
      return [
        {
          label: entryMatch[1],
          kind: 'heading',
          line,
          depth: currentSectionDepth + 1,
        },
      ];
    }

    return [];
  });
}
