import React, { useEffect } from 'react';
import type { RecentWorkspaceEntry } from '@shared/ipc';

export interface MultiWorkspaceTreeShellProps {
  visibleWorkspaces: RecentWorkspaceEntry[];
  expandedState: Record<string, boolean>;
  emptyText: string;
  onToggleExpand: (workspaceId: string) => void;
  onClearSelection: () => void;
  renderContent: (workspace: RecentWorkspaceEntry, isExpanded: boolean) => React.ReactNode;
}

export const MultiWorkspaceTreeShell = React.memo(function MultiWorkspaceTreeShell({
  visibleWorkspaces,
  expandedState,
  emptyText,
  onClearSelection,
  renderContent,
}: MultiWorkspaceTreeShellProps) {
  // 点击外部清除选中态：保留交互元素（对话框/新建按钮/树行/工作区头/右键菜单），
  // 点击其余区域（含容器空白）清除选中态。
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          [
            '.adl-prompt-modal', // 新建/重命名对话框
            '.adl-confirm-overlay', // 删除确认对话框
            '.adl-tool-navigator__create-action', // 新建按钮
            '.adl-filetree__row', // 树节点行
            '.adl-multitree-entry__header', // 工作区头
            '.adl-sidebar-menu', // 右键菜单
          ].join(', '),
        )
      ) {
        return;
      }
      onClearSelection();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClearSelection]);

  if (visibleWorkspaces.length === 0) {
    return (
      <div className="adl-multitree">
        <div className="adl-multitree__empty">
          <p className="adl-empty-hint">{emptyText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="adl-multitree">
      {visibleWorkspaces.map((ws) => (
        <React.Fragment key={ws.id}>
          {renderContent(ws, expandedState[ws.id] ?? false)}
        </React.Fragment>
      ))}
    </div>
  );
});
