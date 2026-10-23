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
  /** 存储组执行依赖（仅执行侧：setPaths / resetTreeCache / downloadPath）。 */
  deps: StorageResetExecuteDeps;
  /** 执行结束回调（成功/失败/跳过汇总由调用方展示）。允许 async：汇总侧含刷新/重启等待。 */
  onCommitted: (outcome: ResetAllOutcome) => void | Promise<void>;
  onClose: () => void;
  /**
   * 触发元素（调用方在点击同步段捕获）：预计算期间触发按钮被禁用、焦点会被浏览器
   * 移走，开框后读 activeElement 已 capture 不到，故由调用方显式传入用于关闭后归还焦点。
   * 缺省时回落到开框瞬间 activeElement（直接挂载本框的用例与测试走此路径）。
   */
  opener?: HTMLElement | null;
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
 * 有意不区分 unavailable / allDefault：两者执行语义相同（存储腿跳过、其余三组照常），
 * 且产品要求确认框不列分组细节，故统一渲染通用确认文案。
  * 执行走 `resetAllSettings`（preferences → browser → dsh → network → storage），进度逐组回调；
 * 执行期间锁定关闭/取消/遮罩/Esc（存储迁移不可中断）。结果交 `onCommitted` 由调用方汇总。
 * 偏好/浏览器/DSH 的依赖取执行时实时 store 值；下载迁移开关同样取实时值覆盖计划快照
 *（R2：开关反映用户最新意图；preflight 与路径判定仍用开框快照）。
 */
export function ResetAllDialog({
  open,
  planResult,
  deps,
  onCommitted,
  onClose,
  opener = null,
}: ResetAllDialogProps) {
  const { t } = useTCopy();
  const [retainSource, setRetainSource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<GroupKey | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // 开框重置本地态（retain/busy/进度）。计划来自 props（开框快照，中途不变），故仅以
  // open 边沿触发，不跟随 planResult 身份变化（否则框开着时父重算会清空用户已勾选项）。
  useEffect(() => {
    if (!open) {
      return;
    }
    setRetainSource(false);
    setProgress(null);
  }, [open]);

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

  // 打开时记录触发元素用于关闭后归还焦点：优先调用方传入的 opener（预计算禁用了
  // 触发按钮，开框瞬间 activeElement 已是 body）；缺省回落到 activeElement 捕获。
  // 若 opener 已不可用，至少把焦点从已卸载的 portal 节点上挪走（jsdom 不做焦点修正）。
  // opener 仅在 open 上升沿读取（开框快照）；列入依赖仅为满足 exhaustive-deps，
  // 关闭分支对 opener 变化无害（savedOpener 为空时至多 no-op）。
  useEffect(() => {
    if (open) {
      openerRef.current =
        opener !== null && document.body.contains(opener)
          ? opener
          : document.activeElement instanceof HTMLElement &&
              document.activeElement !== document.body
            ? document.activeElement
            : null;
      return;
    }
    const savedOpener = openerRef.current;
    openerRef.current = null;
    if (savedOpener !== null && document.body.contains(savedOpener)) {
      savedOpener.focus();
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && !document.body.contains(active)) {
      active.blur();
    }
  }, [open, opener]);

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

  /**
   * 执行时组装完整编排 deps：存储取自 props，偏好/浏览器/DSH 取执行时实时 store 值。
   * 下载迁移开关由调用方传入（单源供给两腿，防 M-3 式分叉）：browser 腿与 storage 腿
   * （经 handleConfirm 覆盖计划快照）用同一实时值；preflight 与路径判定仍用开框快照。
   */
  const buildDeps = useCallback(
    (liveMigrateAtOpen: boolean): ResetAllDeps => {
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
          migrateAtOpen: liveMigrateAtOpen,
        },
        dsh: { saveSourceConfig: (config) => store.saveSourceConfig(config) },
        network: { saveSourceConfig: (config) => store.saveSourceConfig(config) },
        storage: deps,
      };
    },
    [deps],
  );

  const handleConfirm = useCallback(
    async (applyNow: boolean) => {
      setBusy(true);
      setProgress(null);
      // 依赖 resetAllSettings 的“永不 reject”契约（内部 attempt 全兜底）：
      // try/finally 只保解锁，rejection 仅可能来自 onCommitted（下有 catch）。
      try {
        // 下载迁移开关取执行时实时值（开框后用户改设置的极小窗口也按最新意图执行）；
        // preflight 与路径判定仍用开框快照（同源）。
        const liveMigrateAtOpen =
          useAppStore.getState().downloadSettings.auto_migrate_on_path_change;
        const outcome = await resetAllSettings(
          buildDeps(liveMigrateAtOpen),
          {
            storagePlan: plan === null ? null : { ...plan, migrateAtOpen: liveMigrateAtOpen },
            applyNow,
            retainSource,
          },
          setProgress,
        );
        // onCommitted 为显式等待的 fire-and-forget：汇总侧抛错不阻塞关框
        //（恢复本身已完成，编排器永不 reject），catch 仅防 unhandled rejection
        //（点击侧 `void handleConfirm()` 不会消费它）。
        try {
          await onCommitted(outcome);
        } catch {
          // 汇总展示失败：恢复已完成，直接关框，不打断用户。
          // 注：汇总内的存储刷新失败同样静默——下次进入存储组时会自动重拉，无残留。
        }
        onClose();
      } finally {
        // 异常安全：任何抛错时仍须解锁，否则对话框永久锁定、用户只能杀进程。
        setBusy(false);
      }
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

  // 进度区恒占位，避免执行中插入文案导致对话框跳动：闲时用 NBSP（U+00A0，不坍缩）
  // 撑高，配 `.adl-confirm-dialog__progress` 的 min-height（单行 1.4em，与 message
  // 行高对齐）与 margin-bottom 清零。
  const progressText =
    busy && progress !== null
      ? formatT(t, 'settingsResetAllProgress', { group: groupLabel(t, progress) })
      : '\u00A0';

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
                disabled={busy || preflightBlocked}
                onChange={(e) => setRetainSource(e.target.checked)}
              />
              <span>{t.storageRetainSource}</span>
            </label>
          ) : null}

          <p
            className="adl-confirm-dialog__message adl-confirm-dialog__progress"
            aria-live="polite"
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
