import { describe, expect, it } from 'vitest';
import { reorderUnpinnedIds, resolveMoveTarget } from '../useWorkspaceTreeDnd';
import type { RecentWorkspaceEntry } from '@shared/ipc';

function workspace(id: string, pinned: boolean, unpinnedOrder = 0): RecentWorkspaceEntry {
  return {
    id,
    path: `C:/${id}`,
    rootPath: `C:/${id}`,
    name: id,
    lastOpenedAt: 0,
    isPinned: pinned,
    pinnedOrder: pinned ? unpinnedOrder : 0,
    unpinnedOrder,
    removedFromSidebar: false,
    available: true,
  };
}

describe('reorderUnpinnedIds', () => {
  const workspaces = [
    workspace('pinned', true, 0),
    workspace('a', false, 0),
    workspace('b', false, 1),
    workspace('c', false, 2),
  ];

  it('把非置顶项插到目标项之前，置顶项保持不动', () => {
    expect(reorderUnpinnedIds(workspaces, 'c', 'a', 'before')).toEqual(['c', 'a', 'b']);
  });

  it('把非置顶项插到目标项之后', () => {
    expect(reorderUnpinnedIds(workspaces, 'a', 'b', 'after')).toEqual(['b', 'a', 'c']);
  });

  it('目标不在列表时追加到末尾', () => {
    expect(reorderUnpinnedIds(workspaces, 'a', 'ghost', 'before')).toEqual(['b', 'c', 'a']);
  });
});

describe('resolveMoveTarget', () => {
  it('同工作区同路径视为无操作', () => {
    expect(
      resolveMoveTarget({
        fromWorkspaceId: 'ws-a',
        fromPath: 'a.txt',
        fromName: 'a.txt',
        toWorkspaceId: 'ws-a',
        toDir: '',
      }),
    ).toEqual({ targetPath: 'a.txt', workspaceChanged: false, needsMove: false });
  });

  it('跨工作区即使相对路径相同也必须移动', () => {
    expect(
      resolveMoveTarget({
        fromWorkspaceId: 'ws-a',
        fromPath: 'a.txt',
        fromName: 'a.txt',
        toWorkspaceId: 'ws-b',
        toDir: '',
      }),
    ).toEqual({ targetPath: 'a.txt', workspaceChanged: true, needsMove: true });
  });

  it('放入子目录时拼接目标相对路径', () => {
    expect(
      resolveMoveTarget({
        fromWorkspaceId: 'ws-a',
        fromPath: 'a.txt',
        fromName: 'a.txt',
        toWorkspaceId: 'ws-a',
        toDir: 'src',
      }).targetPath,
    ).toBe('src/a.txt');
  });
});
