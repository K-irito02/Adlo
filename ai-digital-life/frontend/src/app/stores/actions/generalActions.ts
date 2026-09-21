import type { StoreState } from '../StoreState';
import type { RecentWorkspaceEntry, WorkspaceTreeNode } from '@ai-digital-life/kernel';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';
import type { TreeCacheOptions } from '../../../shared/ipc/storage';
import { workspaceRequestSeq, queueLowPriorityRefresh, clearError, captureError } from '../shared';
import { buildGitSnapshotSyncPatch } from '../gitSnapshotSync';
import { resolveCurrentTheme } from '@shared/resolveTheme';
import { isTauriShell } from '../../../tauri-bridge';
import { asWorkspaceID } from '../../../shared/branded';
import { runWithConcurrency } from '../../shared/asyncUtils';
import { computeLoadPhases } from './workspaceLoadOrder';
import { syncNewWorkspacesToNaturalOrder } from './workspaceNaturalOrderSync';
import { collectDirPaths } from '../persisted/prune';
import { applyTreeLoadedPrune, applyWorkspacePrune } from '../persisted/pruneWiring';
import type { StoreApi } from 'zustand';
const SCOPE = 'general';

/**
 * T7 校准门选项：默认返回与 Rust 缺省逐字一致（`enabled=true, ttlMinutes=15`）。
 *
 * 缺口裁定（binding）：options 读路径四层全无，本任务不建读路径；T9 经 `stats`
 * 扩展交付真实值并接到此处。测试经 `setCalibrationOptionsForTesting` 注入覆盖。
 */
const RUST_TREE_CACHE_DEFAULTS: TreeCacheOptions = { enabled: true, ttlMinutes: 15 };

let calibrationOptionsOverride: TreeCacheOptions | undefined;

export function resolveCalibrationOptions(): TreeCacheOptions {
  return calibrationOptionsOverride ?? RUST_TREE_CACHE_DEFAULTS;
}

