import type { StoreState } from '../StoreState';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';
import { workspaceRequestSeq, queueLowPriorityRefresh, clearError, captureError } from '../shared';
import { buildGitSnapshotSyncPatch } from '../gitSnapshotSync';
import { resolveCurrentTheme } from '@shared/resolveTheme';
import { isTauriShell } from '../../../tauri-bridge';
import { runWithConcurrency } from '../../shared/asyncUtils';
import { computeLoadPhases } from './workspaceLoadOrder';
import { syncNewWorkspacesToNaturalOrder } from './workspaceNaturalOrderSync';
import type { StoreApi } from 'zustand';
const SCOPE = 'general';

/**
 * 批量累加辅助函数 — 在 Partial<StoreState> 中累积 Record 字段的变更。
 *
 * 首次调用时从当前 store 状态浅拷贝初始化 batch 字段，
 * 后续调用直接在已初始化的 batch 字段上追加，避免每次都展开整个 Record。
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
     * [bootstrap - 启动应用，获取工作区、Git 状态和补丁]
     * @writes workspaceSlice.appInfo, workspaceSlice.recentWorkspaces, gitSlice.gitSnapshot, gitSlice.gitSnapshots, patchSlice.activePatchSet, editorSlice.selectedFilePath, editorSlice.openTabs, editorSlice.dirtyEditorPaths, diagnosticSlice.indexingStatus, diagnosticSlice.repoMap, searchSlice.searchQuery, searchSlice.searchResults
     */
    bootstrap: async () => {
      const requestSeq = workspaceRequestSeq;
      const completeStartup = () => {
        setTimeout(() => {
          set({ appReady: true });
        }, 0);
      };

      const [appInfoResult, recentResult] = await Promise.all([
        window.digitalLife.app.getInfo(),
        window.digitalLife.workspace.listRecent(),
      ]);
      if (requestSeq !== workspaceRequestSeq) {
        return;
      }

      if (!appInfoResult.ok) {
        set({ loading: false });
        captureError(get, appInfoResult.error, SCOPE);
        return;
      }

      // Fix stale resolvedTheme from Rust backend (hardcodes Theme::Light for system mode)
      appInfoResult.data.config.resolvedTheme = resolveCurrentTheme(
        appInfoResult.data.config.themeMode,
      );

      const recentWorkspaces = recentResult.ok ? recentResult.data : [];
      // 为右侧面板设置默认展开所有可见工作区
      const visibleWorkspaces = recentWorkspaces.filter(
        (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available,
      );

      const nextState: Partial<StoreState> = {
        isTauri: isTauriShell(),
        appInfo: appInfoResult.data,
        recentWorkspaces,
        loading: false,
        dirtyEditorPaths: [],
      };

      void window.digitalLife.workspace.setEditorDirtyPaths([]);

      // 尽早渲染 UI，不等 getGitStatus
      set(nextState);

      // Sync any newly-discovered workspaces into the natural-order list
      syncNewWorkspacesToNaturalOrder();

      /**
       * 在后台按 priority → deferred → natural 阶段预加载所有可见工作区的
       * 文件树 + git 快照，并在完成后标记首屏就绪。
       *
       * 方案 B：无论是否存在 currentWorkspace 都会执行（只要 visibleWorkspaces
       * 非空），避免重启/无当前工作区时点击某个工作区才触发全量扫描。
       * 若 visibleWorkspaces 为空则直接 completeStartup。
       */
      const runWorkspaceLoadCascade = async () => {
        if (requestSeq !== workspaceRequestSeq) {
          return;
        }
        if (visibleWorkspaces.length === 0) {
          completeStartup();
          return;
        }
        const appInfo_ = get().appInfo;
        const config = appInfo_?.config;
        const priorityIds: string[] = config?.workspacePriorityIds ?? [];
        const deferredIds: string[] = config?.workspaceDeferredIds ?? [];
        const naturalOrder: string[] = config?.workspaceNaturalOrder ?? [];
        const maxConcurrent = config?.maxConcurrentWorkspaces ?? 6;

        const phases = computeLoadPhases(priorityIds, deferredIds, naturalOrder, visibleWorkspaces);

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
          // 提前设置 loading 标记，防止用户在 loadBatch 进行中点击展开时触发重复 lazyLoad
          // （createLazyLoader 的 guard 会检查 isLoading，从而跳过已排队的工作区）
          {
            const loadingBatch: Partial<StoreState> = {};
            for (const w of items) {
              accumulateBatch(loadingBatch, get, 'workspaceTreeLoading', w.id, true);
              accumulateBatch(loadingBatch, get, 'workspaceChangesTreeLoading', w.id, true);
            }
            set(loadingBatch);
          }
          const results = await runWithConcurrency(tasks, concurrency, async (task) => {
            const [tree, snapshot] = await Promise.all([task.treeLoader(), task.snapshotLoader()]);
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
      };

      if (appInfoResult.data.currentWorkspace) {
        set({
          ...nextState,
          workspaceTrees: {},
          dirtyEditorPaths: [],
        });

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
            const currentWsId = appInfoResult.data.currentWorkspace.id;
            // Merge the current workspace snapshot into B instead of replacing
            // the whole map: bootstrap also fires a low-priority cascade that
            // writes OTHER workspaces' slots, and a replace here would wipe those
            // slots. The sync helper also keeps A/C in lockstep.
            set((state: StoreState) =>
              buildGitSnapshotSyncPatch(state, {
                workspaceId: currentWsId,
                snapshot: gitResult.data,
              }),
            );
          }
        });

        queueLowPriorityRefresh(async () => {
          if (requestSeq !== workspaceRequestSeq) {
            return;
          }
          await Promise.allSettled([get().fetchGitBranches()]);
          await runWorkspaceLoadCascade();
        });
        return;
      }

      // 无当前工作区：仍清除编辑器相关状态（与原有 else 分支一致）。
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
        gitSnapshot: undefined,
        gitSnapshots: {},
        gitBranches: [],
        searchQuery: '',
        searchResults: [],
        externalFileChange: undefined,
      });

      // 方案 B：即使没有当前工作区，也在后台预加载所有可见工作区树，
      // 使重启后点击任一工作区不再触发全量扫描。
      queueLowPriorityRefresh(() => runWorkspaceLoadCascade());
    },

    /**
     * [updatePreferences - 更新应用偏好设置（主题、语言等）]
     * @writes workspaceSlice.appInfo
     */
    updatePreferences: async (patch: AppPreferencePatch): Promise<boolean> => {
      const key = 'updatePreferences';
      if (get().isFetching[key]) {
        return false;
      }
      clearError(get, SCOPE);
      set({ isFetching: { ...get().isFetching, [key]: true } });
      try {
        const result = await window.digitalLife.app.updatePreferences(patch);
        if (!result.ok) {
          captureError(get, result.error, SCOPE);
          return false;
        }
        const responseMode = result.data.config.themeMode;
        // result.data from Rust backend has stale resolvedTheme for system mode
        // (build_app_info hardcodes Theme::Light for ThemeMode::System).
        // Fix it here for store consistency; useThemeSync 会通过 appInfo 变化触发 setTheme。
        result.data.config.resolvedTheme = resolveCurrentTheme(responseMode);
        set({ appInfo: result.data });
        return true;
      } catch (error) {
        captureError(get, error, SCOPE);
        return false;
      } finally {
        set({ isFetching: { ...get().isFetching, [key]: false } });
      }
    },
  };
}
