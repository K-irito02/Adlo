import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import { PartDiffPanel } from '../PartDiffPanel';

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

describe('PartDiffPanel', () => {
  it('renders patch file list', () => {
    const { container } = render(
      wrap(
        <PartDiffPanel
          part={
            {
              id: 'p1',
              messageID: 'm1',
              sessionID: 's1',
              type: 'patch',
              ordinal: 0,
              timeCreated: 0,
              data: { type: 'patch', hash: 'abc', files: ['a.txt', 'b.ts'] },
            } as never
          }
        />,
      ),
    );
    expect(container.textContent).toContain('a.txt');
    expect(container.textContent).toContain('b.ts');
  });
});
