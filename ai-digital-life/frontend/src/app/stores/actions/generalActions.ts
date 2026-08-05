import type { StoreState } from '../StoreState';
import type {
  ConversationMessageRecord,
  ConversationBlock,
  RecentWorkspaceEntry,
} from '@ai-digital-life/kernel';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';
import { createEditorTab } from '@utils/editorTabs';
import { loadConversationState, loadTaskCenterState } from '../loaders';
import { workspaceContextModeFromInfo } from '../conversationUtils';
import { workspaceRequestSeq, queueLowPriorityRefresh, clearError, captureError } from '../shared';
import { resolveCurrentTheme } from '@shared/resolveTheme';
import { isTauriShell } from '../../../tauri-bridge';
import { runWithConcurrency } from '../../shared/asyncUtils';
import { computeLoadPhases } from './workspaceLoadOrder';
import { syncNewWorkspacesToNaturalOrder } from './workspaceNaturalOrderSync';
import type { StoreApi } from 'zustand';

/**
 * 批量累加辅助函数 — 在 Partial<StoreState> 中累积 Record 字段的变更。
 *
 * 首次调用时从当前 store 状态浅拷贝初始化 batch 字段，
 * 后续调用直接在已初始化的 batch 字段上追加，避免每次都展开整个 Record。
 *
 * @param batch - 累积变更的 Partial<StoreState> 对象
 * @param get - Zustand store 的 get 函数，用于读取当前状态
 * @param key - StoreState 中类型为 Record<string, V> 的字段名
 * @param id - 要写入的 Record key
 * @param value - 要写入的 Record value
 */
export function accumulateBatch<K extends keyof StoreState>(
  batch: Partial<StoreState>,
  get: () => StoreState,
  key: K,
  id: string,
  value: StoreState[K] extends Record<string, infer V> ? V : never,
): void {
  if (!batch[key]) {
    batch[key] = { ...(get()[key] as Record<string, unknown>) } as StoreState[K];
  }
  (batch[key] as Record<string, unknown>)[id] = value;
}

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
        appInfoResult.data.config.themeMode,
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
        (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available,
      );

      const nextState: Partial<StoreState> = {
        isTauri: isTauriShell(),
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

      // Sync any newly-discovered workspaces into the natural-order list
      syncNewWorkspacesToNaturalOrder();

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
            const appInfo_ = get().appInfo;
            const config = appInfo_?.config;
            const priorityIds: string[] = config?.workspacePriorityIds ?? [];
            const deferredIds: string[] = config?.workspaceDeferredIds ?? [];
            const naturalOrder: string[] = config?.workspaceNaturalOrder ?? [];
            const maxConcurrent = config?.maxConcurrentWorkspaces ?? 6;

            const phases = computeLoadPhases(
              priorityIds,
              deferredIds,
              naturalOrder,
              visibleWorkspaces,
            );

            /**
             * Logs any rejected Promise.allSettled results for a phase.
             * Required by error-handling.md — never silently swallow rejections.
             */
            function logRejected<T>(
              results: PromiseSettledResult<T>[],
              phase: 'priority' | 'deferred' | 'natural',
            ): void {
              for (const r of results) {
                if (r.status === 'rejected') {
                  console.warn(`[workspace load] ${phase} phase rejected:`, r.reason);
                }
              }
            }

            async function loadBatch(
              items: RecentWorkspaceEntry[],
              concurrency: number,
            ): Promise<PromiseSettledResult<{ id: string; tree: unknown; snapshot: unknown }>[]> {
              const tasks = items.map((w) => ({
                id: w.id,
                treeLoader: () =>
                  window.digitalLife.workspace
                    .listTreeForWorkspace(w.path)
                    .then((r) => (r.ok ? r.data : undefined)),
                snapshotLoader: () =>
                  window.digitalLife.workspace
                    .listGitStatusForWorkspace(w.path)
                    .then((r) => (r.ok ? r.data : undefined)),
              }));
              const results = await runWithConcurrency(tasks, concurrency, async (task) => {
                const [tree, snapshot] = await Promise.all([
                  task.treeLoader(),
                  task.snapshotLoader(),
                ]);
                return { id: task.id, tree, snapshot };
              });
              const batch_: Partial<StoreState> = {};
              for (const r of results) {
                if (r.status === 'fulfilled') {
                  const { id, tree, snapshot } = r.value;
                  if (tree !== undefined) {
                    accumulateBatch(batch_, get, 'workspaceTrees', id, tree);
                    accumulateBatch(batch_, get, 'workspaceTreeLoading', id, false);
                  } else {
                    // 修复：失败时也清除 loading 状态，避免永久卡死
                    accumulateBatch(batch_, get, 'workspaceTreeLoading', id, false);
                  }
                  if (snapshot !== undefined) {
                    accumulateBatch(batch_, get, 'gitSnapshots', id, snapshot);
                    accumulateBatch(batch_, get, 'workspaceChangesTreeLoading', id, false);
                  } else {
                    accumulateBatch(batch_, get, 'workspaceChangesTreeLoading', id, false);
                  }
                }
                // rejected items are logged by logRejected() at the call site
              }
              if (Object.keys(batch_).length > 0) {
                set(batch_);
              }
              return results;
            }

            // === Stage 1: priority blocks first screen ===
            if (phases.priority.length > 0) {
              const results = await loadBatch(phases.priority, maxConcurrent);
              logRejected(results, 'priority');
            }

            // === First screen ready ===
            completeStartup();

            // === Stage 2: deferred → natural cascade (non-blocking) ===
            void (async () => {
              try {
                if (phases.deferred.length > 0) {
                  const deferredConcurrency = Math.min(2, maxConcurrent);
                  const results = await loadBatch(phases.deferred, deferredConcurrency);
                  logRejected(results, 'deferred');
                }

                if (phases.natural.length > 0) {
                  const naturalConcurrency = Math.min(2, maxConcurrent);
                  const results = await loadBatch(phases.natural, naturalConcurrency);
                  logRejected(results, 'natural');
                }
              } catch (err) {
                console.warn('[workspace load] background cascade failed', err);
              }
            })();
            return;
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
    updatePreferences: async (patch: AppPreferencePatch): Promise<boolean> => {
      const key = 'updatePreferences';
      if (get().isFetching[key]) {
        return false;
      }
      clearError(get);
      set({ isFetching: { ...get().isFetching, [key]: true } });
      try {
        const result = await window.digitalLife.app.updatePreferences(patch);
        if (!result.ok) {
          captureError(get, result.error);
          return false;
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
        return true;
      } catch (error) {
        captureError(get, error);
        return false;
      } finally {
        set({ isFetching: { ...get().isFetching, [key]: false } });
      }
    },
  };
}
