import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createBrowserBookmarkSlice } from '../browserBookmarkSlice';
import { createBookmarkTransferSlice } from '../bookmarkTransferSlice';
import type { TransferNode } from '@features/bookmarks/bookmarkTransferTypes';

const bookmark = (url: string, title: string): TransferNode => ({
  kind: 'bookmark',
  url,
  title,
  addedAt: 1_700_000_000_000,
  lastModifiedAt: 1_700_000_000_000,
});

const folder = (name: string, children: TransferNode[]): TransferNode => ({
  kind: 'folder',
  folder: { name, children },
});

function makeStore() {
  const store = createStore<any>((set, get) => ({
    ...createBrowserBookmarkSlice(set, get),
    ...createBookmarkTransferSlice(set, get),
    browserBookmarkFolders: [],
    browserWorkspaceBookmarks: {},
    browserBookmarks: [],
  }));
  return store;
}

describe('browserImportBookmarks', () => {
  it('creates a new folder with nested subfolders and entries', () => {
    const store = makeStore();
    const result = store.getState().browserImportBookmarks({
      nodes: [
        bookmark('https://a.test/', 'A'),
        folder('子目录', [bookmark('https://b.test/', 'B')]),
      ],
      target: { kind: 'new-folder', name: '导入的书签' },
      duplicatePolicy: 'skip',
    });

    expect(result).toEqual({ importedBookmarks: 2, importedFolders: 2, skipped: 0 });
    const folders = store.getState().browserBookmarkFolders;
    const root = folders.find((f: any) => f.name === '导入的书签')!;
    expect(root.entries).toHaveLength(1);
    const child = folders.find((f: any) => f.parentId === root.id)!;
    expect(child.parentType).toBe('folder');
    expect(child.entries).toHaveLength(1);
    expect(store.getState().browserBookmarks).toEqual(
      expect.arrayContaining([
        { url: 'https://a.test/', title: 'A' },
        { url: 'https://b.test/', title: 'B' },
      ]),
    );
  });

  it('skips duplicates inside an existing folder and can allow them', () => {
    const store = makeStore();
    store.setState({
      browserBookmarkFolders: [
        {
          id: 'f1',
          name: '工具',
          createdAt: 0,
          entries: [{ id: 'x', url: 'https://a.test/', title: 'A', addedAt: 0, lastModifiedAt: 0 }],
        },
      ],
    });

    const skipped = store.getState().browserImportBookmarks({
      nodes: [bookmark('https://a.test/', 'A'), bookmark('https://b.test/', 'B')],
      target: { kind: 'folder', id: 'f1' },
      duplicatePolicy: 'skip',
    });
    expect(skipped).toEqual({ importedBookmarks: 1, importedFolders: 0, skipped: 1 });

    const allowed = store.getState().browserImportBookmarks({
      nodes: [bookmark('https://a.test/', 'A')],
      target: { kind: 'folder', id: 'f1' },
      duplicatePolicy: 'allow',
    });
    expect(allowed.importedBookmarks).toBe(1);
    expect(store.getState().browserBookmarkFolders[0].entries).toHaveLength(3);
  });

  it('imports into a workspace directory', () => {
    const store = makeStore();
    const result = store.getState().browserImportBookmarks({
      nodes: [bookmark('https://w.test/', 'W'), folder('分组', [bookmark('https://x.test/', 'X')])],
      target: { kind: 'workspace', id: 'ws1' },
      duplicatePolicy: 'skip',
    });

    expect(result.importedBookmarks).toBe(2);
    expect(store.getState().browserWorkspaceBookmarks['ws1']).toHaveLength(1);
    const nested = store.getState().browserBookmarkFolders[0];
    expect(nested.parentType).toBe('workspace');
    expect(nested.parentId).toBe('ws1');
  });

  it('reuses same-name folders and creates no empty subtree on full dedupe', () => {
    const store = makeStore();
    store.setState({
      browserBookmarkFolders: [
        {
          id: 'f-root',
          name: '收藏夹栏',
          createdAt: 0,
          isUserCreated: true,
          entries: [
            { id: 'e1', url: 'https://a.test/', title: 'A', addedAt: 0, lastModifiedAt: 0 },
          ],
        },
        {
          id: 'f-child',
          name: '网页收藏',
          createdAt: 0,
          isUserCreated: true,
          parentId: 'f-root',
          parentType: 'folder',
          entries: [
            { id: 'e2', url: 'https://b.test/', title: 'B', addedAt: 0, lastModifiedAt: 0 },
          ],
        },
      ],
    });

    const result = store.getState().browserImportBookmarks({
      nodes: [folder('收藏夹栏', [folder('网页收藏', [bookmark('https://b.test/', 'B')])])],
      target: { kind: 'self-root', looseFolderName: 'TOP' },
      duplicatePolicy: 'skip',
    });

    expect(result).toEqual({ importedBookmarks: 0, importedFolders: 0, skipped: 1 });
    // 目录没有被新建，原有两条目录原封不动
    const folders = store.getState().browserBookmarkFolders;
    expect(folders).toHaveLength(2);
    // 顶层目录的判重键包含嵌套后代：嵌套重复也被跳过
    expect(folders[0].entries).toHaveLength(1);
    expect(folders[1].entries).toHaveLength(1);
  });

  it('drops the created subtree when all its bookmarks are duplicates', () => {
    const store = makeStore();
    store.setState({
      browserBookmarkFolders: [
        {
          id: 'f1',
          name: '工具',
          createdAt: 0,
          isUserCreated: true,
          entries: [
            { id: 'e1', url: 'https://a.test/', title: 'A', addedAt: 0, lastModifiedAt: 0 },
          ],
        },
      ],
    });

    const result = store.getState().browserImportBookmarks({
      nodes: [folder('新目录', [folder('子目录', [bookmark('https://a.test/', 'A')])])],
      target: { kind: 'folder', id: 'f1' },
      duplicatePolicy: 'skip',
    });

    expect(result).toEqual({ importedBookmarks: 0, importedFolders: 0, skipped: 1 });
    // 整条子树被跳过，不产生任何空目录
    expect(store.getState().browserBookmarkFolders.map((f: any) => f.name)).toEqual(['工具']);
  });

  it('dedupes nested duplicates anywhere inside the target tree', () => {
    const store = makeStore();
    store.setState({
      browserBookmarkFolders: [
        {
          id: 'f-root',
          name: '收藏夹栏',
          createdAt: 0,
          isUserCreated: true,
          entries: [
            { id: 'e1', url: 'https://x.test/', title: 'X', addedAt: 0, lastModifiedAt: 0 },
          ],
        },
      ],
    });

    const result = store.getState().browserImportBookmarks({
      nodes: [
        folder('新目录', [bookmark('https://x.test/', 'X'), bookmark('https://y.test/', 'Y')]),
      ],
      target: { kind: 'folder', id: 'f-root' },
      duplicatePolicy: 'skip',
    });

    // 目标树内跨目录的重复也判为重复，仅 Y 被导入
    expect(result.skipped).toBe(1);
    expect(result.importedBookmarks).toBe(1);
    expect(result.importedFolders).toBe(1);
  });

  it('re-importing the same file is a no-op the second time', () => {
    const store = makeStore();
    const nodes = [
      folder('收藏夹栏', [folder('网页收藏', [bookmark('https://b.test/', 'B')])]),
      bookmark('https://loose.test/', 'Loose'),
    ];
    const first = store.getState().browserImportBookmarks({
      nodes,
      target: { kind: 'self-root', looseFolderName: 'TOP' },
      duplicatePolicy: 'skip',
    });
    // 收藏夹栏 + 网页收藏 + 顶层书签（松散书签容器）
    expect(first).toEqual({ importedBookmarks: 2, importedFolders: 3, skipped: 0 });

    const second = store.getState().browserImportBookmarks({
      nodes,
      target: { kind: 'self-root', looseFolderName: 'TOP' },
      duplicatePolicy: 'skip',
    });
    expect(second).toEqual({ importedBookmarks: 0, importedFolders: 0, skipped: 2 });

    const folders = store.getState().browserBookmarkFolders;
    // 目录树没有产生新的重复目录
    expect(folders.filter((f: any) => f.name === '网页收藏')).toHaveLength(1);
    expect(folders.filter((f: any) => f.name === '收藏夹栏')).toHaveLength(1);
  });

  it('drops a created top-level folder when everything is duplicated', () => {
    const store = makeStore();
    store.setState({
      browserBookmarkFolders: [
        {
          id: 'f-1',
          name: '旧目录',
          createdAt: 0,
          isUserCreated: true,
          entries: [
            { id: 'e1', url: 'https://a.test/', title: 'A', addedAt: 0, lastModifiedAt: 0 },
          ],
        },
      ],
    });

    const result = store.getState().browserImportBookmarks({
      nodes: [folder('新目录', [bookmark('https://a.test/', 'A')])],
      target: { kind: 'self-root', looseFolderName: 'TOP' },
      duplicatePolicy: 'skip',
    });

    expect(result.importedBookmarks).toBe(0);
    expect(result.importedFolders).toBe(0);
    // 全重复的空顶层目录没有被创建
    expect(store.getState().browserBookmarkFolders.map((f: any) => f.name)).toEqual(['旧目录']);
  });

  it('dedupes inside workspace subfolders, not just the flat workspace list', () => {
    const store = makeStore();
    store.setState({
      browserBookmarkFolders: [
        {
          id: 'ws-child',
          name: '工作区里的目录',
          createdAt: 0,
          isUserCreated: true,
          parentId: 'ws1',
          parentType: 'workspace',
          entries: [
            { id: 'e1', url: 'https://w.test/', title: 'WS', addedAt: 0, lastModifiedAt: 0 },
          ],
        },
      ],
      browserWorkspaceBookmarks: {},
    });

    const result = store.getState().browserImportBookmarks({
      nodes: [bookmark('https://w.test/', 'WS')],
      target: { kind: 'workspace', id: 'ws1' },
      duplicatePolicy: 'skip',
    });

    // ws 子树里的书签同样被判重
    expect(result.skipped).toBe(1);
    expect(result.importedBookmarks).toBe(0);
    expect(store.getState().browserWorkspaceBookmarks['ws1']).toBeUndefined();
  });

  it('carries the icon uri from the file into the created entry', () => {
    const store = makeStore();
    store.getState().browserImportBookmarks({
      nodes: [{ ...bookmark('https://a.test/', 'A'), icon: 'data:image/png;base64,AAA' }],
      target: { kind: 'new-folder', name: 'F' },
      duplicatePolicy: 'skip',
    });
    const entry = store.getState().browserBookmarkFolders[0].entries[0];
    expect(entry.iconUri).toBe('data:image/png;base64,AAA');
  });

  it('seeds imported icon snapshots into the shared site-meta mirror', async () => {
    // 导入即灌共享镜像：书签树与搜索（收藏结果行）立刻有图标，不再等抓取
    const mod = await import('@utils/siteMetaCache');
    mod.setSiteMetaBackendForTest(mod.createMockSiteMetaBackend());
    await mod.initSiteMetaCache();
    const store = makeStore();
    store.getState().browserImportBookmarks({
      nodes: [
        {
          ...bookmark('https://seeded.store/page', 'Seed'),
          icon: 'data:image/png;base64,SEEDED',
        },
      ],
      target: { kind: 'new-folder', name: 'F' },
      duplicatePolicy: 'skip',
    });
    expect(mod.getCachedFavicon('https://seeded.store/page')).toBe('data:image/png;base64,SEEDED');
  });
});
