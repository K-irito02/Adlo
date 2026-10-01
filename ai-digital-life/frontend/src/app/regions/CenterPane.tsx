import React, { useEffect } from 'react';
import { useTCopy } from '../i18n/useTCopy';
import { useAppStore } from '../stores/slicedStore';
import { DshHostRegion } from '../features/dsh/DshHostRegion';
import { CloseDshDialog } from '../features/dsh/CloseDshDialog';
import { CenterBrowserView, CenterLauncherPage, CenterTerminalView } from '../features/center';

/**
 * 中部主区域 — 中心标签视图调度器。
 *
 * 按 `centerTabs` / `centerActiveTabId` 分发当前活动中心标签：
 * browser → `CenterBrowserView`；terminal → `CenterTerminalView`；launcher →
 * `CenterLauncherPage`。过渡态（Ruling-12）：dsh 仍是全局单例，`isOpen` 时优先
 * 渲染 `DshHostRegion`；Task 15 才把 dsh 统一为普通浏览器中心标签。
 *
 * 首启不变量（spec §5）：`centerTabs` 为空时补齐一个 launcher，这是启动时唯一
 * 创建 launcher 的位置。
 */
const CenterPane = React.memo(function CenterPane() {
  const { t } = useTCopy();
  const centerTabs = useAppStore((s) => s.centerTabs);
  const activeId = useAppStore((s) => s.centerActiveTabId);
  const centerAddTab = useAppStore((s) => s.centerAddTab);
  const isDshOpen = useAppStore((s) => s.isOpen);

  const active = centerTabs.find((tab) => tab.id === activeId) ?? centerTabs[0];

  useEffect(() => {
    if (centerTabs.length === 0) {
      centerAddTab('launcher', null);
    }
  }, [centerTabs.length, centerAddTab]);

  return (
    <section className="adl-center adl-center--dsh-placeholder" aria-label={t.dshTitle}>
      <CloseDshDialog />
      {active?.kind === 'browser' ? (
        <CenterBrowserView centerTabId={active.id} browserTabId={active.refId ?? ''} />
      ) : active?.kind === 'terminal' ? (
        <CenterTerminalView centerTabId={active.id} terminalTabId={active.refId} />
      ) : isDshOpen ? (
        <DshHostRegion />
      ) : (
        <CenterLauncherPage centerTabId={active?.id ?? ''} />
      )}
    </section>
  );
});

export { CenterPane };
