import type { OutlineDraft } from './types';

export function parseSql(content: string): OutlineDraft[] {
  let insideCreateTable = false;
  const drafts: OutlineDraft[] = [];
  for (const [index, lineText] of content.split(/\r?\n/).entries()) {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('--')) {
      continue;
    }

    const createTableMatch = trimmed.match(/^create\s+table\s+([A-Za-z0-9_."]+)/i);
    if (createTableMatch?.[1]) {
      drafts.push({
        label: `table ${createTableMatch[1].replace(/"/g, '')}`,
        kind: 'type',
        line,
        depth: 1,
      });
      insideCreateTable = true;
      continue;
    }

    const createOtherMatch = trimmed.match(
      /^create\s+(view|index|function|procedure)\s+([A-Za-z0-9_."]+)/i,
    );
    if (createOtherMatch?.[2]) {
      drafts.push({
        label: `${createOtherMatch[1].toLowerCase()} ${createOtherMatch[2].replace(/"/g, '')}`,
        kind: createOtherMatch[1].toLowerCase() === 'function' ? 'function' : 'heading',
        line,
        depth: 1,
      });
      insideCreateTable = false;
      continue;
    }

    const alterMatch = trimmed.match(/^alter\s+table\s+([A-Za-z0-9_."]+)/i);
    if (alterMatch?.[1]) {
      drafts.push({
        label: `alter ${alterMatch[1].replace(/"/g, '')}`,
        kind: 'heading',
        line,
        depth: 1,
      });
      insideCreateTable = false;
      continue;
    }

    if (insideCreateTable) {
      if (/^\)\s*;?$/.test(trimmed)) {
        insideCreateTable = false;
        continue;
      }
      const columnMatch = trimmed.match(/^([A-Za-z_"][\w"]*)\s+[A-Za-z_]/);
      if (columnMatch?.[1]) {
        drafts.push({
          label: columnMatch[1].replace(/"/g, ''),
          kind: 'property',
          line,
          depth: 2,
        });
      }
    }
  }
  return drafts;
}
