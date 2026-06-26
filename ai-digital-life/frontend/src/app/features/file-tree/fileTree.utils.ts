import type React from 'react';

export interface FileTreeRenderableNode {
  path: string;
  name: string;
  kind: 'directory' | 'file';
  children: FileTreeRenderableNode[];
}

export type FileTreeContextMenuItem<T extends FileTreeRenderableNode> =
  | {
      id: string;
      label?: string;
      icon?: React.ReactNode;
      disabled?: boolean;
      danger?: boolean;
      hasHint?: boolean;
      hint?: string;
      separator?: true;
      action?: (node: T, multiSelectedNodes: T[]) => void;
    }
  | {
      id: string;
      label: string;
      icon?: React.ReactNode;
      disabled?: boolean;
      danger?: boolean;
      hasHint?: boolean;
      hint?: string;
      separator?: false;
      action?: (node: T, multiSelectedNodes: T[]) => void;
    };

export interface FileTreeProps<T extends FileTreeRenderableNode> {
  nodes: T[];
  selectedFilePath?: string;
  selectedFileWorkspaceId?: string;
  expandedPaths: Record<string, boolean>;
  dirtyPaths?: Set<string>;
  externalChangePath?: string;
  onToggle: (path: string) => void;
  onOpenFile: (relativePath: string) => void;
  renderMeta?: (node: T) => React.ReactNode;
  renderCount?: (node: T) => React.ReactNode;
  renderIconBefore?: (node: T) => React.ReactNode;
  getNodeClassName?: (node: T) => string | undefined;
  getContextMenuItems?: (node: T, multiSelectedNodes: T[]) => FileTreeContextMenuItem<T>[];
  contextMenuPersistRef?: React.MutableRefObject<boolean>;
  clearMenuHighlightRef?: React.MutableRefObject<(() => void) | undefined>;
  expandLabel?: string;
  collapseLabel?: string;
  flat?: boolean;
  flipAnimation?: boolean;
}

export function collectDirectoryPaths<T extends FileTreeRenderableNode>(nodes: T[]): string[] {
  const paths: string[] = [];
  const visit = (items: T[]) => {
    items.forEach((item) => {
      if (item.kind === 'directory') {
        paths.push(item.path);
        if (item.children.length > 0) {
          visit(item.children as T[]);
        }
      }
    });
  };
  visit(nodes);
  return paths;
}

export interface FlattenedTreeNode<T extends FileTreeRenderableNode> {
  node: T;
  depth: number;
}

export function flattenVisibleNodes<T extends FileTreeRenderableNode>(
  nodes: T[],
  expandedPaths: Record<string, boolean>
): FlattenedTreeNode<T>[] {
  const result: FlattenedTreeNode<T>[] = [];
  const visit = (items: T[], depth: number) => {
    for (const item of items) {
      result.push({ node: item, depth });
      if (item.kind === 'directory' && expandedPaths[item.path] && item.children.length > 0) {
        visit(item.children as T[], depth + 1);
      }
    }
  };
  visit(nodes, 0);
  return result;
}
