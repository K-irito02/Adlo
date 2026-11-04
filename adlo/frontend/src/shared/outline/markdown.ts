import type { OutlineDraft } from './types';

function cleanMarkdownHeadingLabel(value: string): string {
  return value
    .trim()
    .replace(/\s+#+\s*$/, '')
    .trim();
}

export function pushMarkdownOutline(content: string): OutlineDraft[] {
  let inFence = false;

  return content.split(/\r?\n/).flatMap((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trimStart();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence;
      return [];
    }

    if (!inFence && trimmed.startsWith('#')) {
      const hashes = trimmed.match(/^#{1,6}/)?.[0] ?? '';
      if (!hashes || trimmed[hashes.length]?.trim() !== '') {
        return [];
      }
      const label = cleanMarkdownHeadingLabel(trimmed.slice(hashes.length));
      if (!label) {
        return [];
      }
      return [{ label, kind: 'heading', line, depth: hashes.length }];
    }

    return [];
  });
}