/** 仅供测试注入覆盖校准门选项；传 `undefined` 恢复 Rust 缺省。T9 接真实值后保留。 */
export function setCalibrationOptionsForTesting(opts: TreeCacheOptions | undefined): void {
  calibrationOptionsOverride = opts;
}

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
     * @writes workspaceSlice.appInfo, workspaceSlice.recentWorkspaces, gitSlice.gitSnapshot, gitSlice.gitSnapshots, patchSlice.activePatchSet, editorSlice.selectedFilePath, editorSlice.openTabs, editorSlice.dirtyEditorPaths, diagnosticSlice.indexingStatus, diagnosticSlice.repoMap, searchSlice.searchQuery, searchSlice.searchEntries, searchSlice.searching
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
      // 可见工作区仅用于下面的加载瀑布（computeLoadPhases），不设置任何展开态。
      const visibleWorkspaces = recentWorkspaces.filter(
        (w) => !w.removedFromSidebar && w.available,
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

      // 工作区参照清单就绪（setRecentWorkspaces 的直接-set 等价路径 —— bootstrap
      // 不经过该 action）：剪掉已不存在工作区 / 标签的孤儿条目（规格 §3.5.1）。
      applyWorkspacePrune();

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
        ): Promise<
          PromiseSettledResult<{
            id: string;
            tree: WorkspaceTreeNode[] | undefined;
            snapshot: unknown;
          }>[]
        > {
          // 校准门（T7 缺口裁定）：入口调一次 resolveCalibrationOptions；
          // enabled:false → 全批次 allowStale:false（首包请求不带 allowStale，等同现状）。
          const calibOpts = resolveCalibrationOptions();
          const staleAllowed = calibOpts.enabled;
          const ttlMs = calibOpts.ttlMinutes * 60000;

          interface TreePacket {
            tree: WorkspaceTreeNode[];
            fromCache: boolean;
            capturedAt: number;
          }

          const tasks = items.map((w) => ({
            id: w.id,
            path: w.path,
            // TEMP-RCA(事项1): 分项计时，区分树扫描慢还是 git 快照慢（定案前删除）
            treeLoader: (): Promise<TreePacket | undefined> => {
              const t0 = Date.now();
              const request = staleAllowed
                ? window.digitalLife.workspace.listTreeForWorkspace(w.path, { allowStale: true })
                : window.digitalLife.workspace.listTreeForWorkspace(w.path);
              return request.then((r) => {
                console.log('[ADL-DBG-RCA] treeLoader settled', {
                  id: w.id,
                  ms: Date.now() - t0,
                  ok: r.ok,
                });
                if (!r.ok) {
                  return undefined;
                }
                const payload = r.data;
                if (!Array.isArray(payload.tree)) {
                  console.warn('[workspace load] malformed tree payload, treating as miss', {
                    id: w.id,
                  });
                  return undefined;
                }
                return {
                  tree: payload.tree,
                  fromCache: payload.fromCache,
                  capturedAt: payload.capturedAt,
                };
              });
            },
            snapshotLoader: () => {
              const t0 = Date.now();
              return window.digitalLife.workspace.listGitStatusForWorkspace(w.path).then((r) => {
                console.log('[ADL-DBG-RCA] snapshotLoader settled', {
                  id: w.id,
                  ms: Date.now() - t0,
                  ok: r.ok,
                });
                return r.ok ? r.data : undefined;
              });
            },
          }));
          // 快照无 stale 语义：changes-loading 仍提前置位（与现状一致，
          // 防 loadBatch 进行中触发重复加载；树 loading 见下，不再提前置位）。
          {
            const loadingBatch: Partial<StoreState> = {};
            for (const w of items) {
              accumulateBatch(loadingBatch, get, 'workspaceChangesTreeLoading', w.id, true);
            }
            set(loadingBatch);
          }
          // TEMP-RCA(事项1): 诊断启动转圈是卡/慢/错（定案前删除）
          console.log('[ADL-DBG-RCA] loadBatch start', {
            ids: items.map((w) => w.id),
            at: Date.now(),
          });
          const batchStartAt = Date.now();
          // 第一包：stale 先行 — 树请求带 allowStale 即到即渲染；
          // fromCache:true 的行记入 staleCapturedAt，其 workspaceTreeLoading 永不置位
          //（守卫靠已落库的 hasData 生效，无需 loading 占位）。
          const treeResults = await runWithConcurrency(tasks, concurrency, (task) =>
            task.treeLoader(),
          );
          const staleCapturedAt = new Map<string, number>();
          const firstPacket: Partial<StoreState> = {};
          for (let i = 0; i < treeResults.length; i += 1) {
            const r = treeResults[i];
            const item = items[i];
            if (r.status !== 'fulfilled' || r.value === undefined) {
              continue;
            }
            if (r.value.fromCache) {
              accumulateBatch(firstPacket, get, 'workspaceTrees', item.id, r.value.tree);
              staleCapturedAt.set(item.id, r.value.capturedAt);
            }
          }
          if (Object.keys(firstPacket).length > 0) {
            set(firstPacket);
          }
          // 第二包：miss 回退阻塞加载 — 非 stale 行置 loading（与现状一致的置位），
          // 快照全量并发，结算后统一清零。
          const nonStaleItems = items.filter((w) => !staleCapturedAt.has(w.id));
          {
            const blockingBatch: Partial<StoreState> = {};
            for (const w of nonStaleItems) {
              accumulateBatch(blockingBatch, get, 'workspaceTreeLoading', w.id, true);
            }
            if (Object.keys(blockingBatch).length > 0) {
              set(blockingBatch);
            }
          }
          const snapshotResults = await runWithConcurrency(tasks, concurrency, (task) =>
            task.snapshotLoader(),
          );
          // TEMP-RCA(事项1): 整批结算情况（定案前删除）
          console.log('[ADL-DBG-RCA] loadBatch settled', {
            elapsedMs: Date.now() - batchStartAt,
            summary: items.map((item, i) => {
              const r = treeResults[i];
              return {
                id: item?.id,
                status: r.status,
                tree:
                  r.status === 'fulfilled' && r.value !== undefined
                    ? r.value.tree !== undefined
                    : undefined,
              };
            }),
          });
          const batch_: Partial<StoreState> = {};
          for (let i = 0; i < items.length; i += 1) {
            const item = items[i];
            const id = item.id;
            const tr = treeResults[i];
            const sr = snapshotResults[i];
            if (tr.status === 'fulfilled' && tr.value !== undefined) {
              if (!tr.value.fromCache) {
                // miss 即新鲜：阻塞语义，落库
                accumulateBatch(batch_, get, 'workspaceTrees', id, tr.value.tree);
              }
              if (!staleCapturedAt.has(id)) {
                // stale 行跳过该 id 的 loading 置位；失败行正常清除。
                accumulateBatch(batch_, get, 'workspaceTreeLoading', id, false);
              }
            } else {
              // runWithConcurrency 保证结果与 items 对齐；rejected 时同样
              // 清除 loading 标记，避免该工作区永久 loading 且被新 guard 卡住无法重试。
              accumulateBatch(batch_, get, 'workspaceTreeLoading', id, false);
            }
            if (sr.status === 'fulfilled' && sr.value !== undefined) {
              accumulateBatch(batch_, get, 'gitSnapshots', id, sr.value);
            }
            accumulateBatch(batch_, get, 'workspaceChangesTreeLoading', id, false);
          }
          if (Object.keys(batch_).length > 0) {
            set(batch_);
          }
          // 启动级联直接加载树（不经过 loadWorkspaceTree）：剪枝只消费新鲜树——
          // miss 包直接剪；stale 首包不剪（规格 §3.5.1 R2），待校准成功后以新鲜树剪；
          // 失败（tree === undefined）跳过（规格 §3.5.1）。
          for (let i = 0; i < items.length; i += 1) {
            const tr = treeResults[i];
            if (tr.status !== 'fulfilled' || tr.value === undefined || tr.value.fromCache) {
              continue;
            }
            applyTreeLoadedPrune(items[i].id, collectDirPaths(tr.value.tree));
          }
          // 静默校准（后台，不阻塞首屏）：仅对 fromCache 且行龄超 TTL 的行逐个
          // refreshOneWorkspaceTree(id, path, { silent: true })；成功且无错则以新鲜树剪枝。
          // TTL 行龄小跳过（零扫描重启）；单行失败只记 warn，不影响其他行与启动流程。
          if (staleCapturedAt.size > 0) {
            const calibrateAt = Date.now();
            const calibrate = async () => {
              for (const [id, capturedAt] of staleCapturedAt) {
                if (typeof capturedAt !== 'number' || calibrateAt - capturedAt <= ttlMs) {
                  continue;
                }
                const target = items.find((w) => w.id === id);
                if (!target) {
                  continue;
                }
                try {
                  await get().refreshOneWorkspaceTree(asWorkspaceID(id), target.path, {
                    silent: true,
                  });
                  if (get().workspaceTreeErrors[id] !== undefined) {
                    continue;
                  }
                  const fresh = get().workspaceTrees[id];
                  if (fresh !== undefined) {
                    applyTreeLoadedPrune(id, collectDirPaths(fresh));
                  }
                } catch (err) {
                  console.warn('[workspace load] silent tree calibration failed', { id, err });
                }
              }
            };
            void calibrate().catch((err) => {
              console.warn('[workspace load] silent tree calibration failed', { err });
            });
          }
          return items.map((item, i) => {
            const tr = treeResults[i];
            const sr = snapshotResults[i];
            if (tr.status === 'rejected') {
              return { status: 'rejected' as const, reason: tr.reason };
            }
            if (sr.status === 'rejected') {
              return { status: 'rejected' as const, reason: sr.reason };
            }
            return {
              status: 'fulfilled' as const,
              value: {
                id: item.id,
                tree: tr.value?.tree,
                snapshot: sr.value,
              },
            };
          });
          // rejected items are logged by logRejected() at the call site
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
        searchEntries: [],
        searchSessionId: 0,
        searchHasMore: false,
        searchLimit: get().searchPageSize,
        searchWorkspaceId: undefined,
        searching: false,
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
