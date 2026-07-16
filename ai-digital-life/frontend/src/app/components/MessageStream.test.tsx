import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TCopyProvider } from '../i18n/TCopyContext';
import { MessageStream } from './MessageStream';
import type { ConversationMessageRecord } from '@shared/ipc';

afterEach(cleanup);

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => {
    return typeof key === 'string' ? key : '';
  },
});

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT as any} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

function makeMessage(
  overrides: Partial<ConversationMessageRecord> = {}
): ConversationMessageRecord {
  return {
    id: 'msg-1',
    sessionId: 'session-1',
    role: 'user',
    content: 'hello',
    blocks: [],
    runId: undefined,
    createdAt: 1,
    ...overrides,
  };
}

describe('MessageStream', () => {
  it('renders without crashing when streamingText changes', () => {
    const messages = [
      makeMessage({ id: 'msg-1', role: 'user', content: 'hello', createdAt: 1 }),
      makeMessage({
        id: 'msg-2',
        role: 'assistant',
        content: 'hi there',
        createdAt: 2,
        runId: 'run-1',
      }),
    ];
    const { rerender } = render(
      <TestProvider>
        <MessageStream messages={messages} streamingText="partial" isStreaming={true} />
      </TestProvider>
    );
    // Re-render with new streamingText — should not crash
    rerender(
      <TestProvider>
        <MessageStream messages={messages} streamingText="partial response" isStreaming={true} />
      </TestProvider>
    );
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('renders historical messages', () => {
    const messages = [
      makeMessage({ id: 'msg-1', role: 'user', content: 'historical message', createdAt: 1 }),
    ];
    render(
      <TestProvider>
        <MessageStream messages={messages} streamingText="" isStreaming={false} />
      </TestProvider>
    );
    expect(screen.getByText('historical message')).toBeTruthy();
  });

  it('renders streaming text when isStreaming', () => {
    const messages = [
      makeMessage({ id: 'msg-1', role: 'user', content: 'question', createdAt: 1 }),
    ];
    render(
      <TestProvider>
        <MessageStream messages={messages} streamingText="streaming answer" isStreaming={true} />
      </TestProvider>
    );
    expect(screen.getByText('streaming answer')).toBeTruthy();
  });

  it('renders nothing when no messages and no streaming text', () => {
    const { container } = render(
      <TestProvider>
        <MessageStream messages={[]} streamingText="" isStreaming={false} />
      </TestProvider>
    );
    expect(container.firstChild).toBeNull();
  });
});
