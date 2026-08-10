import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import { PartTimeline } from '../PartTimeline';
import type { SessionPartState } from '../partStoreTypes';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
});

function wrap(children: React.ReactNode) {
  return (
    <TCopyProvider t={mockT as never} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

function makeState(messages: { id: string; role: string; text?: string }[]): SessionPartState {
  const msgMap = new Map(
    messages.map((m) => [
      m.id,
      { id: m.id, sessionID: 's1', role: m.role, timeCreated: 0 } as never,
    ]),
  );
  const parts = new Map<string, never[]>();
  for (const m of messages) {
    if (m.text) {
      parts.set(m.id, [
        {
          id: `${m.id}-p1`,
          messageID: m.id,
          sessionID: 's1',
          type: 'text',
          ordinal: 0,
          timeCreated: 0,
          data: { type: 'text', text: m.text },
        } as never,
      ]);
    }
  }
  return { messages: msgMap, partsByMessage: parts, status: 'idle', questions: [] };
}

describe('PartTimeline', () => {
  it('renders messages with parts', () => {
    const state = makeState([
      { id: 'u1', role: 'user', text: 'hello' },
      { id: 'a1', role: 'assistant', text: 'world' },
    ]);
    const { container } = render(
      wrap(<PartTimeline state={state} userTextByMessageId={new Map([['u1', 'hello']])} />),
    );
    expect(container.textContent).toContain('hello');
    expect(container.textContent).toContain('world');
  });

  it('resolves a part-less, role-less message that is a parentID to a user row', () => {
    const state = makeState([{ id: 'a1', role: 'assistant' }]);
    state.messages.set('u1', {
      id: 'u1',
      sessionID: 's1',
      role: undefined,
      timeCreated: 0,
    } as never);
    state.partsByMessage.set('a1', [
      {
        id: 'a1-p1',
        messageID: 'a1',
        sessionID: 's1',
        type: 'text',
        ordinal: 0,
        timeCreated: 0,
        data: { type: 'text', text: 'assistant answer' },
      } as never,
    ]);
    const { container } = render(
      wrap(
        <PartTimeline
          state={state}
          userTextByMessageId={new Map([['u1', 'parent-linked prompt']])}
        />,
      ),
    );
    expect(container.textContent).toContain('parent-linked prompt');
    expect(container.textContent).toContain('assistant answer');
  });
});
