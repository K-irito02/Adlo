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
      badge?: string;
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
      badge?: string;
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
  extraSelectedPath?: string;
  /**
   * 弱选中模式：为 true 时 selectedFilePath 表示“编辑器当前打开的文件”，
   * 以弱选中态渲染（跟随编辑器保持），强选中仅来自 extraSelectedPath（点击选中）。
   * 缺省为 false 时保持旧行为：selectedFilePath 以强选中态渲染（GitHub/浏览器/变更树等）。
   */
  activePathIsWeak?: boolean;
  expandedPaths: Record<string, boolean>;
  dirtyPaths?: Set<string>;
  externalChangePath?: string;
  onToggle: (path: string) => void;
  onOpenFile: (relativePath: string) => void;
  /**
   * 文件悬停通知（事项4 hover 预取用）：悬停落到文件节点时触发，
   * 目录不触发。缺省不传则无任何行为（文件面板等不启用预取）。
   */
  onHoverFile?: (relativePath: string) => void;
  renderMeta?: (node: T) => React.ReactNode;
  renderCount?: (node: T) => React.ReactNode;
  renderIconBefore?: (node: T) => React.ReactNode;
  getNodeClassName?: (node: T) => string | undefined;
  getNodeTitle?: (node: T) => string | undefined;
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
  expandedPaths: Record<string, boolean>,
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
