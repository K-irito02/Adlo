import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { stubStorage } from '@stores/persisted/__tests__/helpers';
import { useAppStore } from '@stores/slicedStore';
import { useFileFlash } from '../useFileFlash';

// 事项 2 回归：闪烁检查必须在工作区树到达后（重放一次），
// 不能只在选中文件瞬间单发 —— 树后到时单发窗口已耗尽，行从未可见。
describe('useFileFlash', () => {
  beforeEach(() => {
    stubStorage();
    vi.useFakeTimers();
    useAppStore.setState({
      expandedFileTreePaths: {
        workspace_a: { expanded: {}, manualCollapsed: { src: true } },
      },
      workspaceTrees: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('does not flash before the tree is loaded, then flashes once the tree arrives', () => {
    const { result, rerender } = renderHook(
      ({ path }: { path: string }) => useFileFlash(path, 'workspace_a'),
      { initialProps: { path: 'src/app.ts' } },
    );
    // 树未到：不闪（旧实现此处已起 1000ms 计时并在树到前耗尽）。
    expect(result.current).toBeUndefined();

    act(() => {
      useAppStore.setState({ workspaceTrees: { workspace_a: [] } as never });
    });
    rerender({ path: 'src/app.ts' });
    // 树到达：重放检查，闪最浅被折叠祖先。
    expect(result.current).toBe('src');
  });

  it('never flashes when the file is not inside a manually-collapsed directory', () => {
    const { result, rerender } = renderHook(
      ({ path }: { path: string }) => useFileFlash(path, 'workspace_a'),
      { initialProps: { path: 'other/app.ts' } },
    );
    act(() => {
      useAppStore.setState({ workspaceTrees: { workspace_a: [] } as never });
    });
    rerender({ path: 'other/app.ts' });
    expect(result.current).toBeUndefined();
  });
});
