import { useMemo } from 'react';
import type { BrowserCategoryType, BrowserTreeNode } from './types';
import { getCountStrategy } from './useBrowserTreeData';

export interface UseBrowserTreeVirtualizationInput {
  workspaceNodes: BrowserTreeNode[];
  userFolderNodes: BrowserTreeNode[];
  historyNodes: BrowserTreeNode[];
}

export interface UseBrowserTreeVirtualizationResult {
  counts: Map<string, number>;
}

export function useBrowserTreeVirtualization(
  input: UseBrowserTreeVirtualizationInput
): UseBrowserTreeVirtualizationResult {
  const { workspaceNodes, userFolderNodes, historyNodes } = input;

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    const visit = (categoryType: BrowserCategoryType, nodes: BrowserTreeNode[]) => {
      const stack: { type: BrowserCategoryType; nodes: BrowserTreeNode[] }[] = [
        { type: categoryType, nodes },
      ];
      while (stack.length > 0) {
        const { type, nodes: items } = stack.pop()!;
        const strategyFn = getCountStrategy(type);
        for (const item of items) {
          if (item.kind === 'directory') {
            map.set(item.path, strategyFn(item));
            if (item.children.length > 0) {
              stack.push({ type, nodes: item.children });
            }
          }
        }
      }
    };
    visit('workspace', workspaceNodes);
    visit('userFolder', userFolderNodes);
    visit('history', historyNodes);
    return map;
  }, [workspaceNodes, userFolderNodes, historyNodes]);

  return { counts };
}
