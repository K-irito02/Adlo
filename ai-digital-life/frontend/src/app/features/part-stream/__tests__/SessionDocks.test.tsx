import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import { SessionDocks } from '../SessionDocks';
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

describe('SessionDocks', () => {
  it('renders AskCard for pending questions and TurnSummary for status', () => {
    const state: SessionPartState = {
      messages: new Map(),
      partsByMessage: new Map(),
      status: 'busy',
      questions: [{ requestID: 'q1', questions: [{ text: 'Allow?' }] }],
    };
    const onReply = vi.fn();
    render(wrap(<SessionDocks state={state} onReply={onReply} />));
    expect(screen.getByText(/Allow/i)).toBeTruthy();
    fireEvent.click(screen.getByText(/Allow/i));
    expect(onReply).toHaveBeenCalledWith('q1', ['Allow?']);
  });
});
