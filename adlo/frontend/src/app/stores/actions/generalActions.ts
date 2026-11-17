import type { StoreState } from '../StoreState';
import type { RecentWorkspaceEntry, WorkspaceTreeNode } from '@adlo/kernel';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';
import type { TreeCacheOptions } from '../../../shared/ipc/storage';
import { workspaceRequestSeq, queueLowPriorityRefresh, clearError, captureError } from '../shared';
import { clearedChangePreviewState } from '../cacheHelpers';
import { buildGitSnapshotSyncPatch } from '../gitSnapshotSync';
import { resolveCurrentTheme } from '@shared/resolveTheme';
import { isTauriShell } from '../../../tauri-bridge';
import { asWorkspaceID } from '../../../shared/branded';
import { runWithConcurrency } from '../../shared/asyncUtils';
import { computeLoadPhases } from './workspaceLoadOrder';
import { syncNewWorkspacesToNaturalOrder } from './workspaceNaturalOrderSync';
import { mergePrefPatches } from './preferencePatchMerge';
import { collectDirPaths } from '../persisted/prune';
import { applyTreeLoadedPrune, applyWorkspacePrune } from '../persisted/pruneWiring';
import type { StoreApi } from 'zustand';
// 只导入 settings 命名空间而非全量语言包索引（Closing L-1：减小 action chunk 体积）。
import { settingsZh } from '../../i18n/zh-CN/settings';
import { settingsEn } from '../../i18n/en-US/settings';
import { resolveAppLanguage } from '../../i18n/resolveLanguage';
import { allowlistOrigins } from '@shared/originWhitelist';
const SCOPE = 'general';

/**
 * 会话覆盖提示文案（Phase 4 F3）：设置面板经 fire-and-forget 调用
 * `updatePreferences`（见 `useSettingsPanelProps`），UI 层无法 await 结果，
 * 故提示必须在此统一弹。文案取静态语言包（与当前语言一致），不走 hook。
 */
function sessionOverrideNotice(get: () => StoreState, patch?: AppPreferencePatch): string {
  // 本次补丁若改了语言，按用户刚选的语言出提示（Closing M-5），否则跟随旧 appInfo。
  const locale = resolveAppLanguage(patch?.language ?? get().appInfo?.config.language);
  const dict = locale === 'en-US' ? settingsEn : settingsZh;
  return dict.settingsSessionOverrideTakesEffectOnRestart;
}

/**
 * T7 校准门选项：T9 起经 `storage.getTreeCacheStats` 读真实值
 *（stats 与 `get_options()` 同源）；桥不可用/失败时回退 Rust 缺省。
 * 测试经 `setCalibrationOptionsForTesting` 注入覆盖（覆盖优先于真实值，T9 保留）。
 * 注意：此处字面量与 `storageAtDefault.ts` 的 `TREE_CACHE_DEFAULTS` 同值双份
 *（stores/actions 不得依赖 features/ 层，见 Phase 4 R1-7.4 记录；改 Rust 缺省时两处同步）。
 */
const RUST_TREE_CACHE_DEFAULTS: TreeCacheOptions = { enabled: true, ttlMinutes: 15 };

/** TTL 合法范围（分钟），与 Rust `TREE_CACHE_TTL_RANGE`（1..=1440）一致，越界回缺省。 */
const CALIBRATION_TTL_MIN = 1;
const CALIBRATION_TTL_MAX = 1440;

let calibrationOptionsOverride: TreeCacheOptions | undefined;

/**
 * 单飞 memo：一次 bootstrap 内 priority/deferred/natural 三 phase 共用一次
 * `getTreeCacheStats` RPC（F5：此前每 `loadBatch` 调一次 → 每启动 3 次 RPC）。
 * `bootstrap` 入口重置（见 `runWorkspaceLoadCascade` 开头）。
 */
let calibrationMemo: Promise<TreeCacheOptions> | undefined;

/** TTL 清洗：有限数且落在 1..=1440 才采用，否则回 Rust 缺省（NaN/0/负数/超大不再 fail-open 全扫描）。 */
function clampCalibrationOptions(opts: TreeCacheOptions): TreeCacheOptions {
  const enabled =
    typeof opts.enabled === 'boolean' ? opts.enabled : RUST_TREE_CACHE_DEFAULTS.enabled;
  const ttl = opts.ttlMinutes;
  const ttlMinutes =
    typeof ttl === 'number' &&
    Number.isFinite(ttl) &&
    ttl >= CALIBRATION_TTL_MIN &&
    ttl <= CALIBRATION_TTL_MAX
      ? Math.floor(ttl)
      : RUST_TREE_CACHE_DEFAULTS.ttlMinutes;
  return { enabled, ttlMinutes };
}

async function loadCalibrationOptions(): Promise<TreeCacheOptions> {
  try {
    const result = await window.digitalLife?.storage?.getTreeCacheStats();
    if (result?.ok) {
      return clampCalibrationOptions({
        enabled: result.data.enabled,
        ttlMinutes: result.data.ttlMinutes,
      });
    }
  } catch {
    // 桥失败（channel closed 等）即回退缺省，行为等同现状全量加载。
  }
  return RUST_TREE_CACHE_DEFAULTS;
}

