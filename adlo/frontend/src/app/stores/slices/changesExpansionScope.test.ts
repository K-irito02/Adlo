import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { registry } from '@stores/persisted/registry';

const WS_A = 'workspace_a';
const WS_B = 'workspace_b';

function changesExpansion(workspaceId: string) {
  return useAppStore.getState().expandedChangesTreePaths[workspaceId] ?? { expanded: {} };
}

describe('changes tree expansion is workspace-scoped', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ expandedChangesTreePaths: {}, filePreviewModeByPath: {} });
  });

  it('expanding a path in one workspace does not expand it in another', () => {
    useAppStore.getState().toggleChangesTreePath(WS_A, 'src');
    expect(useAppStore.getState().expandedChangesTreePaths[WS_A]?.expanded['src']).toBe(true);
    expect(useAppStore.getState().expandedChangesTreePaths[WS_B]).toBeUndefined();
  });

  it('does not leak preview mode between workspaces for the same relative path', () => {
    useAppStore.getState().setFilePreviewModeForPath(WS_A, 'README.md', true);
    const state = useAppStore.getState();
    expect(state.filePreviewModeByPath[WS_A]?.['README.md']).toBe(true);
    expect(state.filePreviewModeByPath[WS_B]).toBeUndefined();
  });

  it('records the manual collapse intent per workspace without touching the other', () => {
    useAppStore.getState().setChangesTreePathExpanded(WS_A, 'src/legacy', false);
    expect(changesExpansion(WS_A)).toEqual({
      expanded: { 'src/legacy': false },
      manualCollapsed: { 'src/legacy': true },
    });
    expect(useAppStore.getState().expandedChangesTreePaths[WS_B]).toBeUndefined();
  });

  it('auto-expand chain reports blocked per workspace and returns the blocked list', () => {
    useAppStore.getState().setChangesTreePathExpanded(WS_A, 'src', false);
    const blockedA = useAppStore.getState().expandChangesTreePathChain(WS_A, 'src/legacy/old.ts');
    expect(blockedA.blocked).toEqual(['src']);
    expect(changesExpansion(WS_A).expanded['src']).toBe(false);
    const blockedB = useAppStore.getState().expandChangesTreePathChain(WS_B, 'src/legacy/old.ts');
    expect(blockedB.blocked).toEqual([]);
    expect(changesExpansion(WS_B).expanded['src']).toBe(true);
  });

  it('collapse-all only clears the given workspace and keeps its manual intent', () => {
    useAppStore.getState().setChangesTreePathExpanded(WS_A, 'src', true);
    useAppStore.getState().setChangesTreePathExpanded(WS_A, 'src/legacy', false);
    useAppStore.getState().setChangesTreePathExpanded(WS_B, 'docs', true);
    useAppStore.getState().collapseAllChangesTreePaths(WS_A);
    expect(changesExpansion(WS_A)).toEqual({
      expanded: {},
      manualCollapsed: { 'src/legacy': true },
    });
    expect(changesExpansion(WS_B).expanded['docs']).toBe(true);
  });

  it('rename carry moves preview mode only within the renamed workspace', () => {
    useAppStore.getState().setFilePreviewModeForPath(WS_A, 'old.md', true);
    useAppStore.getState().setFilePreviewModeForPath(WS_B, 'old.md', false);
    useAppStore.getState().carryFilePreviewModeForRename(WS_A, 'old.md', 'new.md');
    const state = useAppStore.getState();
    expect(state.filePreviewModeByPath[WS_A]).toEqual({ 'new.md': true });
    expect(state.filePreviewModeByPath[WS_B]).toEqual({ 'old.md': false });
  });
});

describe('changes/preview registry entries are workspace-scoped', () => {
  it('registers adl:changes.dirExpanded as byWorkspaceId TreeExpansion', () => {
    const entry = registry['adl:changes.dirExpanded'];
    expect(entry.scope).toBe('byWorkspaceId');
    expect(entry.field).toBe('expandedChangesTreePaths');
    // 旧扁平值（缺少 expanded 成员）必须被拒绝 —— 不写兼容代码，直接回退
    expect(entry.read?.({ src: true })).toBeUndefined();
    expect(entry.read?.({ [WS_A]: { expanded: { src: true } }, [WS_B]: { expanded: {} } })).toEqual(
      {
        [WS_A]: { expanded: { src: true }, manualCollapsed: undefined },
        [WS_B]: { expanded: {}, manualCollapsed: undefined },
      },
    );
  });

  it('registers adl:files.previewMode as byWorkspaceId nested boolean map', () => {
    const entry = registry['adl:files.previewMode'];
    expect(entry.scope).toBe('byWorkspaceId');
    expect(entry.field).toBe('filePreviewModeByPath');
    // 旧扁平值（叶子为布尔而非对象）必须被拒绝
    expect(entry.read?.({ 'README.md': true })).toBeUndefined();
    expect(entry.read?.({ [WS_A]: { 'README.md': true } })).toEqual({
      [WS_A]: { 'README.md': true },
    });
  });
});
