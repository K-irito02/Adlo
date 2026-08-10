import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import { TurnSummary } from '../TurnSummary';

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

describe('TurnSummary', () => {
  it('renders error status', () => {
    const { container } = render(wrap(<TurnSummary status="error" />));
    expect(container.textContent).not.toBe('');
  });
  it('renders completed status', () => {
    const { container } = render(wrap(<TurnSummary status="completed" />));
    expect(container.textContent).not.toBe('');
  });
});
