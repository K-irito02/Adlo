import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CopyKey } from '@i18n';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { DOWNLOAD_REFRESH_FAILED } from '@stores/slices/browserDownloadsSlice';
import { formatBytes } from '@root/design-system/html';
import { isTauriShell } from '@shared/env';
import {
  IMMOVABLE_ENTRY_KEYS,
  type StorageCategoryStatus,
  type StorageMode,
  type StoragePathPatch,
  type StoragePreflight,
  type StorageStatus,
  type TreeCacheOptions,
  type TreeCacheStats,
} from '@shared/ipc/storage';
import { IconAlertTriangle, IconCircleHelp, IconResetDefaults } from '../../icons';
import { HintCardTrigger } from '../../components/HintCard';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { SettingsSelect } from '../../components/settings/SettingsSelect';
import { StorageCategoryRow } from './StorageCategoryRow';
import { StorageMigrateDialog } from './StorageMigrateDialog';
import { TerminalHistoryBudgetSection } from './TerminalHistoryBudgetSection';
import { BrowserDownloadPathSection } from './BrowserDownloadPathSection';
import {
  formatMinutesForUnit,
  formatTreeCacheTime,
  isTreeTtlUnit,
  treeTtlMinutesFromCustom,
  treeTtlUnitMax,
  type TreeTtlUnit,
} from './treeCacheTtl';
import { TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES } from '@features/terminal/terminalHistoryBudget';

/** 不可移动项 → i18n key（顺序固定，遍历 `IMMOVABLE_ENTRY_KEYS`）。 */
const IMMOVABLE_COPY: Record<
  (typeof IMMOVABLE_ENTRY_KEYS)[number],
  { name: CopyKey; desc: CopyKey }
> = {
  keyring: { name: 'storageImmutableKeyringName', desc: 'storageImmutableKeyring' },
  machineId: { name: 'storageImmutableMachineIdName', desc: 'storageImmutableMachineId' },
  localStorage: { name: 'storageImmutableLocalStorageName', desc: 'storageImmutableLocalStorage' },
  indexedDB: { name: 'storageImmutableIndexedDbName', desc: 'storageImmutableIndexedDb' },
  webview2: { name: 'storageImmutableWebview2Name', desc: 'storageImmutableWebview2' },
  workspaceCache: {
    name: 'storageImmutableWorkspaceCacheName',
    desc: 'storageImmutableWorkspaceCache',
  },
};

/** 树缓存 TTL 下拉选项（分钟；1440 即 1 天），与服务端合法范围 1..=1440 一致。 */
const TREE_CACHE_TTL_OPTIONS = [5, 15, 60, 1440] as const;

/** Rust 缺省（`TreeCacheOptions::default`）：stats 不可用时开关/TTL 的回退值。 */
const TREE_CACHE_DEFAULTS: TreeCacheOptions = { enabled: true, ttlMinutes: 15 };

/** TTL「自定义…」下拉哨兵值（不是持久化取值，仅界面编辑态）。 */
const TREE_CACHE_TTL_CUSTOM = 'custom';

/** 与 SettingsControls 的 InputControl 一致：输入停顿 500ms 才写回，避免逐键提交。 */
const TREE_TTL_COMMIT_DEBOUNCE_MS = 500;

/**
 * 「恢复 核心数据路径 全部默认」的目标补丁：统一根 + 空根（后端视为默认根
 * `app_data_dir`，见 `patch_to_selection`）+ 无逐类覆盖。与「应用」同一套
 * preflight / 迁移对话框 / setPaths 流程。
 */
const CORE_RESET_PATCH: StoragePathPatch = {
  mode: 'unified',
  root: '',
  categories: {},
  retainSource: false,
};

/** 状态查询超时（后端遍历超大目录时的兜底，避免无限 loading）。 */
const STATUS_TIMEOUT_MS = 30_000;

/** 仅由超时计时器抛出的哨兵错误：与后端真实失败区分展示（F3）。 */
export class StatusTimeoutError extends Error {
  constructor() {
    super('storage status timed out');
    this.name = 'StatusTimeoutError';
  }
}

