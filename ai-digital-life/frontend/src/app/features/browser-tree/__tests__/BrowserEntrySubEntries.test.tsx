import { describe, it, expect } from 'vitest';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import type { TabFolderState } from '@stores/slices/browserSlice';
import type { BrowserTreeNode } from '../types';
import { getBrowserNodeTitle } from '../browserTreeTitle';

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
    hiddenFromRightPanels: false,
  };
}

const folders: TabFolderState[] = [
  { id: 'root', name: '工具', createdAt: 0 },
  { id: 'sub', name: '子文件夹', createdAt: 0, parentId: 'root', parentType: 'folder' },
  { id: 'deep', name: '三层', createdAt: 0, parentId: 'sub', parentType: 'folder' },
  { id: 'wsRoot', name: '工作区根目录', createdAt: 0, parentId: 'ws1', parentType: 'workspace' },
  { id: 'wsSub', name: '工作区子目录', createdAt: 0, parentId: 'wsRoot', parentType: 'folder' },
];

const workspaces = [makeWorkspace('ws1', '工作区A', 'E:/ws-a')];

function folderNode(
  name: string,
  folderId: string,
  nodeType: BrowserTreeNode['nodeType'] = 'folder',
): BrowserTreeNode {
  return { path: `folder:${folderId}`, name, kind: 'directory', children: [], nodeType, folderId };
}

function fileNode(name: string, nodeType: BrowserTreeNode['nodeType'] = 'tab'): BrowserTreeNode {
  return { path: 'file:1', name, kind: 'file', children: [], nodeType };
}

describe('getBrowserNodeTitle', () => {
  it('顶层文件夹目录返回文件夹名', () => {
    expect(getBrowserNodeTitle(folderNode('工具', 'root'), '', folders, workspaces)).toBe('工具');
  });

  it('嵌套文件夹返回 "根 → 子"', () => {
    expect(getBrowserNodeTitle(folderNode('子文件夹', 'sub'), '', folders, workspaces)).toBe(
      '工具 → 子文件夹',
    );
    expect(getBrowserNodeTitle(folderNode('三层', 'deep'), '', folders, workspaces)).toBe(
      '工具 → 子文件夹 → 三层',
    );
  });

  it('挂在工作区下的文件夹最前面加工作区名', () => {
    expect(getBrowserNodeTitle(folderNode('工作区子目录', 'wsSub'), '', folders, workspaces)).toBe(
      '工作区A → 工作区根目录 → 工作区子目录',
    );
  });

  it('书签/标签叶子使用父路径 + 名称', () => {
    expect(getBrowserNodeTitle(fileNode('百度'), 'sub', folders, workspaces)).toBe(
      '工具 → 子文件夹 / 百度',
    );
  });

  it('叶子父路径无法解析时回退为名称', () => {
    expect(getBrowserNodeTitle(fileNode('百度'), 'nope', folders, workspaces)).toBe('百度');
    expect(getBrowserNodeTitle(fileNode('百度'), '', folders, workspaces)).toBe('百度');
  });

  it('历史叶子返回名称', () => {
    expect(getBrowserNodeTitle(fileNode('历史条目', 'history'), 'sub', folders, workspaces)).toBe(
      '历史条目',
    );
  });

  it('工作区根目录（无 folderId）返回名称', () => {
    expect(
      getBrowserNodeTitle(
        {
          path: 'workspace:ws1',
          name: '工作区A',
          kind: 'directory',
          children: [],
          nodeType: 'workspace',
          workspaceId: 'ws1',
        },
        '',
        folders,
        workspaces,
      ),
    ).toBe('工作区A');
  });

  it('历史年月日目录节点返回名称标签', () => {
    expect(getBrowserNodeTitle(folderNode('2026年', 'nope', 'year'), '', folders, workspaces)).toBe(
      '2026年',
    );
  });

  it('未知文件叶子（有父路径）也使用 "父路径 / 名称"', () => {
    expect(
      getBrowserNodeTitle(
        { path: 'x', name: '未知', kind: 'file', children: [], nodeType: 'day' },
        'sub',
        folders,
        workspaces,
      ),
    ).toBe('工具 → 子文件夹 / 未知');
  });

  it('未知文件叶子（无父路径）返回名称', () => {
    expect(
      getBrowserNodeTitle(
        { path: 'x', name: '未知', kind: 'file', children: [], nodeType: 'day' },
        '',
        folders,
        workspaces,
      ),
    ).toBe('未知');
  });
});
