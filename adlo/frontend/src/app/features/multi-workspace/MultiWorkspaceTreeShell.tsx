import React, { useEffect, useRef } from 'react';
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
  // 容器引用：仅当点击发生在本面板自己的容器内时才触发清除逻辑，
  // 避免 Files / Changes 两个面板同时挂载时互相污染对方选中态。
  const containerRef = useRef<HTMLDivElement>(null);
  // 点击外部清除选中态：保留交互元素（对话框/新建按钮/树行/工作区头/右键菜单），
  // 点击其余区域（含容器空白）清除选中态。
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // 点击本面板容器之外（另一面板/编辑器/其他区域）不清除选中态
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        return;
      }
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
      <div className="adl-multitree" ref={containerRef}>
        <div className="adl-multitree__empty">
          <p className="adl-empty-hint">{emptyText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="adl-multitree" ref={containerRef}>
      {visibleWorkspaces.map((ws) => (
        <React.Fragment key={ws.id}>
          {renderContent(ws, expandedState[ws.id] ?? false)}
        </React.Fragment>
      ))}
    </div>
  );
});
