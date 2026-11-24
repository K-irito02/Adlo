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
  /**
   * 该标签创建时的「共享浏览配置文件」选择（快照）。建标签入口在创建时写入；
   * 设置切换只影响此后新建的标签，挂起重建/恢复标签沿用此值。
   */
  shareProfile?: boolean;
  /** 所属宿主；缺省（undefined）等同 'panel'。中心标签为 'center'。 */
  location?: TabLocation;
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

/**
 * 一条书签。`id` 是书签自己的身份，与任何浏览器标签页无关——
 * 标签页关掉、从未打开、从外部文件导入，都不影响它。
 */
export interface BookmarkEntry {
  id: string;
  url: string;
  title: string;
  /** 首次收藏时间（毫秒时间戳） */
  addedAt: number;
  /** 内容（标题或 URL）最后一次被编辑的时间（毫秒时间戳） */
  lastModifiedAt: number;
  /** 内联图标（`data:` URI）；来自导入文件或收藏时的站点元数据，可能缺失 */
  iconUri?: string;
  /**
   * 收藏时对应的浏览器标签页 id（可选弱引用，不是身份）。
   * 只用于「取消收藏某个仍打开的标签页时，同步移除它带过来的那份收藏」。
   * 标签页关闭后该值自然失效，不影响书签本身。
   */
  sourceTabId?: string;
}

/** 自建目录树上的一个文件夹；`entries` 是它直接包含的书签。 */
export interface BookmarkFolder {
  id: string;
  name: string;
  createdAt: number;
  isUserCreated?: boolean;
  entries?: BookmarkEntry[];
  parentId?: string;
  parentType?: 'workspace' | 'folder';
}

export interface BookmarkFolderUpdate {
  name?: string;
  entries?: BookmarkEntry[];
}

/** 全局「该链接是否已收藏」索引；不承载时间戳，时间戳只存在于具体书签条目上。 */
export interface BrowserBookmark {
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
