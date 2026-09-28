import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { IconResetDefaults } from '../../icons';
import { BrowserDownloadPathSection } from './BrowserDownloadPathSection';
import { isDownloadPathAtDefault, useDownloadPathReset } from './downloadPathReset';

/**
 * 「浏览器下载路径」块（块头 + 卡片 + 恢复默认确认对话框），自包含状态。
 * 「存储」与「浏览器」设置组渲染同一实例化组件：底层 store 同源，两处显示与行为
 * 天然同步（同一时刻只挂载一个组，无双实例冲突）。
 *
 * @param onOpenChange 确认对话框开合通知：父级（存储组）用它把「下载确认已开」纳入
 * 组级恢复的入口守卫，避免键盘路径多框叠加（原 `downloadResetConfirm` 语义）。
 */
export function DownloadPathBlock({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const { t } = useTCopy();
  const downloadSettings = useAppStore((s) => s.downloadSettings);
  const downloadSettingsLoaded = useAppStore((s) => s.downloadSettingsLoaded);
  const { resetDownloadToDefault } = useDownloadPathReset();

  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  /** 开框时刻的迁移开关快照：文案与执行同源，避免开框后改开关导致"文案一个值、
   * 行为另一个值"（task4 L-5）。 */
  const migrateAtOpenRef = useRef(false);

  const atDefault = isDownloadPathAtDefault(downloadSettings, downloadSettingsLoaded);
  const resetLabel = formatT(t, 'settingsResetGroupToDefault', {
    group: t.storageBrowserDownloadTitle,
  });

  useEffect(() => {
    onOpenChange?.(confirm);
  }, [confirm, onOpenChange]);

  // 确认：打开聚焦确认键，Escape 关闭；忙时锁关闭（写+回读仍在后台跑）。
  useEffect(() => {
    if (!confirm) {
      return;
    }
    confirmRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (busy) {
          return;
        }
        setConfirm(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [confirm, busy]);

  // 关闭后焦点回到触发源（打开时记录），键盘用户不丢位置。
  useEffect(() => {
    if (confirm) {
      return;
    }
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, [confirm]);

  /** 恢复默认：确认后把路径写回系统默认（空串），按**开框时刻**的迁移开关快照决定
   * 是否搬文件；开关复位与搬迁结果解耦（无论成败都关闭）。任一失败对话框保持打开，
   * 供检查/重试（重试安全：空串→空串幂等）。 */
  const handleConfirm = async () => {
    setBusy(true);
    try {
      const ok = await resetDownloadToDefault(migrateAtOpenRef.current);
      if (ok) {
        setConfirm(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="adl-settings-storage__header adl-settings-storage__header--section">
        <button
          type="button"
          className="adl-settings-row__reset"
          aria-label={resetLabel}
          title={resetLabel}
          data-testid="download-path-reset"
          disabled={atDefault}
          onClick={(e) => {
            triggerRef.current = e.currentTarget;
            // 开框即快照迁移开关（M4/L-5）。
            migrateAtOpenRef.current = downloadSettings.auto_migrate_on_path_change;
            setConfirm(true);
          }}
        >
          <IconResetDefaults size={14} decorative />
        </button>
        <SettingsHeader title={t.storageBrowserDownloadTitle} />
      </div>
      <div className="adl-settings-card">
        <BrowserDownloadPathSection />
      </div>
      {confirm
        ? createPortal(
            <div
              className="adl-confirm-overlay"
              onClick={busy ? undefined : () => setConfirm(false)}
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
                    {/* 事项 10：路径已是系统默认（仅开关非默认可开框）→ 只提示开关恢复。 */}
                    {downloadSettings.default_path === '' && migrateAtOpenRef.current
                      ? t.storageDownloadResetConfirmSwitchOnly
                      : migrateAtOpenRef.current
                        ? t.storageDownloadResetConfirmMigrateOn
                        : t.storageDownloadResetConfirmMigrateOff}
                  </p>
                </div>
                <div className="adl-confirm-dialog__footer">
                  <button
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    disabled={busy}
                    onClick={() => setConfirm(false)}
                  >
                    {t.storageCancel}
                  </button>
                  <button
                    ref={confirmRef}
                    type="button"
                    // 确认与「取消」同款 secondary（无品牌蓝填充，产品决策 2026-09-24）。
                    className="adl-btn adl-btn--secondary"
                    disabled={busy}
                    onClick={() => void handleConfirm()}
                  >
                    {t.storageDownloadResetConfirmBtn}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
