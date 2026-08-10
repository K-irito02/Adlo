import type { PartRecord } from '../../../kernel/types-part';

export const CONTEXT_GROUP_TOOLS = new Set(['read', 'glob', 'grep', 'list']);
export const HIDDEN_TOOLS = new Set(['todowrite']);

export interface PartRef {
  messageID: string;
  partID: string;
}
export type PartGroup =
  | { key: string; type: 'part'; ref: PartRef }
  | { key: string; type: 'context'; refs: PartRef[] };

export function isContextGroupTool(part: PartRecord): boolean {
  if (part.type !== 'tool') {
    return false;
  }
  const data = part.data as { tool?: string };
  return CONTEXT_GROUP_TOOLS.has(data.tool ?? '');
}

export function groupParts(parts: { messageID: string; part: PartRecord }[]): PartGroup[] {
  const result: PartGroup[] = [];
  let start = -1;
  const flush = (end: number) => {
    if (start < 0) {
      return;
    }
    const first = parts[start];
    if (!first) {
      start = -1;
      return;
    }
    result.push({
      key: `context:${first.part.id}`,
      type: 'context',
      refs: parts
        .slice(start, end + 1)
        .map((item) => ({ messageID: item.messageID, partID: item.part.id })),
    });
    start = -1;
  };
  parts.forEach((item, index) => {
    if (isContextGroupTool(item.part)) {
      if (start < 0) {
        start = index;
      }
      return;
    }
    flush(index - 1);
    result.push({
      key: `part:${item.messageID}:${item.part.id}`,
      type: 'part',
      ref: { messageID: item.messageID, partID: item.part.id },
    });
  });
  flush(parts.length - 1);
  return result;
}
