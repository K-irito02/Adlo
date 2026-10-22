import { useCallback, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { isDshBusySnap, isDshConfirmedUnusable } from '@features/dsh/dshOpenGuard';
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
  // openDsh 在途标志：拉起进程可能耗时数秒；入口按钮保持可用，
  // 重复点击走 in-flight 复用＋busy 提示。dsh 迟到完成时仅当本标签仍为
  // launcher 才移除（stillLauncher 守卫），不会误删已转换的标签。
  const [openingDsh, setOpeningDsh] = useState(false);

  const handleOpenDsh = useCallback(async () => {
    // 在途复用不灰按钮（用户明确要求：入口按钮永不灰化禁用）。
    // 并发安全由 action 内 openDshInFlight 复用同一 promise 保证，不会重复拉起；
    // 重复点击给 busy 提示而非静默无反应。
    if (openingDsh) {
      showToast(t.dshVersionBusyRetry, 'warning');
      return;
    }
    // 版本操作在途守卫（用户实测 2026-10-21）：
    // 安装/切换/重装/卸载及其重启长尾完成前拦截，toast 提示稍候，不建标签。
    if (isDshBusySnap()) {
      showToast(t.dshVersionBusyRetry, 'warning');
      return;
    }
    setOpeningDsh(true);
    try {
      // 无可用版本守卫（用户实测 2026-10-21）：宿主无任何可用版本时不调桥、
      // 不建标签，直接 toast，由 isDshConfirmedUnusable 新鲜判定（fail-open）。
      if (await isDshConfirmedUnusable()) {
        showToast(t.dshOpenNoVersion, 'warning');
        return;
      }
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
      // 仅当仍为本入口页标签时移除（防御性：并发/异常下标签可能已被就地转换）。
      const stillLauncher =
        useAppStore.getState().centerTabs.find((tab) => tab.id === centerTabId)?.kind ===
        'launcher';
      if (stillLauncher) {
        centerRemoveTab(centerTabId);
      }
    } catch {
      // 意外异常兜底；常规失败（openDsh 返回 null）已由 action 记录全局错误卡片。
      showToast(t.dshOpenFailed, 'error');
    } finally {
      setOpeningDsh(false);
    }
  }, [openDsh, openingDsh, reportError, showToast, centerRemoveTab, centerTabId, t]);

  // 入口按钮永不灰化禁用（用户明确要求）：在途重复点击给 busy 提示；
  // dsh 迟到完成时仅当本标签仍为 launcher 才移除（见下 stillLauncher 守卫），
  // 不会误删用户已就地转换出的浏览器/终端标签。
  const handleOpenBrowser = useCallback(() => {
    browserOpenTab();
    const newId = useAppStore.getState().browserActiveTabId;
    if (!newId) {
      return;
    }
    browserSetLocation(newId, 'center');
    centerUpdateTab(centerTabId, { kind: 'browser', refId: newId });
    // 位置排他：新标签曾被设为面板活动标签；面板按 id 挂载（无 location 过滤），
    // 必须重夹，否则同一 session 双挂载
    // （与 centerActions.clampPanelActiveTab 的规范路径一致）。
    useAppStore.getState().clampPanelActiveTab();
  }, [browserOpenTab, browserSetLocation, centerUpdateTab, centerTabId]);

  const handleOpenTerminal = useCallback(() => {
    centerUpdateTab(centerTabId, { kind: 'terminal', refId: null });
  }, [centerUpdateTab, centerTabId]);

  return (
    <section className="adl-center-entry" aria-label={t.centerLauncherLabel}>
      <div className="adl-launcher-entries" aria-busy={openingDsh}>
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
