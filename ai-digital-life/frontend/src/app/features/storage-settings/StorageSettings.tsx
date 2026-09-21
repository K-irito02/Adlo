import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CopyKey } from '@i18n';
import { useTCopy } from '@i18n/useTCopy';
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
import { IconCircleHelp } from '../../icons';
import { HintCardTrigger } from '../../components/HintCard';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
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

/** 每个分组展示的分类数量（后端按固定顺序返回 11 类：前 5 核心、后 6 高级）。 */
const CORE_CATEGORY_COUNT = 5;

/** 树缓存 TTL 下拉选项（分钟；1440 即 1 天），与服务端合法范围 1..=1440 一致。 */
const TREE_CACHE_TTL_OPTIONS = [5, 15, 60, 1440] as const;

/** Rust 缺省（`TreeCacheOptions::default`）：stats 不可用时开关/TTL 的回退值。 */
const TREE_CACHE_DEFAULTS: TreeCacheOptions = { enabled: true, ttlMinutes: 15 };

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
  // 工作区树缓存区段态：stats 挂载拉取一次（数字非本地化文本，语言切换无需重拉）；
  // 旧桥无该方法时静默缺席（try/catch 吞错），区段不渲染。
  const [treeStats, setTreeStats] = useState<TreeCacheStats | null>(null);
  const [treeConfirmOpen, setTreeConfirmOpen] = useState(false);
  const [treeBusy, setTreeBusy] = useState(false);
  const treeConfirmRef = useRef<HTMLButtonElement | null>(null);
  // 语言切换会更换 `t` 触发重取：草稿只播种一次，避免覆盖用户编辑（F6）。
  // 错误文案仍用最新 `t` 即时计算，保持 `t` 新鲜度。
  const draftsSeededRef = useRef(false);

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
      root: mode === 'unified' ? rootDraft : null,
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

  const handleApply = useCallback(async () => {
    const bridge = window.digitalLife?.storage;
    if (!bridge) {
      return;
    }
    setBusy(true);
    try {
      const result = await bridge.preflight(buildPatch(false));
      if (!result.ok) {
        showToast(ipcErrorMessage(result.error, t.storageUnknownError), 'error');
        return;
      }
      setPreflight(result.data);
      setDialogOpen(true);
    } finally {
      setBusy(false);
    }
  }, [buildPatch, showToast, t]);

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
  const coreCategories = categories.slice(0, CORE_CATEGORY_COUNT);
  const advancedCategories = categories.slice(CORE_CATEGORY_COUNT);
  // 开关/TTL 控件以 stats 为真源；stats 缺席时区段不渲染，缺省值仅供回退展示。
  const treeEnabled = treeStats?.enabled ?? TREE_CACHE_DEFAULTS.enabled;
  const treeTtlMinutes = treeStats?.ttlMinutes ?? TREE_CACHE_DEFAULTS.ttlMinutes;
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

  if (loading) {
    return (
      <div className="adl-settings-section adl-storage-settings">
        <SettingsHeader title={t.storageTitle} />
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <small>{t.storageStatusLoading}</small>
          </div>
        </div>
      </div>
    );
  }

  if (statusError && !status) {
    return (
      <div className="adl-settings-section adl-storage-settings">
        <SettingsHeader title={t.storageTitle} />
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <small>{statusError}</small>
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
    );
  }

  return (
    <div className="adl-settings-section adl-storage-settings">
      <SettingsHeader title={t.storageTitle} />

      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.storageModeLabel}</span>
          </div>
        </div>
        <div
          className="adl-settings-row__control"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
        >
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <input
              type="radio"
              name="adl-storage-mode"
              checked={mode === 'unified'}
              onChange={() => handleModeChange('unified')}
            />
            <span>{t.storageModeUnified}</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
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
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.storageRootLabel}</span>
            </div>
            <small>{status?.root}</small>
          </div>
          <div
            className="adl-settings-row__control"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            <button
              type="button"
              className="adl-btn adl-btn--ghost"
              disabled={picking}
              onClick={() => void handlePickDirectory(setRootDraft)}
            >
              {t.storagePickDir}
            </button>
            <input
              type="text"
              className="adl-settings-input"
              aria-label={t.storageManualInput}
              placeholder={t.storageManualInputPlaceholder}
              value={rootDraft}
              onChange={(e) => setRootDraft(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      <h4 className="adl-settings-header__title">{t.storageCategoryGroupCore}</h4>
      {categories.length === 0 ? (
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <small>{t.storageNoCategories}</small>
          </div>
        </div>
      ) : (
        <>
          {coreCategories.map(renderCategory)}
          <h4 className="adl-settings-header__title">{t.storageCategoryGroupAdvanced}</h4>
          {advancedCategories.map(renderCategory)}
        </>
      )}

      <div className="adl-settings-row">
        <div className="adl-settings-row__label" />
        <div className="adl-settings-row__control">
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

      {treeStats ? (
        <>
          <h4 className="adl-settings-header__title">{t.treeCacheTitle}</h4>
          <div className="adl-settings-row" data-testid="tree-cache-section">
            <div className="adl-settings-row__label">
              <small>
                {t.treeCacheWorkspaces.replace('{count}', String(treeStats.workspaceCount))}
              </small>
              <small>{t.treeCacheSize.replace('{size}', formatBytes(treeStats.totalBytes))}</small>
              <small>
                {treeStats.newestCapturedAt == null
                  ? t.storageNotCreated
                  : t.treeCacheAge.replace(
                      '{time}',
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
            <div
              className="adl-settings-row__control"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
            >
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
              <select
                className="adl-settings-select"
                aria-label={t.treeCacheTtl}
                value={treeTtlMinutes}
                disabled={treeBusy}
                onChange={(e) =>
                  void handleTreeOptionsChange({
                    enabled: treeEnabled,
                    ttlMinutes: Number(e.target.value),
                  })
                }
              >
                {TREE_CACHE_TTL_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes === 1440
                      ? t.treeCacheTtlDay
                      : t.treeCacheTtlMinutes.replace('{minutes}', String(minutes))}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      ) : null}

      <hr className="adl-settings-divider" />

      <h4 className="adl-settings-header__title">{t.storageTerminalBudgetTitle}</h4>
      <TerminalHistoryBudgetSection />

      <h4 className="adl-settings-header__title">{t.storageBrowserDownloadTitle}</h4>
      <BrowserDownloadPathSection />

      <hr className="adl-settings-divider" />

      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.storageLocatorTitle}</span>
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
          </div>
          <small>{status?.locatorPath}</small>
        </div>
      </div>

      <h4 className="adl-settings-header__title">{t.storageImmutableTitle}</h4>
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

      {status?.pending ? (
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <small>
              {status.pending.failed
                ? t.storagePendingFailedBanner.replace('{error}', status.pending.error ?? '')
                : t.storagePendingBanner}
            </small>
          </div>
          <div
            className="adl-settings-row__control"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
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
              <small>
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
