import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { formatBytes } from '@root/design-system/html';
import { useAppStore } from '@stores/slicedStore';
import type { TreeCacheStats } from '@shared/ipc/storage';
import {
  computeStorageResetPlan,
  type StorageResetDeps,
  type StorageResetPlan,
  type StorageResetPredicates,
} from '@shared/settings-reset/storageReset';
import type { GroupKey } from '@shared/settings-reset/types';
import { localizePreflightIssues } from '@features/storage-settings/preflightCopy';
import { RESET_ALL_GROUP_LABEL_KEYS } from './settingsGroups';
import { resetAllSettings, type ResetAllDeps, type ResetAllOutcome } from './resetAllSettings';

export interface ResetAllDialogProps {
  open: boolean;
  onClose: () => void;
  /** 存储组依赖（bridge / refreshStatus / setPaths / resetBudget / resetTreeCache / ... / downloadPath）。 */
  deps: StorageResetDeps;
  /** 与 UI 同源的「是否已默认」判定（由 storageAtDefault / downloadPathReset 注入）。 */
  storagePredicates: StorageResetPredicates;
  /** 执行结束回调（成功/失败/跳过汇总由调用方展示）。 */
  onCommitted: (outcome: ResetAllOutcome) => void;
}

/** 计划状态：计算中 → 就绪（计划可能为 null = 存储无事可做或不可用）。 */
type PlanState = { status: 'computing' } | { status: 'ready'; plan: StorageResetPlan | null };

/**
 * 取最新树缓存统计：已有值直接用；为空时现拉一次（与 `StorageSettings.openGroupResetDialog`
 * 同口径）——`readTreeStats` 注入的是可能陈旧的快照，直接判定会让树块基于旧值。
 */
