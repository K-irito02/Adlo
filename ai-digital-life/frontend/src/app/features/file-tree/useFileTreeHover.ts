import { useState, useMemo, useCallback } from 'react';
import type React from 'react';
import type { FileTreeRenderableNode, FlattenedTreeNode } from './fileTree.utils';

export interface UseFileTreeHoverResult {
  hoveredPath: string | undefined;
  hoveredDescendantPaths: Set<string> | undefined;
  onMouseOver: React.MouseEventHandler<HTMLUListElement>;
  onMouseOut: React.MouseEventHandler<HTMLUListElement>;
}

export function useFileTreeHover<T extends FileTreeRenderableNode>(
  flatNodes: FlattenedTreeNode<T>[],
): UseFileTreeHoverResult {
  const [hoveredPath, setHoveredPath] = useState<string | undefined>(undefined);

  const hoveredDescendantPaths: Set<string> | undefined = useMemo(() => {
    if (!hoveredPath) {
      return undefined;
    }
    const set = new Set<string>();
    const hoveredIndex = flatNodes.findIndex((fn) => fn.node.path === hoveredPath);
    if (hoveredIndex === -1) {
      return undefined;
    }
    const hoveredDepth = flatNodes[hoveredIndex].depth;
    for (let i = hoveredIndex + 1; i < flatNodes.length; i++) {
      const fn = flatNodes[i];
      if (fn.depth <= hoveredDepth) {
        break;
      }
      set.add(fn.node.path);
    }
    return set;
  }, [flatNodes, hoveredPath]);

  const onMouseOver = useCallback((e: React.MouseEvent<HTMLUListElement>) => {
    const target = (e.target as HTMLElement).closest('[data-path]') as HTMLElement | null;
    if (target?.dataset.path) {
      setHoveredPath(target.dataset.path);
    }
  }, []);

  const onMouseOut = useCallback((e: React.MouseEvent<HTMLUListElement>) => {
    const target = (e.target as HTMLElement).closest('[data-path]') as HTMLElement | null;
    const relatedTarget = (e.relatedTarget as HTMLElement)?.closest?.(
      '[data-path]',
    ) as HTMLElement | null;
    if (target?.dataset.path && relatedTarget?.dataset.path !== target.dataset.path) {
      setHoveredPath(relatedTarget?.dataset.path ?? undefined);
    }
  }, []);

  return {
    hoveredPath,
    hoveredDescendantPaths,
    onMouseOver,
    onMouseOut,
  };
}
