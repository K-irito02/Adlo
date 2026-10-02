import React, { useEffect } from 'react';
import { useTCopy } from '../i18n/useTCopy';
import { useAppStore } from '../stores/slicedStore';
import { CenterBrowserView, CenterEntryPage, CenterTerminalView } from '../features/center';

/**
 * 中部主区域 — 中心标签视图调度器。
 *
 * 按 `centerTabs` / `centerActiveTabId` 分发当前活动中心标签：
 * browser → `CenterBrowserView`；terminal → `CenterTerminalView`；launcher →
 * `CenterEntryPage`。dsh 已统一为普通浏览器中心标签（Task 15），不再有专属视图分支。
 *
 * 首启不变量（spec §5）：`centerTabs` 为空时补齐一个 launcher，这是启动时唯一
 * 创建 launcher 的位置。
 *
 * 内容区 `section` 地标用专用 `centerContentLabel`（不复用标签条的
 * `centerTabStripLabel`，两者是不同的可访问名称）。
 */
const CenterPane = React.memo(function CenterPane() {
  const { t } = useTCopy();
  const centerTabs = useAppStore((s) => s.centerTabs);
  const activeId = useAppStore((s) => s.centerActiveTabId);
  const centerAddTab = useAppStore((s) => s.centerAddTab);
  const centerSelectTab = useAppStore((s) => s.centerSelectTab);

  const active = centerTabs.find((tab) => tab.id === activeId);

  useEffect(() => {
    // 读取实时 store（而非闭包快照）以保证 StrictMode 双跑 effect 的幂等性：
    // 第二次运行读到已补齐的长度，不会重复创建 launcher。
    if (useAppStore.getState().centerTabs.length === 0) {
      centerAddTab('launcher', null);
    }
  }, [centerTabs.length, centerAddTab]);

  useEffect(() => {
    // 悬空修复：有列表但 activeId 无匹配时选中首个以修复 store，
    // 而不是静默渲染首个（本帧返回 null，修复后重渲染）。
    if (centerTabs.length > 0 && !active) {
      centerSelectTab(centerTabs[0].id);
    }
  }, [centerTabs, active, centerSelectTab]);

  // 列表为空（首帧补齐前）或悬空修复帧：渲染 null，不挂载 `centerTabId=''`
  // 的 launcher（空串 id 会污染后续的 centerRemoveTab / centerUpdateTab 调用）。
  if (!active) {
    return null;
  }

  return (
    <section className="adl-center adl-center--tab-host" aria-label={t.centerContentLabel}>
      {active.kind === 'browser' ? (
        active.refId ? (
          <CenterBrowserView browserTabId={active.refId} />
        ) : (
          // 损坏态占位：browser 中心标签无底层标签引用时不渲染空工具栏。
          <div className="adl-center__empty">
            <p className="adl-welcome__empty">{t.centerBrowserTabMissing}</p>
          </div>
        )
      ) : active.kind === 'terminal' ? (
        <CenterTerminalView centerTabId={active.id} terminalTabId={active.refId} />
      ) : (
        <CenterEntryPage centerTabId={active.id} />
      )}
    </section>
  );
});

export { CenterPane };
