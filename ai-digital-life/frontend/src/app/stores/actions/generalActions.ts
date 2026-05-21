import type { StoreState } from "../StoreState";
import type {
  AppPreferencePatch,
} from "@ai-digital-life/kernel";
import { themeController } from "../../theme";
import { createEditorTab } from "../../editorTabs";
import { loadConversationState, loadTaskCenterState } from "../../loaders";
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
      set({ error: undefined });

      const [appInfoResult, recentResult, modelHealthResult] = await Promise.all(
        [
          window.digitalLife.app.getInfo(),
          window.digitalLife.workspace.listRecent(),
          window.digitalLife.app.getModelHealth(),
        ]
      );
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

      const nextState: Partial<StoreState> = {
        appInfo: appInfoResult.data,
        modelHealth: modelHealthResult.ok ? modelHealthResult.data : undefined,
        recentWorkspaces: recentResult.ok ? recentResult.data : [],
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
        const [treeResult, gitStatusResult] = await Promise.all([
          window.digitalLife.workspace.listTree(),
          window.digitalLife.workspace.getGitStatus(),
        ]);
        if (requestSeq !== workspaceRequestSeq) return;

        const gitSnapshot = gitStatusResult.ok ? gitStatusResult.data : undefined;
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
          workspaceTree: treeResult.ok ? treeResult.data : [],
          gitSnapshot,
          dirtyEditorPaths: [],
        });

        if (conversationState.detail?.messages.length) {
          const patchBlock = conversationState.detail.messages
            .flatMap((message: any) => message.blocks)
            .find((block: any) => block.type === "patch-summary");
          if (patchBlock?.type === "patch-summary") {
            const patchResult = await window.digitalLife.patch.getPatchSet(
              patchBlock.patchSetId
            );
            if (requestSeq !== workspaceRequestSeq) return;
            if (patchResult.ok) {
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
          }
        }

        queueLowPriorityRefresh(async () => {
          if (requestSeq !== workspaceRequestSeq) return;
          await Promise.allSettled([
            get().fetchIndexStatus(),
            get().fetchAuditEntries(40),
            get().fetchCommandHistory(),
            get().fetchGitBranches(),
          ]);
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
        workspaceTree: [],
        indexingStatus: undefined,
        repoMap: [],
        auditEntries: [],
        commandHistory: [],
        gitSnapshot: undefined,
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

    decideApproval: async (approvalId: string, decision: "approved" | "rejected") => {
      const result = await window.digitalLife.task.decideApproval({
        approvalId,
        decision,
      });
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({
        taskCenter: result.data,
        latestCommandRun: undefined,
      });
      await get().fetchAuditEntries(40);
      await get().fetchCommandHistory();
      await get().fetchGitStatus();
    },

    restoreCheckpoint: async (checkpointId: string) => {
      const result = await window.digitalLife.task.restoreCheckpoint(
        checkpointId
      );
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ taskCenter: result.data });
      await get().fetchAuditEntries(40);
      await get().bootstrap();
    },

    runCommand: async (command: string, argsText: string) => {
      if (!command.trim()) return;
      const args = argsText
        .split(/\s+/)
        .map((item: string) => item.trim())
        .filter(Boolean);
      const result = await window.digitalLife.command.run({
        command: command.trim(),
        args,
      });
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ latestCommandRun: result.data });
      await get().refreshTaskCenter();
      await get().fetchAuditEntries(40);
      await get().fetchCommandHistory();
      await get().fetchGitStatus();
    },
  };
}
