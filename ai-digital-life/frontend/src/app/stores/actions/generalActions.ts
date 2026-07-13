import type { StoreState } from '../StoreState';
import type { ConversationMessageRecord, ConversationBlock } from '@ai-digital-life/kernel';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';
import { createEditorTab } from '@utils/editorTabs';
import { loadConversationState, loadTaskCenterState } from '../loaders';
import { workspaceContextModeFromInfo } from '../conversationUtils';
import { workspaceRequestSeq, queueLowPriorityRefresh, clearError, captureError } from '../shared';
import { resolveCurrentTheme } from '@shared/resolveTheme';
import type { StoreApi } from 'zustand';

export function createGeneralActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [bootstrap - 启动应用，获取工作区信息、会话、任务中心、Git 状态和补丁]
     * @reads — 无（冷启动）
     * @writes workspaceSlice.appInfo, workspaceSlice.modelHealth, workspaceSlice.recentWorkspaces, sessionSlice.sessions, sessionSlice.activeSessionId, sessionSlice.sessionDetails, taskSlice.taskCenter, workspaceSlice.workspaceContextMode, gitSlice.gitSnapshot, gitSlice.gitSnapshots, patchSlice.activePatchSet, editorSlice.selectedFilePath, editorSlice.openTabs, editorSlice.dirtyEditorPaths, editorSlice.externalFileChange, editorSlice.changePreview, editorSlice.changePreviewLoading, diagnosticSlice.indexingStatus, diagnosticSlice.repoMap, commandSlice.commandHistory, searchSlice.searchQuery, searchSlice.searchResults
     * @see shared/ipc.ts → app.getInfo, workspace.listRecent, app.getModelHealth, workspace.getGitStatus, patch.getPatchSet, retrieval.getStatus, retrieval.getRepoMap, task.listAuditEntries, command.listRecent, workspace.listTree, workspace.listGitStatusForWorkspace
     * @see mock-bridge.ts → app.getInfo, workspace.listRecent, app.getModelHealth, workspace.getGitStatus, patch.getPatchSet, retrieval.getStatus, retrieval.getRepoMap, task.listAuditEntries, command.listRecent, workspace.listTree, workspace.listGitStatusForWorkspace
     * @see preview-bridge/index.ts → app.getInfo, workspace.listRecent, app.getModelHealth, workspace.getGitStatus, patch.getPatchSet, retrieval.getStatus, retrieval.getRepoMap, task.listAuditEntries, command.listRecent, workspace.listTree, workspace.listGitStatusForWorkspace
     */
    bootstrap: async () => {
      const requestSeq = workspaceRequestSeq;
      const completeStartup = () => {
        setTimeout(() => {
          set({ appReady: true });
        }, 0);
      };

      const [appInfoResult, recentResult, modelHealthResult] = await Promise.all([
        window.digitalLife.app.getInfo(),
        window.digitalLife.workspace.listRecent(),
        window.digitalLife.app.getModelHealth(),
      ]);
      if (requestSeq !== workspaceRequestSeq) {
        return;
      }

      if (!appInfoResult.ok) {
        set({ loading: false, error: appInfoResult.error.message });
        return;
      }

      // Fix stale resolvedTheme from Rust backend (hardcodes Theme::Light for system mode)
      appInfoResult.data.config.resolvedTheme = resolveCurrentTheme(
        appInfoResult.data.config.themeMode
      );

      const [conversationState, taskCenter] = await Promise.all([
        loadConversationState(),
        loadTaskCenterState(),
      ]);
      if (requestSeq !== workspaceRequestSeq) {
        return;
      }

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

      // 尽早渲染 UI，不等 getGitStatus
      set(nextState);

      if (appInfoResult.data.currentWorkspace) {
        const patchBlock = conversationState.detail?.messages.length
          ? conversationState.detail.messages
              .flatMap((message: ConversationMessageRecord) => message.blocks)
              .find((block: ConversationBlock) => block.type === 'patch-summary')
          : undefined;

        const patchResult =
          patchBlock?.type === 'patch-summary'
            ? await window.digitalLife.patch.getPatchSet(patchBlock.patchSetId)
            : null;

        set({
          ...nextState,
          workspaceTrees: {},
          dirtyEditorPaths: [],
          error: undefined,
        });

        if (patchResult?.ok) {
          const initialPath = patchResult.data?.filePatches[0]?.relativePath;
          set({
            activePatchSet: patchResult.data,
            selectedFilePath: initialPath,
            selectedChangePreviewPath: undefined,
            changePreview: undefined,
            changePreviewLoading: false,
            openTabs: initialPath ? [createEditorTab(initialPath)] : [],
          });
        }

        // Defer git status to low priority (it can take ~400ms)
        queueLowPriorityRefresh(async () => {
          if (requestSeq !== workspaceRequestSeq) {
            return;
          }
          const gitResult = await window.digitalLife.workspace.getGitStatus();
          if (requestSeq !== workspaceRequestSeq) {
            return;
          }
          if (gitResult.ok && appInfoResult.data.currentWorkspace) {
            set({
              gitSnapshot: gitResult.data,
              gitSnapshots: { [appInfoResult.data.currentWorkspace.id]: gitResult.data },
            });
          }
        });

        queueLowPriorityRefresh(async () => {
          if (requestSeq !== workspaceRequestSeq) {
            return;
          }
          await Promise.allSettled([
            get().fetchAuditEntries(40),
            get().fetchCommandHistory(),
            get().fetchGitBranches(),
          ]);

          if (visibleWorkspaces.length > 0) {
            const wsResults = await Promise.allSettled(
              visibleWorkspaces.map(async (w) => {
                const [tree, snapshot] = await Promise.all([
                  window.digitalLife.workspace.listTreeForWorkspace(w.path),
                  window.digitalLife.workspace.listGitStatusForWorkspace(w.path),
                ]);
                return {
                  id: w.id,
                  tree: tree.ok ? tree.data : undefined,
                  snapshot: snapshot.ok ? snapshot.data : undefined,
                };
              })
            );
            const batch: Partial<StoreState> = {};
            for (const r of wsResults) {
              if (r.status !== 'fulfilled') {
                continue;
              }
              const { id, tree, snapshot } = r.value;
              if (tree !== undefined) {
                if (!batch.workspaceTrees) {
                  batch.workspaceTrees = { ...get().workspaceTrees };
                }
                batch.workspaceTrees[id] = tree;
                if (!batch.workspaceTreeLoading) {
                  batch.workspaceTreeLoading = { ...get().workspaceTreeLoading };
                }
                batch.workspaceTreeLoading[id] = false;
              }
              if (snapshot !== undefined) {
                if (!batch.gitSnapshots) {
                  batch.gitSnapshots = { ...get().gitSnapshots };
                }
                batch.gitSnapshots[id] = snapshot;
                if (!batch.workspaceChangesTreeLoading) {
                  batch.workspaceChangesTreeLoading = { ...get().workspaceChangesTreeLoading };
                }
                batch.workspaceChangesTreeLoading[id] = false;
              }
            }
            if (Object.keys(batch).length > 0) {
              set(batch);
            }
          }

          completeStartup();
        });
        return;
      }

      set({
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
        searchQuery: '',
        searchResults: [],
        externalFileChange: undefined,
      });
      completeStartup();
    },

    /**
     * [updatePreferences - 更新应用偏好设置（主题、语言、模型选择等）]
     * @reads workspaceSlice.appInfo
     * @writes workspaceSlice.appInfo, sessionSlice.sessions, workspaceSlice.modelHealth (如有模型变更)
     * @see shared/ipc.ts → app.updatePreferences, app.getModelHealth
     * @see mock-bridge.ts → app.updatePreferences, app.getModelHealth
     * @see preview-bridge/index.ts → app.updatePreferences, app.getModelHealth
     */
    updatePreferences: async (patch: AppPreferencePatch) => {
      const key = 'updatePreferences';
      if (get().isFetching[key]) {
        return;
      }
      clearError(get);
      set({ isFetching: { ...get().isFetching, [key]: true } });
      try {
        const result = await window.digitalLife.app.updatePreferences(patch);
        if (!result.ok) {
          captureError(get, result.error);
          return;
        }
        const responseMode = result.data.config.themeMode;
        // result.data from Rust backend has stale resolvedTheme for system mode
        // (build_app_info hardcodes Theme::Light for ThemeMode::System).
        // Fix it here for store consistency; useThemeSync 会通过 appInfo 变化触发 setTheme。
        result.data.config.resolvedTheme = resolveCurrentTheme(responseMode);
        set((state: StoreState) => ({
          appInfo: result.data,
          sessions: state.sessions,
        }));
        if (patch.modelPreferences) {
          await get().refreshModelHealth();
        }
      } catch (error) {
        captureError(get, error);
      } finally {
        set({ isFetching: { ...get().isFetching, [key]: false } });
      }
    },
  };
}
