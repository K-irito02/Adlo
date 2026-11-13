import { describe, expect, it } from 'vitest';
import type { RecentWorkspaceEntry } from '@adlo/kernel';
import { resolveHistoryWorkspace } from './historyWorkspace';

const workspace = (id: string, root: string): RecentWorkspaceEntry => ({
  id,
  path: root,
  rootPath: root,
  name: id,
  lastOpenedAt: 1,
  isPinned: false,
  pinnedOrder: 0,
  unpinnedOrder: 0,
  removedFromSidebar: false,
  available: true,
});

describe('resolveHistoryWorkspace', () => {
  it('prefers the visible workspace matching the history entry', () => {
    expect(
      resolveHistoryWorkspace({ path: 'a.md', workspaceId: 'ws-1' }, [workspace('ws-1', '/repo')], {
        'external-x': '/elsewhere',
      }),
    ).toEqual({ id: 'ws-1', root: '/repo' });
  });

  it('falls back to externalFileRoots when the hidden entry was refreshed away', () => {
    expect(
      resolveHistoryWorkspace({ path: 'photo.png', workspaceId: 'external-x' }, [], {
        'external-x': 'E:/Downloads',
      }),
    ).toEqual({ id: 'external-x', root: 'E:/Downloads' });
  });

  it('returns null for entries without a workspace or with an unknown one', () => {
    expect(resolveHistoryWorkspace({ path: 'a.md', workspaceId: undefined }, [], {})).toBeNull();
    expect(resolveHistoryWorkspace({ path: 'a.md', workspaceId: 'gone' }, [], {})).toBeNull();
  });
});
