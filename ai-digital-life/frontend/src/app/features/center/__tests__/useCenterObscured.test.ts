import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, renderHook, act, waitFor } from '@testing-library/react';
import { isObscuredByPanelOverlay, useCenterObscured } from '../useCenterObscured';

function mountShellBody(overlayClass = ''): HTMLDivElement {
  const el = document.createElement('div');
  el.className = ['adl-shell__body', overlayClass].filter(Boolean).join(' ');
  document.body.appendChild(el);
  return el;
}

/**
 * 记录**每次 render** 的返回值。
 * `renderHook` 的 `result.current` 只给最新值，而本库的 render 与 effect 同在 act 内执行，
 * 故它包含 effect 里 `sync()` 的结果 —— 无法区分「惰性初值」与 `useState(false)`。
 * 抓首帧必须自己保留渲染快照。
 */
function firstRenderValue(): boolean {
  const seen: boolean[] = [];
  function Probe() {
    seen.push(useCenterObscured());
    return null;
  }
  render(createElement(Probe));
  return seen[0];
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('isObscuredByPanelOverlay', () => {
  it('两类浮层类名都判为遮挡，且与 useRightPanelLayout 写入的类名一一对应', () => {
    for (const cls of ['is-rightpanel-overlay-active', 'is-rightpanel-overlay-expanded']) {
      const el = mountShellBody(cls);
      expect(isObscuredByPanelOverlay(el)).toBe(true);
      el.className = 'adl-shell__body';
      expect(isObscuredByPanelOverlay(el)).toBe(false);
    }
  });

  it('shell body 缺失（null）时为不遮挡', () => {
    expect(isObscuredByPanelOverlay(null)).toBe(false);
  });
});

describe('useCenterObscured', () => {
  it('首帧即为真（惰性初值）：挂载时面板已在浮层态不应先按"未遮挡"摆回中心 WebView', () => {
    mountShellBody('is-rightpanel-overlay-expanded');
    // 判别性断言：旧实现（useState(false)）首帧必为 false → 会先摆回中心 WebView 再隐藏
    expect(firstRenderValue()).toBe(true);

    const { result } = renderHook(() => useCenterObscured());
    expect(result.current).toBe(true);
  });

  it('订阅 shell body 的类名变化：加浮层类变真、移除后恢复', async () => {
    const shell = mountShellBody();
    const { result } = renderHook(() => useCenterObscured());
    expect(result.current).toBe(false);

    await act(async () => {
      shell.classList.add('is-rightpanel-overlay-active');
    });
    await waitFor(() => expect(result.current).toBe(true));

    await act(async () => {
      shell.classList.remove('is-rightpanel-overlay-active');
    });
    await waitFor(() => expect(result.current).toBe(false));
  });
});
