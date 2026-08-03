import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { IconClose, IconFoldVertical } from '@icons';
import { TreeRow } from '../file-tree/TreeRow';
import type { ModuleTreeNode } from './moduleTreeUtils';
import '@/styles/components/module-tree-card.css';

interface ModuleTreeCardProps {
  subtree: ModuleTreeNode[];
  position: { x: number; y: number };
  /** Basename of the right-clicked directory, shown in the card header. */
  dirName?: string;
  /** Full path of the right-clicked directory, shown as a native title tooltip. */
  dirPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

interface FlatNode {
  node: ModuleTreeNode;
  depth: number;
}

function flattenVisible(root: ModuleTreeNode[], expanded: Set<string>, depth = 0): FlatNode[] {
  const result: FlatNode[] = [];
  for (const child of root) {
    result.push({ node: child, depth });
    if (child.isDir && expanded.has(child.path)) {
      result.push(...flattenVisible(child.children, expanded, depth + 1));
    }
  }
  return result;
}

function collectAllPaths(nodes: ModuleTreeNode[]): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    result.push(node.path);
    if (node.children.length > 0) {
      result.push(...collectAllPaths(node.children));
    }
  }
  return result;
}

export const ModuleTreeCard = React.memo(function ModuleTreeCard({
  subtree,
  position,
  dirName,
  dirPath,
  onSelect,
  onClose,
}: ModuleTreeCardProps) {
  const { t } = useTCopy();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [hoveredPath, setHoveredPath] = useState<string | undefined>(undefined);
  const [pos, setPos] = useState(position);
  const [dragging, setDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const dragStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(
    null,
  );

  const clampToViewport = useCallback((x: number, y: number) => {
    const pad = 8;
    const maxLeft = Math.max(pad, window.innerWidth - sizeRef.current.width - pad);
    const maxTop = Math.max(pad, window.innerHeight - sizeRef.current.height - pad);
    return {
      x: Math.min(Math.max(pad, x), maxLeft),
      y: Math.min(Math.max(pad, y), maxTop),
    };
  }, []);

  useLayoutEffect(() => {
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      sizeRef.current = {
        width: rect.width || 320,
        height: rect.height || 200,
      };
    }
    setPos(clampToViewport(position.x, position.y));
  }, [clampToViewport, position.x, position.y]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) {
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest('button')) {
        return;
      }
      dragStartRef.current = { x: e.clientX, y: e.clientY, originX: pos.x, originY: pos.y };
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [pos.x, pos.y],
  );

  const handleHeaderPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = dragStartRef.current;
      if (!start) {
        return;
      }
      const next = clampToViewport(
        start.originX + (e.clientX - start.x),
        start.originY + (e.clientY - start.y),
      );
      setPos(next);
    },
    [clampToViewport],
  );

  const handleHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const handleHeaderPointerCancel = useCallback(() => {
    dragStartRef.current = null;
    setDragging(false);
  }, []);

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const allDirPaths = useMemo(() => new Set(collectAllPaths(subtree)), [subtree]);

  const toggleExpandAll = useCallback(() => {
    setExpanded((prev) => (prev.size === allDirPaths.size ? new Set() : allDirPaths));
  }, [allDirPaths]);

  const allExpanded = useMemo(
    () => allDirPaths.size > 0 && allDirPaths.size === expanded.size,
    [allDirPaths, expanded],
  );

  const handleRowActivate = useCallback(
    (path: string, isDir: boolean) => {
      setSelectedPath(path === selectedPath ? null : path);
      if (isDir) {
        toggleExpand(path);
      }
    },
    [toggleExpand, selectedPath],
  );

  const handleAreaClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-path]')) {
      setSelectedPath(null);
    }
  }, []);

  const handleMouseOver = useCallback((e: React.MouseEvent<HTMLUListElement>) => {
    const target = (e.target as HTMLElement).closest('[data-path]') as HTMLElement | null;
    if (target?.dataset.path) {
      setHoveredPath(target.dataset.path);
    }
  }, []);

  const handleMouseOut = useCallback((e: React.MouseEvent<HTMLUListElement>) => {
    const target = (e.target as HTMLElement).closest('[data-path]') as HTMLElement | null;
    const relatedTarget = (e.relatedTarget as HTMLElement)?.closest?.(
      '[data-path]',
    ) as HTMLElement | null;
    if (target?.dataset.path && relatedTarget?.dataset.path !== target.dataset.path) {
      setHoveredPath(relatedTarget?.dataset.path ?? undefined);
    }
  }, []);

  const flatNodes = flattenVisible(subtree, expanded);

  const trunkHeightMap: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < flatNodes.length; i++) {
      const { node, depth } = flatNodes[i];
      if (!node.isDir || !expanded.has(node.path)) {
        map[node.path] = 0;
        continue;
      }
      let lastDescendantIdx = i;
      for (let j = i + 1; j < flatNodes.length; j++) {
        if (flatNodes[j].depth <= depth) {
          break;
        }
        lastDescendantIdx = j;
      }
      if (i === lastDescendantIdx) {
        map[node.path] = 0;
      } else {
        map[node.path] = (lastDescendantIdx - i) * 28 + 28;
      }
    }
    return map;
  }, [flatNodes, expanded]);

  const hoveredDescendantPaths: Set<string> | undefined = useMemo(() => {
    if (!hoveredPath) {
      return undefined;
    }
    const set = new Set<string>();
    const idx = flatNodes.findIndex((fn) => fn.node.path === hoveredPath);
    if (idx === -1) {
      return undefined;
    }
    const hoveredDepth = flatNodes[idx].depth;
    for (let i = idx + 1; i < flatNodes.length; i++) {
      const fn = flatNodes[i];
      if (fn.depth <= hoveredDepth) {
        break;
      }
      set.add(fn.node.path);
    }
    return set;
  }, [flatNodes, hoveredPath]);

  const cardStyle: React.CSSProperties = {
    position: 'fixed',
    left: pos.x,
    top: pos.y,
  };

  return createPortal(
    <div className="adl-module-tree-card" ref={cardRef} style={cardStyle}>
      <div
        className={`adl-module-tree-card__header${dragging ? ' is-dragging' : ''}`}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={handleHeaderPointerCancel}
      >
        <div className="adl-module-tree-card__header-left">
          <button
            type="button"
            className="adl-module-tree-card__icon-btn"
            onClick={toggleExpandAll}
            title={allExpanded ? t.gitVisModuleCollapseAll : t.gitVisModuleExpandAll}
          >
            <IconFoldVertical size={14} decorative />
          </button>
          {dirName && (
            <span className="adl-module-tree-card__dir-name" title={dirPath}>
              {dirName}
            </span>
          )}
        </div>
        <div className="adl-module-tree-card__header-right">
          <button
            type="button"
            className="adl-module-tree-card__icon-btn"
            onClick={onClose}
            aria-label={t.gitVisModuleClose}
          >
            <IconClose size={14} decorative />
          </button>
        </div>
      </div>
      <div className="adl-module-tree-card__tree" onClick={handleAreaClick}>
        <ul
          className="adl-filetree adl-tree-root"
          role="tree"
          style={{ height: 'auto', position: 'relative' }}
          onMouseOver={handleMouseOver}
          onMouseOut={handleMouseOut}
        >
          {flatNodes.map(({ node, depth }) => (
            <TreeRow
              key={node.path}
              name={node.name}
              path={node.path}
              isDir={node.isDir}
              depth={depth + 1}
              isExpanded={expanded.has(node.path)}
              isSelected={selectedPath === node.path}
              isHoveredByAncestor={hoveredDescendantPaths?.has(node.path) ?? false}
              onToggle={() => toggleExpand(node.path)}
              onActivate={() => handleRowActivate(node.path, node.isDir)}
              style={
                {
                  '--adl-trunk-height': `${trunkHeightMap[node.path] ?? 28}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </ul>
      </div>
      <div className="adl-module-tree-card__actions">
        <button className="adl-module-tree-card__btn" onClick={onClose}>
          {t.gitVisModuleCancel}
        </button>
        <button
          className="adl-module-tree-card__btn adl-module-tree-card__btn--confirm"
          disabled={selectedPath === null}
          onClick={() => {
            if (selectedPath) {
              onSelect(selectedPath);
            }
          }}
        >
          {t.gitVisModuleConfirm}
        </button>
      </div>
    </div>,
    document.body,
  );
});
