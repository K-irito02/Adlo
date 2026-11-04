import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { flushCrossSliceWrites } from '@stores/storageHelpers';

const WS = 'workspace_rules';
const DIR_KEY = 'adl:files.dirExpanded';

function expansion(): {
  expanded: Record<string, boolean>;
  manualCollapsed?: Record<string, true>;
} {
  return useAppStore.getState().expandedFileTreePaths[WS] ?? { expanded: {} };
}

/** 不变量：`manualCollapsed[k] === true` 与 `expanded[k] === true` 不得同时成立 */
function expectInvariant(): void {
  const current = expansion();
  const conflicting = Object.keys(current.manualCollapsed ?? {}).filter(
    (path) => current.expanded[path] === true,
  );
  expect(conflicting).toEqual([]);
}

describe('directory expansion intent', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ expandedFileTreePaths: {} });
  });

  it('manual collapse records both the collapsed state and the manual intent', () => {
    useAppStore.getState().setFileTreePathExpanded(WS, 'src/legacy', false);
    expect(expansion()).toEqual({
      expanded: { 'src/legacy': false },
      manualCollapsed: { 'src/legacy': true },
    });
  });

  it('issues file-tree reveal requests with increasing nonces', () => {
    useAppStore.setState({ fileTreeRevealRequest: null });
    useAppStore.getState().requestFileTreeReveal('ws-1', 'docs/a.md');
    const first = useAppStore.getState().fileTreeRevealRequest;
    expect(first).toMatchObject({ workspaceId: 'ws-1', path: 'docs/a.md' });
    expect(typeof first?.nonce).toBe('number');
    useAppStore.getState().requestFileTreeReveal('ws-1', 'docs/a.md');
    const second = useAppStore.getState().fileTreeRevealRequest;
    expect(second?.nonce).toBeGreaterThan(first?.nonce ?? 0);
  });

  it('consumeFileTreeReveal clears a pending reveal request', () => {
    useAppStore.setState({ fileTreeRevealRequest: null });
    useAppStore.getState().requestFileTreeReveal('ws-1', 'docs/a.md');
    expect(useAppStore.getState().fileTreeRevealRequest).not.toBeNull();
    useAppStore.getState().consumeFileTreeReveal();
    expect(useAppStore.getState().fileTreeRevealRequest).toBeNull();
  });

  it('manual expand clears the manual intent', () => {
    useAppStore.getState().setFileTreePathExpanded(WS, 'src/legacy', false);
    useAppStore.getState().setFileTreePathExpanded(WS, 'src/legacy', true);
    expect(expansion().expanded['src/legacy']).toBe(true);
    expect(expansion().manualCollapsed?.['src/legacy']).toBeUndefined();
  });

  it('records the manual intent even when the path is already collapsed', () => {
    // 裁定 6：旧扁平实现的"值已相等就早退"会在这里丢掉用户意图 ——
    // expanded[k] 已经是 false，但 manualCollapsed[k] 还没被记录，必须补记。
    useAppStore.setState({
      expandedFileTreePaths: { [WS]: { expanded: { 'src/legacy': false } } },
    });
    useAppStore.getState().setFileTreePathExpanded(WS, 'src/legacy', false);
    expect(expansion()).toEqual({
      expanded: { 'src/legacy': false },
      manualCollapsed: { 'src/legacy': true },
    });
  });

  it('reports the blocked directory instead of re-expanding it', () => {
    useAppStore.getState().setFileTreePathExpanded(WS, 'src/legacy', false);
    const result = useAppStore.getState().expandFileTreePathChain(WS, 'src/legacy/old.ts');
    expect(result.blocked).toEqual(['src/legacy']);
    expect(expansion().expanded['src/legacy']).toBe(false);
  });

  it('reports nested blocked ancestors in shallow-to-deep order (blocked[0] is the visible one)', () => {
    // 嵌套折叠：src 与 src/legacy 都被手动折叠。blocked[0] 必须是最浅的 src ——
    // 只有它保证在虚列表中可见（其上方已被链路展开）；更深的 src/legacy 行
    // 因父级折叠根本不在渲染列表里，闪它等于没有提示（FileNavigatorShell 用 blocked[0] 闪烁）。
    useAppStore.getState().setFileTreePathExpanded(WS, 'src', false);
    useAppStore.getState().setFileTreePathExpanded(WS, 'src/legacy', false);
    const result = useAppStore.getState().expandFileTreePathChain(WS, 'src/legacy/old.ts');
    expect(result.blocked).toEqual(['src', 'src/legacy']);
    expect(result.blocked[0]).toBe('src');
    // 被折叠的目录都保持折叠
    expect(expansion().expanded['src']).toBe(false);
    expect(expansion().expanded['src/legacy']).toBe(false);
  });

  it('auto-expand still expands ancestors that were not manually collapsed', () => {
    useAppStore.getState().setFileTreePathExpanded(WS, 'src/legacy', false);
    const result = useAppStore.getState().expandFileTreePathChain(WS, 'src/active/now.ts');
    expect(result.blocked).toEqual([]);
    expect(expansion().expanded['src']).toBe(true);
    expect(expansion().expanded['src/active']).toBe(true);
  });

  it('does not write when the chain has nothing to expand', () => {
    useAppStore.getState().setFileTreePathExpanded(WS, 'src', true);
    flushCrossSliceWrites();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    try {
      const result = useAppStore.getState().expandFileTreePathChain(WS, 'src/now.ts');
      flushCrossSliceWrites();
      expect(result.blocked).toEqual([]);
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });

  it('does write when the chain actually expands something (control for the case above)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    try {
      const result = useAppStore.getState().expandFileTreePathChain(WS, 'src/active/now.ts');
      flushCrossSliceWrites();
      expect(result.blocked).toEqual([]);
      expect(setItem).toHaveBeenCalledWith(DIR_KEY, expect.any(String));
    } finally {
      setItem.mockRestore();
    }
  });

  it('keeps the cross-field invariant after every mutation', () => {
    const { setFileTreePathExpanded, toggleFileTreePath, expandFileTreePathChain } =
      useAppStore.getState();

    setFileTreePathExpanded(WS, 'src', false); // 手动折叠 'src'
    expectInvariant();

    const blocked = expandFileTreePathChain(WS, 'src/legacy/old.ts'); // 'src' 被拦，'src/legacy' 自动展开
    expect(blocked.blocked).toEqual(['src']);
    expectInvariant();

    toggleFileTreePath(WS, 'src/legacy'); // 手动折叠子目录
    expectInvariant();

    setFileTreePathExpanded(WS, 'src', true); // 手动展开父目录，清除其手动意图
    expectInvariant();

    // 不可平凡：manualCollapsed 仍非空，且 expanded 中确实存在 true 项
    expect(expansion().manualCollapsed).toEqual({ 'src/legacy': true });
    expect(expansion().expanded['src']).toBe(true);
  });

  it('persists the manual intent across a restart', () => {
    useAppStore.getState().setFileTreePathExpanded(WS, 'src/legacy', false);
    flushCrossSliceWrites();
    const stored = JSON.parse(localStorage.getItem(DIR_KEY) ?? 'null');
    expect(stored[WS].manualCollapsed).toEqual({ 'src/legacy': true });
  });
});
