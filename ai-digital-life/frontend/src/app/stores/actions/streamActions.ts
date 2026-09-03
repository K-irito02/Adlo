import type { StoreState } from '../StoreState';
import type {
  ConversationSendResult,
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  AppInfo,
} from '@ai-digital-life/kernel';

/**
 * Safety net for the converged send flow: the ad-server `send_message` ack
 * returns the moment the agent loop spawns, and the loop streams for 1-30s+
 * afterwards. `sendMessage` keeps the model/run-activity subscriptions alive
 * until the run reaches a terminal state; this bounds that wait so a runaway
 * or never-terminating loop cannot leak an open EventSource forever.
 */
const SEND_MESSAGE_TERMINAL_TIMEOUT_MS = 5 * 60 * 1000;
import { mapPatchToEditorTab } from '@utils/editorTabs';
import {
  sessionFallbackTitle,
  refreshConversationSlice,
  workspaceContextModeFromInfo,
} from '../conversationUtils';
import { loadLocale } from '@app/i18n/i18nLoader';
import {
  applySlashScenarioOverride,
  augmentPromptWithChips,
  chatModeToScenario,
  type MessageSendOptions,
} from '@utils/composerSend';
import type { StoreApi } from 'zustand';
import { postMutationRefresh, captureError } from '../shared';
const SCOPE = 'stream';

function createModelStreamSubscriber(
  set: StoreApi<StoreState>['setState'],
): (event: DigitalLifeModelStreamEventV1) => void {
  return (event) => {
    if (event.v !== 1) {
      return;
    }
    set((state: StoreState) => {
      if (event.type === 'route') {
        return { streamingActiveRunId: event.runId };
      }
      if (event.type === 'delta') {
        const nextRunId = state.streamingActiveRunId ?? event.runId;
        if (state.streamingActiveRunId && event.runId !== state.streamingActiveRunId) {
          return state;
        }
        return {
          streamingActiveRunId: nextRunId,
          streamingAssistantText: state.streamingAssistantText + event.text,
        };
      }
      if (event.type === 'done') {
        return {
          streamingAssistantText: '',
          streamingActiveRunId: undefined,
        };
      }
      return state;
    });
  };
}

function createRunActivitySubscriber(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
): (event: DigitalLifeRunActivityEventV1) => void {
  return (event) => {
    if (event.v !== 1) {
      return;
    }
    get().appendRunActivity(event.runId, event);
    if (event.type === 'model' && event.usage) {
      get().setRunUsage(event.runId, event.usage);
    }
  };
}

type SlashCommandHandler = (
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) => Promise<boolean> | boolean;

const slashCommandRegistry = new Map<string, SlashCommandHandler>();

function registerSlashCommand(command: string, handler: SlashCommandHandler): void {
  slashCommandRegistry.set(command, handler);
}

function localeFrom(get: () => StoreState) {
  return get().appInfo?.config.language === 'en-US' ? 'en-US' : 'zh-CN';
}

registerSlashCommand('/apply', async (set, get) => {
  const ps = get().activePatchSet;
  if (ps) {
    await get().applyPatchSet(ps.id);
  } else {
    const dict = await loadLocale(localeFrom(get));
    captureError(get, dict.patchesNoneApplyable, SCOPE);
  }
  return true;
});

registerSlashCommand('/rollback', async (set, get) => {
  const ps = get().activePatchSet;
  if (ps) {
    await get().rollbackPatchSet(ps.id);
  } else {
    const dict = await loadLocale(localeFrom(get));
    captureError(get, dict.patchesNoneRollback, SCOPE);
  }
  return true;
});

registerSlashCommand('/model', (set, get) => {
  get().setActiveRightTool('settings');
  get().setActiveSettingsGroup('general');
  return true;
});

registerSlashCommand('/clear', async (set, get) => {
  const dict = await loadLocale(localeFrom(get));
  captureError(get, dict.clearCommandNotImplemented, SCOPE);
  return true;
});

registerSlashCommand('/plan', async (_set, get) => {
  const workspaceId = get().appInfo?.currentWorkspace?.id;
  const workspaceRoot = get().appInfo?.currentWorkspace?.rootPath;
  if (!workspaceId || !workspaceRoot) {
    captureError(get, 'No active workspace: cannot enter plan mode', SCOPE);
    return true;
  }
  await get().enterPlanMode(workspaceId, workspaceRoot);
  return true;
});

