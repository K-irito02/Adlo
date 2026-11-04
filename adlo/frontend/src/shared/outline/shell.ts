import type { OutlineDraft } from './types';

export function parseShell(content: string, family: 'shell' | 'powershell'): OutlineDraft[] {
  let depth = 0;
  return content.split(/\r?\n/).flatMap((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return [];
    }
    const items: OutlineDraft[] = [];

    if (trimmed.startsWith('}') || /^(fi|done|esac)\b/.test(trimmed)) {
      depth = Math.max(0, depth - 1);
    }

    const functionMatch =
      family === 'powershell'
        ? trimmed.match(/^function\s+([A-Za-z_][\w-]*)/i)
        : trimmed.match(/^(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{/);
    if (functionMatch?.[1]) {
      items.push({ label: functionMatch[1], kind: 'function', line, depth: depth + 1 });
    } else {
      const blockMatch =
        family === 'powershell'
          ? trimmed.match(/^(if|foreach|for|while|switch|try|catch|finally|class|enum)\b/i)
          : trimmed.match(/^(if|for|while|until|case|select)\b/);
      if (blockMatch?.[1]) {
        items.push({ label: trimmed, kind: 'heading', line, depth: depth + 1 });
      }
    }

    const opensBlock =
      family === 'powershell'
        ? trimmed.endsWith('{')
        : /\{\s*$/.test(trimmed) || /\b(do|then)\s*$/.test(trimmed) || /^case\b/.test(trimmed);
    if (opensBlock) {
      depth += 1;
    }

    return items;
  });
}
