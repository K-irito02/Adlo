import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import { SessionSidePanel } from '../SessionSidePanel';
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

describe('SessionSidePanel', () => {
  it('lists session files and patches', () => {
    const state: SessionPartState = {
      messages: new Map(),
      partsByMessage: new Map([
        [
          'm1',
          [
            {
              id: 'p-file',
              messageID: 'm1',
              sessionID: 's1',
              type: 'file',
              ordinal: 0,
              timeCreated: 0,
              data: {
                type: 'file',
                mime: 'text/plain',
                filename: 'notes.md',
                url: 'file:///ws/notes.md',
              },
            },
            {
              id: 'p-patch',
              messageID: 'm1',
              sessionID: 's1',
              type: 'patch',
              ordinal: 1,
              timeCreated: 0,
              data: { type: 'patch', hash: 'abc', files: ['a.txt', 'b.ts'] },
            },
          ],
        ],
      ]),
      status: 'idle',
      questions: [],
    };
    render(wrap(<SessionSidePanel state={state} />));
    expect(screen.getByText('notes.md')).toBeTruthy();
    expect(screen.getByText('a.txt')).toBeTruthy();
    expect(screen.getByText('b.ts')).toBeTruthy();
  });
});
