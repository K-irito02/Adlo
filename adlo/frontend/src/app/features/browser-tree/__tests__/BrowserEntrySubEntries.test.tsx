import { describe, it, expect } from 'vitest';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import type { BookmarkFolder } from '@stores/slices/browserSlice';
import type { BrowserTreeNode } from '../types';
import { buildBrowserNodeTitleMap } from '../browserTreeTitle';

function makeWorkspace(id: string, name: string, path: string): RecentWorkspaceEntry {
  return {
    id,
    name,
    path,
    rootPath: path,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
  };
}

const folders: BookmarkFolder[] = [
  { id: 'root', name: '工具', createdAt: 0 },
  { id: 'sub', name: '子文件夹', createdAt: 0, parentId: 'root', parentType: 'folder' },
  { id: 'wsRoot', name: '工作区根目录', createdAt: 0, parentId: 'ws1', parentType: 'workspace' },
];

const workspaces = [makeWorkspace('ws1', '工作区A', 'E:/ws-a')];

function fileNode(
  path: string,
  name: string,
  nodeType: BrowserTreeNode['nodeType'] = 'tab',
): BrowserTreeNode {
  return { path, name, kind: 'file', children: [], nodeType };
}

const tree: BrowserTreeNode[] = [
  {
    path: 'workspace:ws1',
    name: '工作区A',
    kind: 'directory',
    children: [
      fileNode('tab:ws1:root', '工作区根叶'),
      {
        path: 'folder:root',
        name: '工具',
        kind: 'directory',
        folderId: 'root',
        nodeType: 'folder',
        children: [
          fileNode('bookmark:root:baidu', '百度'),
          {
            path: 'folder:sub',
            name: '子文件夹',
            kind: 'directory',
            folderId: 'sub',
            nodeType: 'folder',
            children: [fileNode('bookmark:sub:baidu', '百度')],
          },
        ],
      },
      {
        path: 'folder:wsRoot',
        name: '工作区根目录',
        kind: 'directory',
        folderId: 'wsRoot',
        nodeType: 'folder',
        children: [fileNode('bookmark:wsRoot:baidu', '百度')],
      },
    ],
    nodeType: 'workspace',
    workspaceId: 'ws1',
  },
  {
    path: 'history-year:2026',
    name: '2026年',
    kind: 'directory',
    children: [fileNode('history-entry:1', '历史条目', 'history')],
    nodeType: 'year',
  },
];

describe('buildBrowserNodeTitleMap', () => {
  it('顶层目录返回文件夹路径', () => {
    const map = buildBrowserNodeTitleMap(tree, folders, workspaces);
    expect(map.get('folder:root')).toBe('工具');
  });

  it('嵌套目录返回 "根/子"', () => {
    const map = buildBrowserNodeTitleMap(tree, folders, workspaces);
    expect(map.get('folder:sub')).toBe('工具/子文件夹');
  });

  it('嵌套目录下的叶子使用完整父路径', () => {
    const map = buildBrowserNodeTitleMap(tree, folders, workspaces);
    expect(map.get('bookmark:sub:baidu')).toBe('工具/子文件夹/百度');
  });

  it('工作区顶级目录下的叶子使用父目录路径', () => {
    const map = buildBrowserNodeTitleMap(tree, folders, workspaces);
    expect(map.get('bookmark:root:baidu')).toBe('工具/百度');
  });

  it('挂在工作区根目录下的叶子使用工作区前缀路径', () => {
    const map = buildBrowserNodeTitleMap(tree, folders, workspaces);
    expect(map.get('bookmark:wsRoot:baidu')).toBe('工作区A/工作区根目录/百度');
  });

  it('工作区根下的叶子回退为名称', () => {
    const map = buildBrowserNodeTitleMap(tree, folders, workspaces);
    expect(map.get('tab:ws1:root')).toBe('工作区根叶');
  });

  it('历史叶子返回名称', () => {
    const map = buildBrowserNodeTitleMap(tree, folders, workspaces);
    expect(map.get('history-entry:1')).toBe('历史条目');
  });

  it('baseParentPath 使顶层文件夹的直接书签子级获得文件夹前缀', () => {
    // 模拟 userFolder 顶层文件夹"工具"的直接子级（书签叶子 + 子文件夹）
    const directChildren: BrowserTreeNode[] = [
      fileNode('bookmark:root:baidu', '百度'),
      {
        path: 'folder:sub',
        name: '子文件夹',
        kind: 'directory',
        children: [fileNode('bookmark:sub:baidu', '百度')],
        nodeType: 'folder',
        folderId: 'sub',
      },
    ];
    const map = buildBrowserNodeTitleMap(directChildren, folders, workspaces, '工具');
    expect(map.get('bookmark:root:baidu')).toBe('工具/百度');
    // 嵌套目录用自己的完整路径覆盖 base，不产生双前缀
    expect(map.get('bookmark:sub:baidu')).toBe('工具/子文件夹/百度');
  });

  it('非文件夹目录节点（年/月/日）返回名称标签', () => {
    const map = buildBrowserNodeTitleMap(tree, folders, workspaces);
    expect(map.get('history-year:2026')).toBe('2026年');
  });

  it('工作区根目录节点返回名称', () => {
    const map = buildBrowserNodeTitleMap(tree, folders, workspaces);
    expect(map.get('workspace:ws1')).toBe('工作区A');
  });
});
