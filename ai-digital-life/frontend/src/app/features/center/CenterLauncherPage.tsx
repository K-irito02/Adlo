import { useCallback } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { DshVersionManagement } from '@features/dsh/WelcomePage';

interface CenterLauncherPageProps {
  centerTabId: string;
}

/**
 * 中心 launcher 引导页（三入口 + dsh 版本管理卡片）。
 *
 * 三入口**就地转换当前 launcher 标签**（`centerUpdateTab`），不新增中心标签：
 * - 打开 dsh：过渡态（Ruling-12）——dsh 仍是全局单例，仅调用 `openDsh()`，
 *   由 `CenterPane` 的 `isOpen → DshHostRegion` 分支承载，**不转换**标签；
 *   Task 15 才把 dsh 统一为普通浏览器中心标签。
 * - 打开浏览器欢迎页：新建空 URL 浏览器标签 → 移到中心 → 就地转为 browser。
 * - 打开终端欢迎页：就地转为 `kind='terminal', refId=null`（渲染终端选择器）。
 *
 * 下方复用 `WelcomePage` 拆出的 `DshVersionManagement`（当前/最新版本、检查更新、
 * 升级、卸载、重装），与欢迎页保持功能一致。
 */
export function CenterLauncherPage({ centerTabId }: CenterLauncherPageProps) {
  const { t } = useTCopy();
  const openDsh = useAppStore((s) => s.openDsh);
  const browserOpenTab = useAppStore((s) => s.browserOpenTab);
  const browserSetLocation = useAppStore((s) => s.browserSetLocation);
  const centerUpdateTab = useAppStore((s) => s.centerUpdateTab);

  const handleOpenDsh = useCallback(() => {
    void openDsh();
  }, [openDsh]);

  const handleOpenBrowser = useCallback(() => {
    browserOpenTab();
    const newId = useAppStore.getState().browserActiveTabId;
    if (!newId) {
      return;
    }
    browserSetLocation(newId, 'center');
    centerUpdateTab(centerTabId, { kind: 'browser', refId: newId });
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
