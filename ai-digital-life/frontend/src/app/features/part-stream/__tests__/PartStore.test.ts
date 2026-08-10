import { describe, expect, it } from 'vitest';
import type { PartData } from '../../../../kernel/types-part';
import {
  createInitialPartState,
  reducePartEvent,
  hydratePartHistory,
  selectSessionMessages,
  selectSessionStatus,
} from '../PartStore';

describe('PartStore reducer', () => {
  it('message.created inserts a message', () => {
    let s = createInitialPartState();
    s = reducePartEvent(s, {
      type: 'message.created',
      sessionID: 's1',
      info: { id: 'm1', role: 'assistant' },
    });
    expect(selectSessionMessages(s, 's1').messages.size).toBe(1);
  });

  it('message.part.updated upserts a part', () => {
    let s = createInitialPartState();
    s = reducePartEvent(s, {
      type: 'message.created',
      sessionID: 's1',
      info: { id: 'm1', role: 'assistant' },
    });
    s = reducePartEvent(s, {
      type: 'message.part.updated',
      sessionID: 's1',
      messageID: 'm1',
      partID: 'p1',
      part: { ...emptyPartRecord('s1', 'm1', 'p1'), text: 'hi' },
    });
    const msgs = selectSessionMessages(s, 's1');
    expect(msgs.partsByMessage.get('m1')?.length).toBe(1);
    expect(textOf(msgs.partsByMessage.get('m1')?.[0]?.data)).toBe('hi');
  });

  it('message.part.delta appends to text part', () => {
    let s = createInitialPartState();
    s = reducePartEvent(s, {
      type: 'message.created',
      sessionID: 's1',
      info: { id: 'm1', role: 'assistant' },
    });
    s = reducePartEvent(s, {
      type: 'message.part.updated',
      sessionID: 's1',
      messageID: 'm1',
      partID: 'p1',
      part: { ...emptyPartRecord('s1', 'm1', 'p1'), text: '' },
    });
    s = reducePartEvent(s, {
      type: 'message.part.delta',
      sessionID: 's1',
      messageID: 'm1',
      partID: 'p1',
      field: 'text',
      delta: 'Hello',
    });
    s = reducePartEvent(s, {
      type: 'message.part.delta',
      sessionID: 's1',
      messageID: 'm1',
      partID: 'p1',
      field: 'text',
      delta: ' world',
    });
    const part = selectSessionMessages(s, 's1').partsByMessage.get('m1')?.[0];
    expect(textOf(part?.data)).toBe('Hello world');
  });

  it('message.part.delta appends to reasoning field', () => {
    let s = createInitialPartState();
    s = reducePartEvent(s, {
      type: 'message.created',
      sessionID: 's1',
      info: { id: 'm1', role: 'assistant' },
    });
    s = reducePartEvent(s, {
      type: 'message.part.updated',
      sessionID: 's1',
      messageID: 'm1',
      partID: 'p1',
      part: {
        ...emptyPartRecord('s1', 'm1', 'p1'),
        data: { type: 'reasoning', text: '' },
      },
    });
    s = reducePartEvent(s, {
      type: 'message.part.delta',
      sessionID: 's1',
      messageID: 'm1',
      partID: 'p1',
      field: 'reasoning',
      delta: 'think',
    });
    const part = selectSessionMessages(s, 's1').partsByMessage.get('m1')?.[0];
    expect(textOf(part?.data)).toBe('think');
  });

  it('session.status sets session status', () => {
    let s = createInitialPartState();
    s = reducePartEvent(s, { type: 'session.status', sessionID: 's1', status: 'busy' });
    expect(selectSessionStatus(s, 's1')).toBe('busy');
  });

  it('hydratePartHistory loads messages+parts', () => {
    let s = createInitialPartState();
    s = hydratePartHistory(s, 's1', {
      messages: [
        {
          message: { id: 'm1', sessionID: 's1', role: 'assistant', timeCreated: 0 },
          parts: [
            {
              id: 'p1',
              messageID: 'm1',
              sessionID: 's1',
              type: 'text',
              ordinal: 0,
              timeCreated: 0,
              data: { type: 'text', text: 'history' },
            },
          ],
        },
      ],
    });
    const msgs = selectSessionMessages(s, 's1');
    expect(msgs.messages.size).toBe(1);
    expect(textOf(msgs.partsByMessage.get('m1')?.[0]?.data)).toBe('history');
  });
});

function emptyPartRecord(sessionID: string, messageID: string, id: string) {
  return { id, messageID, sessionID, type: 'text', ordinal: 0, timeCreated: 0 };
}

function textOf(data: PartData | undefined): string | undefined {
  return data && 'text' in data ? (data as { text: string }).text : undefined;
}
