import type { FileTreeRenderableNode } from '@features/file-tree';

export type BrowserCategoryType = 'workspace' | 'userFolder' | 'history';

export type BrowserNodeType = 'workspace' | 'folder' | 'year' | 'month' | 'day' | 'tab' | 'history';

export interface BrowserTreeNode extends FileTreeRenderableNode {
  children: BrowserTreeNode[];
  nodeType: BrowserNodeType;
  tabId?: string;
  url?: string;
  workspaceId?: string;
  folderId?: string;
  visitedAt?: number;
  isPlayingAudio?: boolean;
  isAudioMuted?: boolean;
  associatedTabId?: string;
  /** True if this node represents a saved bookmark (workspace bookmark or user folder entry).
   *  Its delete action should only remove bookmark state, not close the underlying tab. */
  isSavedBookmark?: boolean;
}

export interface BrowserCategoryState {
  label: string;
  nodes: BrowserTreeNode[];
}
