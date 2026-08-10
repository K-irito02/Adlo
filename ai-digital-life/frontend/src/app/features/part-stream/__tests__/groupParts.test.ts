import { describe, expect, it } from 'vitest';
import { groupParts } from '../groupParts';

const mk = (id: string, tool?: string) => ({
  messageID: 'm1',
  part: {
    id,
    messageID: 'm1',
    sessionID: 's1',
    type: 'tool' as const,
    ordinal: 0,
    timeCreated: 0,
    data: tool
      ? {
          type: 'tool' as const,
          tool,
          callID: id,
          state: { status: 'completed' as const, input: {}, output: '', time: { start: 0 } },
        }
      : { type: 'text' as const, text: '' },
  },
});

describe('groupParts', () => {
  it('groups consecutive context tools (read/glob/grep/list) into one context group', () => {
    const groups = groupParts([
      mk('p1', 'read'),
      mk('p2', 'glob'),
      mk('p3', 'grep'),
      mk('p4', 'text'),
    ]);
    expect(groups[0].type).toBe('context');
    if (groups[0].type === 'context') {
      expect(groups[0].refs).toHaveLength(3);
    }
    expect(groups[1].type).toBe('part');
  });

  it('single text part is a part group', () => {
    const groups = groupParts([mk('p1', undefined)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('part');
  });
});
