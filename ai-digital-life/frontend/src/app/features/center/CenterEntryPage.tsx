import { useCallback } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { IconDeepSeek, IconGlobe, IconTerminal } from '@icons';

interface CenterEntryPageProps {
  centerTabId: string;
}

/**
 * 中心统一入口页（三入口）。
 *
 * 中间部分不再专属 dsh，而是统一入口，可打开三种内容之一：
 * - 打开 deepseek harness：`openDsh()` 拉起进程并创建承载它的普通浏览器中心标签，
 *   成功后移除当前入口页标签，让新建的 dsh 浏览器标签（已设为活动）显示出来。
 * - 打开浏览器：新建空 URL 浏览器标签 → 移到中心 → 就地转为 browser。
 * - 打开终端：就地转为 `kind='terminal', refId=null`（渲染终端选择器）。
 *
 * dsh 版本管理已移入右侧设置面板「DSH」设置组，此处只保留三入口。
 */
export function CenterEntryPage({ centerTabId }: CenterEntryPageProps) {
  const { t } = useTCopy();
  const openDsh = useAppStore((s) => s.openDsh);
  const browserOpenTab = useAppStore((s) => s.browserOpenTab);
  const browserSetLocation = useAppStore((s) => s.browserSetLocation);
  const centerUpdateTab = useAppStore((s) => s.centerUpdateTab);
  const centerRemoveTab = useAppStore((s) => s.centerRemoveTab);
  const reportError = useAppStore((s) => s.reportError);
  const showToast = useAppStore((s) => s.showToast);

  const handleOpenDsh = useCallback(async () => {
    try {
      const result = await openDsh();
      if (!result) {
        // openDsh 失败时已由 action 记录全局错误卡片，此处不重复提示。
        return;
      }
      // 固定 3080 端口被残留 dsh 占用时后端自动释放并重启 → 右下角 info 卡片告知。
      if (result.freedPort) {
        reportError('DSH_FREED_PORT', t.dshPortFreed, 'dsh');
      }
      // openDsh 已创建并激活 dsh 浏览器中心标签；移除入口页标签以免其抢占视图。
      centerRemoveTab(centerTabId);
    } catch {
      // 意外异常兜底；常规失败（openDsh 返回 null）已由 action 记录全局错误卡片。
      showToast(t.dshOpenFailed, 'error');
    }
  }, [openDsh, reportError, showToast, centerRemoveTab, centerTabId, t]);

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
    <section className="adl-center-entry" aria-label={t.centerLauncherLabel}>
      <div className="adl-launcher-entries">
        <button type="button" className="adl-launcher-entry" onClick={handleOpenDsh}>
          <IconDeepSeek size={16} decorative />
          <span>{t.centerLauncherOpenDsh}</span>
        </button>
        <button type="button" className="adl-launcher-entry" onClick={handleOpenBrowser}>
          <IconGlobe size={16} decorative />
          <span>{t.centerLauncherOpenBrowser}</span>
        </button>
        <button type="button" className="adl-launcher-entry" onClick={handleOpenTerminal}>
          <IconTerminal size={16} decorative />
          <span>{t.centerLauncherOpenTerminal}</span>
        </button>
      </div>
    </section>
  );
}
