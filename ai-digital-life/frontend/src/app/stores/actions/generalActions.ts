import type { StoreState } from "../StoreState";
import type {
  AppPreferencePatch,
} from "@ai-digital-life/kernel";
import { themeController } from "../../utils/theme";
import { createEditorTab } from "../../utils/editorTabs";
import { loadConversationState, loadTaskCenterState } from "../loaders";
import { workspaceContextModeFromInfo } from "../conversationUtils";
import {
  workspaceRequestSeq,
  queueLowPriorityRefresh,
} from "../shared";
import type { StoreApi } from "zustand";

export function createGeneralActions(set: StoreApi<StoreState>["setState"], get: () => StoreState) {
  return {
    bootstrap: async () => {
      const requestSeq = workspaceRequestSeq;

      const [appInfoResult, recentResult, modelHealthResult] = await Promise.all([
        window.digitalLife.app.getInfo(),
        window.digitalLife.workspace.listRecent(),
        window.digitalLife.app.getModelHealth(),
      ]);
      if (requestSeq !== workspaceRequestSeq) return;

      if (!appInfoResult.ok) {
        set({ loading: false, error: appInfoResult.error.message });
        return;
      }

      const [conversationState, taskCenter] = await Promise.all([
        loadConversationState(),
        loadTaskCenterState(),
      ]);
      if (requestSeq !== workspaceRequestSeq) return;

      const recentWorkspaces = recentResult.ok ? recentResult.data : [];
    // 为右侧面板设置默认展开所有可见工作区
    const visibleWorkspaces = recentWorkspaces.filter(
      (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
    );

    const nextState: Partial<StoreState> = {
      appInfo: appInfoResult.data,
      modelHealth: modelHealthResult.ok ? modelHealthResult.data : undefined,
      recentWorkspaces,
      sessions: conversationState.sessions,
      activeSessionId: conversationState.activeSessionId,
      sessionDetails: conversationState.detail
        ? { [conversationState.detail.session.id]: conversationState.detail }
        : {},
      taskCenter,
      workspaceContextMode: workspaceContextModeFromInfo(appInfoResult.data),
      loading: false,
      dirtyEditorPaths: [],
    };

      void window.digitalLife.workspace.setEditorDirtyPaths([]);

      if (appInfoResult.data.currentWorkspace) {
        const patchBlock = conversationState.detail?.messages.length
          ? conversationState.detail.messages
              .flatMap((message: any) => message.blocks)
              .find((block: any) => block.type === "patch-summary")
          : undefined;

        const patchPromise =
          patchBlock?.type === "patch-summary"
            ? window.digitalLife.patch.getPatchSet(patchBlock.patchSetId)
            : null;

        const [gitStatusResult, patchResult] = await Promise.all([
          window.digitalLife.workspace.getGitStatus(),
          patchPromise,
        ]);
        if (requestSeq !== workspaceRequestSeq) return;

        const gitSnapshot = gitStatusResult.ok ? gitStatusResult.data : undefined;
        const gitSnapshots: Record<string, any> = {};
        if (gitSnapshot && appInfoResult.data.currentWorkspace) {
          gitSnapshots[appInfoResult.data.currentWorkspace.id] = gitSnapshot;
        }

        const appInfoWithGitSnapshot =
          gitSnapshot && appInfoResult.data.currentWorkspace
            ? {
                ...appInfoResult.data,
                currentWorkspace: {
                  ...appInfoResult.data.currentWorkspace,
                  gitSnapshot,
                },
              }
            : appInfoResult.data;

        set({
          ...nextState,
          appInfo: appInfoWithGitSnapshot,
          workspaceTrees: {},
          gitSnapshot,
          gitSnapshots,
          dirtyEditorPaths: [],
          error: undefined,
        });

        if (patchResult?.ok) {
          const initialPath =
            patchResult.data?.filePatches[0]?.relativePath;
          set({
            activePatchSet: patchResult.data,
            selectedFilePath: initialPath,
            selectedChangePreviewPath: undefined,
            changePreview: undefined,
            changePreviewLoading: false,
            openTabs: initialPath ? [createEditorTab(initialPath)] : [],
          });
        }

        queueLowPriorityRefresh(async () => {
          if (requestSeq !== workspaceRequestSeq) return;
          const results = await Promise.allSettled([
            get().fetchIndexStatus(),
            get().fetchAuditEntries(40),
            get().fetchCommandHistory(),
            get().fetchGitBranches(),
            // 懒加载可见工作区的文件树和变更状态
            ...visibleWorkspaces.map((w) => get().loadWorkspaceTree(w.id, w.path)),
            ...visibleWorkspaces.map((w) => get().loadGitSnapshot(w.id, w.path)),
          ]);
          const errors = results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason);
          if (errors.length > 0) {
            console.warn("[bootstrap] Low-priority refresh failures:", errors);
          }
        });
        return;
      }

      set({
        ...(nextState as StoreState),
        dirtyEditorPaths: [],
        openTabs: [],
        selectedFilePath: undefined,
        selectedChangePreviewPath: undefined,
        changePreview: undefined,
        changePreviewLoading: false,
        fileContent: undefined,
        fileLastModifiedAt: undefined,
        outline: [],
        indexingStatus: undefined,
        repoMap: [],
        auditEntries: [],
        commandHistory: [],
        gitSnapshot: undefined,
        gitSnapshots: {},
        gitBranches: [],
        searchQuery: "",
        searchResults: [],
        externalFileChange: undefined,
      });
    },

    updatePreferences: async (patch: AppPreferencePatch) => {
      const result = await window.digitalLife.app.updatePreferences(patch);
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      themeController.setTheme({
        mode: result.data.config.themeMode,
        resolvedTheme: result.data.config.resolvedTheme,
      });
      themeController.hydrate();
      set((state: StoreState) => ({
        appInfo: result.data,
        sessions: state.sessions,
      }));
      if (patch.modelPreferences) await get().refreshModelHealth();
    },


  };
}
