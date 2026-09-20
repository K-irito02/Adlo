import { describe, it, expect } from 'vitest';
import {
  pruneByWorkspaceId,
  pruneDirPathsByWorkspace,
  pruneByTabId,
  prunePathPrefix,
  pruneBrowserTreeExpanded,
} from '../prune';
import type { PruneCtx } from '../entry';

function ctx(partial: Partial<PruneCtx> = {}): PruneCtx {
  return {
    workspaceIds: new Set<string>(),
    loadedDirPaths: new Map<string, ReadonlySet<string>>(),
    tabIds: new Set<string>(),
    ...partial,
  };
}

describe('pruneByWorkspaceId', () => {
  it('NEGATIVE: skips entirely when the workspace list is empty (R7)', () => {
    const value = { workspace_a: true, workspace_b: false };
    const result = pruneByWorkspaceId(value, ctx());
    expect(result.changed).toBe(false);
    expect(result.value).toEqual(value);
  });

  it('removes entries whose workspace no longer exists', () => {
    const result = pruneByWorkspaceId(
      { workspace_a: true, workspace_b: true },
      ctx({
        workspaceIds: new Set(['workspace_a']),
      }),
    );
    expect(result.changed).toBe(true);
    expect(result.value).toEqual({ workspace_a: true });
  });
});

describe('pruneDirPathsByWorkspace', () => {
  const value = {
    workspace_a: { src: true, 'src/legacy': false },
    workspace_b: { docs: true },
  };

  it('NEGATIVE: skips entirely when the workspace list is empty (R7)', () => {
    expect(pruneDirPathsByWorkspace(value, ctx()).changed).toBe(false);
  });

  it('NEGATIVE: keeps all directory paths when that workspace tree is not loaded (R2)', () => {
    // workspace_b 必须列入参照清单：本用例断言"整表不变"，而"工作区已不存在"是另一条独立规则
    // （见下一个用例与 Task 15 的 applyWorkspacePrune）。未被加载的树才是本用例要覆盖的守卫。
    const result = pruneDirPathsByWorkspace(
      value,
      ctx({ workspaceIds: new Set(['workspace_a', 'workspace_b']) }),
    );
    expect(result.changed).toBe(false);
    expect(result.value).toEqual(value);
  });

  it('NEGATIVE: keeps the workspace as-is when the tree load failed (not present in loadedDirPaths)', () => {
    const result = pruneDirPathsByWorkspace(
      value,
      ctx({ workspaceIds: new Set(['workspace_a']), loadedDirPaths: new Map() }),
    );
    expect(result.value.workspace_a).toEqual({ src: true, 'src/legacy': false });
  });

  it('drops only directories absent from the loaded tree', () => {
    const result = pruneDirPathsByWorkspace(
      value,
      ctx({
        workspaceIds: new Set(['workspace_a']),
        loadedDirPaths: new Map([['workspace_a', new Set(['src'])]]),
      }),
    );
    expect(result.changed).toBe(true);
    expect(result.value.workspace_a).toEqual({ src: true });
  });

  it('drops the whole workspace record when the workspace is gone', () => {
    const result = pruneDirPathsByWorkspace(
      value,
      ctx({
        workspaceIds: new Set(['workspace_a']),
        loadedDirPaths: new Map([['workspace_a', new Set(['src', 'src/legacy'])]]),
      }),
    );
    expect(result.value.workspace_b).toBeUndefined();
  });
});

describe('pruneByTabId', () => {
  it('NEGATIVE: skips when the tab list is empty', () => {
    expect(pruneByTabId({ 'terminal-1': 12 }, ctx()).changed).toBe(false);
  });

  it('drops unknown tabs', () => {
    const result = pruneByTabId(
      { 'terminal-1': 12, 'terminal-2': 30 },
      ctx({ tabIds: new Set(['terminal-1']) }),
    );
    expect(result.value).toEqual({ 'terminal-1': 12 });
  });
});

describe('prunePathPrefix', () => {
  it('drops the path itself and every descendant', () => {
    const result = prunePathPrefix(
      { src: true, 'src/legacy': true, 'src/legacy/deep': true, docs: false },
      'src/legacy',
    );
    expect(result.changed).toBe(true);
    expect(result.value).toEqual({ src: true, docs: false });
  });

  it('does not drop sibling paths sharing a name prefix', () => {
    const result = prunePathPrefix({ 'src-legacy': true, src: true }, 'src');
    expect(result.value).toEqual({ 'src-legacy': true });
  });

  it('returns the input unchanged when nothing matches the removed path', () => {
    const value = { src: true, docs: false };
    const result = prunePathPrefix(value, 'vendor');
    expect(result.changed).toBe(false);
    expect(result.value).toEqual(value);
  });
});

describe('pruneBrowserTreeExpanded', () => {
  it('NEGATIVE: skips entirely when either reference list is empty', () => {
    const value = { 'workspace:ws-a': true, 'tab:k:tab-a': true };
    const emptyWorkspaces = pruneBrowserTreeExpanded(value, ctx({ tabIds: new Set(['tab-a']) }));
    expect(emptyWorkspaces.changed).toBe(false);
    expect(emptyWorkspaces.value).toEqual(value);

    const emptyTabs = pruneBrowserTreeExpanded(value, ctx({ workspaceIds: new Set(['ws-a']) }));
    expect(emptyTabs.changed).toBe(false);
    expect(emptyTabs.value).toEqual(value);
  });

  it('drops orphan workspace paths', () => {
    const result = pruneBrowserTreeExpanded(
      { 'workspace:ws-a': true, 'workspace:ws-gone': true, 'tab:key-1:tab-a': false },
      ctx({ workspaceIds: new Set(['ws-a']), tabIds: new Set(['tab-a']) }),
    );
    expect(result.changed).toBe(true);
    expect(result.value).toEqual({ 'workspace:ws-a': true, 'tab:key-1:tab-a': false });
  });

  it('keeps folder paths even when the folder no longer exists', () => {
    const value = {
      'folder:folder-gone': true,
      'history:year:2026': false,
      'tab:key-1:tab-a': true,
    };
    const result = pruneBrowserTreeExpanded(
      value,
      ctx({ workspaceIds: new Set(['ws-a']), tabIds: new Set(['tab-a']) }),
    );
    expect(result.changed).toBe(false);
    expect(result.value).toEqual(value);
  });
});
