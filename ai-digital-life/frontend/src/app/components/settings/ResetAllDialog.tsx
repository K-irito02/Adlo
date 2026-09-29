import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import type { CopyDict } from '@i18n';
import { formatBytes } from '@root/design-system/html';
import { useAppStore } from '@stores/slicedStore';
import type {
  StorageResetExecuteDeps,
  StorageResetPlanResult,
} from '@shared/settings-reset/storageReset';
import type { GroupKey } from '@shared/settings-reset/types';
import { localizePreflightIssues } from '@features/storage-settings/preflightCopy';
import { RESET_ALL_GROUP_LABEL_KEYS } from './settingsGroups';
import { resetAllSettings, type ResetAllDeps, type ResetAllOutcome } from './resetAllSettings';

export interface ResetAllDialogProps {
  open: boolean;
  /** 父组件预计算好的存储计划（开框前已就绪，开框即渲染，无框内“计算中”闪烁）。 */
  planResult: StorageResetPlanResult | null;
  /** 存储组执行依赖（仅执行侧：setPaths / resetBudget / resetTreeCache / downloadPath）。 */
  deps: StorageResetExecuteDeps;
  /** 执行结束回调（成功/失败/跳过汇总由调用方展示）。 */
  onCommitted: (outcome: ResetAllOutcome) => void;
  onClose: () => void;
}

function groupLabel(t: CopyDict, key: GroupKey): string {
  return t[RESET_ALL_GROUP_LABEL_KEYS[key]];
}

/**
 * 「恢复全部默认」聚合确认框（`createPortal` 到 body，复用 `.adl-confirm-dialog` 样式）。
 *
 * 开框前计划已由调用方算好（`planResult`），本框为纯展示 + 执行：
 * body 不再列出各分组清单，仅保留需用户决策项（核心迁移摘要 + preflight issues +
 * retain 复选框 + 迁移时机两键）；非核心场景仅单确认键。
 * 执行走 `resetAllSettings`（preferences → browser → dsh → storage），进度逐组回调；
 * 执行期间锁定关闭/取消/遮罩/Esc（存储迁移不可中断）。结果交 `onCommitted` 由调用方汇总。
 * 偏好/浏览器/DSH 的依赖取执行时实时 store 值（R2：迁移开关不在开框时快照）。
 */
export function ResetAllDialog({
  open,
  planResult,
  deps,
  onCommitted,
  onClose,
}: ResetAllDialogProps) {
  const { t } = useTCopy();
  const [retainSource, setRetainSource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<GroupKey | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // 开框重置本地态（retain/busy/进度）。计划来自 props，不再框内异步计算。
  useEffect(() => {
    if (!open) {
      return;
    }
    setRetainSource(false);
    setProgress(null);
    console.log('[ADL-DEBUG] ResetAllDialog open', {
      status: planResult?.status ?? 'null',
      coreNeeded: planResult?.status === 'ready' ? planResult.plan.blocks.coreNeeded : 'n/a',
    });
  }, [open, planResult]);

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

  const plan = planResult?.status === 'ready' ? planResult.plan : null;
  const coreNeeded = plan !== null && plan.blocks.coreNeeded;
  const preflight = plan?.preflight ?? null;
  const preflightBlocked = preflight !== null && !preflight.ok;

  // 打开时记录触发元素（设置面板的「恢复全部默认」按钮），关闭时归还焦点；
  // 若 opener 已不可用，至少把焦点从已卸载的 portal 节点上挪走（jsdom 不做焦点修正）。
  useEffect(() => {
    if (open) {
      openerRef.current =
        document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : null;
      return;
    }
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener !== null && document.body.contains(opener)) {
      opener.focus();
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && !document.body.contains(active)) {
      active.blur();
    }
  }, [open]);

  // 焦点管理：打开即进入对话框（预检禁用时落「取消」键，否则落主确认键）。
  // 执行中（busy）不搬动焦点，避免打断进度展示。
  useEffect(() => {
    if (!open || busy) {
      return;
    }
    if (!preflightBlocked) {
      confirmRef.current?.focus();
      return;
    }
    cancelRef.current?.focus();
  }, [open, busy, preflightBlocked]);

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
    };
  }, [deps]);

  const handleConfirm = useCallback(
    async (applyNow: boolean) => {
      setBusy(true);
      setProgress(null);
      console.log('[ADL-DEBUG] ResetAllDialog confirm start', { applyNow, retainSource });
      const outcome = await resetAllSettings(
        buildDeps(),
        { storagePlan: plan, applyNow, retainSource },
        (key) => {
          setProgress(key);
          console.log('[ADL-DEBUG] ResetAllDialog progress', { group: key });
        },
      );
      console.log('[ADL-DEBUG] ResetAllDialog confirm done', {
        done: outcome.done,
        failedAt: outcome.failedAt,
      });
      setBusy(false);
      onCommitted(outcome);
      onClose();
    },
    [buildDeps, plan, retainSource, onCommitted, onClose],
  );

  if (!open) {
    return null;
  }

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
        ref={confirmRef}
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
      ref={confirmRef}
      type="button"
      className="adl-btn adl-btn--secondary"
      disabled={busy}
      onClick={() => void handleConfirm(false)}
    >
      {t.storageGroupResetConfirm}
    </button>
  );

  // 进度区恒占位（minHeight），避免执行中插入文案导致对话框跳动；闲时用零宽空格撑高。
  const progressText =
    busy && progress !== null
      ? formatT(t, 'settingsResetAllProgress', { group: groupLabel(t, progress) })
      : ' ';

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
          <p className="adl-confirm-dialog__message">{t.settingsResetAllConfirmMessage}</p>

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

          <p
            className="adl-confirm-dialog__message adl-confirm-dialog__progress"
            aria-live="polite"
            style={{ minHeight: '1.4em', marginBottom: 0 }}
          >
            {progressText}
          </p>
        </div>
        <div className="adl-confirm-dialog__footer">
          <button
            ref={cancelRef}
            type="button"
            className="adl-btn adl-btn--secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t.cancel}
          </button>
          {confirmControls}
        </div>
      </div>
    </div>,
    document.body,
  );
}
