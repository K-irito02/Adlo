import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import { ContextToolGroup } from '../ContextToolGroup';

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

const mk = (tool: string) => ({
  id: tool,
  messageID: 'm1',
  sessionID: 's1',
  type: 'tool' as const,
  ordinal: 0,
  timeCreated: 0,
  data: {
    type: 'tool' as const,
    tool,
    callID: tool,
    state: { status: 'completed' as const, input: {}, output: '', time: { start: 0 } },
  },
});

describe('ContextToolGroup', () => {
  it('aggregates read/glob/grep/list into one row', () => {
    const { container } = render(
      wrap(<ContextToolGroup parts={[mk('read'), mk('glob')] as never} busy={false} />),
    );
    expect(container.textContent).toContain('read');
    expect(container.textContent).toContain('glob');
  });
});
