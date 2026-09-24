import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@stores/slicedStore';
import { DOWNLOAD_REFRESH_FAILED } from '@stores/slices/browserDownloadsSlice';
import { useTCopy } from '@i18n/useTCopy';
import { ManualPathInput } from './StorageCategoryRow';

/**
 * 路径别名归一（前端侧，供"显式输入=系统默认"判定，F8/N6）：
 * 统一斜杠与去尾分隔符；大小写折叠**仅当任一侧为 Windows 风格**（含反斜杠、盘符
 * `X:` 前缀、正斜杠 UNC `//server/share`）——单侧判定会漏掉 `C:/X` vs `c:\x` 混写；
 * 纯正斜杠路径（Unix 风格）保持大小写敏感，与后端 `normalize_path_key`
 * （仅 #[cfg(windows)] 小写）语义一致。
 */
function normalizePathAlias(p: string): string {
  return p.replace(/\//g, '\\').replace(/\\+$/, '');
}

function isWindowsStylePath(p: string): boolean {
  // 反斜杠、盘符前缀（`X:`）、正斜杠 UNC（`//server/share`）均为 Windows 风格（R4-N1）。
  return p.includes('\\') || /^[a-zA-Z]:/.test(p) || p.startsWith('//');
}

function isSameResolvedPath(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }
  const normA = normalizePathAlias(a);
  const normB = normalizePathAlias(b);
  if (isWindowsStylePath(a) || isWindowsStylePath(b)) {
    return normA.toLowerCase() === normB.toLowerCase();
  }
  return normA === normB;
}

/**
 * 「浏览器默认下载路径」区块（原「浏览器」设置组的 default_path 行，Plan C Task 5 移入「存储」组）。
 * 下载**模式**（auto/ask）仍留在「浏览器」组，这里只管路径与「更改时迁移」开关。
 *
 * 布局：迁移复选框在上、路径行在下，两行属同一语义分组（去分隔线、右侧控件垂直居中）。
 * 路径行：手输草稿（失焦/回车提交）+ 选择目录按钮；提交一律走 `changeDownloadPath`
 *（`migrate` 取当前复选框状态）。开启复选框时弹确认，确认后才写入（默认关闭）。
 *
 * 空路径（= 系统默认）不空显示：展示 `download_get_default_path` 解析出的系统默认
 * 目录；无改动失焦不回写，与系统默认同值的显式输入归一为 `''`（不把隐式默认转成显式落盘）。
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

  /** 刷新失败哨兵（slice 侧 DOWNLOAD_REFRESH_FAILED）：写成功但回读失败时透出，映射专用 toast。 */
  const commitPath = async (path: string) => {
    if (busy || isLoadingSettings) {
      return;
    }
    // 提交前 trim；与解析系统默认相同的显式输入归一为 ''（保持隐式默认，
    // 不把显式值落盘改变 storage 覆盖判定，F8）；无改动不回写。
    const trimmed = path.trim();
    const target = isSameResolvedPath(trimmed, systemDefaultDownloadPath) ? '' : trimmed;
    if (target === defaultPath) {
      return;
    }
    setBusy(true);
    try {
      const result = await changeDownloadPath(target, autoMigrate);
      if (!result.ok) {
        showToast(
          result.error.message === DOWNLOAD_REFRESH_FAILED
            ? t.storageDownloadRefreshFailed
            : autoMigrate
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
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePickDirectory = async () => {
    if (busy || isLoadingSettings) {
      return;
    }
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
      if (result.data) {
        const picked = result.data.trim();
        // 选中目录恰为系统默认 → 按 '' 提交（同 commitPath 的归一，F8/N6）。
        const target = isSameResolvedPath(picked, systemDefaultDownloadPath) ? '' : picked;
        if (target !== defaultPath) {
          const change = await changeDownloadPath(target, autoMigrate);
          if (!change.ok) {
            showToast(
              change.error.message === DOWNLOAD_REFRESH_FAILED
                ? t.storageDownloadRefreshFailed
                : autoMigrate
                  ? t.storageDownloadMigrateFailed.replace(
                      '{error}',
                      change.error.message ?? t.storageUnknownError,
                    )
                  : t.storagePickFailed.replace(
                      '{error}',
                      change.error.message ?? t.storageUnknownError,
                    ),
              'error',
            );
          }
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleMigrateToggle = (checked: boolean) => {
    if (!checked) {
      void updateDownloadSettings(undefined, undefined, false).then((result) => {
        if (!result.ok) {
          showToast(t.settingsUpdateFailed, 'error');
        }
      });
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
              data-testid="download-migrate-checkbox"
              checked={autoMigrate}
              disabled={disabled}
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
                      void updateDownloadSettings(undefined, undefined, true).then((result) => {
                        if (!result.ok) {
                          showToast(t.settingsUpdateFailed, 'error');
                        }
                      });
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
