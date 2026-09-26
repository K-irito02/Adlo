import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { DEFAULT_BROWSER_SUSPEND_MS, DEFAULT_DOWNLOAD_MODE } from '@shared/defaultPreferences';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { BrowserPerformanceSettings } from './BrowserPerformanceSettings';
import { BrowserDownloadSettings } from './BrowserDownloadSettings';
import { DownloadPathBlock } from '../storage-settings/DownloadPathBlock';
import {
  isDownloadPathAtDefault,
  useDownloadPathReset,
} from '../storage-settings/downloadPathReset';

/**
 * 「浏览器」设置组容器：挂起时长 + 下载模式 + 下载路径三块。
 *
 * 组级恢复默认走自有流程（与「存储」组同构）：侧边栏置 browserGroupResetPending
 * 信号 → 此处消费并弹出自有确认对话框 → 按挂起 → 模式 → 路径顺序依次执行；
 * 任一步失败保持对话框供重试。同时维护浏览器三块「全默认」聚合信号
 * （browserBlocksAtDefault），供侧边栏浏览器行 disabled 判定。
 */
export function BrowserSettings() {
  const { t } = useTCopy();
  const updatePreferences = useAppStore((s) => s.updatePreferences);
  const updateDownloadSettings = useAppStore((s) => s.updateDownloadSettings);
  const showToast = useAppStore((s) => s.showToast);
  const downloadSettings = useAppStore((s) => s.downloadSettings);
  const downloadSettingsLoaded = useAppStore((s) => s.downloadSettingsLoaded);
  const { resetDownloadToDefault } = useDownloadPathReset();

  // 组级恢复待处理信号 + 消费动作（pending 布尔消除挂载播种吞信号的首跳竞态）。
  const browserGroupResetPending = useAppStore((s) => s.browserGroupResetPending);
  const consumeBrowserGroupReset = useAppStore((s) => s.consumeBrowserGroupReset);

  // 三块 at-default 判定与各块恢复按钮同口径（fail-open：未知视为非默认）。
  const suspendMs = useAppStore((s) => s.appInfo?.config?.browserInactiveTabSuspendMs);
  const suspendAtDefault = suspendMs !== undefined && suspendMs === DEFAULT_BROWSER_SUSPEND_MS;
  const modeAtDefault = downloadSettingsLoaded && downloadSettings.mode === DEFAULT_DOWNLOAD_MODE;
  const pathAtDefault = isDownloadPathAtDefault(downloadSettings, downloadSettingsLoaded);

  const setBrowserBlocksAtDefault = useAppStore((s) => s.setBrowserBlocksAtDefault);
  useEffect(() => {
    setBrowserBlocksAtDefault(suspendAtDefault && modeAtDefault && pathAtDefault);
  }, [suspendAtDefault, modeAtDefault, pathAtDefault, setBrowserBlocksAtDefault]);
  // 卸载（切出浏览器组）清 null 回到「未知 → 启用」。transient，不持久化。
  useEffect(() => () => setBrowserBlocksAtDefault(null), [setBrowserBlocksAtDefault]);

  const [groupResetOpen, setGroupResetOpen] = useState(false);
  const [groupResetBusy, setGroupResetBusy] = useState(false);
  /** 开框时刻的迁移开关快照：路径步的搬运行为与展示文案同源（开框后改开关不影响本次）。 */
  const groupMigrateAtOpenRef = useRef(false);
  /** 单块确认框开合（各块经 onOpenChange 通知）：组级恢复的入口守卫用，
   * 避免键盘路径多框叠加。 */
  const [suspendConfirmOpen, setSuspendConfirmOpen] = useState(false);
  const [modeConfirmOpen, setModeConfirmOpen] = useState(false);
  const [pathConfirmOpen, setPathConfirmOpen] = useState(false);

  /**
   * 组级对话框打开（承接 pending 信号）：
   * 1. 先消费 pending（幂等，无副作用）；
   * 2. 入口守卫：组框已开 / 任一单块确认框已开 / 执行中 → 丢弃信号，
   *    杜绝并发执行与键盘路径多框叠加（与 StorageSettings.openGroupResetDialog 同构）。
   */
  const openGroupResetDialog = useCallback(() => {
    consumeBrowserGroupReset();
    if (
      groupResetOpen ||
      groupResetBusy ||
      suspendConfirmOpen ||
      modeConfirmOpen ||
      pathConfirmOpen
    ) {
      return;
    }
    groupMigrateAtOpenRef.current = downloadSettings.auto_migrate_on_path_change;
    setGroupResetOpen(true);
  }, [
    consumeBrowserGroupReset,
    groupResetOpen,
    groupResetBusy,
    suspendConfirmOpen,
    modeConfirmOpen,
    pathConfirmOpen,
    downloadSettings.auto_migrate_on_path_change,
  ]);

  // 浏览器组级恢复默认：侧边栏置 pending（顺带切到浏览器组），此处消费并开自有对话框。
  useEffect(() => {
    if (!browserGroupResetPending) {
      return;
    }
    openGroupResetDialog();
  }, [browserGroupResetPending, openGroupResetDialog]);

  // 卸载兜底：pending 置位后若组件在消费前卸载，清信号避免下次挂载"迟到弹窗"。
  useEffect(
    () => () => {
      useAppStore.getState().consumeBrowserGroupReset();
    },
    [],
  );

  /**
   * 组级恢复确认：按挂起 → 下载模式 → 下载路径顺序依次执行（跨 bridge 多步，
   * 不能走 updatePreferences 一刀切）。任一步失败即停止并保持对话框供重试，
   * 全部成功才关框 + 成功 toast。
   */
  const handleGroupConfirm = useCallback(() => {
    if (groupResetBusy) {
      return;
    }
    setGroupResetBusy(true);
    void (async () => {
      try {
        const suspendOk = await updatePreferences({
          browserInactiveTabSuspendMs: DEFAULT_BROWSER_SUSPEND_MS,
        });
        if (!suspendOk) {
          showToast(t.settingsUpdateFailed, 'error');
          return;
        }
        const modeResult = await updateDownloadSettings(DEFAULT_DOWNLOAD_MODE);
        if (!modeResult.ok) {
          showToast(t.settingsUpdateFailed, 'error');
          return;
        }
        // 路径步自带 toast（失败原因细分）与开框快照的迁移开关。
        const pathOk = await resetDownloadToDefault(groupMigrateAtOpenRef.current);
        if (!pathOk) {
          return;
        }
        showToast(t.settingsResetComplete, 'success');
        setGroupResetOpen(false);
      } catch {
        showToast(t.settingsUpdateFailed, 'error');
      } finally {
        setGroupResetBusy(false);
      }
    })();
  }, [
    groupResetBusy,
    updatePreferences,
    updateDownloadSettings,
    showToast,
    t,
    resetDownloadToDefault,
  ]);

  const handleGroupCancel = useCallback(() => {
    if (groupResetBusy) {
      return;
    }
    setGroupResetOpen(false);
  }, [groupResetBusy]);

  return (
    // section 容器：块头与卡片同级排布（与存储组同构），gap 由 settings.css 共享规则给出。
    <div className="adl-settings-section adl-settings-browser">
      <BrowserPerformanceSettings onOpenChange={setSuspendConfirmOpen} />
      <BrowserDownloadSettings onOpenChange={setModeConfirmOpen} />
      {/* 与「存储」组同一块组件：底层 store 同源，两处显示天然同步。 */}
      <DownloadPathBlock onOpenChange={setPathConfirmOpen} />
      <ConfirmDialog
        open={groupResetOpen}
        title={t.browserGroupResetTitle}
        message={
          groupMigrateAtOpenRef.current
            ? `${t.browserGroupResetMessage} ${t.browserGroupResetMigrateOnNote}`
            : t.browserGroupResetMessage
        }
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleGroupConfirm}
        onCancel={handleGroupCancel}
      />
    </div>
  );
}
