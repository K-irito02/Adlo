import type { FileTreeRenderableNode } from '@features/file-tree';

export type BrowserCategoryType = 'workspace' | 'userFolder' | 'history';

export type BrowserNodeType =
  | 'workspace'
  | 'folder'
  | 'year'
  | 'month'
  | 'day'
  | 'tab'
  | 'bookmark'
  | 'history';

export interface BrowserTreeNode extends FileTreeRenderableNode {
  children: BrowserTreeNode[];
  nodeType: BrowserNodeType;
  /** 仅当节点背后有真实打开的标签页时存在。 */
  tabId?: string;
  /** 仅当节点是一条书签条目时存在（书签自己的身份，与标签页无关）。 */
  bookmarkId?: string;
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
  /** 书签条目自带的内联图标快照（data-URI）；无站点元数据时可直接显示，避免首字母闪烁。 */
  iconUri?: string;
}

export interface BrowserCategoryState {
  label: string;
  nodes: BrowserTreeNode[];
}
