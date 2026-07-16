import { useCallback, type ReactElement } from 'react';
import type { ChangeTreeNode } from '@regions/right-panel/changesTree';
import type { WorkspaceTreeNode } from '@ai-digital-life/kernel';
import { getPrimaryBadge } from '@regions/right-panel/ChangesPanel/utils';

export function useChangesPanelRenderers(): {
  renderNavigatorMeta: (node: WorkspaceTreeNode) => ReactElement;
  renderNavigatorCount: (node: WorkspaceTreeNode) => ReactElement | null;
} {
  const renderNavigatorMeta = useCallback((node: WorkspaceTreeNode) => {
    const cn = node as ChangeTreeNode;
    return (
      <span className="adl-filetree__count-badge">
        {cn.kind === 'directory'
          ? cn.fileCount
          : cn.totalHunks > 0
            ? `${cn.reviewedHunks}/${cn.totalHunks}`
            : '1'}
      </span>
    );
  }, []);

  const renderNavigatorCount = useCallback((node: WorkspaceTreeNode) => {
    const cn = node as ChangeTreeNode;
    const badge = getPrimaryBadge(cn);
    return badge ? (
      <span className={`adl-filetree__status-badge adl-filetree__status-badge--${badge.tone}`}>
        {badge.label}
      </span>
    ) : null;
  }, []);

  return { renderNavigatorMeta, renderNavigatorCount };
}
