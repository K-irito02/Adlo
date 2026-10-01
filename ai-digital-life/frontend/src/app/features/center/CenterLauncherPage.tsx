import { useCallback } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { DshVersionManagement } from '@features/dsh/DshVersionManagement';

interface CenterLauncherPageProps {
  centerTabId: string;
}

/**
 * 中心 launcher 引导页（三入口 + dsh 版本管理卡片）。
 *
 * 三入口：
 * - 打开 dsh：`openDsh()` 拉起进程并创建承载它的普通浏览器中心标签，成功后移除
 *   当前 launcher 标签，让新建的 dsh 浏览器标签（已设为活动）显示出来。
 * - 打开浏览器欢迎页：新建空 URL 浏览器标签 → 移到中心 → 就地转为 browser。
 * - 打开终端欢迎页：就地转为 `kind='terminal', refId=null`（渲染终端选择器）。
 *
 * 下方复用 `DshVersionManagement`（当前/最新版本、检查更新、升级、卸载、重装）。
 */
export function CenterLauncherPage({ centerTabId }: CenterLauncherPageProps) {
  const { t } = useTCopy();
  const openDsh = useAppStore((s) => s.openDsh);
  const browserOpenTab = useAppStore((s) => s.browserOpenTab);
  const browserSetLocation = useAppStore((s) => s.browserSetLocation);
  const centerUpdateTab = useAppStore((s) => s.centerUpdateTab);
  const centerRemoveTab = useAppStore((s) => s.centerRemoveTab);

  const handleOpenDsh = useCallback(async () => {
    const result = await openDsh();
    if (result) {
      // openDsh 已创建并激活 dsh 浏览器中心标签；移除 launcher 以免其抢占视图。
      centerRemoveTab(centerTabId);
    }
  }, [openDsh, centerRemoveTab, centerTabId]);

  const handleOpenBrowser = useCallback(() => {
    browserOpenTab();
    const newId = useAppStore.getState().browserActiveTabId;
    if (!newId) {
      return;
    }
    browserSetLocation(newId, 'center');
    centerUpdateTab(centerTabId, { kind: 'browser', refId: newId });
    // 位置排他：新标签已转中心，`browserOpenTab` 曾把它设为面板活动标签；
    // 面板按 id 挂载（无 location 过滤），必须重夹，否则同一 session 双挂载
    // （与 centerActions.clampPanelActiveTab 的规范路径一致）。
    useAppStore.getState().clampPanelActiveTab();
  }, [browserOpenTab, browserSetLocation, centerUpdateTab, centerTabId]);

  const handleOpenTerminal = useCallback(() => {
    centerUpdateTab(centerTabId, { kind: 'terminal', refId: null });
  }, [centerUpdateTab, centerTabId]);

  return (
    <div className="adl-app-welcome">
      <div className="adl-app-welcome__card">
        <button
          type="button"
          className="adl-btn adl-btn--secondary"
          aria-label={t.centerLauncherOpenDsh}
          onClick={handleOpenDsh}
        >
          {t.centerLauncherOpenDsh}
        </button>
        <button
          type="button"
          className="adl-btn adl-btn--secondary"
          aria-label={t.centerLauncherOpenBrowser}
          onClick={handleOpenBrowser}
        >
          {t.centerLauncherOpenBrowser}
        </button>
        <button
          type="button"
          className="adl-btn adl-btn--secondary"
          aria-label={t.centerLauncherOpenTerminal}
          onClick={handleOpenTerminal}
        >
          {t.centerLauncherOpenTerminal}
        </button>
      </div>

      <DshVersionManagement />
    </div>
  );
}
