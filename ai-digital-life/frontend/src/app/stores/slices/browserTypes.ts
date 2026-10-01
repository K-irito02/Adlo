import type { TabLocation } from './tabLocation';

export interface BrowserTabState {
  id: string;
  workspaceId: string;
  title: string;
  url: string;
  titleResolved: boolean;
  isPinned: boolean;
  pinnedAt?: number;
  sortOrder: number;
  isPlayingAudio: boolean;
  isAudioMuted: boolean;
  isDownloading: boolean;
  /** 所属宿主；缺省（undefined）等同 'panel'。中心标签为 'center'。 */
  location?: TabLocation;
  /** dsh 承载标签（关闭时联动停止 dsh 进程）。 */
  isDsh?: boolean;
}

export interface BrowserTabStateUpdate {
  workspaceId?: string;
  title?: string;
  url?: string;
  titleResolved?: boolean;
  isPinned?: boolean;
  pinnedAt?: number;
  sortOrder?: number;
  isPlayingAudio?: boolean;
  isAudioMuted?: boolean;
  isDownloading?: boolean;
}

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

export interface BrowserBookmark {
  url: string;
  title: string;
}

export interface WorkspaceBookmarkEntry {
  tabId: string;
  url: string;
  title: string;
}

export interface BrowserHistoryState {
  id: string;
  title: string;
  url: string;
  visitedAt: number;
}

export interface ShortcutSite {
  id: string;
  name: string;
  url: string;
  icon?: string;
  sortOrder: number;
  createdAt: number;
}

export interface LocalPort {
  id: string;
  host: string;
  port: number;
  label?: string;
  isAutoDiscovered: boolean;
  healthy: boolean;
  lastAliveAt: number;
  sortOrder: number;
}

export type BackgroundMode = 'default' | 'image' | 'video';
export type BackgroundFit = 'cover' | 'contain' | 'repeat';

export interface BackgroundConfig {
  mode: BackgroundMode;
  filePath?: string;
  fit: BackgroundFit;
  fileName?: string;
}
