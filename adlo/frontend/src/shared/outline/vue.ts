import type { OutlineDraft } from './types';
import { parseBraceLanguage } from './brace';
import { parseCss } from './css';
import { parseHtml } from './html';

export function parseVue(content: string): OutlineDraft[] {
  const drafts: OutlineDraft[] = [];
  const lines = content.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    const match = line.match(/^\s*<(template|script|style)([^>]*)>/i);
    if (!match?.[1]) {
      index += 1;
      continue;
    }

    const section = match[1].toLowerCase();
    const startLine = index + 1;
    const endTag = new RegExp(`</${section}>`, 'i');
    let endIndex = index + 1;
    while (endIndex < lines.length && !endTag.test(lines[endIndex]!)) {
      endIndex += 1;
    }

    drafts.push({
      label: section,
      kind: 'heading',
      line: startLine,
      depth: 1,
    });

    const innerContent = lines.slice(index + 1, endIndex).join('\n');
    const innerDrafts =
      section === 'template'
        ? parseHtml(innerContent)
        : section === 'style'
          ? parseCss(innerContent)
          : parseBraceLanguage(innerContent, { includeObjectProperties: true });

    for (const draft of innerDrafts) {
      drafts.push({
        ...draft,
        line: draft.line + startLine,
        depth: draft.depth + 1,
      });
    }

    index = endIndex + 1;
  }

  return drafts;
}
