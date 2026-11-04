import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { flushCrossSliceWrites } from '@stores/storageHelpers';

function readJsonKey(key: string): unknown {
  const raw = localStorage.getItem(key);
  return raw === null ? undefined : JSON.parse(raw);
}

describe('removing a workspace cleans every workspace-scoped key', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      recentWorkspaces: [{ id: 'workspace_a' }, { id: 'workspace_b' }] as never,
      activeWorkspaceTab: 'workspace_b',
      // 文件面板
      workspaceTreeExpandedInFileNav: { workspace_a: true, workspace_b: true },
      expandedFileTreePaths: {
        workspace_a: { expanded: { src: true } },
        workspace_b: { expanded: { src: true } },
      },
      filePreviewModeByPath: {
        workspace_a: { 'README.md': true },
        workspace_b: { 'README.md': true },
      },
      // 变更面板
      workspaceChangesExpanded: { workspace_a: true, workspace_b: true },
      expandedChangesTreePaths: {
        workspace_a: { expanded: { src: true } },
        workspace_b: { expanded: { src: true } },
      },
      // 浏览器面板
      browserTabs: [
        { id: 'tab-a', workspaceId: 'workspace_a', title: 'A', url: 'https://a' },
        { id: 'tab-b', workspaceId: 'workspace_b', title: 'B', url: 'https://b' },
      ] as never,
      browserWorkspaceBookmarks: {
        workspace_a: [{ tabId: 'tab-a', url: 'https://a', title: 'A' }],
        workspace_b: [{ tabId: 'tab-b', url: 'https://b', title: 'B' }],
      } as never,
      // 终端面板
      terminalWorkspaceExpanded: { workspace_a: true, workspace_b: true },
      workspaceDefaultProfiles: {
        workspace_a: 'powershell',
        workspace_b: 'powershell',
      } as never,
      // 检索面板
      searchIgnoredPaths: {
        workspace_a: ['node_modules'],
        workspace_b: ['dist'],
      },
      searchUseGitignore: { workspace_a: true, workspace_b: true },
    });
  });

  it('drops the workspace from files / changes / browser / terminal / search scopes in one pass', () => {
    useAppStore.setState({ recentWorkspaces: [{ id: 'workspace_b' }] as never });
    useAppStore.getState().cleanupRemovedWorkspaceTree('workspace_a' as never);
    flushCrossSliceWrites();

    const state = useAppStore.getState();
    // 文件面板
    expect(state.workspaceTreeExpandedInFileNav.workspace_a).toBeUndefined();
    expect(state.workspaceTreeExpandedInFileNav.workspace_b).toBe(true);
    expect(state.expandedFileTreePaths.workspace_a).toBeUndefined();
    expect(state.expandedFileTreePaths.workspace_b).toBeDefined();
    expect(state.filePreviewModeByPath.workspace_a).toBeUndefined();
    expect(state.filePreviewModeByPath.workspace_b).toEqual({ 'README.md': true });
    // 变更面板
    expect(state.workspaceChangesExpanded.workspace_a).toBeUndefined();
    expect(state.workspaceChangesExpanded.workspace_b).toBe(true);
    expect(state.expandedChangesTreePaths.workspace_a).toBeUndefined();
    expect(state.expandedChangesTreePaths.workspace_b).toBeDefined();
    // 浏览器面板（含全局数组按 workspaceId 过滤）
    expect(state.browserTabs.some((t) => t.workspaceId === 'workspace_a')).toBe(false);
    expect(state.browserTabs.some((t) => t.workspaceId === 'workspace_b')).toBe(true);
    expect(state.browserWorkspaceBookmarks.workspace_a).toBeUndefined();
    expect(state.browserWorkspaceBookmarks.workspace_b).toBeDefined();
    // 终端面板
    expect(state.terminalWorkspaceExpanded.workspace_a).toBeUndefined();
    expect(state.terminalWorkspaceExpanded.workspace_b).toBe(true);
    expect(state.workspaceDefaultProfiles.workspace_a).toBeUndefined();
    expect(state.workspaceDefaultProfiles.workspace_b).toBe('powershell');
    // 检索面板
    expect(state.searchIgnoredPaths.workspace_a).toBeUndefined();
    expect(state.searchIgnoredPaths.workspace_b).toEqual(['dist']);
    expect(state.searchUseGitignore.workspace_a).toBeUndefined();
    expect(state.searchUseGitignore.workspace_b).toBe(true);

    // 落盘：此前未被清理的终端 / 检索 / 文件目录键也必须同步
    expect(readJsonKey('adl:terminal.workspaceExpanded')).toEqual({ workspace_b: true });
    expect(readJsonKey('adl:search.ignoredPaths')).toEqual({ workspace_b: ['dist'] });
    expect(readJsonKey('adl:search.useGitignore')).toEqual({ workspace_b: true });
    expect(readJsonKey('adl:files.workspaceExpanded')).toEqual({ workspace_b: true });
    expect(readJsonKey('adl:changes.workspaceExpanded')).toEqual({ workspace_b: true });
    expect(readJsonKey('adl:files.dirExpanded')).toEqual({
      workspace_b: { expanded: { src: true } },
    });
    expect(readJsonKey('adl:browser.workspaceBookmarks')).toEqual({
      workspace_b: [{ tabId: 'tab-b', url: 'https://b', title: 'B' }],
    });
  });
});
