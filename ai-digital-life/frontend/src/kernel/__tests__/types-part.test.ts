import { describe, expect, it } from 'vitest';
import type { PartRecord, PartType, ToolState, PartData } from '../types-part';

describe('types-part wire shapes', () => {
  it('PartType kebab-case values', () => {
    const types: PartType[] = [
      'text',
      'reasoning',
      'tool',
      'file',
      'step-start',
      'step-finish',
      'patch',
      'snapshot',
    ];
    expect(types).toContain('text');
    expect(types).toContain('step-start');
  });

  it('ToolState discriminated on status', () => {
    const state: ToolState = {
      status: 'completed',
      input: { path: 'a.txt' },
      output: 'ok',
      title: undefined,
      metadata: {},
      time: { start: 1700000000000, end: 1700000001000 },
    };
    expect(state.status).toBe('completed');
  });

  it('PartData tagged on type', () => {
    const part: PartData = { type: 'text', text: 'hello' };
    expect(part.type).toBe('text');
  });

  it('PartRecord camelCase wire', () => {
    const rec: PartRecord = {
      id: 'p1',
      messageID: 'm1',
      sessionID: 's1',
      type: 'tool',
      ordinal: 0,
      timeCreated: 1700000000000,
      data: { type: 'tool', tool: 'read', callID: 'c1', state: { status: 'pending', input: {} } },
    };
    expect(rec.messageID).toBe('m1');
    expect(rec.sessionID).toBe('s1');
    expect(rec.timeCreated).toBe(1700000000000);
  });
});
