import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { ToggleControl } from '../../components/settings/SettingsControls';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { IconResetDefaults } from '../../icons';

/**
 * 「浏览配置文件」块：面板与中心是否共用一个 WebView2 浏览配置文件。
 *
 * 关闭时中心使用独立 UDF（独立 cookie / 登录态）；打开时中心与面板共用默认
 * UDF（登录一次，两边都生效）。设置只影响新建标签：已打开的标签保留创建时
 * 选择的 UDF，关闭后下次创建才切换。
 *
 * 浏览器模式没有 WebView2/UDF 概念，开关禁用并提示「仅桌面模式可用」。
 * 块级恢复默认与其它块同款：确认后写回默认值（开）。
 */
export function BrowserProfileSettings({
  anchor,
  onOpenChange,
}: {
  anchor?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTCopy();
  const shareProfile = useAppStore((s) => s.browserShareProfile);
  const setBrowserShareProfile = useAppStore((s) => s.setBrowserShareProfile);
  const isTauri = useAppStore((s) => s.isTauri);
  const isLoadingSettings = useAppStore((s) => s.isLoadingSettings);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    onOpenChange?.(confirm);
  }, [confirm, onOpenChange]);

  const atDefault = shareProfile === true;
  const resetDisabled = atDefault || isLoadingSettings || !isTauri;
  const resetLabel = formatT(t, 'settingsResetGroupToDefault', {
    group: t.browserShareProfileTitle,
  });

  const handleChange = useCallback(
    (value: boolean) => {
      setBrowserShareProfile(value);
    },
    [setBrowserShareProfile],
  );

  const handleResetConfirm = useCallback(() => {
    setBrowserShareProfile(true);
    setConfirm(false);
  }, [setBrowserShareProfile]);

  return (
    <>
      <div className="adl-settings-browser__header" data-settings-anchor={anchor}>
        <button
          type="button"
          className="adl-settings-row__reset"
          aria-label={resetLabel}
          title={resetLabel}
          data-testid="share-profile-reset"
          disabled={resetDisabled}
          onClick={() => setConfirm(true)}
        >
          <IconResetDefaults size={14} decorative />
        </button>
        <SettingsHeader title={t.browserShareProfileTitle} />
      </div>
      <div className="adl-settings-card adl-browser-settings">
        <div className="adl-settings-row" data-settings-row={t.browserShareProfile}>
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.browserShareProfile}</span>
            </div>
            <small>{t.browserShareProfileDesc}</small>
            {!isTauri ? <small>{t.browserShareProfileDesktopOnly}</small> : null}
          </div>
          <div className="adl-settings-row__control">
            <ToggleControl
              item={{
                id: 'browserShareProfile',
                groupId: 'browser',
                label: t.browserShareProfile,
                type: 'toggle',
                value: shareProfile,
                disabled: !isTauri || isLoadingSettings,
              }}
              onChange={handleChange}
            />
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        title={formatT(t, 'settingsResetGroupConfirmTitle', {
          group: t.browserShareProfileTitle,
        })}
        message={formatT(t, 'settingsResetGroupConfirmMessage', {
          group: t.browserShareProfileTitle,
        })}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleResetConfirm}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
