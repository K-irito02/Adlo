import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../slicedStore';
import type { DigitalLifeBridge } from '../../../shared/ipc/digital-life';
import type {
  ConversationDetail,
  ConversationMessageRecord,
  ConversationSendResult,
  ConversationSessionRecord,
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
} from '@ai-digital-life/kernel';

describe('/model slash command', () => {
  beforeEach(() => {
    useAppStore.setState({ activeRightTool: 'files', activeSettingsGroup: 'general' });
  });

  afterEach(() => {
    useAppStore.setState({ activeRightTool: 'files', activeSettingsGroup: 'general' });
  });

  it('opens the settings tool with the general group', async () => {
    await useAppStore.getState().sendMessage('/model');
    expect(useAppStore.getState().activeRightTool).toBe('settings');
    expect(useAppStore.getState().activeSettingsGroup).toBe('general');
  });
});

describe('sendMessage converged round trip (Finding 1)', () => {
  const SESSION_ID = 'sess-1';
  const RUN_ID = 'run-1';

  let modelListener: ((e: DigitalLifeModelStreamEventV1) => void) | undefined;
  let activityListener: ((e: DigitalLifeRunActivityEventV1) => void) | undefined;
  let unsubscribeModel: ReturnType<typeof vi.fn>;
  let unsubscribeRunActivity: ReturnType<typeof vi.fn>;
  let sendMessageMock: ReturnType<typeof vi.fn>;
  let getSessionMock: ReturnType<typeof vi.fn>;

  const sessionRecord: ConversationSessionRecord = {
    id: SESSION_ID,
    workspaceId: 'ws-1',
    title: 's',
    status: 'active',
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    manualUnread: false,
    createdAt: 0,
    updatedAt: 0,
    lastMessageAt: 0,
  };

  const userMessage: ConversationMessageRecord = {
    id: 'msg-user',
    sessionId: SESSION_ID,
    role: 'user',
    content: 'hello',
    blocks: [],
    createdAt: 1,
  };

  const assistantMessage: ConversationMessageRecord = {
    id: RUN_ID,
    sessionId: SESSION_ID,
    role: 'assistant',
    content: 'The assistant reply.',
    blocks: [],
    runId: RUN_ID,
    createdAt: 2,
  };

  function sendResult(): ConversationSendResult {
    return {
      session: sessionRecord,
      userMessage,
      assistantMessage,
      runDetail: {
        run: {
          id: RUN_ID,
          workspaceId: 'ws-1',
          sessionId: SESSION_ID,
          prompt: 'hello',
          scenario: 'chat',
          status: 'planning',
          createdAt: 0,
          updatedAt: 0,
        },
        steps: [],
      },
      patchSet: undefined,
    };
  }

  function detail(): ConversationDetail {
    return { session: sessionRecord, messages: [userMessage, assistantMessage] };
  }

  const appInfo = {
    appName: 'test',
    version: '0.0.0',
    config: {
      themeMode: 'light' as const,
      resolvedTheme: 'light' as const,
      logLevel: 'info',
      terminalLogMode: 'overwrite' as const,
      debugLogMode: 'overwrite' as const,
      maxRecentWorkspaces: 10,
      modelPreferences: { providers: {} },
      keybinds: {},
      fonts: {},
      language: 'zh-CN',
      maxConcurrentWorkspaces: 6,
      workspacePriorityIds: [],
      workspaceDeferredIds: [],
      workspaceNaturalOrder: [],
      browserInactiveTabSuspendMs: 3_600_000,
    },
    currentWorkspace: undefined,
    recentLogs: [],
  };

  function installMockBridge() {
    unsubscribeModel = vi.fn();
    unsubscribeRunActivity = vi.fn();
    sendMessageMock = vi.fn().mockResolvedValue({ ok: true as const, data: sendResult() });
    getSessionMock = vi.fn().mockResolvedValue({ ok: true as const, data: detail() });

    (window as unknown as { digitalLife: unknown }).digitalLife = {
      subscribeModelStream: vi.fn((l: (e: DigitalLifeModelStreamEventV1) => void) => {
        modelListener = l;
        return unsubscribeModel;
      }),
      subscribeRunActivity: vi.fn((l: (e: DigitalLifeRunActivityEventV1) => void) => {
        activityListener = l;
        return unsubscribeRunActivity;
      }),
      conversation: {
        sendMessage: sendMessageMock,
        listSessions: vi.fn().mockResolvedValue({ ok: true as const, data: [sessionRecord] }),
        getSession: getSessionMock,
      },
      app: {
        getInfo: vi.fn().mockResolvedValue({ ok: true as const, data: appInfo }),
      },
    } as unknown as DigitalLifeBridge;
  }

  beforeEach(() => {
    modelListener = undefined;
    activityListener = undefined;
    installMockBridge();
    useAppStore.setState({
      activeSessionId: SESSION_ID,
      appInfo,
    });
  });

  afterEach(() => {
    delete (window as { digitalLife?: unknown }).digitalLife;
    useAppStore.setState({
      activeSessionId: undefined,
      appInfo: undefined,
      streamingAssistantText: '',
      streamingActiveRunId: undefined,
      runActivityByRunId: {},
      sessionDetails: {},
    });
  });

  it('keeps the stream subscriptions alive past the ack until the run terminal event', async () => {
    const promise = useAppStore.getState().sendMessage('hello');

    // Wait for the ack to resolve and refreshAfterSend to run — the
    // subscriptions must STILL be open (the ad-server ack returns the moment
    // the loop spawns; streaming follows for seconds after).
    await vi.waitFor(() => expect(sendMessageMock).toHaveBeenCalledTimes(1));
    expect(unsubscribeModel).not.toHaveBeenCalled();
    expect(unsubscribeRunActivity).not.toHaveBeenCalled();

    // A model delta arriving after the ack must still reach the store.
    modelListener?.({ v: 1, runId: RUN_ID, seq: 1, type: 'delta', text: 'The' });
    modelListener?.({ v: 1, runId: RUN_ID, seq: 2, type: 'delta', text: ' reply' });
    expect(useAppStore.getState().streamingAssistantText).toBe('The reply');

    // Terminal event: run-done fires, the wait resolves, sendMessage finishes.
    activityListener?.({
      v: 1,
      runId: RUN_ID,
      seq: 3,
      ts: Date.now(),
      type: 'run-done',
      status: 'succeeded',
    });
    await promise;

    expect(unsubscribeModel).toHaveBeenCalled();
    expect(unsubscribeRunActivity).toHaveBeenCalled();
  });

  it('shows the assistant reply in the session view after the run completes', async () => {
    const promise = useAppStore.getState().sendMessage('hello');
    // Let the ack resolve; then the loop reaches its terminal state.
    await vi.waitFor(() => expect(sendMessageMock).toHaveBeenCalledTimes(1));
    activityListener?.({
      v: 1,
      runId: RUN_ID,
      seq: 1,
      ts: Date.now(),
      type: 'run-done',
      status: 'succeeded',
    });
    await promise;

    const detail = useAppStore.getState().sessionDetails[SESSION_ID];
    expect(detail?.messages.some((m) => m.role === 'assistant')).toBe(true);
    const assistant = detail?.messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toBe('The assistant reply.');
  });
});