export async function resolveCalibrationOptions(): Promise<TreeCacheOptions> {
  if (calibrationOptionsOverride !== undefined) {
    return clampCalibrationOptions(calibrationOptionsOverride);
  }
  calibrationMemo ??= loadCalibrationOptions();
  return calibrationMemo;
}

/** 仅供测试注入覆盖校准门选项；传 `undefined` 恢复 Rust 缺省。T9 接真实值后保留。 */
export function setCalibrationOptionsForTesting(opts: TreeCacheOptions | undefined): void {
  calibrationOptionsOverride = opts;
  calibrationMemo = undefined;
}

/** 重置单飞 memo：生产经 `bootstrap` 级联入口调用；测试按需调用。 */
export function resetCalibrationMemo(): void {
  calibrationMemo = undefined;
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

/**
 * `updatePreferences` 的合并式排队（P1）。
 *
 * 原实现用 `isFetching` 守卫直接 `return false` 静默丢弃并发补丁 —— 而一次
 * `updatePreferences` 含 `spawn_blocking` 写盘 + 3s 超时的 workspace fetch，
 * 用户在设置面板快速连改三项（日志级别/终端模式/调试模式）时会真实丢设置。
 * 现改为：in-flight 期间的补丁入队，本次完成后把整批合并为**单次** IPC 发出，
 * 因此既不丢操作，也不产生并发写 config.json 的竞态。
 */
interface PendingPrefCall {
  patch: AppPreferencePatch;
  resolve: (ok: boolean) => void;
}

/**
 * 合并队列的 per-store 状态（Phase 4 R4）：队列收进 `createGeneralActions`
 * 闭包、随 store 生命周期，不再是模块级单例（多 store 实例/测试/HMR 下后续
 * 调用的状态更新不再写到第一个 store）。
 */
interface PrefQueueState {
  queue: PendingPrefCall[];
  draining: boolean;
}

async function drainPrefQueue(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
  prefState: PrefQueueState,
): Promise<void> {
  if (prefState.draining) {
    return;
  }
  prefState.draining = true;
  // 凡入队必决议（Closing M-1/N-1）：drain 体内任何同步抛错（今日 merge/set
  // 均不抛，仅防未来改动）都把已取批次 + 排队中未取批次全部 resolve(false)，
  // 不许悬挂；入口 set 也纳入保护（抛错同样决议已入队）。
  const pending: PendingPrefCall[] = [];
  try {
    // 对外可观察的 loading 信号（Phase 4 D1）：生产尚无读取方（防重入由闭包内
    // prefState.draining 承担），保留供未来保存中 spinner 使用；测试锁定该行为。
    // 函数式更新防并发写互相覆盖（Closing L-2）。
    set((s) => ({ isFetching: { ...s.isFetching, updatePreferences: true } }));
    while (prefState.queue.length > 0) {
      const batch = prefState.queue;
      prefState.queue = [];
      pending.push(...batch);
      const merged = batch.reduce<AppPreferencePatch>(
        (acc, call) => mergePrefPatches(acc, call.patch),
        {},
      );
      const ok = await sendPreferencePatch(set, get, merged);
      // 同一批次共享一个 ok（all-or-nothing 语义：合并 IPC 失败时批次内
      // 所有调用者都得 false，无归因；注释锁定该语义）。
      for (const call of batch) {
        call.resolve(ok);
      }
      pending.length = 0;
    }
  } catch (error) {
    for (const call of [...pending, ...prefState.queue]) {
      try {
        call.resolve(false);
      } catch {
        // resolve 本身不应抛；防御性吞掉，保证 finally 复位。
      }
    }
    prefState.queue = [];
    throw error;
  } finally {
    prefState.draining = false;
    set((s) => ({ isFetching: { ...s.isFetching, updatePreferences: false } }));
  }
}

async function sendPreferencePatch(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
  patch: AppPreferencePatch,
): Promise<boolean> {
  try {
    const result = await window.digitalLife.app.updatePreferences(patch);
    if (!result.ok) {
      captureError(get, result.error, SCOPE);
      return false;
    }
    // result.data from Rust backend has stale resolvedTheme for system mode
    // (build_app_info hardcodes Theme::Light for ThemeMode::System).
    // Fix it here for store consistency; useThemeSync 会通过 appInfo 变化触发 setTheme。
    result.data.info.config.resolvedTheme = resolveCurrentTheme(result.data.info.config.themeMode);
    // 提示文案必须在 set 之前解析：set 会用响应覆盖 appInfo，而语言取自旧 appInfo
    // 或本次补丁（语言切换场景跟新语言，Closing M-5）。
    // 旧信封/异常信封无数组即视为空集（Closing M-8），不抛 TypeError。
    const lockedFields = result.data.sessionLockedFields ?? [];
    const lockedNotice = lockedFields.length > 0 ? sessionOverrideNotice(get, patch) : null;
    set({ appInfo: result.data.info });
    // Agent-site link interception is baked into live WebViews via an injected
    // prefix; refresh it whenever the whitelist/enable flag changed so already
    // loaded agent pages pick up the new settings (Tauri only; no-op elsewhere).
    if (
      patch.agentLinkIntercept !== undefined ||
      patch.agentSiteWhitelist !== undefined ||
      patch.agentSiteRules !== undefined ||
      patch.agentSiteOverrides !== undefined ||
      patch.resetAgentSiteRules !== undefined ||
      patch.resetAgentSiteOverrides !== undefined ||
      patch.resetAgentSiteOverride !== undefined
    ) {
      const config = result.data.info.config;
      void window.digitalLife?.browser?.setAgentIntercept?.(
        allowlistOrigins(config.agentSiteWhitelist ?? []),
        config.agentLinkIntercept ?? false,
        config.agentSiteRules,
        config.agentSiteOverrides,
      );
    }
    // 会话级 CLI/env 覆盖锁定的字段：已落盘但运行期保持 CLI 值 → 顶部提示
    // "下次启动生效"，消除静默分歧（Phase 4 F3，用户决策）。
    if (lockedNotice) {
      get().showToast(lockedNotice, 'warning');
    }
    return true;
  } catch (error) {
    captureError(get, error, SCOPE);
    return false;
  }
}

export function createGeneralActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  const prefState: PrefQueueState = { queue: [], draining: false };
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
        set({ loading: false, adServerReachable: false });
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
        adServerReachable: true,
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
        // 新一轮级联重置校准单飞 memo：三 phase 共用本轮一次 stats 读取。
        resetCalibrationMemo();
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
          // 校准门（T7 缺口裁定 + T9 接线）：入口 await 一次 resolveCalibrationOptions
          //（注入覆盖优先，无桥/失败回退 Rust 缺省）；
          // enabled:false → 全批次 allowStale:false（首包请求不带 allowStale，等同现状）。
          const calibOpts = await resolveCalibrationOptions();
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
            treeLoader: (): Promise<TreePacket | undefined> => {
              const request = staleAllowed
                ? window.digitalLife.workspace.listTreeForWorkspace(w.path, { allowStale: true })
                : window.digitalLife.workspace.listTreeForWorkspace(w.path);
              return request.then((r) => {
                if (!r.ok) {
                  return undefined;
                }
                const payload = r.data;
                // 全字段校验：tree 非数组、fromCache 非布尔、capturedAt 非 number
                // 一律按 miss 处理（失格 capturedAt 若记入 stale 门会永不校准，见 F6）。
                if (
                  !payload ||
                  !Array.isArray(payload.tree) ||
                  typeof payload.fromCache !== 'boolean' ||
                  typeof payload.capturedAt !== 'number'
                ) {
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
              return window.digitalLife.workspace.listGitStatusForWorkspace(w.path).then((r) => {
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
              // stale 先行 seq 守卫（F2）：首包落库前用户若已触发同 id 新鲜加载
              //（lazy/refresh 已写入 `workspaceTrees[id]`），stale 不得覆盖——用户点击的新鲜树必胜。
              if (get().workspaceTrees[item.id] !== undefined) {
                continue;
              }
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
            // id → 条目预建 Map（F3.2：校准循环内不再逐次 `items.find`）。
            const itemsById = new Map(items.map((w) => [w.id, w] as const));
            const calibrate = async () => {
              for (const [id, capturedAt] of staleCapturedAt) {
                if (typeof capturedAt !== 'number' || calibrateAt - capturedAt <= ttlMs) {
                  continue;
                }
                const target = itemsById.get(id);
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
          await Promise.allSettled([get().fetchGitBranches({ silent: true })]);
          await runWorkspaceLoadCascade();
        });
        return;
      }

      // 无当前工作区：仍清除编辑器相关状态（与原有 else 分支一致）。
      set({
        dirtyEditorPaths: [],
        openTabs: [],
        selectedFilePath: undefined,
        ...clearedChangePreviewState(),
        fileContent: undefined,
        fileLastModifiedAt: undefined,
        fileMedia: null,
        fileMediaLoading: false,
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
     *
     * 合并式排队（P1）：in-flight 期间到达的补丁入队并在本次完成后合并发出，
     * 不再静默丢弃并发操作。
     * @writes workspaceSlice.appInfo
     */
    updatePreferences: (patch: AppPreferencePatch): Promise<boolean> => {
      // 只在开启新一轮 drain 时 clear（Closing M-2）：并入在途批次的调用不再擦掉
      // 刚上报的错误卡 —— 错误保留到下一次新操作（失败仍可见，不一闪而没）。
      if (prefState.queue.length === 0 && !prefState.draining) {
        clearError(get, SCOPE);
      }
      const settled = new Promise<boolean>((resolve) => {
        prefState.queue.push({ patch, resolve });
      });
      // drain 今日不 reject（sendPreferencePatch 全捕获、合并纯函数），catch 仅防
      // 未来改动引入未处理 rejection 导致调用方 promise 悬挂（Phase 4 R4）。
      void drainPrefQueue(set, get, prefState).catch((error) => captureError(get, error, SCOPE));
      return settled;
    },
  };
}
