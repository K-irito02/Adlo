import React from 'react';
import { IconChevronDown, IconChevronRight, FileBadgeIcon } from '@icons';
import { getFileTreeVisualSpec } from './fileTreeVisuals';

interface TreeRowProps {
  name: string;
  path: string;
  isDir: boolean;
  depth: number;
  isExpanded?: boolean;
  isSelected?: boolean;
  /** 弱选中态（与 isSelected 视觉区分），用于“点击节点”这类非打开场景的临时高亮 */
  isWeakSelected?: boolean;
  isHoveredByAncestor?: boolean;
  onToggle?: (path: string) => void;
  onActivate?: (path: string, isDir: boolean) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const TreeRow = React.memo(function TreeRow({
  name,
  path,
  isDir,
  depth,
  isExpanded = false,
  isSelected = false,
  isWeakSelected = false,
  isHoveredByAncestor = false,
  onToggle,
  onActivate,
  onContextMenu,
  className,
  style,
}: TreeRowProps) {
  const fileVisual = isDir
    ? undefined
    : getFileTreeVisualSpec({ name, path, kind: 'file' as const });

  return (
    <li
      className={`adl-tree-node${isSelected ? ' is-selected' : ''}${isWeakSelected ? ' is-weak-selected' : ''}${isHoveredByAncestor ? ' is-hovered-by-ancestor' : ''} adl-filetree__item${isDir ? ' adl-filetree__node--directory' : ' adl-filetree__node--file'}${className ? ` ${className}` : ''}`}
      data-depth={depth}
      data-path={path}
      style={
        {
          '--adl-tree-row-offset': `${Math.max(4, depth * 48 + 4)}px`,
          '--adl-tree-indent': `${Math.max(0, (depth - 1) * 14)}px`,
          position: 'relative',
          ...style,
        } as React.CSSProperties
      }
      role="treeitem"
      aria-expanded={isDir ? (isExpanded ? 'true' : 'false') : undefined}
    >
      <div className="adl-tree-node__row adl-filetree__row" onContextMenu={onContextMenu}>
        {isDir ? (
          <button
            type="button"
            className="adl-tree-node__toggle adl-filetree__toggle"
            onClick={() => onToggle?.(path)}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <IconChevronDown size={12} decorative />
            ) : (
              <IconChevronRight size={12} decorative />
            )}
          </button>
        ) : (
          <span className="adl-tree-node__icon-before">
            <span
              className={`adl-filetree__file-icon adl-filetree__file-icon--${fileVisual?.tone ?? 'default'}`}
              aria-hidden="true"
            >
              <FileBadgeIcon variant={fileVisual?.icon ?? 'badge'} size={14} decorative />
            </span>
          </span>
        )}
        <button
          type="button"
          className="adl-tree-node__label adl-filetree__label"
          title={path}
          onClick={() => (onActivate ? onActivate(path, isDir) : onToggle?.(path))}
        >
          <span className="adl-tree-node__label-content adl-filetree__node-main">
            <span className="adl-tree-node__label-text">{name}</span>
          </span>
        </button>
      </div>
    </li>
  );
});
