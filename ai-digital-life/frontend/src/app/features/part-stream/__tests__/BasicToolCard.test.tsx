import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import { BasicToolCard } from '../BasicToolCard';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
});

function wrap(children: React.ReactNode) {
  return (
    <TCopyProvider t={mockT as any} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

const mkPart = (state: { status: string; input?: unknown; output?: string; error?: string }) => ({
  id: 'p1',
  messageID: 'm1',
  sessionID: 's1',
  type: 'tool' as const,
  ordinal: 0,
  timeCreated: 0,
  data: { type: 'tool' as const, tool: 'read', callID: 'c1', state },
});

describe('BasicToolCard', () => {
  it('renders pending tool collapsed with title', () => {
    render(
      wrap(
        <BasicToolCard
          message={{ id: 'm1' } as never}
          part={mkPart({ status: 'pending', input: { path: 'a.txt' } }) as never}
        />,
      ),
    );
    expect(screen.getByText(/read/i)).toBeTruthy();
  });
  it('renders error state with ToolErrorCard', () => {
    render(
      wrap(
        <BasicToolCard
          message={{ id: 'm1' } as never}
          part={mkPart({ status: 'error', input: {}, error: 'boom' }) as never}
        />,
      ),
    );
    expect(screen.getByText(/boom/i)).toBeTruthy();
  });
});
