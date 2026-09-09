import { describe, it, expect } from 'vitest';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import { buildFolderPathLabel, buildWorkspacePathLabel } from '../browserFoldersUtils';
import type { TabFolderState } from '../browserFoldersTypes';

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

const folders: TabFolderState[] = [
  { id: 'root', name: '工具', createdAt: 0 },
  { id: 'sub', name: '子文件夹', createdAt: 0, parentId: 'root', parentType: 'folder' },
  { id: 'deep', name: '三层', createdAt: 0, parentId: 'sub', parentType: 'folder' },
  { id: 'wsRoot', name: '工作区根目录', createdAt: 0, parentId: 'ws1', parentType: 'workspace' },
  { id: 'wsSub', name: '工作区子目录', createdAt: 0, parentId: 'wsRoot', parentType: 'folder' },
];

const workspaces = [makeWorkspace('ws1', '工作区A', 'E:/ws-a')];

describe('buildFolderPathLabel', () => {
  it('顶层文件夹只返回文件夹名', () => {
    expect(buildFolderPathLabel('root', folders, workspaces)).toBe('工具');
  });

  it('嵌套文件夹返回 "根/子"', () => {
    expect(buildFolderPathLabel('sub', folders, workspaces)).toBe('工具/子文件夹');
    expect(buildFolderPathLabel('deep', folders, workspaces)).toBe('工具/子文件夹/三层');
  });

  it('挂在工作区下的文件夹最前面加工作区名', () => {
    expect(buildFolderPathLabel('wsRoot', folders, workspaces)).toBe('工作区A/工作区根目录');
    expect(buildFolderPathLabel('wsSub', folders, workspaces)).toBe(
      '工作区A/工作区根目录/工作区子目录',
    );
  });

  it('未知 folderId 返回空字符串', () => {
    expect(buildFolderPathLabel('nope', folders, workspaces)).toBe('');
  });

  it('循环 parentId 保护：超出步数截断不死循环', () => {
    const cycleA: TabFolderState = { id: 'a', name: 'A', createdAt: 0, parentId: 'b' };
    const cycleB: TabFolderState = { id: 'b', name: 'B', createdAt: 0, parentId: 'a' };
    const label = buildFolderPathLabel('a', [cycleA, cycleB], []);
    expect(label).toContain('A');
    expect(label.length).toBeLessThan(200);
  });
});

describe('buildWorkspacePathLabel', () => {
  it('返回工作区名', () => {
    expect(buildWorkspacePathLabel('ws1', workspaces)).toBe('工作区A');
  });
  it('未知 wsId 返回空字符串', () => {
    expect(buildWorkspacePathLabel('nope', workspaces)).toBe('');
  });
  it('工作区无 name 时用 path 回退', () => {
    expect(buildWorkspacePathLabel('ws2', [makeWorkspace('ws2', '', 'E:/ws-b')])).toBe('E:/ws-b');
  });
  it('path 回退中的反斜杠归一化为正斜杠', () => {
    expect(buildWorkspacePathLabel('ws3', [makeWorkspace('ws3', '', 'E:\\ws-c')])).toBe('E:/ws-c');
  });
});
