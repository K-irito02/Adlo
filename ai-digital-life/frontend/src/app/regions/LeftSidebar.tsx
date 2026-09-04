import React from 'react';
import { useTCopy } from '../i18n/useTCopy';
import { ResizeHandle } from './left-sidebar/ResizeHandle';
import { ClipboardHistoryList } from '../features/clipboard-history';
import { SystemMonitorPanel } from '../features/system-monitor';

interface LeftSidebarProps {
  collapsed: boolean;
}

const LeftSidebar = React.memo(function LeftSidebar({ collapsed }: LeftSidebarProps) {
  const { t } = useTCopy();

  return (
    <aside
      className={`adl-leftbar${collapsed ? ' adl-leftbar--collapsed' : ''}`}
      aria-label={t.sidebarNavigator}
      aria-hidden={collapsed}
    >
      <div className="adl-leftbar__content">
        <ClipboardHistoryList />
        <SystemMonitorPanel />
      </div>

      <ResizeHandle />
    </aside>
  );
});

export { LeftSidebar };