async function resolveTreeStats(current: TreeCacheStats | null): Promise<TreeCacheStats | null> {
  if (current !== null) {
    return current;
  }
  const bridge = window.digitalLife?.storage;
  if (!bridge?.getTreeCacheStats) {
    return null;
  }
  try {
    const result = await bridge.getTreeCacheStats();
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

/** 计算存储组恢复计划；无草稿在途 → `draftsDirty` 恒 false。 */
async function computePlan(
  deps: StorageResetDeps,
  predicates: StorageResetPredicates,
): Promise<StorageResetPlan | null> {
  const treeStats = await resolveTreeStats(deps.readTreeStats());
  return computeStorageResetPlan({ ...deps, readTreeStats: () => treeStats }, predicates);
}

function groupLabel(t: Record<string, string>, key: GroupKey): string {
  return t[RESET_ALL_GROUP_LABEL_KEYS[key]];
}

/**
 * 「恢复全部默认」聚合确认框（`createPortal` 到 body，复用 `.adl-confirm-dialog` 样式）。
 *
 * 打开即渲染范围清单并并行计算存储计划；计划就绪前存储行显示「计算中…」。
 * 执行走 `resetAllSettings`（preferences → browser → dsh → storage），进度逐组回调；
 * 执行期间锁定关闭/取消/遮罩/Esc（存储迁移不可中断）。结果交 `onCommitted` 由调用方汇总。
 * 偏好/浏览器/DSH 的依赖取执行时实时 store 值（R2：迁移开关不在开框时快照）。
 */
export function ResetAllDialog({
  open,
  onClose,
  deps,
  storagePredicates,
  onCommitted,
}: ResetAllDialogProps) {
  const { t } = useTCopy();
  const [planState, setPlanState] = useState<PlanState>({ status: 'computing' });
  const [retainSource, setRetainSource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<GroupKey | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setPlanState({ status: 'computing' });
    setRetainSource(false);
    setProgress(null);
    void computePlan(deps, storagePredicates).then((plan) => {
      if (!cancelled) {
        setPlanState({ status: 'ready', plan });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, deps, storagePredicates]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      if (busy) {
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onClose]);

  const plan = planState.status === 'ready' ? planState.plan : null;
  const coreNeeded = plan !== null && plan.blocks.coreNeeded;
  const preflight = plan?.preflight ?? null;
  const preflightBlocked = preflight !== null && !preflight.ok;

  /** 执行时组装完整编排 deps：存储取自 props，其余组取 store 实时值（R2）。 */
  const buildDeps = useCallback((): ResetAllDeps => {
    const store = useAppStore.getState();
    return {
      updatePreferences: store.updatePreferences,
      browser: {
        updatePreferences: store.updatePreferences,
        updateDownloadSettings: store.updateDownloadSettings,
        downloadPath: {
          changeDownloadPath: store.changeDownloadPath,
          updateDownloadSettings: store.updateDownloadSettings,
        },
        migrateAtOpen: store.downloadSettings.auto_migrate_on_path_change,
      },
      dsh: { saveSourceConfig: (config) => store.saveSourceConfig(config) },
      storage: deps,
      storagePredicates,
    };
  }, [deps, storagePredicates]);

  const handleConfirm = useCallback(
    async (applyNow: boolean) => {
      setBusy(true);
      setProgress(null);
      const outcome = await resetAllSettings(
        buildDeps(),
        { storagePlan: plan, applyNow, retainSource },
        setProgress,
      );
      setBusy(false);
      onCommitted(outcome);
      onClose();
    },
    [buildDeps, plan, retainSource, onCommitted, onClose],
  );

  if (!open) {
    return null;
  }

  const storageScopeText =
    planState.status === 'computing'
      ? t.settingsResetAllStorageCompute
      : plan === null
        ? t.settingsResetAllStorageUnavailable
        : t.settingsResetAllScopeStorage;

  const confirmControls = coreNeeded ? (
    <>
      {/* 预检失败（ok=false）时两键均禁用：无法安全迁移，仅可取消。 */}
      <button
        type="button"
        className="adl-btn adl-btn--secondary"
        disabled={busy || preflightBlocked}
        onClick={() => void handleConfirm(false)}
      >
        {t.storageMigrateLater}
      </button>
      <button
        type="button"
        className="adl-btn adl-btn--secondary"
        disabled={busy || preflightBlocked}
        onClick={() => void handleConfirm(true)}
      >
        {t.storageMigrateNow}
      </button>
    </>
  ) : (
    /* 核心无需迁移（含计划为 null）：单确认键，迁移时机默认「下次启动」。 */
    <button
      type="button"
      className="adl-btn adl-btn--secondary"
      disabled={busy}
      onClick={() => void handleConfirm(false)}
    >
      {t.storageGroupResetConfirm}
    </button>
  );

  return createPortal(
    <div
      className="adl-confirm-overlay"
      onClick={busy ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.settingsResetConfirmTitle}
    >
      <div className="adl-confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="adl-confirm-dialog__header">
          <h3 className="adl-confirm-dialog__title">{t.settingsResetConfirmTitle}</h3>
        </div>
        <div className="adl-confirm-dialog__body">
          <p className="adl-confirm-dialog__message">{t.settingsResetAllScopeIntro}</p>
          <ul className="adl-confirm-dialog__list">
            <li>{t.settingsResetAllScopePreferences}</li>
            <li>{t.settingsResetAllScopeBrowser}</li>
            <li>{t.settingsResetAllScopeDsh}</li>
            <li>{storageScopeText}</li>
          </ul>

          {coreNeeded ? (
            <p className="adl-confirm-dialog__message">
              {formatT(t, 'storageMigrateDialogSummary', {
                files: String(preflight?.totalFiles ?? 0),
                size: formatBytes(preflight?.totalBytes ?? 0),
              })}
            </p>
          ) : null}

          {preflight && preflight.errors.length > 0 ? (
            <div className="adl-confirm-dialog__issues adl-confirm-dialog__issues--error">
              <p className="adl-confirm-dialog__issues-title">{t.storagePreflightErrors}</p>
              <ul className="adl-confirm-dialog__issues-list">
                {localizePreflightIssues(preflight.errors, t).map((text, index) => (
                  <li key={`${text}-${index}`}>{text}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {preflight && preflight.warnings.length > 0 ? (
            <div className="adl-confirm-dialog__issues adl-confirm-dialog__issues--warning">
              <p className="adl-confirm-dialog__issues-title">{t.storagePreflightWarnings}</p>
              <ul className="adl-confirm-dialog__issues-list">
                {localizePreflightIssues(preflight.warnings, t).map((text, index) => (
                  <li key={`${text}-${index}`}>{text}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {coreNeeded ? (
            <label className="adl-confirm-dialog__message adl-confirm-dialog__retain">
              <input
                type="checkbox"
                checked={retainSource}
                disabled={busy}
                onChange={(e) => setRetainSource(e.target.checked)}
              />
              <span>{t.storageRetainSource}</span>
            </label>
          ) : null}

          {busy && progress !== null ? (
            <p className="adl-confirm-dialog__message">
              {formatT(t, 'settingsResetAllProgress', { group: groupLabel(t, progress) })}
            </p>
          ) : null}
        </div>
        <div className="adl-confirm-dialog__footer">
          <button
            type="button"
            className="adl-btn adl-btn--secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t.cancel}
          </button>
          {planState.status === 'ready' ? confirmControls : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