async function dispatchSlashCommand(
  trimmed: string,
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
): Promise<boolean> {
  const handler = slashCommandRegistry.get(trimmed);
  if (handler) {
    const result = handler(set, get);
    return result instanceof Promise ? await result : result;
  }
  return false;
}

async function refreshAfterSend(
  sessionId: string,
  result: { data: ConversationSendResult },
  nextAppInfo: AppInfo | undefined,
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  const conversationState = await refreshConversationSlice(sessionId);

  const nextState: Partial<StoreState> = {
    appInfo: nextAppInfo,
    sessions: conversationState.sessions,
    activeSessionId: conversationState.activeSessionId,
    activeRun: result.data.runDetail,
    activePatchSet: result.data.patchSet,
    openTabs: result.data.patchSet?.filePatches.map(mapPatchToEditorTab) ?? get().openTabs,
    selectedFilePath: result.data.patchSet?.filePatches[0]?.relativePath,
    streamingAssistantText: '',
    streamingActiveRunId: undefined,
    workspaceContextMode: workspaceContextModeFromInfo(nextAppInfo),
  };

  if (result.data.patchSet?.filePatches[0]?.relativePath) {
    await get().openFile(result.data.patchSet.filePatches[0].relativePath);
  }

  set((state: StoreState) => ({
    ...nextState,
    // Carry the refreshed detail into `sessionDetails` so the S1 message list
    // (which renders `ConversationDetail.messages`) shows the user message
    // immediately and, after the run completes, the persisted assistant reply.
    sessionDetails: conversationState.detail
      ? { ...state.sessionDetails, [sessionId]: conversationState.detail }
      : state.sessionDetails,
  }));

  if (nextAppInfo?.currentWorkspace) {
    await postMutationRefresh(get);
  } else {
    set({
      indexingStatus: undefined,
      repoMap: [],
      gitSnapshot: undefined,
      gitBranches: [],
    });
  }
}

