import type { OutlineDraft } from './types';

export function parsePython(content: string): OutlineDraft[] {
  const indentStack: number[] = [];
  const drafts: OutlineDraft[] = [];
  content.split(/\r?\n/).forEach((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    const indent = lineText.match(/^\s*/)?.[0]?.replace(/\t/g, '    ').length ?? 0;
    while (indentStack.length > 0 && indent <= indentStack[indentStack.length - 1]!) {
      indentStack.pop();
    }

    const classMatch = trimmed.match(/^class\s+([A-Za-z_][\w]*)/);
    if (classMatch?.[1]) {
      indentStack.push(indent);
      drafts.push({ label: classMatch[1], kind: 'class', line, depth: indentStack.length });
      return;
    }

    const functionMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][\w]*)/);
    if (functionMatch?.[1]) {
      indentStack.push(indent);
      drafts.push({ label: functionMatch[1], kind: 'function', line, depth: indentStack.length });
    }
  });
  return drafts;
}
