import { useAppStore } from '@stores/slicedStore';
import { seedSnapshotFavicons, type FaviconSnapshot } from '@utils/siteMetaCache';

interface BookmarkEntryLike {
  url: string;
  iconUri?: string;
}

interface IconSnapshotSources {
  browserBookmarkFolders: readonly { entries?: BookmarkEntryLike[] }[];
  browserWorkspaceBookmarks: Record<string, BookmarkEntryLike[] | undefined>;
}

/**
 * 收集书签自带的图标快照（导入文件里的 `ICON`）。
 *
 * 只读 store，不触发网络：快照是「用户导入时既有的事实」，播种到共享镜像后
 * 立刻可用于书签树与搜索（收藏结果行）；真实图标（以 data-URI 广播）稍后由抓取
 * 路径覆盖。
 */
export function collectBookmarkIconSnapshots(state: IconSnapshotSources): FaviconSnapshot[] {
  const out: FaviconSnapshot[] = [];
  const push = (entry: BookmarkEntryLike) => {
    if (entry.url && entry.iconUri) {
      out.push({ url: entry.url, iconUri: entry.iconUri });
    }
  };
  for (const folder of state.browserBookmarkFolders) {
    (folder.entries ?? []).forEach(push);
  }
  for (const entries of Object.values(state.browserWorkspaceBookmarks)) {
    (entries ?? []).forEach(push);
  }
  return out;
}

/**
 * 启动同步：把 store 里已有的书签图标快照播种进共享镜像。
 *
 * 调用时机必须是 `subscribeSiteMetaReady` 之后（水合完成），否则会挡住持久层里
 * 的真实图标；导入路径另有即时播种（见 `bookmarkTransferSlice`）。
 */
export function syncBookmarkIconSnapshots(): number {
  return seedSnapshotFavicons(collectBookmarkIconSnapshots(useAppStore.getState()));
}
