/**
 * Browser Folders 切片类型定义
 * 从 browserFoldersSlice.ts 提取，供 slice 和消费者使用
 */

export interface BookmarkTabItem {
  tabId: string;
  url: string;
  title: string;
}

export interface TabFolderState {
  id: string;
  name: string;
  createdAt: number;
  isUserCreated?: boolean;
  tabs?: BookmarkTabItem[];
  children?: TabFolderState[];
  parentId?: string;
  parentType?: 'workspace' | 'folder';
}

export interface TabFolderStateUpdate {
  name?: string;
  tabs?: BookmarkTabItem[];
}
