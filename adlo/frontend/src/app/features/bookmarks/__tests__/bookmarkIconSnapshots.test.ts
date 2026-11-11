import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import type { BookmarkEntry, BookmarkFolder } from '@stores/slices/browserTypes';
import * as siteMetaCache from '@utils/siteMetaCache';
import { collectBookmarkIconSnapshots, syncBookmarkIconSnapshots } from '../bookmarkIconSnapshots';

const ICON = 'data:image/png;base64,SEED';

function makeFolder(
  id: string,
  entries: BookmarkFolder['entries'],
  parentId?: string,
): BookmarkFolder {
  return {
    id,
    name: `folder-${id}`,
    createdAt: 0,
    entries,
    ...(parentId ? { parentId, parentType: 'folder' as const } : {}),
  };
}

describe('bookmark icon snapshots', () => {
  beforeEach(async () => {
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
    useAppStore.setState({ browserBookmarkFolders: [], browserWorkspaceBookmarks: {} });
  });

  it('collects icons from nested user folders and workspace bookmarks, skipping empty icons', () => {
    // folders 是扁平数组（嵌套由 parentId 表达），逐项遍历即覆盖嵌套目录
    const browserBookmarkFolders: BookmarkFolder[] = [
      makeFolder('root', [
        {
          id: 'b1',
          url: 'https://a.test/',
          title: 'A',
          addedAt: 1,
          lastModifiedAt: 1,
          iconUri: ICON,
        },
        { id: 'b2', url: 'https://b.test/', title: 'B', addedAt: 1, lastModifiedAt: 1 },
      ]),
      makeFolder(
        'nested',
        [
          {
            id: 'b3',
            url: 'https://c.test/',
            title: 'C',
            addedAt: 1,
            lastModifiedAt: 1,
            iconUri: ICON,
          },
        ],
        'root',
      ),
    ];
    const browserWorkspaceBookmarks: Record<string, BookmarkEntry[]> = {
      ws1: [
        {
          id: 'b4',
          url: 'https://d.test/',
          title: 'D',
          addedAt: 1,
          lastModifiedAt: 1,
          iconUri: ICON,
        },
      ],
    };

    const snapshots = collectBookmarkIconSnapshots({
      browserBookmarkFolders,
      browserWorkspaceBookmarks,
    });

    expect(snapshots).toEqual([
      { url: 'https://a.test/', iconUri: ICON },
      { url: 'https://c.test/', iconUri: ICON },
      { url: 'https://d.test/', iconUri: ICON },
    ]);
  });

  it('syncs the store snapshots into the shared mirror (startup path)', () => {
    // 跨会话支柱：镜像只在内存，重启后必须靠这一次同步把导入图标补回来
    useAppStore.setState({
      browserBookmarkFolders: [
        makeFolder('f', [
          {
            id: 'b',
            url: 'https://startup-sync.test/',
            title: 'S',
            addedAt: 1,
            lastModifiedAt: 1,
            iconUri: 'data:image/png;base64,STARTUP',
          },
        ]),
      ],
    });

    expect(syncBookmarkIconSnapshots()).toBe(1);
    expect(siteMetaCache.getCachedFavicon('https://startup-sync.test/')).toBe(
      'data:image/png;base64,STARTUP',
    );
  });

  it('sync skips snapshots that are not inline images', () => {
    useAppStore.setState({
      browserBookmarkFolders: [
        makeFolder('bad', [
          {
            id: 'b-bad',
            url: 'https://startup-bad.test/',
            title: 'Bad',
            addedAt: 1,
            lastModifiedAt: 1,
            iconUri: 'https://evil.test/icon.png',
          },
        ]),
      ],
    });

    expect(syncBookmarkIconSnapshots()).toBe(0);
    expect(siteMetaCache.getCachedSiteMeta('https://startup-bad.test/')).toBeUndefined();
  });
});
