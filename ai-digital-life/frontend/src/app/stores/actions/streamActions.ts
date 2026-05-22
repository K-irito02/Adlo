import type { StoreState } from "../StoreState";
import type { ConversationMessageRecord } from "@ai-digital-life/kernel";
import { mapPatchToEditorTab } from "../../editorTabs";
import { sessionFallbackTitle, refreshConversationSlice, workspaceContextModeFromInfo } from "../conversationUtils";
import { useUiStore } from "../../ui-store";
import {
  applySlashScenarioOverride,
  augmentPromptWithChips,
  chatModeToScenario,
  type MessageSendOptions,
} from "../../composerSend";
import type { StoreApi } from "zustand";

export function createStreamActions(set: StoreApi<StoreState>["setState"], get: () => StoreState) {
  return {
    sendMessage: async (content: string, options?: MessageSendOptions) => {
      if (!content.trim()) return;
      const trimmed = content.trim();
      if (trimmed === "/apply") {
        const ps = get().activePatchSet;
        if (ps) {
          await get().applyPatchSet(ps.id);
        } else {
          set({ error: "当前没有可应用的补丁。" });
        }
        return;
      }
      if (trimmed === "/rollback") {
        const ps = get().activePatchSet;
        if (ps) {
          await get().rollbackPatchSet(ps.id);
        } else {
          set({ error: "当前没有可回滚的补丁。" });
        }
        return;
      }
      if (trimmed === "/model") {
        useUiStore.getState().setActiveTool("models");
        return;
      }
      if (trimmed === "/clear") {
        set({
          error:
            "「/clear」尚未实现清空历史。请使用侧栏「新建会话」开始新线程，或删除当前会话。",
        });
        return;
      }
      const mode = options?.mode ?? useUiStore.getState().chatMode;
      const baseScenario = chatModeToScenario(mode);
      const withChips = augmentPromptWithChips(content, options?.chips);
      const { scenario, prompt } = applySlashScenarioOverride(
        withChips,
        baseScenario
      );
      set({
        streamingAssistantText: "",
        streamingActiveRunId: undefined,
        error: undefined,
      });
      let sessionId = get().activeSessionId;

      if (!sessionId) {
        const created = await window.digitalLife.conversation.createSession(
          sessionFallbackTitle(get().appInfo)
        );
        if (!created.ok) {
          set({ error: created.error.message });
          return;
        }
        sessionId = created.data.id;
      }

      const unsubscribe = window.digitalLife.subscribeModelStream(
        (event) => {
          if (event.v !== 1) return;
          set((state: StoreState) => {
            if (event.type === "route")
              return { streamingActiveRunId: event.runId };
            if (event.type === "delta") {
              const nextRunId = state.streamingActiveRunId ?? event.runId;
              if (state.streamingActiveRunId && event.runId !== state.streamingActiveRunId)
                return state;
              return {
                streamingActiveRunId: nextRunId,
                streamingAssistantText: state.streamingAssistantText + event.text,
              };
            }
            if (event.type === "done")
              return {
                streamingAssistantText: "",
                streamingActiveRunId: undefined,
              };
            return state;
          });
        }
      );

      const unsubscribeRunActivity = window.digitalLife.subscribeRunActivity(
        (event) => {
          if (event.v !== 1) return;
          set((state: StoreState) => {
            const runId = event.runId;
            const prev = state.runActivityByRunId[runId] ?? [];
            const next =
              prev.length > 500
                ? [...prev.slice(-400), event]
                : [...prev, event];
            const usagePatch: Partial<StoreState> = {
              runActivityByRunId: { ...state.runActivityByRunId, [runId]: next },
            };
            if (event.type === "model" && event.usage) {
              usagePatch.runUsageByRunId = {
                ...state.runUsageByRunId,
                [runId]: event.usage,
              };
            }
            return usagePatch;
          });
        }
      );

      try {
        const result = await window.digitalLife.conversation.sendMessage({
          sessionId,
          content: prompt,
          scenario,
        });
        if (!result.ok) {
          set({ error: result.error.message });
          return;
        }

        const detailResult = await window.digitalLife.conversation.getSession(
          sessionId
        );
        if (!detailResult.ok) {
          set({ error: detailResult.error.message });
          return;
        }

        const appInfoResult = await window.digitalLife.app.getInfo();
        const nextAppInfo = appInfoResult.ok ? appInfoResult.data : get().appInfo;
        const conversationState = await refreshConversationSlice(sessionId);

        const nextState: Partial<StoreState> = {
          appInfo: nextAppInfo,
          sessions: conversationState.sessions,
          activeSessionId: conversationState.activeSessionId,
          activeRun: result.data.runDetail,
          activePatchSet: result.data.patchSet,
          openTabs:
            result.data.patchSet?.filePatches.map(mapPatchToEditorTab) ??
            get().openTabs,
          selectedFilePath: result.data.patchSet?.filePatches[0]?.relativePath,
          streamingAssistantText: "",
          streamingActiveRunId: undefined,
          workspaceContextMode: workspaceContextModeFromInfo(nextAppInfo),
        };

        if (result.data.patchSet?.filePatches[0]?.relativePath) {
          await get().openFile(result.data.patchSet.filePatches[0].relativePath);
        }

        set((state: StoreState) => ({
          ...nextState,
          sessionDetails: detailResult.data
            ? {
                ...state.sessionDetails,
                [sessionId]: detailResult.data,
              }
            : state.sessionDetails,
        }));

        if (nextAppInfo?.currentWorkspace) {
          await Promise.allSettled([
            get().refreshWorkspaceTree(),
            get().fetchIndexStatus(),
            get().fetchRepoMap(),
            get().fetchGitStatus(),
            get().fetchGitBranches(),
          ]);
        } else {
          set({
            workspaceTree: [],
            indexingStatus: undefined,
            repoMap: [],
            gitSnapshot: undefined,
            gitBranches: [],
          });
        }
      } finally {
        unsubscribe();
        unsubscribeRunActivity();
        set({
          streamingAssistantText: "",
          streamingActiveRunId: undefined,
        });
      }
    },

    cancelActiveStream: async () => {
      const runId = get().streamingActiveRunId;
      if (!runId) return;
      const result = await window.digitalLife.conversation.cancelMessage(runId);
      if (!result.ok) set({ error: result.error.message });
    },
  };
}
