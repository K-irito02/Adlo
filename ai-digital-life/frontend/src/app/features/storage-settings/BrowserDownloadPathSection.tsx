import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { ManualPathInput } from './StorageCategoryRow';

/**
 * 「浏览器默认下载路径」区块（原「浏览器」设置组的 default_path 行，Plan C Task 5 移入「存储」组）。
 * 下载**模式**（auto/ask）仍留在「浏览器」组，这里只管路径与「更改时迁移」开关。
 *
 * 布局：迁移复选框在上、路径行在下，两行属同一语义分组（去分隔线、右侧控件垂直居中）。
 * 路径行：手输草稿（失焦/回车提交）+ 选择目录按钮；提交一律走 `changeDownloadPath`
 *（`migrate` 取当前复选框状态）。开启复选框时弹确认，确认后才写入（默认关闭）。
 *
 * 空路径（= 系统默认）不空显示：展示 `download_get_default_path` 解析出的系统默认
 * 目录；无改动失焦不回写（提交守卫按展示值判等），不把隐式默认转成显式落盘。
 */
export function BrowserDownloadPathSection() {
  const { t } = useTCopy();
  const downloadSettings = useAppStore((s) => s.downloadSettings);
  const systemDefaultDownloadPath = useAppStore((s) => s.systemDefaultDownloadPath);
  const isLoadingSettings = useAppStore((s) => s.isLoadingSettings);
  const updateDownloadSettings = useAppStore((s) => s.updateDownloadSettings);
  const changeDownloadPath = useAppStore((s) => s.changeDownloadPath);
  const fetchSystemDefaultDownloadPath = useAppStore((s) => s.fetchSystemDefaultDownloadPath);
  const showToast = useAppStore((s) => s.showToast);

  const [busy, setBusy] = useState(false);
  const [confirmEnable, setConfirmEnable] = useState(false);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const defaultPath = downloadSettings.default_path;
  const autoMigrate = downloadSettings.auto_migrate_on_path_change;
  const disabled = isLoadingSettings || busy;
  /** 展示路径：显式配置优先；空（系统默认）则显示解析出的系统默认目录。 */
  const displayPath = defaultPath || systemDefaultDownloadPath;

  useEffect(() => {
    void fetchSystemDefaultDownloadPath();
  }, [fetchSystemDefaultDownloadPath]);

  useEffect(() => {
    if (!confirmEnable) {
      return;
    }
    confirmRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (busy) {
          return;
        }
        setConfirmEnable(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [confirmEnable, busy]);

  useEffect(() => {
    if (confirmEnable) {
      return;
    }
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, [confirmEnable]);

  const commitPath = async (path: string) => {
    // 按展示值判等：无改动失焦不回写，避免把隐式系统默认转成显式落盘。
    if (path === displayPath) {
      return;
    }
    setBusy(true);
    try {
      const result = await changeDownloadPath(path, autoMigrate);
      if (!result.ok) {
        showToast(
          autoMigrate
            ? t.storageDownloadMigrateFailed.replace('{error}', result.error.message)
            : t.storagePickFailed.replace('{error}', result.error.message),
          'error',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePickDirectory = async () => {
    const bridge = window.digitalLife?.workspace;
    if (!bridge?.pickDirectory) {
      showToast(t.storagePickUnavailable, 'error');
      return;
    }
    setBusy(true);
    try {
      const result = await bridge.pickDirectory();
      if (!result.ok) {
        showToast(
          t.storagePickFailed.replace('{error}', result.error.message ?? t.storageUnknownError),
          'error',
        );
        return;
      }
      if (result.data && result.data !== displayPath) {
        const change = await changeDownloadPath(result.data, autoMigrate);
        if (!change.ok) {
          showToast(
            autoMigrate
              ? t.storageDownloadMigrateFailed.replace('{error}', change.error.message)
              : change.error.message || t.storageUnknownError,
            'error',
          );
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleMigrateToggle = (checked: boolean) => {
    if (!checked) {
      void updateDownloadSettings(undefined, undefined, false);
      return;
    }
    setConfirmEnable(true);
  };

  return (
    <>
      <div
        className="adl-settings-row adl-settings-row--path-center adl-settings-row--no-divider"
        data-testid="download-migrate-row"
      >
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <label htmlFor="adl-download-migrate">{t.storageDownloadMigrateLabel}</label>
            <input
              id="adl-download-migrate"
              type="checkbox"
              aria-label={t.storageDownloadMigrateLabel}
              data-testid="download-migrate-checkbox"
              checked={autoMigrate}
              disabled={isLoadingSettings}
              onChange={(e) => {
                triggerRef.current = e.currentTarget;
                handleMigrateToggle(e.target.checked);
              }}
            />
          </div>
          <small>{t.storageDownloadMigrateHint}</small>
        </div>
      </div>

      <div
        className="adl-settings-row adl-settings-row--path-center"
        data-testid="download-path-row"
      >
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.browserDownloadSettingsPath}</span>
          </div>
          <small>{t.browserDownloadSettingsPathDesc}</small>
        </div>
        <div className="adl-settings-row__control adl-settings-row__control--inline">
          <ManualPathInput
            value={displayPath}
            label={t.browserDownloadSettingsPath}
            placeholder={t.storageManualInputPlaceholder}
            disabled={disabled}
            onCommit={(path) => void commitPath(path)}
          />
          <button
            type="button"
            className="adl-btn adl-btn--path-pick"
            data-testid="download-path-pick"
            disabled={disabled}
            onClick={() => void handlePickDirectory()}
          >
            {t.storagePickDir}
          </button>
        </div>
      </div>

      {confirmEnable
        ? createPortal(
            <div
              className="adl-confirm-overlay"
              onClick={busy ? undefined : () => setConfirmEnable(false)}
              role="dialog"
              aria-modal="true"
              aria-label={t.storageDownloadMigrateEnableTitle}
            >
              <div className="adl-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="adl-confirm-dialog__header">
                  <h3 className="adl-confirm-dialog__title">
                    {t.storageDownloadMigrateEnableTitle}
                  </h3>
                </div>
                <div className="adl-confirm-dialog__body">
                  <p className="adl-confirm-dialog__message">
                    {t.storageDownloadMigrateEnableConfirm}
                  </p>
                </div>
                <div className="adl-confirm-dialog__footer">
                  <button
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    disabled={busy}
                    onClick={() => setConfirmEnable(false)}
                  >
                    {t.storageCancel}
                  </button>
                  {/* 确认与「取消」同款 secondary（无品牌蓝填充，见 tree-cache 关闭确认先例）。 */}
                  <button
                    ref={confirmRef}
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    disabled={busy}
                    onClick={() => {
                      setConfirmEnable(false);
                      void updateDownloadSettings(undefined, undefined, true);
                    }}
                  >
                    {t.storageDownloadMigrateEnableConfirmBtn}
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