function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StatusTimeoutError()), ms);
  });
  // 经 `Promise.resolve().then(fn)` 延迟调用：`bridge.getStatus()` 的同步抛错
  // 也转为竞态的拒绝，走错误路径而非同步逃逸（F2）。
  const task = Promise.resolve().then(fn);
  return Promise.race([task, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

/** `ok:true` 畸形体校验：缺 `data`/`categories` 即视为版本错配，走加载失败路径（F1）。 */
function isWellFormedStatus(data: unknown): data is StorageStatus {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const candidate = data as Partial<StorageStatus>;
  return (
    (candidate.mode === 'unified' || candidate.mode === 'per_category') &&
    typeof candidate.root === 'string' &&
    Array.isArray(candidate.categories)
  );
}

/**
 * IpcResult 错误消息提取：缺失时回退为本地化未知错误。
 * 畸形体（如旧后端裸值）不断言、不抛错，只降级显示；版本错配的可观测性由调用点的
 * `console.warn` 负责（目前仅 getStatus 双路径打 warn，避免正常业务错误噪音）。
 */
function ipcErrorMessage(error: { message?: string } | null | undefined, fallback: string): string {
  return error?.message ?? fallback;
}

/**
 * 「存储」设置组（Plan C Task 5）。
 *
 * 组成：模式切换 → （统一模式）根目录行 → 11 类分类行（核心/高级）→ 应用
 * → 工作区树缓存（统计/清除/开关/TTL）
 * → 存储引擎（搬入的终端历史预算、浏览器默认下载路径）→ 数据位置索引（只读）
 * → 不可移动说明 6 项 → 待迁移横幅 → 上次迁移报告。
 *
 * 数据流：挂载时 `storage.getStatus()` 填充；「应用」先 `preflight` 校验，
 * 再打开 `StorageMigrateDialog` 由用户选择迁移时机（立即/下次启动、是否保留旧数据）。
 * 迁移本体只在下次进程启动、任何 DB/日志句柄打开之前执行，因此这里只登记待迁移项。
 *
 * 分类行在两种模式下都渲染：统一模式下路径由根目录派生，行内只读展示（让用户能看到
 * 每类数据实际落在哪里），「每类独立」模式才开放选择目录/手输。
 */
export function StorageSettings() {
  const { t, locale } = useTCopy();
  const showToast = useAppStore((s) => s.showToast);

  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<StorageMode>('unified');
  const [rootDraft, setRootDraft] = useState('');
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [preflight, setPreflight] = useState<StoragePreflight | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  // 工作区树缓存区段态：stats 挂载拉取一次（stats 数字/时间由 Intl 渲染，无需随语言重拉）；
  // 旧桥无该方法时静默缺席（try/catch 吞错），区段不渲染。
  const [treeStats, setTreeStats] = useState<TreeCacheStats | null>(null);
  /** 树缓存确认对话框：null 关闭；`clear` 清除缓存；`disable` 关闭开关（含清缓存说明）。 */
  const [treeConfirm, setTreeConfirm] = useState<'clear' | 'disable' | null>(null);
  const [treeBusy, setTreeBusy] = useState(false);
  const treeConfirmRef = useRef<HTMLButtonElement | null>(null);
  /** 打开确认对话框的触发源：关闭后恢复焦点用。 */
  const treeConfirmTriggerRef = useRef<HTMLElement | null>(null);
  /** 下载路径「恢复默认」确认对话框（文案含当前迁移开关状态）。 */
  const [downloadResetConfirm, setDownloadResetConfirm] = useState(false);
  /** 下载恢复对话框打开时刻的迁移开关快照：文案与执行同源，避免开框后键盘回 Tab
   * 切开关导致"文案一个值、行为另一个值"（task4 L-5；组级 M2 快照的同构）。 */
  const downloadMigrateAtOpenRef = useRef(false);
  /** 组级对话框打开时刻的迁移开关快照（M4-R：组清单文案与搬运行为同源）。 */
  const groupMigrateAtOpenRef = useRef(false);
  const [downloadResetBusy, setDownloadResetBusy] = useState(false);
  const downloadResetConfirmRef = useRef<HTMLButtonElement | null>(null);
  const downloadResetTriggerRef = useRef<HTMLElement | null>(null);
  /** 存储组级「恢复全部默认」确认对话框（侧边栏按钮经 storageGroupResetPending 触发）。
   * 一步完成：4 项明细 + 预检摘要/错误 + 保留源复选框 + 迁移时机按钮。 */
  const [groupResetOpen, setGroupResetOpen] = useState(false);
  const [groupResetBusy, setGroupResetBusy] = useState(false);
  const [groupResetPreflight, setGroupResetPreflight] = useState<StoragePreflight | null>(null);
  const [groupResetRetain, setGroupResetRetain] = useState(false);
  const groupResetConfirmRef = useRef<HTMLButtonElement | null>(null);
  const downloadSettings = useAppStore((s) => s.downloadSettings);
  const changeDownloadPath = useAppStore((s) => s.changeDownloadPath);
  const updateDownloadSettings = useAppStore((s) => s.updateDownloadSettings);
  /** 组级恢复待处理信号 + 消费动作（pending 布尔消除挂载播种吞信号的首跳竞态）。 */
  const storageGroupResetPending = useAppStore((s) => s.storageGroupResetPending);
  const consumeStorageGroupReset = useAppStore((s) => s.consumeStorageGroupReset);
  /** TTL 自定义编辑态（本地草稿，不直接等于 stats.ttlMinutes）。 */
  const [ttlCustomMode, setTtlCustomMode] = useState(false);
  const [ttlCustomValue, setTtlCustomValue] = useState('');
  const [ttlCustomUnit, setTtlCustomUnit] = useState<TreeTtlUnit>('m');
  /** 在途自定义草稿（值 + 输入时单位）：timer 到期按自带单位提交，不受后续切单位影响。 */
  const ttlPendingRef = useRef<{ value: string; unit: TreeTtlUnit } | null>(null);
  const ttlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 树缓存写请求单调序列：丢弃被更新写超车的过期回包合并（近似 last-initiation-wins；
   * 服务端按到达序应用，同桥同序到达时等价）。 */
  const treeWriteSeqRef = useRef(0);
  // 语言切换会更换 `t` 触发重取：草稿只播种一次，避免覆盖用户编辑（F6）。
  // 错误文案仍用最新 `t` 即时计算，保持 `t` 新鲜度。
  const draftsSeededRef = useRef(false);
  /**
   * 「恢复默认」后重播种数据根输入：恢复把草稿清成空串（后端视空为默认根），
   * 迁移落盘成功后用后端解析出的默认根回填，避免输入框空显示。
   * 只在恢复流程的成功路径消费一次；普通「应用」不碰草稿。
   */
  const resetReseedRef = useRef(false);
  // 「块底部 撤回/应用」是否处于可见区：可见时隐藏粘性提交条，不可见时显示。
  const bottomCtaRef = useRef<HTMLDivElement | null>(null);
  const [bottomCtaVisible, setBottomCtaVisible] = useState(false);
  /** 最近一次成功加载/刷新确认的数据根（L-6 回填源：闭包 status 可能陈旧）。 */
  const lastKnownRootRef = useRef<string | null>(null);

  /** 撤回未应用的修改：把草稿重置回已持久化状态（mode/root/逐类路径）。 */
  const handleRevert = useCallback(() => {
    if (!status) {
      return;
    }
    setMode(status.mode);
    setRootDraft(status.root);
    setCategoryDrafts(
      Object.fromEntries(status.categories.map((category) => [category.key, category.path])),
    );
  }, [status]);

  /** 重拉树缓存 stats（清除/开关/TTL 写后刷新展示）；失败静默保留旧值。
   * 传 `expectedSeq` 时：回包落地发现已有更新写超车则跳过本次 `setTreeStats`
   *（关序列号守卫最后缺口：旧写慢读不覆盖新写合并；不传则保持原语义）。 */
  const loadTreeStats = useCallback(async (expectedSeq?: number) => {
    const bridge = window.digitalLife?.storage;
    if (!bridge?.getTreeCacheStats) {
      return;
    }
    try {
      const result = await bridge.getTreeCacheStats();
      if (result.ok) {
        if (expectedSeq !== undefined && treeWriteSeqRef.current !== expectedSeq) {
          return;
        }
        setTreeStats(result.data);
      }
    } catch {
      // 旧桥/通道失败即缺席：区段保持上次（或不渲染），动作失败另行 toast。
    }
  }, []);

  useEffect(() => {
    void loadTreeStats();
  }, [loadTreeStats]);

  // 确认对话框：打开聚焦确认键，Escape 关闭（仿 StorageMigrateDialog）。
  // 忙时锁关闭通道（遮罩/Esc/取消键）：写+清+重拉仍在后台跑，关框会丢失进度上下文。
  useEffect(() => {
    if (!treeConfirm) {
      return;
    }
    treeConfirmRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (treeBusy) {
          return;
        }
        setTreeConfirm(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [treeConfirm, treeBusy]);

  // 确认对话框关闭后焦点回到触发源（打开时记录），键盘用户不丢位置。
  useEffect(() => {
    if (treeConfirm) {
      return;
    }
    treeConfirmTriggerRef.current?.focus();
    treeConfirmTriggerRef.current = null;
  }, [treeConfirm]);

  // 下载路径恢复默认确认：打开聚焦确认键，Escape 关闭；忙时锁关闭。
  useEffect(() => {
    if (!downloadResetConfirm) {
      return;
    }
    downloadResetConfirmRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (downloadResetBusy) {
          return;
        }
        setDownloadResetConfirm(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [downloadResetConfirm, downloadResetBusy]);

  useEffect(() => {
    if (downloadResetConfirm) {
      return;
    }
    downloadResetTriggerRef.current?.focus();
    downloadResetTriggerRef.current = null;
  }, [downloadResetConfirm]);

  // 组级确认对话框：打开聚焦确认键，Escape 关闭；忙时锁关闭通道。
  // 触发源在侧边栏导航（组件树之外），关闭后不强制回焦点。
  useEffect(() => {
    if (!groupResetOpen) {
      return;
    }
    groupResetConfirmRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (groupResetBusy) {
          return;
        }
        setGroupResetOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [groupResetOpen, groupResetBusy]);

  /** 终端预算恢复默认：直接写默认字节数，无需确认（产品决策 2026-09-24）。
   * 返回写入结果：单块点击按需 toast；组级恢复 await 后失败可见（Phase 4 M3）。
   * `updatePreferences` 契约恒 resolve boolean（实现内全量 try/catch，见 generalActions），
   * 不再挂第二层 `.catch`（Phase 4 B-P1）。 */
  const handleTerminalBudgetReset = useCallback((): Promise<boolean> => {
    return useAppStore.getState().updatePreferences({
      terminalHistoryBudgetBytes: TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES,
    });
  }, []);

  const handleTerminalBudgetResetClick = useCallback(() => {
    void handleTerminalBudgetReset().then((ok) => {
      if (!ok) {
        showToast(t.settingsUpdateFailed, 'error');
      }
    });
  }, [handleTerminalBudgetReset, showToast, t]);

  /**
   * 下载路径恢复默认的共享序列（单块/组级共用，防漂移）：路径写回系统默认
   * （空串，migrate 按调用方传入的开框快照）+ 开关复位关闭（解耦，成败都执行）。
   * 各自 toast；返回整体 ok。调用方决定后续：单块成功关框，组级记 failed 汇总。
   */
  const resetDownloadToDefault = useCallback(
    async (migrate: boolean): Promise<boolean> => {
      let ok = true;
      const result = await changeDownloadPath('', migrate);
      if (!result.ok) {
        showToast(
          result.error.message === DOWNLOAD_REFRESH_FAILED
            ? t.storageDownloadRefreshFailed
            : migrate
              ? t.storageDownloadMigrateFailed.replace(
                  '{error}',
                  result.error.message ?? t.storageUnknownError,
                )
              : t.storagePickFailed.replace(
                  '{error}',
                  result.error.message ?? t.storageUnknownError,
                ),
          'error',
        );
        ok = false;
      }
      const upd = await updateDownloadSettings(undefined, undefined, false);
      if (!upd.ok) {
        showToast(
          upd.error.message === DOWNLOAD_REFRESH_FAILED
            ? t.storageDownloadRefreshFailed
            : t.settingsUpdateFailed,
          'error',
        );
        ok = false;
      }
      return ok;
    },
    [changeDownloadPath, updateDownloadSettings, showToast, t],
  );

  /** 下载路径恢复默认：确认后把路径写回系统默认（空串），按**开框时刻**的迁移开关
   * 快照决定是否搬文件（M4：对话框无焦点陷阱，开框后改开关不影响本次语义）。
   * 开关复位与搬迁结果解耦：无论搬迁成败都恢复为关闭（同组级语义，I1-N5）；
   * 任一失败对话框保持打开（同组级 M5）。重试安全：空串→空串幂等，重复 toast 为唯一成本。 */
  const handleDownloadResetConfirm = useCallback(async () => {
    setDownloadResetBusy(true);
    try {
      const ok = await resetDownloadToDefault(downloadMigrateAtOpenRef.current);
      if (ok) {
        setDownloadResetConfirm(false);
      }
    } finally {
      setDownloadResetBusy(false);
    }
  }, [resetDownloadToDefault]);

  // 自定义 TTL 防抖计时器卸载清理。
  useEffect(
    () => () => {
      if (ttlTimerRef.current) {
        clearTimeout(ttlTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const bridge = window.digitalLife?.storage;
    if (!bridge) {
      setStatusError(t.storageStatusLoadFailed.replace('{error}', t.storageBridgeUnavailable));
      setLoading(false);
      return;
    }
    void withTimeout(() => bridge.getStatus(), STATUS_TIMEOUT_MS)
      .then(
        (result) => {
          if (cancelled) {
            return;
          }
          try {
            if (!result.ok) {
              if (result.error == null) {
                // 形状错配（如旧后端裸值）只应出现在版本错配时；记 warn 供排查，UI 仍显示友好错误。
                console.warn('[storage] malformed IpcResult (missing error object)', result);
              }
              setStatusError(
                t.storageStatusLoadFailed.replace(
                  '{error}',
                  ipcErrorMessage(result.error, t.storageUnknownError),
                ),
              );
              setLoading(false);
              return;
            }
            if (!isWellFormedStatus(result.data)) {
              console.warn(
                '[storage] malformed IpcResult (ok:true missing data/categories)',
                result,
              );
              setStatusError(t.storageStatusLoadFailed.replace('{error}', t.storageUnknownError));
              setLoading(false);
              return;
            }
            setStatusError(null);
            setStatus(result.data);
            lastKnownRootRef.current = result.data.root;
            if (!draftsSeededRef.current) {
              setMode(result.data.mode);
              setRootDraft(result.data.root);
              setCategoryDrafts(
                Object.fromEntries(
                  result.data.categories.map((category) => [category.key, category.path]),
                ),
              );
              draftsSeededRef.current = true;
            }
            setLoading(false);
          } catch (error) {
            // 成功处理器内部抛错（如畸形 `ok:true` 取属性失败）：同样落加载失败，不卡 loading（F1）。
            console.warn('[storage] malformed IpcResult (onFulfilled threw)', result, error);
            setStatusError(t.storageStatusLoadFailed.replace('{error}', t.storageUnknownError));
            setLoading(false);
          }
        },
        (error: unknown) => {
          if (cancelled) {
            return;
          }
          // 超时哨兵报超时文案；其它拒绝（如 channel closed、同步抛错）报加载失败+原文（F3）。
          if (error instanceof StatusTimeoutError) {
            setStatusError(t.storageStatusTimeout);
          } else {
            setStatusError(
              t.storageStatusLoadFailed.replace(
                '{error}',
                error instanceof Error ? error.message : t.storageUnknownError,
              ),
            );
          }
          setLoading(false);
        },
      )
      .catch((error: unknown) => {
        // 成功处理器抛错的兜底：已在内层 try/catch 处理，这里防漏网（如拒绝处理器抛错）。
        if (cancelled) {
          return;
        }
        console.warn('[storage] malformed IpcResult (unexpected throw)', error);
        setStatusError(t.storageStatusLoadFailed.replace('{error}', t.storageUnknownError));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  /** 只刷新后端状态（不覆盖用户正在编辑的草稿）；成功时清除加载错误，失败 toast（F5）。
   * 返回最新状态（恢复默认流程用它回填数据根输入；失败返回 null）。 */
  const refresh = useCallback(async () => {
    const bridge = window.digitalLife?.storage;
    if (!bridge) {
      return null;
    }
    try {
      const result = await withTimeout(() => bridge.getStatus(), STATUS_TIMEOUT_MS);
      if (!result.ok) {
        if (result.error == null) {
          console.warn('[storage] malformed IpcResult (missing error object)', result);
        }
        showToast(
          t.storageStatusLoadFailed.replace(
            '{error}',
            ipcErrorMessage(result.error, t.storageUnknownError),
          ),
          'error',
        );
        return null;
      }
      if (!isWellFormedStatus(result.data)) {
        console.warn('[storage] malformed IpcResult (ok:true missing data/categories)', result);
        showToast(t.storageStatusLoadFailed.replace('{error}', t.storageUnknownError), 'error');
        return null;
      }
      setStatusError(null);
      setStatus(result.data);
      lastKnownRootRef.current = result.data.root;
      return result.data;
    } catch (error) {
      if (error instanceof StatusTimeoutError) {
        showToast(t.storageStatusTimeout, 'error');
      } else {
        showToast(
          t.storageStatusLoadFailed.replace(
            '{error}',
            error instanceof Error ? error.message : t.storageUnknownError,
          ),
          'error',
        );
      }
      return null;
    }
  }, [showToast, t]);

  /** 加载失败后的重试：重置状态并重新拉取（同样受超时保护）。加载中禁用防重入（F9）。 */
  const handleRetryLoad = useCallback(async () => {
    if (loading) {
      return;
    }
    const bridge = window.digitalLife?.storage;
    if (!bridge) {
      setStatusError(t.storageStatusLoadFailed.replace('{error}', t.storageBridgeUnavailable));
      return;
    }
    setLoading(true);
    setStatusError(null);
    try {
      const result = await withTimeout(() => bridge.getStatus(), STATUS_TIMEOUT_MS);
      if (!result.ok) {
        if (result.error == null) {
          console.warn('[storage] malformed IpcResult (missing error object)', result);
        }
        setStatusError(
          t.storageStatusLoadFailed.replace(
            '{error}',
            ipcErrorMessage(result.error, t.storageUnknownError),
          ),
        );
      } else if (!isWellFormedStatus(result.data)) {
        console.warn('[storage] malformed IpcResult (ok:true missing data/categories)', result);
        setStatusError(t.storageStatusLoadFailed.replace('{error}', t.storageUnknownError));
      } else {
        // 重试成功必须清除状态错误（F4），并重播种草稿（显式用户动作）。
        setStatusError(null);
        setStatus(result.data);
        lastKnownRootRef.current = result.data.root;
        setMode(result.data.mode);
        setRootDraft(result.data.root);
        setCategoryDrafts(
          Object.fromEntries(
            result.data.categories.map((category) => [category.key, category.path]),
          ),
        );
        draftsSeededRef.current = true;
      }
    } catch (error) {
      if (error instanceof StatusTimeoutError) {
        setStatusError(t.storageStatusTimeout);
      } else {
        setStatusError(
          t.storageStatusLoadFailed.replace(
            '{error}',
            error instanceof Error ? error.message : t.storageUnknownError,
          ),
        );
      }
    }
    setLoading(false);
  }, [loading, t]);

  const buildPatch = useCallback(
    (retainSource: boolean): StoragePathPatch => ({
      mode,
      root: mode === 'unified' ? rootDraft.trim() : null,
      categories:
        mode === 'per_category'
          ? Object.fromEntries(Object.entries(categoryDrafts).map(([k, v]) => [k, v.trim()]))
          : {},
      retainSource,
    }),
    [mode, rootDraft, categoryDrafts],
  );

  const handleModeChange = useCallback(
    (next: StorageMode) => {
      setMode(next);
      if (next === 'unified') {
        setCategoryDrafts({});
        return;
      }
      setCategoryDrafts(
        Object.fromEntries(
          (status?.categories ?? []).map((category) => [category.key, category.path]),
        ),
      );
    },
    [status],
  );

  const handlePickDirectory = useCallback(
    async (applyPath: (path: string) => void) => {
      const bridge = window.digitalLife?.workspace;
      if (!bridge?.pickDirectory) {
        showToast(t.storagePickUnavailable, 'error');
        return;
      }
      setPicking(true);
      try {
        const result = await bridge.pickDirectory();
        if (!result.ok) {
          showToast(
            t.storagePickFailed.replace(
              '{error}',
              ipcErrorMessage(result.error, t.storageUnknownError),
            ),
            'error',
          );
          return;
        }
        if (result.data) {
          applyPath(result.data);
        }
      } finally {
        setPicking(false);
      }
    },
    [showToast, t],
  );

  /** 预检一个路径补丁并在通过后打开迁移对话框（「应用」与「恢复默认」共用）。
   * 失败路径清 `resetReseedRef`：恢复默认置位后预检失败时标志不滞留，
   * 避免之后无关的常规「应用」成功时误触发根回填（Phase 4 B-O1）。 */
  const applyPatch = useCallback(
    async (patch: StoragePathPatch) => {
      const bridge = window.digitalLife?.storage;
      if (!bridge) {
        resetReseedRef.current = false;
        return;
      }
      setBusy(true);
      try {
        const result = await bridge.preflight(patch);
        if (!result.ok) {
          resetReseedRef.current = false;
          showToast(ipcErrorMessage(result.error, t.storageUnknownError), 'error');
          return;
        }
        setPreflight(result.data);
        setDialogOpen(true);
      } catch (error) {
        // preflight promise reject（与 !ok 同为失败）：清标志 + toast，防第三条滞留路径与
        // void 调用方的 unhandled rejection（Phase 4 B-N4）。
        resetReseedRef.current = false;
        showToast(
          ipcErrorMessage(error instanceof Error ? error : null, t.storageUnknownError),
          'error',
        );
      } finally {
        setBusy(false);
      }
    },
    [showToast, t],
  );

  const handleApply = useCallback(() => {
    void applyPatch(buildPatch(false));
  }, [applyPatch, buildPatch]);

  /**
   * 「恢复 核心数据路径 全部默认」：把表单草稿重置为默认（路径模式→统一根目录、
   * 数据根目录→默认、逐类覆盖清空），并复用「应用」的迁移流程完成实际落盘。
   * @see CORE_RESET_PATCH
   */
  const handleResetCorePaths = useCallback(() => {
    setMode('unified');
    setRootDraft('');
    setCategoryDrafts({});
    // 恢复流程：落盘成功后用后端解析出的默认根回填输入框（不空显示）。
    resetReseedRef.current = true;
    void applyPatch(CORE_RESET_PATCH);
  }, [applyPatch]);

  /**
   * 组级对话框打开（承接 pending 信号）：
   * 1. 消费 pending + `groupResetOpeningRef` in-flight 门控：app 当前未启用 StrictMode
   *    （main.tsx 直接 createRoot render），但门控防御将来启用时 effect 双跑读到同一
   *    闭包（pending/busy 皆 stale）导致的并发双预检（rev2 I4-N3）；
   * 2. 入口守卫：组框/单块迁移框/树确认/下载确认已开或任一 busy 时丢弃信号，
   *    杜绝并发预检/落盘与键盘路径多框叠加（H2/L2/rev2 I4-N4 半修残留 R4）；
   * 3. 先对默认补丁预检，**成功后**才清草稿——预检失败不丢用户未保存编辑（M1）；
   * 4. 桥缺席 toast 不开框。
   */
  const groupResetOpeningRef = useRef(false);
  const openGroupResetDialog = useCallback(async () => {
    consumeStorageGroupReset();
    if (
      groupResetOpeningRef.current ||
      groupResetOpen ||
      groupResetBusy ||
      dialogOpen ||
      busy ||
      treeConfirm !== null ||
      downloadResetConfirm
    ) {
      return;
    }
    groupResetOpeningRef.current = true;
    const bridge = window.digitalLife?.storage;
    if (!bridge) {
      groupResetOpeningRef.current = false;
      showToast(t.storageStatusLoadFailed.replace('{error}', t.storageBridgeUnavailable), 'error');
      return;
    }
    setGroupResetBusy(true);
    try {
      const result = await bridge.preflight(CORE_RESET_PATCH);
      if (!result.ok) {
        showToast(ipcErrorMessage(result.error, t.storageUnknownError), 'error');
        return;
      }
      // 预检通过后再把草稿清成恢复值（与单块恢复一致：取消也不回填），
      // 同时快照下载迁移开关供本次组流程全程使用（M4-R：与对话框展示文案同源）。
      setMode('unified');
      setRootDraft('');
      setCategoryDrafts({});
      setGroupResetRetain(false);
      groupMigrateAtOpenRef.current = downloadSettings.auto_migrate_on_path_change;
      setGroupResetPreflight(result.data);
      setGroupResetOpen(true);
    } finally {
      groupResetOpeningRef.current = false;
      setGroupResetBusy(false);
    }
  }, [
    consumeStorageGroupReset,
    groupResetOpen,
    groupResetBusy,
    dialogOpen,
    busy,
    treeConfirm,
    downloadResetConfirm,
    downloadSettings.auto_migrate_on_path_change,
    showToast,
    t,
  ]);

  // 存储组级恢复默认：侧边栏置 pending（顺带切到存储组），此处消费并开自有对话框。
  // pending 为布尔——挂载即消费，不存在「新值被当历史播种」的首跳漏弹（H1）。
  useEffect(() => {
    if (!storageGroupResetPending) {
      return;
    }
    void openGroupResetDialog();
  }, [storageGroupResetPending, openGroupResetDialog]);

  // 卸载兜底：pending 置位后若组件在消费前卸载（挂载失败等极小概率），清信号
  // 避免残留到下次挂载"迟到弹窗"（task4 L-1；正常路径挂载即消费，此处恒为 no-op）。
  useEffect(() => {
    return () => {
      useAppStore.getState().consumeStorageGroupReset();
    };
  }, [consumeStorageGroupReset]);

  const handleApplyMigration = useCallback(
    async (retainSource: boolean, applyNow: boolean) => {
      const bridge = window.digitalLife?.storage;
      if (!bridge) {
        return;
      }
      setBusy(true);
      try {
        const result = await bridge.setPaths(buildPatch(retainSource), applyNow);
        if (!result.ok) {
          showToast(ipcErrorMessage(result.error, t.storageUnknownError), 'error');
          return;
        }
        // 后端可能拒绝写入（预检失败时返回 restartRequired:false + failing preflight）：
        // 此时保持对话框打开并回填预检结果展示 errors/warnings，不 toast、不关闭。
        if (!result.data.preflight.ok) {
          setPreflight(result.data.preflight);
          return;
        }
        setDialogOpen(false);
        if (applyNow && result.data.restartRequired) {
          const restarted = await bridge.restartApp();
          if (!restarted.ok) {
            // 浏览器模式无法重启宿主进程（B5）：待迁移项已登记，下次启动生效。
            showToast(t.storageRestartUnavailableInBrowser, 'error');
          } else {
            showToast(t.storageRestartRequired, 'success');
          }
        } else {
          showToast(t.storagePendingBanner, 'success');
        }
        const fresh = await refresh();
        // 恢复流程回填：草稿曾被清成空串，用最新解析根回填，避免输入框空显示。
        // 待迁移（下次启动生效）时回填的仍是旧根——数据确实还在旧位置，诚实展示。
        if (resetReseedRef.current && fresh) {
          setRootDraft(fresh.root);
        }
        resetReseedRef.current = false;
      } finally {
        setBusy(false);
      }
    },
    [buildPatch, refresh, showToast, t],
  );

  const handleRetryMigration = useCallback(async () => {
    const bridge = window.digitalLife?.storage;
    if (!bridge) {
      return;
    }
    setBusy(true);
    try {
      const result = await bridge.restartApp();
      if (!result.ok) {
        showToast(t.storageRestartUnavailableInBrowser, 'error');
        return;
      }
      showToast(t.storageRestartRequired, 'success');
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh, showToast, t]);

  const handleCancelPending = useCallback(async () => {
    const bridge = window.digitalLife?.storage;
    if (!bridge) {
      return;
    }
    setBusy(true);
    try {
      const result = await bridge.cancelPending();
      if (!result.ok) {
        showToast(ipcErrorMessage(result.error, t.storageUnknownError), 'error');
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh, showToast, t]);

  /** 丢弃在途的自定义输入（改选预设/重置/关闭开关/切单位前必须先处理，
   * 否则旧草稿会在防抖到期后覆盖新意图）。 */
  const cancelPendingTtl = useCallback(() => {
    ttlPendingRef.current = null;
    if (ttlTimerRef.current) {
      clearTimeout(ttlTimerRef.current);
      ttlTimerRef.current = null;
    }
  }, []);

  /** 清除确认：删全行（派生数据，下次扫描重建）后重拉 stats；失败 toast。
   * 桥本身抛错（通道关闭等）与 !ok 同等落 toast，不抛未处理拒绝。 */
  const handleTreeClearConfirm = useCallback(async () => {
    const bridge = window.digitalLife?.storage;
    if (!bridge) {
      return;
    }
    const seq = ++treeWriteSeqRef.current;
    setTreeBusy(true);
    try {
      const result = await bridge.clearTreeCache();
      if (!result.ok) {
        showToast(ipcErrorMessage(result.error, t.storageUnknownError), 'error');
        return;
      }
      setTreeConfirm(null);
      await loadTreeStats(seq);
    } catch (e) {
      showToast(ipcErrorMessage(e instanceof Error ? e : null, t.storageUnknownError), 'error');
    } finally {
      setTreeBusy(false);
    }
  }, [loadTreeStats, showToast, t]);

  /** 关闭确认：串行 写 options(enabled=false) → 清缓存 → 重拉 stats；失败 toast。
   * 桥本身抛错（通道关闭等）与 !ok 同等落 toast，对话框保持打开，不抛未处理拒绝。 */
  const handleTreeDisableConfirm = useCallback(
    async (opts: TreeCacheOptions) => {
      const bridge = window.digitalLife?.storage;
      if (!bridge) {
        return;
      }
      // 在途 TTL 防抖若此时到期，会用过期闭包把开关写回 true：先丢弃。
      cancelPendingTtl();
      const seq = ++treeWriteSeqRef.current;
      setTreeBusy(true);
      try {
        const result = await bridge.setTreeCacheOptions(opts);
        if (!result.ok) {
          showToast(ipcErrorMessage(result.error, t.storageUnknownError), 'error');
          return;
        }
        const clearResult = await bridge.clearTreeCache();
        if (!clearResult.ok) {
          showToast(ipcErrorMessage(clearResult.error, t.storageUnknownError), 'error');
          // 开关已写成功：仍关闭对话框并重拉 stats，避免勾选状态卡在旧值。
        }
        setTreeConfirm(null);
        await loadTreeStats(seq);
        // 回拉可能返回陈旧 enabled（no-op/静默失败）：写成功的结果以本地 opts 为准。
        // 被更新写超车时跳过合并（序列号守卫）。
        if (treeWriteSeqRef.current !== seq) {
          return;
        }
        setTreeStats((prev) => (prev ? { ...prev, ...opts } : prev));
      } catch (e) {
        showToast(ipcErrorMessage(e instanceof Error ? e : null, t.storageUnknownError), 'error');
      } finally {
        setTreeBusy(false);
      }
    },
    [cancelPendingTtl, loadTreeStats, showToast, t],
  );

  /** 开关/TTL 写后重拉 stats + 本地合并回写（防 stats 回拉静默失败导致勾选弹回）。
   * 桥本身抛错落 toast，不抛未处理拒绝。返回写成功与否供组级汇总（N4；调用方 void 忽略亦可）。 */
  const handleTreeOptionsChange = useCallback(
    async (opts: TreeCacheOptions): Promise<boolean> => {
      const bridge = window.digitalLife?.storage;
      if (!bridge) {
        return false;
      }
      const seq = ++treeWriteSeqRef.current;
      try {
        const result = await bridge.setTreeCacheOptions(opts);
        if (!result.ok) {
          showToast(ipcErrorMessage(result.error, t.storageUnknownError), 'error');
          return false;
        }
      } catch (e) {
        showToast(ipcErrorMessage(e instanceof Error ? e : null, t.storageUnknownError), 'error');
        return false;
      }
      // 快速连续写是 last-completion-wins：被更新写超车时跳过本次合并。
      if (treeWriteSeqRef.current !== seq) {
        return true;
      }
      setTreeStats((prev) =>
        prev ? { ...prev, enabled: opts.enabled, ttlMinutes: opts.ttlMinutes } : prev,
      );
      await loadTreeStats(seq);
      if (treeWriteSeqRef.current !== seq) {
        return true;
      }
      setTreeStats((prev) =>
        prev ? { ...prev, enabled: opts.enabled, ttlMinutes: opts.ttlMinutes } : prev,
      );
      return true;
    },
    [loadTreeStats, showToast, t],
  );

  /** 复选框：勾选直接写；取消勾选弹关闭确认（含清缓存影响说明），确认后才写。 */
  const handleTreeEnabledToggle = useCallback(
    (checked: boolean) => {
      if (checked) {
        // 在途自定义草稿若此时到期会覆盖新意图：与取消路径同样先丢弃。
        cancelPendingTtl();
        void handleTreeOptionsChange({
          enabled: true,
          ttlMinutes: treeStats?.ttlMinutes ?? TREE_CACHE_DEFAULTS.ttlMinutes,
        });
        return;
      }
      // 在途 TTL 防抖若在确认对话框期间到期，会把开关写回 true：先丢弃。
      cancelPendingTtl();
      setTreeConfirm('disable');
    },
    [cancelPendingTtl, handleTreeOptionsChange, treeStats?.ttlMinutes],
  );

  const categories = status?.categories ?? [];

  /** 展示用分类：`downloads_default`（默认下载目标）已并入下方「浏览器默认下载路径」块，此处不再重复列出。 */
  const displayCategories = categories.filter((category) => category.key !== 'downloads_default');

  /** 草稿与已持久化状态是否不一致：有未应用的修改（用于粘性提交条）。 */
  const isDirty = Boolean(
    status &&
    (mode !== status.mode ||
      (mode === 'unified'
        ? rootDraft.trim() !== status.root
        : categories.some((c) => (categoryDrafts[c.key] ?? c.path).trim() !== c.path))),
  );

  // 观测「块底部 撤回/应用」是否可见：可见时推移性提交条隐藏；不可见（向上/向下滚、窗口变化）时显示。
  // 根取最近的滚动容器（与 sticky bottom 一致），找不到则用视口。
  useEffect(() => {
    const el = bottomCtaRef.current;
    if (!el || !isDirty || typeof IntersectionObserver === 'undefined') {
      return;
    }
    let root: Element | null = null;
    let node: HTMLElement | null = el.parentElement;
    while (node) {
      const ov = getComputedStyle(node).overflowY;
      if (ov === 'auto' || ov === 'scroll' || ov === 'overlay') {
        root = node;
        break;
      }
      node = node.parentElement;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setBottomCtaVisible(entry.isIntersecting);
        }
      },
      { root, threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isDirty]);

  // 开关/TTL 控件以 stats 为真源；stats 缺席时区段不渲染，缺省值仅供回退展示。
  const treeEnabled = treeStats?.enabled ?? TREE_CACHE_DEFAULTS.enabled;
  const treeTtlMinutes = treeStats?.ttlMinutes ?? TREE_CACHE_DEFAULTS.ttlMinutes;

  // 四块「恢复默认」按钮的禁用判定（spec §3）：各块在其数据源未知时保持启用
  //（fail-open），未知态不禁用。per_category 模式下核心按钮恒启用是有意的：
  // 一键回到统一默认本身就是有效操作（CORE_RESET_PATCH），不存在"无事可做"态。
  const coreAtDefault =
    status !== null && status.mode === 'unified' && status.root === status.defaultRoot && !isDirty;
  // treeStats 为 null（未加载/失败）时视为未知 → false（展示区段此时不渲染按钮，
  // 但聚合信号必须保守，不能把未知计为默认）。
  const treeAtDefault =
    treeStats !== null && treeEnabled && treeTtlMinutes === TREE_CACHE_DEFAULTS.ttlMinutes;
  const budgetBytes = useAppStore((s) => s.appInfo?.config?.terminalHistoryBudgetBytes);
  const budgetAtDefault =
    budgetBytes !== undefined && budgetBytes === TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES;
  const downloadSettingsLoaded = useAppStore((s) => s.downloadSettingsLoaded);
  // store 初值恰为默认形，无 loaded 标记无法区分"未知"与"默认" → 未知时启用。
  const downloadAtDefault =
    downloadSettingsLoaded &&
    downloadSettings.default_path === '' &&
    !downloadSettings.auto_migrate_on_path_change;

  // 侧边栏存储行 disabled 聚合信号：四块全默认才为 true；卸载（切出存储组）时清 null
  // 回到"未知→启用"。transient，不持久化。
  const setStorageBlocksAtDefault = useAppStore((s) => s.setStorageBlocksAtDefault);
  useEffect(() => {
    setStorageBlocksAtDefault(
      coreAtDefault && treeAtDefault && budgetAtDefault && downloadAtDefault,
    );
  }, [coreAtDefault, treeAtDefault, budgetAtDefault, downloadAtDefault, setStorageBlocksAtDefault]);
  useEffect(() => () => setStorageBlocksAtDefault(null), [setStorageBlocksAtDefault]);

  // options 身份稳定，避免下游 SettingsSelect 订阅 effect 每渲染重绑监听。
  const ttlSelectOptions = useMemo(
    () => [
      ...TREE_CACHE_TTL_OPTIONS.map((minutes) => ({
        value: String(minutes),
        label:
          minutes === 1440
            ? t.treeCacheTtlDay
            : t.treeCacheTtlMinutes.replace('{minutes}', String(minutes)),
      })),
      { value: TREE_CACHE_TTL_CUSTOM, label: t.treeCacheTtlCustom },
    ],
    [t.treeCacheTtlMinutes, t.treeCacheTtlDay, t.treeCacheTtlCustom],
  );

  const ttlUnitOptions = useMemo(
    () => [
      { value: 's', label: t.treeCacheUnitSecond },
      { value: 'm', label: t.treeCacheUnitMinute },
      { value: 'h', label: t.treeCacheUnitHour },
      { value: 'd', label: t.treeCacheUnitDay },
    ],
    [t.treeCacheUnitSecond, t.treeCacheUnitMinute, t.treeCacheUnitHour, t.treeCacheUnitDay],
  );

  const treeTtlIsPreset = TREE_CACHE_TTL_OPTIONS.includes(
    treeTtlMinutes as (typeof TREE_CACHE_TTL_OPTIONS)[number],
  );
  // 非预设值或用户选了「自定义…」→ 自定义编辑态（本地草稿，不覆盖 stats）。
  const showTtlCustom = ttlCustomMode || !treeTtlIsPreset;
  const ttlSelectValue = showTtlCustom ? TREE_CACHE_TTL_CUSTOM : String(treeTtlMinutes);

  const commitTtlCustom = useCallback(() => {
    if (ttlTimerRef.current) {
      clearTimeout(ttlTimerRef.current);
      ttlTimerRef.current = null;
    }
    const pending = ttlPendingRef.current;
    ttlPendingRef.current = null;
    if (pending === null) {
      return;
    }
    // 按草稿自带单位换算（切单位后 timer 重排仍用旧单位口径，不错位）。
    const minutes = treeTtlMinutesFromCustom(Number(pending.value), pending.unit);
    // 非法输入（空/0/负/NaN）静默丢弃不出桥：防抖输入的常见选择——输入框保留草稿，
    // 用户继续键入即重新排队，无需错误态打断编辑。
    if (minutes === null) {
      return;
    }
    void handleTreeOptionsChange({ enabled: treeEnabled, ttlMinutes: minutes });
  }, [handleTreeOptionsChange, treeEnabled]);

  /** 重排防抖 timer（调用方已更新 pending；回调读 ref，单位恒新鲜）。 */
  const rearmTtlTimer = useCallback(() => {
    if (ttlTimerRef.current) {
      clearTimeout(ttlTimerRef.current);
    }
    ttlTimerRef.current = setTimeout(commitTtlCustom, TREE_TTL_COMMIT_DEBOUNCE_MS);
  }, [commitTtlCustom]);

  const handleTtlSelectChange = useCallback(
    (v: string) => {
      cancelPendingTtl();
      if (v === TREE_CACHE_TTL_CUSTOM) {
        setTtlCustomMode(true);
        setTtlCustomValue(String(treeTtlMinutes));
        setTtlCustomUnit('m');
        return;
      }
      setTtlCustomMode(false);
      setTtlCustomValue('');
      const raw = Number(v);
      if (!Number.isFinite(raw)) {
        return;
      }
      // 与服务端合法范围 1..=1440 对齐：钳制后写（非法值不出桥）。
      const ttlMinutes = Math.min(1440, Math.max(1, Math.floor(raw)));
      void handleTreeOptionsChange({ enabled: treeEnabled, ttlMinutes });
    },
    [cancelPendingTtl, handleTreeOptionsChange, treeEnabled, treeTtlMinutes],
  );

  const handleTtlCustomChange = useCallback(
    (raw: string) => {
      setTtlCustomValue(raw);
      ttlPendingRef.current = { value: raw, unit: ttlCustomUnit };
      rearmTtlTimer();
    },
    [rearmTtlTimer, ttlCustomUnit],
  );

  // 后端合法但不在预设档的 TTL（如 30）：进入自定义态时播种草稿（不覆盖在途输入）。
  useEffect(() => {
    if (treeTtlIsPreset || ttlPendingRef.current !== null || ttlCustomMode) {
      return;
    }
    setTtlCustomValue(String(treeTtlMinutes));
    setTtlCustomUnit('m');
  }, [treeTtlIsPreset, treeTtlMinutes, ttlCustomMode]);

  /** 恢复默认：enabled=true、ttl=15；不触发清缓存。
   * 产品决策（2026-09-24）：“恢复默认”含重开语义——关闭态点击同样写 enabled=true
   *（默认值本身就是开启），按钮在关闭态保持可用。返回写入 Promise 供组级 await（L5）。 */
  const handleTreeResetDefaults = useCallback(() => {
    cancelPendingTtl();
    setTtlCustomMode(false);
    setTtlCustomValue('');
    return handleTreeOptionsChange({ ...TREE_CACHE_DEFAULTS });
  }, [cancelPendingTtl, handleTreeOptionsChange]);

  /**
   * 存储组级「恢复全部默认」一步执行（迁移时机确认键共用）：
   * 1. 桥检查前移（L4）；2. **核心先行**：核心 setPaths（含后端二次 preflight）失败即早返，
   *    不再执行下载搬运等不可逆操作——缩小不可逆部分生效窗口（closing H-1）；
   *    其余三块（预算/树/下载）互不阻塞、失败各自 toast（既定产品语义）；
   * 3. 核心路径落盘用**开框预检的补丁快照**（仅替换 retainSource），不读实时草稿（M2）；
   * 4. 下载搬运的 migrate 开关用**开框快照**，与对话框展示文案同源（M4-R）；
   * 5. 任一分支失败：尾部只发汇总错误（不再发成功 toast，M5），且**保持对话框打开**
   *    供检查/重试（与单块/树确认框"失败不关框"对齐，M5-R）；尾段仿 handleApplyMigration。
   */
  const handleGroupResetApply = useCallback(
    async (applyNow: boolean) => {
      const bridge = window.digitalLife?.storage;
      if (!bridge) {
        showToast(
          t.storageStatusLoadFailed.replace('{error}', t.storageBridgeUnavailable),
          'error',
        );
        return;
      }
      // 预检失败的对话框不进入本函数（按钮 disabled），编程调用再守一次（task4 L-2）。
      if (groupResetPreflight && !groupResetPreflight.ok) {
        return;
      }
      setGroupResetBusy(true);
      try {
        // 核心先行：最易失败且其失败会让一切无意义，先落盘；失败早返。
        const applied = await bridge.setPaths(
          { ...CORE_RESET_PATCH, retainSource: groupResetRetain },
          applyNow,
        );
        if (!applied.ok) {
          showToast(ipcErrorMessage(applied.error, t.storageUnknownError), 'error');
          return;
        }
        // 后端可能拒绝写入：保持对话框打开并回填预检结果展示 errors/warnings。
        if (!applied.data.preflight.ok) {
          setGroupResetPreflight(applied.data.preflight);
          return;
        }
        // 任一分支失败即记 failed：尾部不再发"成功"toast，改发汇总错误（task1 M5）。
        let failed = false;
        const budgetOk = await handleTerminalBudgetReset();
        if (!budgetOk) {
          showToast(t.settingsUpdateFailed, 'error');
          failed = true;
        }
        // 树写自带错误 toast；返回值纳入汇总（N4）。
        const treeOk = await handleTreeResetDefaults();
        if (!treeOk) {
          failed = true;
        }
        const downloadOk = await resetDownloadToDefault(groupMigrateAtOpenRef.current);
        if (!downloadOk) {
          failed = true;
        }
        // 树/预算走独立桥，此处 refresh 仅回填核心根（L5）。
        const fresh = await refresh();
        if (fresh) {
          lastKnownRootRef.current = fresh.root;
          setRootDraft(fresh.root);
        } else if (lastKnownRootRef.current ?? status?.root) {
          // refresh 失败也回填上次已知根，避免输入框空显示（L3/L-6）。
          setRootDraft(lastKnownRootRef.current ?? status?.root ?? '');
        }
        if (failed) {
          // 任一分支失败：只发汇总错误，不发成功 toast，且保持对话框打开供检查（M5-R）。
          showToast(t.settingsUpdateFailed, 'error');
          return;
        }
        setGroupResetOpen(false);
        if (applyNow && applied.data.restartRequired) {
          const restarted = await bridge.restartApp();
          if (!restarted.ok) {
            showToast(t.storageRestartUnavailableInBrowser, 'error');
          } else {
            showToast(t.storageRestartRequired, 'success');
          }
        } else {
          showToast(t.storagePendingBanner, 'success');
        }
      } finally {
        setGroupResetBusy(false);
      }
    },
    [
      handleTerminalBudgetReset,
      handleTreeResetDefaults,
      resetDownloadToDefault,
      groupResetRetain,
      groupResetPreflight,
      refresh,
      status,
      showToast,
      t,
    ],
  );

  const pathFor = (category: StorageCategoryStatus) =>
    categoryDrafts[category.key] ?? category.path;

  const renderCategory = (category: StorageCategoryStatus) => (
    <StorageCategoryRow
      key={category.key}
      category={category}
      path={pathFor(category)}
      editable={mode === 'per_category'}
      picking={picking}
      onPathChange={(path) => setCategoryDrafts((prev) => ({ ...prev, [category.key]: path }))}
      onPickDirectory={() =>
        void handlePickDirectory((path) =>
          setCategoryDrafts((prev) => ({ ...prev, [category.key]: path })),
        )
      }
    />
  );

  const resetLabel = formatT(t, 'settingsResetGroupToDefault', {
    group: t.storageCorePathsTitle,
  });
  const treeResetLabel = formatT(t, 'settingsResetGroupToDefault', {
    group: t.treeCacheTitle,
  });
  const budgetResetLabel = formatT(t, 'settingsResetGroupToDefault', {
    group: t.storageTerminalBudgetTitle,
  });
  const downloadResetLabel = formatT(t, 'settingsResetGroupToDefault', {
    group: t.storageBrowserDownloadTitle,
  });

  if (loading) {
    return (
      <div className="adl-settings-section adl-storage-settings">
        <div className="adl-settings-card">
          <SettingsHeader title={t.storageCorePathsTitle} />
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <small>{t.storageStatusLoading}</small>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (statusError && !status) {
    return (
      <div className="adl-settings-section adl-storage-settings">
        <div className="adl-settings-card">
          <SettingsHeader title={t.storageCorePathsTitle} />
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <small className="adl-settings-status adl-settings-status--danger">
                {statusError}
              </small>
            </div>
            <div className="adl-settings-row__control">
              <button
                type="button"
                className="adl-btn adl-btn--secondary"
                disabled={loading}
                onClick={() => void handleRetryLoad()}
              >
                {t.storageRetry}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="adl-settings-section adl-storage-settings">
      <div className="adl-settings-storage__header">
        <button
          type="button"
          className="adl-settings-row__reset"
          aria-label={resetLabel}
          title={resetLabel}
          data-testid="storage-reset-defaults"
          disabled={busy || coreAtDefault}
          onClick={handleResetCorePaths}
        >
          <IconResetDefaults size={14} decorative />
        </button>
        <SettingsHeader title={t.storageCorePathsTitle} />
      </div>

      <div className="adl-settings-card">
        <div
          className={`adl-settings-row${mode === 'unified' ? ' adl-settings-row--no-divider' : ''}`}
        >
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <HintCardTrigger content={t.storageModeHint}>
                <button
                  type="button"
                  className="adl-icon-button adl-icon-button--info"
                  tabIndex={-1}
                  aria-label={t.storageModeHint}
                >
                  <IconCircleHelp size={14} />
                </button>
              </HintCardTrigger>
              <span>{t.storageModeLabel}</span>
            </div>
          </div>
          <div className="adl-settings-row__control adl-settings-row__control--inline">
            <label className="adl-settings-radio">
              <input
                type="radio"
                name="adl-storage-mode"
                checked={mode === 'unified'}
                onChange={() => handleModeChange('unified')}
              />
              <span>{t.storageModeUnified}</span>
            </label>
            <label className="adl-settings-radio">
              <input
                type="radio"
                name="adl-storage-mode"
                checked={mode === 'per_category'}
                onChange={() => handleModeChange('per_category')}
              />
              <span>{t.storageModePerCategory}</span>
            </label>
          </div>
        </div>

        {mode === 'unified' ? (
          <div className="adl-settings-row adl-settings-row--path-center">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <HintCardTrigger content={t.storageRootHint}>
                  <button
                    type="button"
                    className="adl-icon-button adl-icon-button--info"
                    tabIndex={-1}
                    aria-label={t.storageRootHint}
                  >
                    <IconCircleHelp size={14} />
                  </button>
                </HintCardTrigger>
                <span>{t.storageRootLabel}</span>
              </div>
            </div>
            <div className="adl-settings-row__control adl-settings-row__control--inline">
              <input
                type="text"
                className="adl-settings-input adl-settings-input--path"
                aria-label={t.storageManualInput}
                placeholder={t.storageManualInputPlaceholder}
                value={rootDraft}
                onChange={(e) => setRootDraft(e.target.value)}
              />
              <button
                type="button"
                className="adl-btn adl-btn--path-pick"
                disabled={picking}
                onClick={() => void handlePickDirectory(setRootDraft)}
              >
                {t.storagePickDir}
              </button>
            </div>
          </div>
        ) : null}

        {displayCategories.length === 0 ? (
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <small>{t.storageNoCategories}</small>
            </div>
          </div>
        ) : (
          displayCategories.map(renderCategory)
        )}

        {isDirty ? (
          <div
            className="adl-settings-row adl-settings-row--actions"
            ref={bottomCtaRef}
            data-testid="storage-bottom-cta"
          >
            <div className="adl-settings-row__label">
              <span className="adl-storage-settings__cta-hint">
                {t.storageDirtyHint.replace('{block}', t.storageCorePathsTitle)}
              </span>
            </div>
            <div className="adl-settings-row__control adl-settings-row__control--inline">
              <button
                type="button"
                className="adl-btn adl-btn--secondary"
                disabled={busy}
                onClick={handleRevert}
              >
                {t.storageRevert}
              </button>
              <button
                type="button"
                className="adl-btn adl-btn--primary"
                disabled={busy}
                onClick={() => void handleApply()}
              >
                {t.storageApply}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {treeStats ? (
        <>
          <div className="adl-settings-storage__header adl-settings-storage__header--tree-cache">
            <button
              type="button"
              className="adl-settings-row__reset"
              aria-label={treeResetLabel}
              title={treeResetLabel}
              data-testid="tree-cache-reset"
              disabled={treeBusy || treeAtDefault}
              onClick={handleTreeResetDefaults}
            >
              <IconResetDefaults size={14} decorative />
            </button>
            <SettingsHeader title={t.treeCacheTitle} />
          </div>

          <div className="adl-settings-card">
            <div className="adl-settings-row" data-testid="tree-cache-section">
              <div className="adl-settings-row__label">
                <div className="adl-settings-row__label-text">
                  <span>{t.treeCacheStatsLabel}</span>
                </div>
                <div className="adl-tree-cache-stats">
                  <span>
                    {t.treeCacheWorkspaces.replace('{count}', String(treeStats.workspaceCount))}
                  </span>
                  <span className="adl-tree-cache-stats__sep" aria-hidden="true">
                    |
                  </span>
                  <span>
                    {t.treeCacheSize.replace('{size}', formatBytes(treeStats.totalBytes))}
                  </span>
                  <span className="adl-tree-cache-stats__sep" aria-hidden="true">
                    |
                  </span>
                  <span>
                    {typeof treeStats.newestCapturedAt !== 'number'
                      ? t.storageNotCreated
                      : t.treeCacheAge.replace(
                          '{time}',
                          // 缓存时间为绝对时刻：按应用语言经 Intl 本地化渲染。
                          formatTreeCacheTime(treeStats.newestCapturedAt, locale),
                        )}
                  </span>
                </div>
              </div>
              <div className="adl-settings-row__control">
                {/* 次要动作按钮：灰底偏直角、描边仅 hover（path-pick 交互语言）。 */}
                <button
                  type="button"
                  className="adl-btn adl-btn--path-pick"
                  data-testid="tree-cache-clear"
                  disabled={treeBusy}
                  onClick={(e) => {
                    treeConfirmTriggerRef.current = e.currentTarget;
                    setTreeConfirm('clear');
                  }}
                >
                  {t.treeCacheClear}
                </button>
              </div>
            </div>

            <div
              className="adl-settings-row adl-settings-row--path-center"
              data-testid="tree-cache-enabled-row"
            >
              <div className="adl-settings-row__label">
                <div className="adl-settings-row__label-text">
                  {/* 纯文本 label（无附加样式）：点文字即切换，零视觉变更。 */}
                  <label htmlFor="adl-tree-cache-enabled">{t.treeCacheEnabled}</label>
                  <input
                    id="adl-tree-cache-enabled"
                    type="checkbox"
                    aria-label={t.treeCacheEnabled}
                    checked={treeEnabled}
                    disabled={treeBusy}
                    onChange={(e) => {
                      treeConfirmTriggerRef.current = e.currentTarget;
                      handleTreeEnabledToggle(e.target.checked);
                    }}
                  />
                </div>
                <small>{t.treeCacheEnabledHint}</small>
              </div>
              <div className="adl-settings-row__control adl-settings-row__control--inline">
                {showTtlCustom ? (
                  <>
                    <input
                      type="number"
                      className="adl-settings-input adl-settings-input--narrow"
                      min={1}
                      max={treeTtlUnitMax(ttlCustomUnit)}
                      step={1}
                      aria-label={t.treeCacheTtlCustom}
                      value={ttlCustomValue}
                      disabled={treeBusy || !treeEnabled}
                      onChange={(e) => handleTtlCustomChange(e.target.value)}
                      onBlur={commitTtlCustom}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          commitTtlCustom();
                        }
                      }}
                    />
                    <SettingsSelect
                      value={ttlCustomUnit}
                      options={ttlUnitOptions}
                      onChange={(v) => {
                        if (!isTreeTtlUnit(v)) {
                          return;
                        }
                        // 切单位是继续编辑同一草稿：在途输入换算到新单位后显示与待提交一致，
                        // 不丢草稿、不立即写桥（仍走防抖）；非法草稿则丢弃。
                        const pending = ttlPendingRef.current;
                        if (pending !== null) {
                          const minutes = treeTtlMinutesFromCustom(
                            Number(pending.value),
                            pending.unit,
                          );
                          if (minutes === null) {
                            cancelPendingTtl();
                          } else {
                            const converted = formatMinutesForUnit(minutes, v);
                            ttlPendingRef.current = { value: converted, unit: v };
                            setTtlCustomValue(converted);
                            rearmTtlTimer();
                          }
                        }
                        setTtlCustomUnit(v);
                      }}
                      label={t.treeCacheTtlUnitLabel}
                      disabled={treeBusy || !treeEnabled}
                    />
                  </>
                ) : null}
                {/* 默认选项下拉恒在最右（自定义态顺序：数值 → 单位 → 默认选项）。 */}
                <SettingsSelect
                  value={ttlSelectValue}
                  options={ttlSelectOptions}
                  onChange={handleTtlSelectChange}
                  label={t.treeCacheTtl}
                  disabled={treeBusy || !treeEnabled}
                />
              </div>
            </div>
          </div>
        </>
      ) : null}

      <div className="adl-settings-storage__header adl-settings-storage__header--section">
        <button
          type="button"
          className="adl-settings-row__reset"
          aria-label={budgetResetLabel}
          title={budgetResetLabel}
          data-testid="terminal-budget-reset"
          disabled={budgetAtDefault || groupResetBusy}
          onClick={handleTerminalBudgetResetClick}
        >
          <IconResetDefaults size={14} decorative />
        </button>
        <SettingsHeader title={t.storageTerminalBudgetTitle} />
      </div>
      <div className="adl-settings-card">
        <TerminalHistoryBudgetSection />
      </div>

      <div className="adl-settings-storage__header adl-settings-storage__header--section">
        <button
          type="button"
          className="adl-settings-row__reset"
          aria-label={downloadResetLabel}
          title={downloadResetLabel}
          data-testid="download-path-reset"
          disabled={downloadAtDefault}
          onClick={(e) => {
            downloadResetTriggerRef.current = e.currentTarget;
            // 开框即快照迁移开关（M4/L-5）。
            downloadMigrateAtOpenRef.current = downloadSettings.auto_migrate_on_path_change;
            setDownloadResetConfirm(true);
          }}
        >
          <IconResetDefaults size={14} decorative />
        </button>
        <SettingsHeader title={t.storageBrowserDownloadTitle} />
      </div>
      <div className="adl-settings-card">
        <BrowserDownloadPathSection />
      </div>

      {/* 不可移动项独立成块：主标题无恢复默认按钮（系统/运行时管理，无可恢复项）。 */}
      <div
        className="adl-settings-storage__header adl-settings-storage__header--section"
        data-testid="immovables-block-header"
      >
        <SettingsHeader title={t.storageImmutableTitle} />
      </div>
      <div className="adl-settings-card">
        {IMMOVABLE_ENTRY_KEYS.map((key) => (
          <div className="adl-settings-row" key={key} data-testid="storage-immutable-item">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t[IMMOVABLE_COPY[key].name]}</span>
              </div>
              <small>{t[IMMOVABLE_COPY[key].desc]}</small>
            </div>
          </div>
        ))}
      </div>

      {status?.pending || status?.lastReport ? (
        <div className="adl-settings-card">
          {status?.pending ? (
            <div className="adl-settings-row">
              <div className="adl-settings-row__label">
                <small
                  className={`adl-settings-status ${
                    status.pending.failed
                      ? 'adl-settings-status--danger'
                      : 'adl-settings-status--warning'
                  }`}
                >
                  {status.pending.failed
                    ? t.storagePendingFailedBanner.replace('{error}', status.pending.error ?? '')
                    : t.storagePendingBanner}
                </small>
              </div>
              <div className="adl-settings-row__control adl-settings-row__control--inline">
                {status.pending.failed ? (
                  <button
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    disabled={busy}
                    onClick={() => void handleRetryMigration()}
                  >
                    {t.storageRetryMigration}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="adl-btn adl-btn--ghost"
                  disabled={busy}
                  onClick={() => void handleCancelPending()}
                >
                  {t.storageCancelPending}
                </button>
              </div>
            </div>
          ) : null}

          {status?.lastReport ? (
            <div className="adl-settings-row">
              <div className="adl-settings-row__label">
                <div className="adl-settings-row__label-text">
                  <span>{t.storageReportTitle}</span>
                </div>
                {status.lastReport.ok ? (
                  <small>
                    {t.storageReportOk
                      .replace('{files}', String(status.lastReport.movedFiles))
                      .replace('{size}', formatBytes(status.lastReport.movedBytes))}
                  </small>
                ) : (
                  <small className="adl-settings-status adl-settings-status--danger">
                    {t.storageReportFailed.replace('{error}', status.lastReport.error ?? '')}
                  </small>
                )}
                {!status.lastReport.ok && status.lastReport.switched ? (
                  <small>{t.storageReportSwitched}</small>
                ) : null}
                {status.lastReport.removedDirs.length > 0 ? (
                  <small>
                    {t.storageReportDirsRemoved.replace(
                      '{count}',
                      String(status.lastReport.removedDirs.length),
                    )}
                  </small>
                ) : null}
                {status.lastReport.keptDirs.length > 0 ? (
                  <small>
                    {t.storageReportDirsKept.replace(
                      '{count}',
                      String(status.lastReport.keptDirs.length),
                    )}
                  </small>
                ) : null}
                {status.lastReport.retained ? <small>{t.storageReportRetained}</small> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 数据位置索引沉底：放在不可移动块之后的最底部。 */}
      <div className="adl-settings-card" data-testid="storage-locator-card">
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <HintCardTrigger content={t.storageLocatorHint}>
                <button
                  type="button"
                  className="adl-icon-button adl-icon-button--info"
                  aria-label={t.storageLocatorHint}
                  tabIndex={-1}
                >
                  <IconCircleHelp size={14} />
                </button>
              </HintCardTrigger>
              <span>{t.storageLocatorTitle}</span>
            </div>
            <small>{status?.locatorPath}</small>
          </div>
        </div>
      </div>

      {isDirty && !bottomCtaVisible ? (
        <div className="adl-storage-settings__dirtybar" data-testid="storage-dirtybar">
          <span className="adl-storage-settings__dirtybar-hint">
            {t.storageDirtyHint.replace('{block}', t.storageCorePathsTitle)}
          </span>
          <div className="adl-storage-settings__dirtybar-actions">
            <button
              type="button"
              className="adl-btn adl-btn--secondary"
              disabled={busy}
              onClick={handleRevert}
            >
              {t.storageRevert}
            </button>
            <button
              type="button"
              className="adl-btn adl-btn--primary"
              disabled={busy}
              onClick={() => void handleApply()}
            >
              {t.storageApply}
            </button>
          </div>
        </div>
      ) : null}

      <StorageMigrateDialog
        open={dialogOpen}
        preflight={preflight}
        busy={busy}
        onCancel={() => {
          resetReseedRef.current = false;
          setDialogOpen(false);
        }}
        onApply={(retainSource, applyNow) => void handleApplyMigration(retainSource, applyNow)}
      />
      {treeConfirm
        ? createPortal(
            <div
              className="adl-confirm-overlay"
              onClick={treeBusy ? undefined : () => setTreeConfirm(null)}
              role="dialog"
              aria-modal="true"
              aria-label={treeConfirm === 'disable' ? t.treeCacheDisableTitle : t.treeCacheClear}
            >
              <div className="adl-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="adl-confirm-dialog__header">
                  <h3 className="adl-confirm-dialog__title">
                    {treeConfirm === 'disable' ? t.treeCacheDisableTitle : t.treeCacheClear}
                  </h3>
                </div>
                <div className="adl-confirm-dialog__body">
                  <p className="adl-confirm-dialog__message">
                    {treeConfirm === 'disable'
                      ? t.treeCacheDisableConfirm
                      : t.treeCacheClearConfirm}
                  </p>
                </div>
                <div className="adl-confirm-dialog__footer">
                  {/* 忙时锁关闭：写+清+重拉仍在后台跑，关框会丢失进度上下文。 */}
                  <button
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    disabled={treeBusy}
                    onClick={() => setTreeConfirm(null)}
                  >
                    {t.storageCancel}
                  </button>
                  <button
                    ref={treeConfirmRef}
                    type="button"
                    // 确认对话框的确认键与「取消」同款 secondary（无品牌蓝填充，产品决策 2026-09-24）。
                    className="adl-btn adl-btn--secondary"
                    disabled={treeBusy}
                    onClick={() => {
                      if (treeConfirm === 'disable') {
                        void handleTreeDisableConfirm({
                          enabled: false,
                          ttlMinutes: treeTtlMinutes,
                        });
                      } else {
                        void handleTreeClearConfirm();
                      }
                    }}
                  >
                    {treeConfirm === 'disable' ? t.treeCacheDisableConfirmBtn : t.treeCacheClear}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {downloadResetConfirm
        ? createPortal(
            <div
              className="adl-confirm-overlay"
              onClick={downloadResetBusy ? undefined : () => setDownloadResetConfirm(false)}
              role="dialog"
              aria-modal="true"
              aria-label={t.storageDownloadResetTitle}
            >
              <div className="adl-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="adl-confirm-dialog__header">
                  <h3 className="adl-confirm-dialog__title">{t.storageDownloadResetTitle}</h3>
                </div>
                <div className="adl-confirm-dialog__body">
                  <p className="adl-confirm-dialog__message">
                    {downloadMigrateAtOpenRef.current
                      ? t.storageDownloadResetConfirmMigrateOn
                      : t.storageDownloadResetConfirmMigrateOff}
                  </p>
                </div>
                <div className="adl-confirm-dialog__footer">
                  <button
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    disabled={downloadResetBusy}
                    onClick={() => setDownloadResetConfirm(false)}
                  >
                    {t.storageCancel}
                  </button>
                  <button
                    ref={downloadResetConfirmRef}
                    type="button"
                    // 确认与「取消」同款 secondary（无品牌蓝填充，产品决策 2026-09-24）。
                    className="adl-btn adl-btn--secondary"
                    disabled={downloadResetBusy}
                    onClick={() => void handleDownloadResetConfirm()}
                  >
                    {t.storageDownloadResetConfirmBtn}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {groupResetOpen
        ? createPortal(
            <div
              className="adl-confirm-overlay"
              onClick={groupResetBusy ? undefined : () => setGroupResetOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label={t.storageGroupResetTitle}
            >
              <div className="adl-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="adl-confirm-dialog__header">
                  <h3 className="adl-confirm-dialog__title">{t.storageGroupResetTitle}</h3>
                </div>
                <div className="adl-confirm-dialog__body">
                  <p className="adl-confirm-dialog__message">{t.storageGroupResetIntro}</p>
                  <ul className="adl-confirm-dialog__message adl-confirm-dialog__list">
                    <li>{t.storageGroupResetItemCore}</li>
                    <li>{t.storageGroupResetItemTree}</li>
                    <li>
                      {formatT(t, 'storageGroupResetItemBudget', {
                        default: formatBytes(TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES),
                      })}
                    </li>
                    <li>
                      {groupMigrateAtOpenRef.current
                        ? t.storageGroupResetItemDownloadMigrateOn
                        : t.storageGroupResetItemDownloadMigrateOff}
                    </li>
                  </ul>
                  <p className="adl-confirm-dialog__message">
                    {t.storageMigrateDialogSummary
                      .replace('{files}', String(groupResetPreflight?.totalFiles ?? 0))
                      .replace('{size}', formatBytes(groupResetPreflight?.totalBytes ?? 0))}
                  </p>

                  {(groupResetPreflight?.errors ?? []).length > 0 ? (
                    <div className="adl-confirm-dialog__message">
                      <p>
                        <IconAlertTriangle size={12} decorative /> {t.storagePreflightErrors}
                      </p>
                      <ul>
                        {(groupResetPreflight?.errors ?? []).map((error, index) => (
                          <li key={`${error}-${index}`}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {(groupResetPreflight?.warnings ?? []).length > 0 ? (
                    <div className="adl-confirm-dialog__message">
                      <p>{t.storagePreflightWarnings}</p>
                      <ul>
                        {(groupResetPreflight?.warnings ?? []).map((warning, index) => (
                          <li key={`${warning}-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <label className="adl-confirm-dialog__message adl-confirm-dialog__retain">
                    <input
                      type="checkbox"
                      checked={groupResetRetain}
                      disabled={groupResetBusy}
                      onChange={(e) => setGroupResetRetain(e.target.checked)}
                    />
                    <span>{t.storageRetainSource}</span>
                  </label>
                </div>
                <div className="adl-confirm-dialog__footer">
                  <button
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    disabled={groupResetBusy}
                    onClick={() => setGroupResetOpen(false)}
                  >
                    {t.storageCancel}
                  </button>
                  {/* 确认键与「取消」同款 secondary（无品牌蓝填充）；预检失败时禁用。 */}
                  <button
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    disabled={
                      groupResetBusy || (groupResetPreflight !== null && !groupResetPreflight.ok)
                    }
                    onClick={() => void handleGroupResetApply(false)}
                  >
                    {t.storageMigrateLater}
                  </button>
                  <button
                    ref={groupResetConfirmRef}
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    disabled={
                      groupResetBusy || (groupResetPreflight !== null && !groupResetPreflight.ok)
                    }
                    onClick={() => void handleGroupResetApply(true)}
                  >
                    {t.storageMigrateNow}
                  </button>
                  {!isTauriShell() ? <small>{t.storageRestartUnavailableInBrowser}</small> : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
