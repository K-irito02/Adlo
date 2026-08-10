import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import { SessionFileTabs } from '../SessionFileTabs';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
});

describe('SessionFileTabs', () => {
  it('renders session file tabs', () => {
    render(
      <TCopyProvider t={mockT as never} locale="en-US">
        <SessionFileTabs
          files={[
            { url: 'file:///a.txt', filename: 'a.txt' },
            { url: 'file:///b.ts', filename: 'b.ts' },
          ]}
        />
      </TCopyProvider>,
    );
    expect(screen.getByText('a.txt')).toBeTruthy();
    expect(screen.getByText('b.ts')).toBeTruthy();
  });
});
