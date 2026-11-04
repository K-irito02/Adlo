import type { OutlineDraft } from './types';

export function parseYaml(content: string): OutlineDraft[] {
  const indentStack: number[] = [];
  return content.split(/\r?\n/).flatMap((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return [];
    }
    const indent = lineText.match(/^\s*/)?.[0]?.replace(/\t/g, '  ').length ?? 0;
    while (indentStack.length > 0 && indent <= indentStack[indentStack.length - 1]!) {
      indentStack.pop();
    }

    const listKeyMatch = trimmed.match(/^-+\s*([^:#]+)\s*:\s*(.*)$/);
    if (listKeyMatch?.[1]) {
      indentStack.push(indent);
      return [
        {
          label: listKeyMatch[1].trim(),
          kind: 'heading',
          line,
          depth: indentStack.length,
        },
      ];
    }

    const keyMatch = trimmed.match(/^([^:#][^:]*?)\s*:\s*(.*)$/);
    if (keyMatch?.[1]) {
      const suffix = keyMatch[2]?.trim() ?? '';
      if (
        suffix &&
        !['|', '>'].includes(suffix) &&
        !suffix.startsWith('{') &&
        !suffix.startsWith('[')
      ) {
        return [];
      }
      indentStack.push(indent);
      return [
        {
          label: keyMatch[1].trim().replace(/^['"]|['"]$/g, ''),
          kind: 'heading',
          line,
          depth: indentStack.length,
        },
      ];
    }

    if (/^-+\s*(?:\{|\[)?\s*$/.test(trimmed)) {
      indentStack.push(indent);
      return [
        {
          label: 'item',
          kind: 'heading',
          line,
          depth: indentStack.length,
        },
      ];
    }

    return [];
  });
}
