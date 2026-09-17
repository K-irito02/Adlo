import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, act } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { usePersistedScrollTop } from './usePersistedScrollTop';

function mockLayout(el: HTMLElement, box: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => box.scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => box.clientHeight });
}

function setScrollTop(el: HTMLElement, value: number) {
  Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value });
}

/**
 * 模拟条件渲染的滚动容器（还原真实根因场景：父组件 mount 时容器尚不存在，
 * loading 结束后才挂载；普通 ref + mount 期 effect 会永远错过挂载时机）。
 */
function LateHost({ storageKey, signal }: { storageKey: string; signal: number }) {
  const [ready, setReady] = useState(false);
  const { scrollRef, tryRestore } = usePersistedScrollTop(storageKey);
  useEffect(() => {
    if (signal > 0) {
      tryRestore();
    }
  }, [signal, tryRestore]);
  return (
    <>
      <button type="button" data-testid="ready" onClick={() => setReady(true)} />
      {ready ? <div ref={scrollRef} data-testid="scroll" style={{ overflowY: 'auto' }} /> : null}
    </>
  );
}

function renderLateHost(storageKey: string) {
  const rendered = render(<LateHost storageKey={storageKey} signal={0} />);
  const mountNode = () => {
    const btn = rendered.getByTestId('ready');
    fireEvent.click(btn);
    return rendered.getByTestId('scroll') as HTMLElement;
  };
  return { ...rendered, mountNode };
}

describe('usePersistedScrollTop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves scrollTop even when the scroll node mounts after parent mount (regression)', () => {
    const key = 'test:late-mount-save';
    const { mountNode } = renderLateHost(key);
    const node = mountNode();
    setScrollTop(node, 80);
    fireEvent.scroll(node);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(window.localStorage.getItem(key)).toBe('80');
  });

  it('restores saved scrollTop once content is tall enough', () => {
    const key = 'test:restore-ready';
    window.localStorage.setItem(key, '120');
    const { mountNode, rerender } = renderLateHost(key);
    const node = mountNode();
    mockLayout(node, { scrollHeight: 600, clientHeight: 100 });
    // 节点到达时布局尚为 0（jsdom），靠数据信号重试恢复。
    rerender(<LateHost storageKey={key} signal={1} />);
    expect(node.scrollTop).toBe(120);
  });

  it('manual scroll takes over and later restores do not yank back', () => {
    const key = 'test:takeover';
    window.localStorage.setItem(key, '300');
    const { mountNode, rerender } = renderLateHost(key);
    const node = mountNode();
    // 内容先矮：回填被钳制，仍保持 armed。
    mockLayout(node, { scrollHeight: 150, clientHeight: 100 });
    rerender(<LateHost storageKey={key} signal={1} />);
    expect(node.scrollTop).toBe(50);
    // 真实浏览器中程序化 scrollTop 赋值会异步触发一次 scroll 事件，先模拟它以消费抑制标记。
    fireEvent.scroll(node);
    // 用户手动滚动接管。
    setScrollTop(node, 10);
    fireEvent.scroll(node);
    // 内容长高后重试也不应把用户位置拽回 300。
    mockLayout(node, { scrollHeight: 800, clientHeight: 100 });
    rerender(<LateHost storageKey={key} signal={2} />);
    expect(node.scrollTop).toBe(10);
    // 且手动位置会被持久化。
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(window.localStorage.getItem(key)).toBe('10');
  });
});
