import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CopyKey } from '@i18n';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { formatBytes } from '@root/design-system/html';
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
import { IconCircleHelp, IconResetDefaults } from '../../icons';
import { HintCardTrigger } from '../../components/HintCard';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { SettingsSelect } from '../../components/settings/SettingsSelect';
import { StorageCategoryRow } from './StorageCategoryRow';
import { StorageMigrateDialog } from './StorageMigrateDialog';
import { TerminalHistoryBudgetSection } from './TerminalHistoryBudgetSection';
import { BrowserDownloadPathSection } from './BrowserDownloadPathSection';

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
  const { t } = useTCopy();
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
  const [treeConfirmOpen, setTreeConfirmOpen] = useState(false);
  const [treeBusy, setTreeBusy] = useState(false);
  const treeConfirmRef = useRef<HTMLButtonElement | null>(null);
  // 语言切换会更换 `t` 触发重取：草稿只播种一次，避免覆盖用户编辑（F6）。
  // 错误文案仍用最新 `t` 即时计算，保持 `t` 新鲜度。
  const draftsSeededRef = useRef(false);
  // 「块底部 撤回/应用」是否处于可见区：可见时隐藏粘性提交条，不可见时显示。
  const bottomCtaRef = useRef<HTMLDivElement | null>(null);
  const [bottomCtaVisible, setBottomCtaVisible] = useState(false);

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

  /** 重拉树缓存 stats（清除/开关/TTL 写后刷新展示）；失败静默保留旧值。 */
  const loadTreeStats = useCallback(async () => {
    const bridge = window.digitalLife?.storage;
    if (!bridge?.getTreeCacheStats) {
      return;
    }
    try {
      const result = await bridge.getTreeCacheStats();
      if (result.ok) {
        setTreeStats(result.data);
      }
    } catch {
      // 旧桥/通道失败即缺席：区段保持上次（或不渲染），动作失败另行 toast。
    }
  }, []);

  useEffect(() => {
    void loadTreeStats();
  }, [loadTreeStats]);

  // 清除确认对话框：打开聚焦确认键，Escape 关闭（仿 StorageMigrateDialog）。
  useEffect(() => {
    if (!treeConfirmOpen) {
      return;
    }
    treeConfirmRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setTreeConfirmOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [treeConfirmOpen]);

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

  /** 只刷新后端状态（不覆盖用户正在编辑的草稿）；成功时清除加载错误，失败 toast（F5）。 */
  const refresh = useCallback(async () => {
    const bridge = window.digitalLife?.storage;
    if (!bridge) {
      return;
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
        return;
      }
      if (!isWellFormedStatus(result.data)) {
        console.warn('[storage] malformed IpcResult (ok:true missing data/categories)', result);
        showToast(t.storageStatusLoadFailed.replace('{error}', t.storageUnknownError), 'error');
        return;
      }
      setStatusError(null);
      setStatus(result.data);
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
      categories: mode === 'per_category' ? categoryDrafts : {},
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

  /** 预检一个路径补丁并在通过后打开迁移对话框（「应用」与「恢复默认」共用）。 */
  const applyPatch = useCallback(
    async (patch: StoragePathPatch) => {
      const bridge = window.digitalLife?.storage;
      if (!bridge) {
        return;
      }
      setBusy(true);
      try {
        const result = await bridge.preflight(patch);
        if (!result.ok) {
          showToast(ipcErrorMessage(result.error, t.storageUnknownError), 'error');
          return;
        }
        setPreflight(result.data);
        setDialogOpen(true);
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
    void applyPatch(CORE_RESET_PATCH);
  }, [applyPatch]);

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
        await refresh();
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

  /** 清除确认：删全行（派生数据，下次扫描重建）后重拉 stats；失败 toast。 */
  const handleTreeClearConfirm = useCallback(async () => {
    const bridge = window.digitalLife?.storage;
    if (!bridge) {
      return;
    }
    setTreeBusy(true);
    try {
      const result = await bridge.clearTreeCache();
      if (!result.ok) {
        showToast(ipcErrorMessage(result.error, t.storageUnknownError), 'error');
        return;
      }
      setTreeConfirmOpen(false);
      await loadTreeStats();
    } finally {
      setTreeBusy(false);
    }
  }, [loadTreeStats, showToast, t]);

  /** 开关/TTL 写后重拉 stats；失败 toast 且不改本地展示（以 stats 为真源）。 */
  const handleTreeOptionsChange = useCallback(
    async (opts: TreeCacheOptions) => {
      const bridge = window.digitalLife?.storage;
      if (!bridge) {
        return;
      }
      const result = await bridge.setTreeCacheOptions(opts);
      if (!result.ok) {
        showToast(ipcErrorMessage(result.error, t.storageUnknownError), 'error');
        return;
      }
      await loadTreeStats();
    },
    [loadTreeStats, showToast, t],
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
        : categories.some((c) => (categoryDrafts[c.key] ?? c.path) !== c.path))),
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

  const handleTtlSelectChange = useCallback(
    (v: string) => {
      const raw = Number(v);
      if (!Number.isFinite(raw)) {
        return;
      }
      // 与服务端合法范围 1..=1440 对齐：钳制后写（非法值不出桥）。
      const ttlMinutes = Math.min(1440, Math.max(1, Math.floor(raw)));
      void handleTreeOptionsChange({
        enabled: treeEnabled,
        ttlMinutes,
      });
    },
    [handleTreeOptionsChange, treeEnabled],
  );

  // options 身份稳定，避免下游 SettingsSelect 订阅 effect 每渲染重绑监听。
  const ttlSelectOptions = useMemo(() => {
    // 非列表值（如后端合法但不在下拉档的 30）：回退展示当前值档（复用既有 key，无新文案）。
    const fallback = !TREE_CACHE_TTL_OPTIONS.includes(
      treeTtlMinutes as (typeof TREE_CACHE_TTL_OPTIONS)[number],
    )
      ? [
          {
            value: String(treeTtlMinutes),
            label: t.treeCacheTtlMinutes.replace('{minutes}', String(treeTtlMinutes)),
          },
        ]
      : [];
    return [
      ...fallback,
      ...TREE_CACHE_TTL_OPTIONS.map((minutes) => ({
        value: String(minutes),
        label:
          minutes === 1440
            ? t.treeCacheTtlDay
            : t.treeCacheTtlMinutes.replace('{minutes}', String(minutes)),
      })),
    ];
  }, [treeTtlMinutes, t.treeCacheTtlMinutes, t.treeCacheTtlDay]);
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
        <div className="adl-settings-card">
          <h4 className="adl-settings-section-title adl-settings-title--serif">
            {t.treeCacheTitle}
          </h4>
          <div className="adl-settings-row" data-testid="tree-cache-section">
            <div className="adl-settings-row__label">
              <small>
                {t.treeCacheWorkspaces.replace('{count}', String(treeStats.workspaceCount))}
              </small>
              <small>{t.treeCacheSize.replace('{size}', formatBytes(treeStats.totalBytes))}</small>
              <small>
                {typeof treeStats.newestCapturedAt !== 'number'
                  ? t.storageNotCreated
                  : t.treeCacheAge.replace(
                      '{time}',
                      // 缓存时间为绝对时刻：经 Intl 本地化渲染（与上条注释一致）。
                      new Date(treeStats.newestCapturedAt).toLocaleString(),
                    )}
              </small>
            </div>
            <div className="adl-settings-row__control">
              <button
                type="button"
                className="adl-btn adl-btn--secondary"
                data-testid="tree-cache-clear"
                disabled={treeBusy}
                onClick={() => setTreeConfirmOpen(true)}
              >
                {t.treeCacheClear}
              </button>
            </div>
          </div>

          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.treeCacheEnabled}</span>
              </div>
            </div>
            <div className="adl-settings-row__control adl-settings-row__control--inline">
              <input
                type="checkbox"
                aria-label={t.treeCacheEnabled}
                checked={treeEnabled}
                disabled={treeBusy}
                onChange={(e) =>
                  void handleTreeOptionsChange({
                    enabled: e.target.checked,
                    ttlMinutes: treeTtlMinutes,
                  })
                }
              />
              <SettingsSelect
                value={String(treeTtlMinutes)}
                options={ttlSelectOptions}
                onChange={handleTtlSelectChange}
                label={t.treeCacheTtl}
                disabled={treeBusy}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="adl-settings-card">
        <h4 className="adl-settings-section-title adl-settings-title--serif">
          {t.storageTerminalBudgetTitle}
        </h4>
        <TerminalHistoryBudgetSection />

        <h4 className="adl-settings-section-title adl-settings-title--serif">
          {t.storageBrowserDownloadTitle}
        </h4>
        <BrowserDownloadPathSection />
      </div>

      <div className="adl-settings-card">
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

        <h4 className="adl-settings-section-title adl-settings-title--serif">
          {t.storageImmutableTitle}
        </h4>
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

      {isDirty && !bottomCtaVisible ? (
        <div className="adl-storage-settings__dirtybar" data-testid="storage-dirtybar">
          <span>{t.storageDirtyHint.replace('{block}', t.storageCorePathsTitle)}</span>
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
        onCancel={() => setDialogOpen(false)}
        onApply={(retainSource, applyNow) => void handleApplyMigration(retainSource, applyNow)}
      />
      {treeConfirmOpen
        ? createPortal(
            <div
              className="adl-confirm-overlay"
              onClick={() => setTreeConfirmOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label={t.treeCacheClear}
            >
              <div className="adl-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="adl-confirm-dialog__header">
                  <h3 className="adl-confirm-dialog__title">{t.treeCacheClear}</h3>
                </div>
                <div className="adl-confirm-dialog__body">
                  <p className="adl-confirm-dialog__message">{t.treeCacheClearConfirm}</p>
                </div>
                <div className="adl-confirm-dialog__footer">
                  <button
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    onClick={() => setTreeConfirmOpen(false)}
                  >
                    {t.storageCancel}
                  </button>
                  <button
                    ref={treeConfirmRef}
                    type="button"
                    className="adl-btn adl-btn--primary"
                    disabled={treeBusy}
                    onClick={() => void handleTreeClearConfirm()}
                  >
                    {t.treeCacheClear}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
