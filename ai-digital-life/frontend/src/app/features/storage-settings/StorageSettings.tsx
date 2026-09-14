import { useCallback, useEffect, useState } from 'react';
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
} from '@shared/ipc/storage';
import { IconCircleHelp } from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { StorageCategoryRow } from './StorageCategoryRow';
import { StorageMigrateDialog } from './StorageMigrateDialog';
import { TerminalHistoryBudgetSection } from './TerminalHistoryBudgetSection';
import { BrowserDownloadPathSection } from './BrowserDownloadPathSection';

/** 不可移动项 → i18n key（顺序固定，遍历 `IMMOVABLE_ENTRY_KEYS`）。 */
const IMMOVABLE_COPY: Record<(typeof IMMOVABLE_ENTRY_KEYS)[number], CopyKey> = {
  keyring: 'storageImmutableKeyring',
  machineId: 'storageImmutableMachineId',
  localStorage: 'storageImmutableLocalStorage',
  indexedDB: 'storageImmutableIndexedDb',
  webview2: 'storageImmutableWebview2',
  workspaceCache: 'storageImmutableWorkspaceCache',
};

/** 每个分组展示的分类数量（后端按固定顺序返回 10 类：前 5 核心、后 5 高级）。 */
const CORE_CATEGORY_COUNT = 5;

/**
 * 「存储」设置组（Plan C Task 5）。
 *
 * 组成：模式切换 → （统一模式）根目录行 → 10 类分类行（核心/高级）→ 应用
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
  const [mode, setMode] = useState<StorageMode>('unified');
  const [rootDraft, setRootDraft] = useState('');
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [preflight, setPreflight] = useState<StoragePreflight | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const bridge = window.digitalLife?.storage;
    if (!bridge) {
      return;
    }
    void bridge.getStatus().then((result) => {
      if (cancelled || !result.ok) {
        return;
      }
      setStatus(result.data);
      setMode(result.data.mode);
      setRootDraft(result.data.root);
      setCategoryDrafts(
        Object.fromEntries(result.data.categories.map((category) => [category.key, category.path])),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 只刷新后端状态（不覆盖用户正在编辑的草稿）。 */
  const refresh = useCallback(async () => {
    const bridge = window.digitalLife?.storage;
    if (!bridge) {
      return;
    }
    const result = await bridge.getStatus();
    if (result.ok) {
      setStatus(result.data);
    }
  }, []);

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
        return;
      }
      setPicking(true);
      try {
        const result = await bridge.pickDirectory();
        if (!result.ok) {
          showToast(t.storagePickFailed.replace('{error}', result.error.message), 'error');
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
        showToast(result.error.message, 'error');
        return;
      }
      setPreflight(result.data);
      setDialogOpen(true);
    } finally {
      setBusy(false);
    }
  }, [buildPatch, showToast]);

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
          showToast(result.error.message, 'error');
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
        showToast(result.error.message, 'error');
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh, showToast]);

  const categories = status?.categories ?? [];
  const coreCategories = categories.slice(0, CORE_CATEGORY_COUNT);
  const advancedCategories = categories.slice(CORE_CATEGORY_COUNT);
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
      {coreCategories.map(renderCategory)}

      <h4 className="adl-settings-header__title">{t.storageCategoryGroupAdvanced}</h4>
      {advancedCategories.map(renderCategory)}

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
            <TooltipSimple placement="top" maxWidth={320} content={t.storageLocatorHint}>
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                aria-label={t.storageLocatorHint}
                title={t.storageLocatorHint}
              >
                <IconCircleHelp size={12} decorative />
              </button>
            </TooltipSimple>
          </div>
          <small>{status?.locatorPath}</small>
        </div>
      </div>

      <h4 className="adl-settings-header__title">{t.storageImmutableTitle}</h4>
      {IMMOVABLE_ENTRY_KEYS.map((key) => (
        <div className="adl-settings-row" key={key} data-testid="storage-immutable-item">
          <div className="adl-settings-row__label">
            <small>{t[IMMOVABLE_COPY[key]]}</small>
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
    </div>
  );
}
