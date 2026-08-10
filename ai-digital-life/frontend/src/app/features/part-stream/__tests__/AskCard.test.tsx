import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import { AskCard } from '../AskCard';

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

describe('AskCard', () => {
  it('renders question options and replies on select', () => {
    const onReply = vi.fn();
    render(
      wrap(
        <AskCard
          requestID="r1"
          questions={[{ text: 'Option A' }, { text: 'Option B' }]}
          onReply={onReply}
        />,
      ),
    );
    expect(screen.getByText(/Option A/i)).toBeTruthy();
    fireEvent.click(screen.getByText(/Option A/i));
    expect(onReply).toHaveBeenCalledWith('r1', ['Option A']);
  });
});
