import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import {
  flattenVisibleNodes,
  type FileTreeRenderableNode,
  type FlattenedTreeNode,
} from './fileTree.utils';
import { useVirtualList } from './hooks/useVirtualList';

export const VIRTUAL_ITEM_HEIGHT = 28;

export interface UseFileTreeVirtualizationResult<T extends FileTreeRenderableNode> {
  flatNodes: FlattenedTreeNode<T>[];
  totalHeight: number;
  trunkHeightMap: Record<string, number>;
  startIndex: number;
  visibleNodes: FlattenedTreeNode<T>[];
}

export function useFileTreeVirtualization<T extends FileTreeRenderableNode>(
  nodes: T[],
  expandedPaths: Record<string, boolean>,
  scrollAreaRef: RefObject<HTMLDivElement | null>,
  flipAnimation: boolean,
): UseFileTreeVirtualizationResult<T> {
  const flatNodes = useMemo(
    () => flattenVisibleNodes(nodes, expandedPaths),
    [nodes, expandedPaths],
  );

  const totalHeight = flatNodes.length * VIRTUAL_ITEM_HEIGHT;

  const trunkHeightMap: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    const stack: { path: string; depth: number; count: number }[] = [];

    for (const { node, depth } of flatNodes) {
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        const entry = stack.pop()!;
        if (entry.count > 0) {
          map[entry.path] = (entry.count + 1) * VIRTUAL_ITEM_HEIGHT;
        }
        if (stack.length > 0) {
          stack[stack.length - 1].count += entry.count + 1;
        }
      }

      if (node.kind === 'directory') {
        stack.push({ path: node.path, depth, count: 0 });
      } else if (stack.length > 0) {
        stack[stack.length - 1].count++;
      }
    }

    while (stack.length > 0) {
      const entry = stack.pop()!;
      if (entry.count > 0) {
        map[entry.path] = (entry.count + 1) * VIRTUAL_ITEM_HEIGHT;
      }
      if (stack.length > 0) {
        stack[stack.length - 1].count += entry.count + 1;
      }
    }

    return map;
  }, [flatNodes]);

  const { startIndex, endIndex } = useVirtualList(
    scrollAreaRef as RefObject<HTMLElement>,
    flatNodes,
    VIRTUAL_ITEM_HEIGHT,
    5,
  );

  const visibleNodes = useMemo(
    () => flatNodes.slice(startIndex, endIndex),
    [flatNodes, startIndex, endIndex],
  );

  // FLIP animation: smooth position transitions via Web Animation API
  const prevPositionsRef = useRef<Map<string, number>>(new Map());
  const flipAnimationsRef = useRef<Map<string, Animation>>(new Map());
  const wasHiddenRef = useRef(true);

  useLayoutEffect(() => {
    if (!flipAnimation) {
      prevPositionsRef.current = new Map();
      wasHiddenRef.current = true;
      return;
    }

    const container = scrollAreaRef.current;
    if (!container) {
      return;
    }

    flipAnimationsRef.current.forEach((anim) => anim.cancel());
    flipAnimationsRef.current = new Map();

    const isVisible = container.offsetParent !== null;

    const ulEl = container.querySelector('.adl-filetree');
    if (!ulEl) {
      return;
    }
    const ulRect = ulEl.getBoundingClientRect();
    const newPositions = new Map<string, number>();
    const items = container.querySelectorAll<HTMLElement>('[data-path].adl-filetree__node--file');
    items.forEach((el) => {
      const path = el.getAttribute('data-path');
      if (path) {
        const rect = el.getBoundingClientRect();
        newPositions.set(path, rect.top - ulRect.top);
      }
    });

    // Skip FLIP animation when transitioning from hidden to visible (e.g., panel switch)
    // to avoid unwanted entrance animations from zero positions.
    if (wasHiddenRef.current) {
      prevPositionsRef.current = newPositions;
      wasHiddenRef.current = !isVisible;
      return;
    }
    wasHiddenRef.current = !isVisible;

    let hasDelta = false;
    const deltas = new Map<string, number>();
    prevPositionsRef.current.forEach((oldTop, path) => {
      const newTop = newPositions.get(path);
      if (newTop !== undefined && Math.abs(oldTop - newTop) > 0.5) {
        deltas.set(path, oldTop - newTop);
        hasDelta = true;
      }
    });

    if (!hasDelta) {
      prevPositionsRef.current = newPositions;
      return;
    }

    deltas.forEach((deltaY, path) => {
      const el = container.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
      if (el) {
        const anim = el.animate(
          [{ transform: `translateY(${deltaY}px)` }, { transform: 'translateY(0)' }],
          { duration: 300, easing: 'ease' },
        );
        flipAnimationsRef.current.set(path, anim);
        anim.finished
          .then(() => flipAnimationsRef.current.delete(path))
          .catch(() => {
            /* cancelled, ignore */
          });
      }
    });

    prevPositionsRef.current = newPositions;
  }, [flatNodes, flipAnimation, scrollAreaRef]);

  return {
    flatNodes,
    totalHeight,
    trunkHeightMap,
    startIndex,
    visibleNodes,
  };
}
