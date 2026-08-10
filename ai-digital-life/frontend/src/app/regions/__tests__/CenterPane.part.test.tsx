import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import type { PartState } from '../../features/part-stream/partStoreTypes';
import type { ConversationDetail } from '../../../kernel/types-conversation';
import type { DigitalLifeBridge } from '../../../shared/ipc/digital-life';
import { CenterPane } from '../CenterPane';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

const SESSION_ID = 's1';
const USER_MESSAGE_ID = 'msg-user-1';
const ASSISTANT_MESSAGE_ID = 'run-1';

/** Part-store state hydrated from the S1 `GET /session/{id}/message` history. */
function makePartState(): PartState {
  return {
    [SESSION_ID]: {
      messages: new Map([
        [
          USER_MESSAGE_ID,
          { id: USER_MESSAGE_ID, sessionID: SESSION_ID, role: 'user', timeCreated: 1 },
        ],
        [
          ASSISTANT_MESSAGE_ID,
          {
            id: ASSISTANT_MESSAGE_ID,
            sessionID: SESSION_ID,
            role: 'assistant',
            parentID: USER_MESSAGE_ID,
            timeCreated: 2,
          },
        ],
      ]),
      partsByMessage: new Map([
        [
          ASSISTANT_MESSAGE_ID,
          [
            {
              id: 'p-text',
              messageID: ASSISTANT_MESSAGE_ID,
              sessionID: SESSION_ID,
              type: 'text',
              ordinal: 0,
              timeCreated: 3,
              data: { type: 'text', text: 'Building feature X' },
            },
            {
              id: 'p-tool',
              messageID: ASSISTANT_MESSAGE_ID,
              sessionID: SESSION_ID,
              type: 'tool',
              ordinal: 1,
              timeCreated: 4,
              data: {
                type: 'tool',
                tool: 'bash',
                callID: 'c1',
                state: {
                  status: 'completed',
                  input: { command: 'cargo test' },
                  output: 'ok',
                  time: { start: 4, end: 5 },
                },
              },
            },
          ],
        ],
      ]),
      status: 'idle',
      questions: [],
    },
  };
}

/**
 * Legacy-path detail. The user prompt text is NOT part of the Part wire
 * (MessageRecord has no content; no text part is attached to user messages).
 * It lives only on the ConversationMessageRecord the S1 bridge persists
 * (kick_agent_run), which is what the old MessageStream renders. The user
 * part-message correlates to it via the assistant hop (assistant.parentID ===
 * user msg id, ConversationMessageRecord.runId === assistant id).
 */
function makeDetail(): ConversationDetail {
  return {
    session: {
      id: SESSION_ID,
      workspaceId: 'ws-1',
      title: 'Session',
      status: 'active',
      isPinned: false,
      pinnedOrder: 0,
      unpinnedOrder: 0,
      manualUnread: false,
      createdAt: 1,
      updatedAt: 1,
      lastMessageAt: 1,
    },
    messages: [
      {
        id: 'message-user-1',
        sessionId: SESSION_ID,
        role: 'user',
        content: 'Hello there',
        blocks: [],
        runId: ASSISTANT_MESSAGE_ID,
        createdAt: 1,
      },
    ],
  };
}

let replyToQuestion: Mock;
let getSessionMessages: Mock;

beforeEach(() => {
  replyToQuestion = vi.fn().mockResolvedValue({ ok: true, data: true });
  getSessionMessages = vi.fn().mockResolvedValue({ ok: true, data: { messages: [] } });
  (window as unknown as Record<string, unknown>).digitalLife = {
    conversation: { getSessionMessages, replyToQuestion },
    subscribeSessionPartEvents: () => () => undefined,
  } as unknown as DigitalLifeBridge;

  useAppStore.setState({
    activeSessionId: SESSION_ID,
    sessionDetails: { [SESSION_ID]: makeDetail() },
    partBySession: makePartState(),
  });
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).digitalLife;
  useAppStore.setState({
    activeSessionId: undefined,
    sessionDetails: {},
    partBySession: {},
  });
});

describe('CenterPane part-stream integration (S2 Task 10)', () => {
  it('renders part-stream content (user text + text/tool parts) as the primary path', () => {
    render(
      <TestProvider>
        <CenterPane />
      </TestProvider>,
    );

    // User prompt text is sourced from the legacy ConversationMessageRecord.
    expect(screen.getByText('Hello there')).toBeTruthy();

    // Text part renders through StreamingMarkdown inside the .adl-part-scope.
    const scope = document.querySelector('.adl-part-scope');
    expect(scope).toBeTruthy();
    expect(within(scope as HTMLElement).getByText('Building feature X')).toBeTruthy();

    // Tool part renders through BasicToolCard.
    const tool = document.querySelector('.adl-part-tool');
    expect(tool).toBeTruthy();
    expect(within(tool as HTMLElement).getByText('bash')).toBeTruthy();

    // The old ConversationMessageRecord MessageStream must NOT render when the
    // Part path owns the conversation (single render, no double messages).
    expect(document.querySelector('.adl-message-stream')).toBeNull();
  });

  it('renders AskCard questions and wires onReply to conversation.replyToQuestion', () => {
    useAppStore.setState((s) => ({
      partBySession: {
        ...s.partBySession,
        [SESSION_ID]: {
          ...s.partBySession[SESSION_ID],
          questions: [{ requestID: 'q1', questions: [{ text: 'Approve change?' }] }],
        },
      },
    }));

    render(
      <TestProvider>
        <CenterPane />
      </TestProvider>,
    );

    const ask = document.querySelector('.adl-part-ask');
    expect(ask).toBeTruthy();
    const option = within(ask as HTMLElement).getByRole('button', { name: 'Approve change?' });
    fireEvent.click(option);
    expect(replyToQuestion).toHaveBeenCalledWith('q1', ['Approve change?']);
  });

  it('maps a terminal active status to the completed TurnSummary', () => {
    useAppStore.getState().partApplyEvent(SESSION_ID, {
      type: 'session.status',
      sessionID: SESSION_ID,
      status: 'active',
    });

    render(
      <TestProvider>
        <CenterPane />
      </TestProvider>,
    );

    const summary = document.querySelector('.adl-part-turn-summary');
    expect(summary).toBeTruthy();
    expect(summary?.classList.contains('adl-part-turn-summary--completed')).toBe(true);
  });

  it('falls back to the legacy MessageStream when the session has no part data', () => {
    useAppStore.setState({ partBySession: {} });

    render(
      <TestProvider>
        <CenterPane />
      </TestProvider>,
    );

    expect(document.querySelector('.adl-message-stream')).toBeTruthy();
    expect(document.querySelector('.adl-part-scope')).toBeNull();
  });
});
