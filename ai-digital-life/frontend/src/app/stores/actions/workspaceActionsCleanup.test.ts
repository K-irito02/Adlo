import { describe, expect, it } from 'vitest';
import { stripWorkspaceFromBrowserState } from './workspaceActions';
import type {
  BrowserTabState,
  TabFolderState,
  WorkspaceBookmarkEntry,
} from '../slices/browserSlice';

function makeTab(id: string, workspaceId: string): BrowserTabState {
  return {
    id,
    title: id,
    url: `https://${id}.example`,
    workspaceId,
    isPinned: false,
    isPlayingAudio: false,
    isAudioMuted: false,
    sortOrder: 0,
  };
}

function makeFolder(
  id: string,
  parentId: string | undefined,
  parentType: TabFolderState['parentType'],
): TabFolderState {
  return { id, name: id, createdAt: 0, parentId, parentType };
}

describe('stripWorkspaceFromBrowserState (cleanup on workspace delete)', () => {
  it('removes all tabs of the target workspace, keeps others', () => {
    const tabs = [makeTab('t1', 'ws-a'), makeTab('t2', 'ws-b'), makeTab('t3', 'ws-a')];
    const result = stripWorkspaceFromBrowserState('ws-a', tabs, [], {}, {}, 't1');
    expect(result.browserTabs.map((t) => t.id)).toEqual(['t2']);
    expect(result.browserTabsById['t2']).toBeDefined();
    expect(result.browserTabsById['t1']).toBeUndefined();
  });

  it('removes folders whose parent is the target workspace (parentType=workspace)', () => {
    const folders = [
      makeFolder('f1', 'ws-a', 'workspace'),
      makeFolder('f2', 'ws-b', 'workspace'),
      makeFolder('f3', 'f1', 'folder'),
      makeFolder('f4', undefined, undefined),
    ];
    const result = stripWorkspaceFromBrowserState('ws-a', [], folders, {}, {}, '');
    expect(result.browserTabFolders.map((f) => f.id)).toEqual(['f2', 'f3', 'f4']);
  });

  it('does NOT remove folders whose parent is a folder (only direct workspace children)', () => {
    const folders = [
      makeFolder('f-root', 'ws-a', 'workspace'),
      makeFolder('f-child', 'f-root', 'folder'),
    ];
    const result = stripWorkspaceFromBrowserState('ws-a', [], folders, {}, {}, '');
    // f-root is removed; f-child is kept (its parentType is folder, not workspace)
    expect(result.browserTabFolders.map((f) => f.id)).toEqual(['f-child']);
  });

  it("removes the target workspace's key from browserWorkspaceExpanded", () => {
    const expanded = { 'ws-a': true, 'ws-b': false, 'ws-c': true };
    const result = stripWorkspaceFromBrowserState('ws-a', [], [], expanded, {}, '');
    expect(result.browserWorkspaceExpanded).toEqual({ 'ws-b': false, 'ws-c': true });
  });

  it('preserves browserActiveTabId when the active tab survives the filter', () => {
    const tabs = [makeTab('t1', 'ws-a'), makeTab('t2', 'ws-b')];
    const result = stripWorkspaceFromBrowserState('ws-a', tabs, [], {}, {}, 't2');
    expect(result.browserActiveTabId).toBe('t2');
  });

  it('falls back to last surviving tab when active tab is removed', () => {
    const tabs = [makeTab('t1', 'ws-a'), makeTab('t2', 'ws-a'), makeTab('t3', 'ws-b')];
    const result = stripWorkspaceFromBrowserState('ws-a', tabs, [], {}, {}, 't1');
    // t1 is gone; last surviving tab is t3
    expect(result.browserActiveTabId).toBe('t3');
  });

  it('returns empty activeTabId when all tabs are removed', () => {
    const tabs = [makeTab('t1', 'ws-a')];
    const result = stripWorkspaceFromBrowserState('ws-a', tabs, [], {}, {}, 't1');
    expect(result.browserTabs).toEqual([]);
    expect(result.browserActiveTabId).toBe('');
    expect(result.browserTabsById).toEqual({});
  });

  it('is idempotent: stripping an absent workspace leaves state unchanged', () => {
    const tabs = [makeTab('t1', 'ws-a')];
    const folders = [makeFolder('f1', 'ws-b', 'workspace')];
    const expanded = { 'ws-b': true };
    const wsBookmarks: Record<string, WorkspaceBookmarkEntry[]> = {
      'ws-a': [{ tabId: 't1', url: '', title: '' }],
      'ws-b': [{ tabId: 't2', url: '', title: '' }],
    };
    const result = stripWorkspaceFromBrowserState(
      'ws-nonexistent',
      tabs,
      folders,
      expanded,
      wsBookmarks,
      't1',
    );
    expect(result.browserTabs).toEqual(tabs);
    expect(result.browserTabFolders).toEqual(folders);
    expect(result.browserWorkspaceExpanded).toEqual(expanded);
    expect(result.browserWorkspaceBookmarks).toEqual(wsBookmarks);
    expect(result.browserActiveTabId).toBe('t1');
  });

  it('removes the target workspace key from browserWorkspaceBookmarks', () => {
    const wsBookmarks: Record<string, WorkspaceBookmarkEntry[]> = {
      'ws-a': [
        { tabId: 't1', url: '', title: '' },
        { tabId: 't2', url: '', title: '' },
      ],
      'ws-b': [{ tabId: 't3', url: '', title: '' }],
    };
    const result = stripWorkspaceFromBrowserState('ws-a', [], [], {}, wsBookmarks, '');
    expect(result.browserWorkspaceBookmarks).toEqual({
      'ws-b': [{ tabId: 't3', url: '', title: '' }],
    });
  });
});
