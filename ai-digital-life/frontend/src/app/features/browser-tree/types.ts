import type { FileTreeRenderableNode } from "../file-tree";

export type BrowserCategoryType = "workspace" | "userFolder" | "history";

export type BrowserNodeType = "workspace" | "folder" | "year" | "month" | "day" | "tab" | "history";

export interface BrowserTreeNode extends FileTreeRenderableNode {
  children: BrowserTreeNode[];
  nodeType: BrowserNodeType;
  tabId?: string;
  url?: string;
  workspaceId?: string;
  folderId?: string;
  visitedAt?: number;
}

export interface BrowserCategoryState {
  id: BrowserCategoryType;
  label: string;
  isExpanded: boolean;
  isPermanent: boolean;
  nodes: BrowserTreeNode[];
}
