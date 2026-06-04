import type { StoreState } from '../StoreState';
import type {
  ConversationMessageRecord,
  ConversationSendResult,
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  AppInfo,
} from '@ai-digital-life/kernel';
import { mapPatchToEditorTab } from '../../utils/editorTabs';
import {
  sessionFallbackTitle,
  refreshConversationSlice,
  workspaceContextModeFromInfo,
  getAppCopy,
} from '../conversationUtils';
import {
  applySlashScenarioOverride,
  augmentPromptWithChips,
  chatModeToScenario,
  type MessageSendOptions,
} from '../../utils/composerSend';
import type { StoreApi } from 'zustand';
import { postMutationRefresh, captureError } from '../shared';

function createModelStreamSubscriber(
  set: StoreApi<StoreState>['setState']
): (event: DigitalLifeModelStreamEventV1) => void {
  return (event) => {
    if (event.v !== 1) return;
    set((state: StoreState) => {
      if (event.type === 'route') return { streamingActiveRunId: event.runId };
      if (event.type === 'delta') {
        const nextRunId = state.streamingActiveRunId ?? event.runId;
        if (state.streamingActiveRunId && event.runId !== state.streamingActiveRunId) return state;
        return {
          streamingActiveRunId: nextRunId,
          streamingAssistantText: state.streamingAssistantText + event.text,
        };
      }
      if (event.type === 'done')
        return {
          streamingAssistantText: '',
          streamingActiveRunId: undefined,
        };
      return state;
    });
  };
}

function createRunActivitySubscriber(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState
): (event: DigitalLifeRunActivityEventV1) => void {
  return (event) => {
    if (event.v !== 1) return;
    get().appendRunActivity(event.runId, event);
    if (event.type === 'model' && event.usage) {
      get().setRunUsage(event.runId, event.usage);
    }
  };
}

type SlashCommandHandler = (
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState
) => Promise<boolean> | boolean;

const slashCommandRegistry = new Map<string, SlashCommandHandler>();

function registerSlashCommand(command: string, handler: SlashCommandHandler): void {
  slashCommandRegistry.set(command, handler);
}

registerSlashCommand('/apply', async (set, get) => {
  const ps = get().activePatchSet;
  if (ps) {
    await get().applyPatchSet(ps.id);
  } else {
    captureError(get, getAppCopy(get().appInfo).patchesNoneApplyable);
  }
  return true;
});

registerSlashCommand('/rollback', async (set, get) => {
  const ps = get().activePatchSet;
  if (ps) {
    await get().rollbackPatchSet(ps.id);
  } else {
    captureError(get, getAppCopy(get().appInfo).patchesNoneRollback);
  }
  return true;
});

registerSlashCommand('/model', (set, get) => {
  get().setActiveRightTool('models');
  return true;
});

registerSlashCommand('/clear', (set, get) => {
  captureError(get, getAppCopy(get().appInfo).clearCommandNotImplemented);
  return true;
});

async function dispatchSlashCommand(
  trimmed: string,
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState
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
  get: () => StoreState
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
    sessionDetails: state.sessionDetails,
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
    sendMessage: async (content: string, options?: MessageSendOptions) => {
      if (!content.trim()) return;
      const trimmed = content.trim();

      const isHandled = await dispatchSlashCommand(trimmed, set, get);
      if (isHandled) return;

      const mode = options?.mode ?? get().chatMode ?? 'ask';
      const baseScenario = chatModeToScenario(mode);
      const locale = get().appInfo?.config.language === 'en-US' ? 'en-US' : 'zh-CN';
      const withChips = augmentPromptWithChips(content, options?.chips, locale);
      const { scenario, prompt } = applySlashScenarioOverride(withChips, baseScenario, locale);

      set({
        streamingAssistantText: '',
        streamingActiveRunId: undefined,
        error: undefined,
      });

      let sessionId = get().activeSessionId;

      if (!sessionId) {
        const created = await window.digitalLife.conversation.createSession(
          sessionFallbackTitle(get().appInfo)
        );
        if (!created.ok) {
          captureError(get, created.error);
          return;
        }
        sessionId = created.data.id;
      }

      const unsubscribe = window.digitalLife.subscribeModelStream(createModelStreamSubscriber(set));

      const unsubscribeRunActivity = window.digitalLife.subscribeRunActivity(
        createRunActivitySubscriber(set, get)
      );

      try {
        const result = await window.digitalLife.conversation.sendMessage({
          sessionId,
          content: prompt,
          scenario,
        });
        if (!result.ok) {
          captureError(get, result.error);
          return;
        }

        const appInfoResult = await window.digitalLife.app.getInfo();
        const nextAppInfo = appInfoResult.ok ? appInfoResult.data : get().appInfo;

        await refreshAfterSend(sessionId, result, nextAppInfo, set, get);
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

    cancelActiveStream: async () => {
      const runId = get().streamingActiveRunId;
      if (!runId) return;
      const result = await window.digitalLife.conversation.cancelMessage(runId);
      if (!result.ok) captureError(get, result.error);
    },
  };
}