export function createStreamActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [sendMessage - 发送 AI 对话消息，支持流式响应、补丁应用和快捷命令]
     * @reads workspaceSlice.appInfo, sessionSlice.activeSessionId
     * @writes store.streamingAssistantText, store.streamingActiveRunId, store.appInfo, sessionSlice.sessions, sessionSlice.activeSessionId, store.activeRun, patchSlice.activePatchSet, editorSlice.openTabs, editorSlice.selectedFilePath, workspaceSlice.workspaceContextMode
     * @see shared/ipc.ts → conversation.createSession, conversation.sendMessage, app.getInfo, patch.getPatchSet, patch.applyPatchSet, subscribeModelStream, subscribeRunActivity
     * @see mock-bridge.ts → conversation.createSession, conversation.sendMessage, app.getInfo, patch.getPatchSet, patch.applyPatchSet, subscribeModelStream, subscribeRunActivity
     * @see preview-bridge/index.ts → conversation.createSession, conversation.sendMessage, app.getInfo, patch.getPatchSet, patch.applyPatchSet, subscribeModelStream, subscribeRunActivity
     */
    sendMessage: async (content: string, options?: MessageSendOptions) => {
      if (!content.trim()) {
        return;
      }
      const trimmed = content.trim();

      const isHandled = await dispatchSlashCommand(trimmed, set, get);
      if (isHandled) {
        return;
      }

      const mode = options?.mode ?? get().chatMode ?? 'ask';
      const baseScenario = chatModeToScenario(mode);
      const locale = get().appInfo?.config.language === 'en-US' ? 'en-US' : 'zh-CN';
      const withChips = await augmentPromptWithChips(content, options?.chips, locale);
      const { scenario, prompt } = await applySlashScenarioOverride(
        withChips,
        baseScenario,
        locale,
      );

      set({
        streamingAssistantText: '',
        streamingActiveRunId: undefined,
      });

      let sessionId = get().activeSessionId;

      if (!sessionId) {
        const created = await window.digitalLife.conversation.createSession(
          await sessionFallbackTitle(get().appInfo),
        );
        if (!created.ok) {
          captureError(get, created.error, SCOPE);
          return;
        }
        sessionId = created.data.id;
      }

      // The ad-server `send_message` handler returns its ack the moment the
      // loop spawns; the loop then streams for 1-30s+. The demo simulator
      // instead resolves its `sendMessage` promise at `finish` — its terminal
      // events fire DURING the `await sendMessage` below, before `runId` is
      // known. To mirror that contract on the converged path we keep the two
      // subscriptions open past the ack and track which runIds have reached a
      // terminal state, then wait for OUR runId's `run-done` when it has not
      // already fired.
      //
      // `run-done` is the terminal signal (not the model `done`): the server
      // persists the assistant reply (`persist_assistant_reply`) BEFORE it
      // publishes the terminal `session.status` that synthesizes `run-done`, so
      // waiting on it guarantees the refreshed session detail contains the
      // assistant reply.
      const terminalRunIds = new Set<string>();
      let runId: string | undefined;
      let resolveTerminal: (() => void) | undefined;
      const terminalPromise = new Promise<void>((resolve) => {
        resolveTerminal = resolve;
      });
      const markTerminal = (id: string) => {
        terminalRunIds.add(id);
        // The normal path keys `run-done` by the run id (Finding 3). When the
        // loop errors before publishing any message events, no run id is
        // learned and `run-done` falls back to the session id — accept both.
        if (runId && (id === runId || id === sessionId)) {
          resolveTerminal?.();
        }
      };

      const modelSubscriber = createModelStreamSubscriber(set);
      const runActivitySubscriber = createRunActivitySubscriber(set, get);
      const unsubscribe = window.digitalLife.subscribeModelStream((event) => {
        modelSubscriber(event);
      });
      const unsubscribeRunActivity = window.digitalLife.subscribeRunActivity((event) => {
        runActivitySubscriber(event);
        if (event.v === 1 && event.type === 'run-done') {
          markTerminal(event.runId);
        }
      });

      try {
        const { selectedProviderId, selectedModelId } = get();
        const result = await window.digitalLife.conversation.sendMessage({
          sessionId,
          content: prompt,
          scenario,
          ...(selectedProviderId && selectedModelId
            ? {
                providerId: selectedProviderId,
                modelId: selectedModelId,
              }
            : {}),
        });
        if (!result.ok) {
          captureError(get, result.error, SCOPE);
          return;
        }
        runId = result.data.runDetail.run.id;

        const appInfoResult = await window.digitalLife.app.getInfo();
        const nextAppInfo = appInfoResult.ok ? appInfoResult.data : get().appInfo;

        await refreshAfterSend(sessionId, result, nextAppInfo, set, get);

        // Keep the stream subscriptions alive until the run reaches a terminal
        // state (with a safety-net timeout so a runaway loop cannot leak the
        // EventSource forever). The demo path already fired the terminal event
        // during `await sendMessage` above, so `terminalRunIds` has the id and
        // we skip the wait. On the converged path the loop streams on and the
        // terminal event arrives over SSE later.
        if (!terminalRunIds.has(runId)) {
          await Promise.race([
            terminalPromise,
            new Promise<void>((resolve) => setTimeout(resolve, SEND_MESSAGE_TERMINAL_TIMEOUT_MS)),
          ]);
        }

        // The loop persists the assistant reply as a `ConversationMessageRecord`
        // when it finishes, so refresh the session detail one more time — the
        // earlier `refreshAfterSend` ran right after the ack, before the reply
        // existed. This makes the assistant message appear in the S1 message list.
        if (get().activeSessionId === sessionId) {
          const conversationState = await refreshConversationSlice(sessionId);
          set((state: StoreState) => ({
            sessions: conversationState.sessions,
            activeSessionId: conversationState.activeSessionId,
            sessionDetails: conversationState.detail
              ? { ...state.sessionDetails, [sessionId]: conversationState.detail }
              : state.sessionDetails,
          }));
        }
      } finally {
        unsubscribe();
        unsubscribeRunActivity();
        const hadStreaming = get().streamingAssistantText;
        if (hadStreaming) {
          set({
            streamingAssistantText: '',
            streamingActiveRunId: undefined,
          });
        }
      }
    },

    /**
     * [cancelActiveStream - 取消当前运行中的 AI 流式请求]
     * @reads store.streamingActiveRunId
     * @writes — (通过后端取消间接更新)
     * @see shared/ipc.ts → conversation.cancelMessage
     * @see mock-bridge.ts → conversation.cancelMessage
     * @see preview-bridge/index.ts → conversation.cancelMessage
     */
    cancelActiveStream: async () => {
      const runId = get().streamingActiveRunId;
      if (!runId) {
        return;
      }
      const result = await window.digitalLife.conversation.cancelMessage(runId);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
      }
    },
  };
}
