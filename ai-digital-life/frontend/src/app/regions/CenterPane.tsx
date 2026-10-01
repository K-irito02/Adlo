import React, { useEffect } from 'react';
import { useTCopy } from '../i18n/useTCopy';
import { useAppStore } from '../stores/slicedStore';
import { CenterBrowserView, CenterLauncherPage, CenterTerminalView } from '../features/center';

/**
 * 中部主区域 — 中心标签视图调度器。
 *
 * 按 `centerTabs` / `centerActiveTabId` 分发当前活动中心标签：
 * browser → `CenterBrowserView`；terminal → `CenterTerminalView`；launcher →
 * `CenterLauncherPage`。dsh 已统一为普通浏览器中心标签（Task 15），不再有专属视图分支。
 *
 * 首启不变量（spec §5）：`centerTabs` 为空时补齐一个 launcher，这是启动时唯一
 * 创建 launcher 的位置。
 */
const CenterPane = React.memo(function CenterPane() {
  const { t } = useTCopy();
  const centerTabs = useAppStore((s) => s.centerTabs);
  const activeId = useAppStore((s) => s.centerActiveTabId);
  const centerAddTab = useAppStore((s) => s.centerAddTab);

  const active = centerTabs.find((tab) => tab.id === activeId) ?? centerTabs[0];

  useEffect(() => {
    // 读取实时 store（而非闭包快照）以保证 StrictMode 双跑 effect 的幂等性：
    // 第二次运行读到已补齐的长度，不会重复创建 launcher。
    if (useAppStore.getState().centerTabs.length === 0) {
      centerAddTab('launcher', null);
    }
  }, [centerTabs.length, centerAddTab]);

  return (
    <section className="adl-center adl-center--dsh-placeholder" aria-label={t.dshTitle}>
      {active?.kind === 'browser' ? (
        <CenterBrowserView centerTabId={active.id} browserTabId={active.refId ?? ''} />
      ) : active?.kind === 'terminal' ? (
        <CenterTerminalView centerTabId={active.id} terminalTabId={active.refId} />
      ) : (
        <CenterLauncherPage centerTabId={active?.id ?? ''} />
      )}
    </section>
  );
});

export { CenterPane };
