import React, { useCallback } from 'react';

/**
 * 下划线式 tab 导航（完整提取自 Git 可视化热力聚合图 `HeatmapCardGroup`，
 * 供各处复用：视觉（底部边框 + 选中下划线动效）与交互（左右/首尾键导航 + 焦点跟随）一模一样）。
 *
 * 样式由调用方通过 className 注入：新用法直接用共享类
 * （`adl-underline-tabs__nav/__tab/--active`，见 `styles/components/underline-tabs.css`）；
 * 存量用法（热力图）透传原有类名，视觉与测试零变化。
 */

interface UnderlineTabItem<Id extends string> {
  id: Id;
  label: React.ReactNode;
}

interface UnderlineTabsProps<Id extends string> {
  tabs: UnderlineTabItem<Id>[];
  activeId: Id;
  onChange: (id: Id) => void;
  /** tablist 的无障碍名称 */
  ariaLabel: string;
  /** 按钮 id 前缀：`${idPrefix}-${tab.id}`（键盘导航后焦点跟随用） */
  idPrefix: string;
  /** 对应 tabpanel 的 id（`aria-controls`），无 panel 时可省略 */
  panelId?: string;
  navClassName: string;
  tabClassName: string;
  activeTabClassName: string;
}

function UnderlineTabs<Id extends string>({
  tabs,
  activeId,
  onChange,
  ariaLabel,
  idPrefix,
  panelId,
  navClassName,
  tabClassName,
  activeTabClassName,
}: UnderlineTabsProps<Id>) {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const idx = tabs.findIndex((tab) => tab.id === activeId);
      let next = idx;
      if (event.key === 'ArrowRight') {
        next = (idx + 1) % tabs.length;
      } else if (event.key === 'ArrowLeft') {
        next = (idx - 1 + tabs.length) % tabs.length;
      } else if (event.key === 'Home') {
        next = 0;
      } else if (event.key === 'End') {
        next = tabs.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      onChange(tabs[next].id);
      document.getElementById(`${idPrefix}-${tabs[next].id}`)?.focus();
    },
    [tabs, activeId, onChange, idPrefix],
  );

  return (
    <nav className={navClassName} role="tablist" aria-label={ariaLabel} onKeyDown={handleKeyDown}>
      {tabs.map((tab) => {
        const isActive = activeId === tab.id;
        return (
          <button
            key={tab.id}
            id={`${idPrefix}-${tab.id}`}
            type="button"
            role="tab"
            className={`${tabClassName}${isActive ? ` ${activeTabClassName}` : ''}`}
            aria-selected={isActive}
            aria-controls={panelId}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

const MemoUnderlineTabs = React.memo(UnderlineTabs) as typeof UnderlineTabs;

export { MemoUnderlineTabs as UnderlineTabs };
export type { UnderlineTabItem, UnderlineTabsProps };
