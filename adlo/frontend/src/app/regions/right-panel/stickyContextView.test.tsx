// @vitest-environment jsdom
import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { zhCN } from '../../i18n/zh-CN';
import { createStickyContextModel } from './editor-support/stickyContext';
import { StickyContext } from './editor-support/stickyContextView';
import { usePreviewStickyContext } from './hooks/usePreviewStickyContext';
import { useStickyContext } from './hooks/useStickyContext';
import type { FileOutlineItem } from '@adlo/kernel';
import type { EditorRef } from '../../stores/types';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <TCopyProvider t={zhCN} locale="zh-CN">
      {children}
    </TCopyProvider>
  );
}

describe('StickyContext 自动隐藏', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('2s 后隐藏；只有真实滚动信号能重新出现，模型 id 变化不会续命', () => {
    vi.useFakeTimers();
    const base = createStickyContextModel({
      modelId: 'first',
      revealSignal: 1,
      canScrollToTop: true,
      onNavigateLine: () => undefined,
      topLabel: '文件顶部',
    });
    const { container, rerender } = render(<StickyContext data-testid="sticky" model={base} />, {
      wrapper,
    });
    const element = container.querySelector('.adl-sticky-context');
    expect(element?.classList.contains('is-hidden')).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(element?.classList.contains('is-hidden')).toBe(true);

    // 布局/内容更新只改 modelId：不得重新显示（旧实现会一直常驻）。
    rerender(<StickyContext data-testid="sticky" model={{ ...base, modelId: 'layout-only' }} />);
    expect(element?.classList.contains('is-hidden')).toBe(true);

    // 真实滚动信号递增：重新显示。
    rerender(<StickyContext data-testid="sticky" model={{ ...base, revealSignal: 2 }} />);
    expect(element?.classList.contains('is-hidden')).toBe(false);
  });
});

describe('usePreviewStickyContext', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function mount() {
    const container = document.createElement('div');
    const scroller = document.createElement('div');
    const scrollTo = vi.fn();
    Object.defineProperty(scroller, 'clientHeight', { value: 1000, configurable: true });
    Object.assign(scroller, { scrollTo });
    container.appendChild(scroller);
    document.body.appendChild(container);
    const ref = { current: container };
    const view = renderHook(() => usePreviewStickyContext(ref, 'fixture'), { wrapper });
    return { container, scroller, scrollTo, view };
  }

  it('内层滚动容器滚动后出现，回到顶部后隐藏', () => {
    const { scroller, view } = mount();
    expect(view.result.current?.showTopEntry).toBe(false);

    act(() => {
      scroller.scrollTop = 120;
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(view.result.current?.showTopEntry).toBe(true);

    act(() => {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(view.result.current?.showTopEntry).toBe(false);
  });

  it('短距离平滑回顶，超过 3 个视口高度瞬时回顶', () => {
    const { scroller, scrollTo, view } = mount();

    act(() => {
      scroller.scrollTop = 500;
      scroller.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      view.result.current?.scrollToTop();
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });

    act(() => {
      scroller.scrollTop = 5000;
      scroller.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      view.result.current?.scrollToTop();
    });
    expect(scroller.scrollTop).toBe(0);
  });
});

describe('useStickyContext 编辑器挂载后重新订阅', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function makeEditor() {
    const listeners: (() => void)[] = [];
    let scrollTop = 0;
    const editor = {
      getSelection: () => null,
      getModel: () => null,
      revealLineInCenter: () => undefined,
      getVisibleRanges: () => [
        { startLineNumber: 4, startColumn: 1, endLineNumber: 6, endColumn: 1 },
      ],
      getScrollTop: () => scrollTop,
      getScrollHeight: () => 1000,
      getLayoutInfo: () => ({ height: 100 }),
      setScrollPosition: ({ scrollTop: next }: { scrollTop: number }) => {
        scrollTop = next;
      },
      onDidScrollChange: (listener: () => void) => {
        listeners.push(listener);
        return { dispose: () => undefined };
      },
      onDidChangeHiddenAreas: () => ({ dispose: () => undefined }),
      onDidLayoutChange: () => ({ dispose: () => undefined }),
      focus: () => undefined,
      setPosition: () => undefined,
      getLineCenterDelta: () => null,
    } as unknown as EditorRef;
    return {
      editor,
      listeners,
      scrollTo: (value: number) => {
        scrollTop = value;
      },
    };
  }

  it('lazy 编辑器挂载（mount version 变化）后才挂滚动监听并更新模型', () => {
    const surface = document.createElement('div');
    document.body.appendChild(surface);
    const editorSurfaceRef = { current: surface };
    const fake = makeEditor();
    let current: EditorRef | null = null;
    const content = ['# A', '', '## B', '', 'line 4', 'line 5'].join('\n');
    const outline: FileOutlineItem[] = [{ id: 'a', label: 'A', kind: 'heading', line: 1 }];

    const { result, rerender } = renderHook(
      ({ version }: { version: number }) =>
        useStickyContext({
          selectedFilePath: 'note.md',
          content,
          outline,
          getStickySourceEditor: () => current,
          wordWrapEnabled: false,
          diffSideBySide: false,
          editorSurfaceRef,
          stickyDiffRanges: undefined,
          editorMountVersion: version,
        }),
      { wrapper, initialProps: { version: 0 } },
    );

    expect(result.current?.showTopEntry).toBe(false);
    expect(fake.listeners).toHaveLength(0);

    current = fake.editor;
    fake.scrollTo(200);
    rerender({ version: 1 });
    expect(fake.listeners).toHaveLength(1);
    expect(result.current?.showTopEntry).toBe(true);

    fake.scrollTo(0);
    act(() => {
      fake.listeners[0]?.();
    });
    expect(result.current?.showTopEntry).toBe(false);
  });
});
