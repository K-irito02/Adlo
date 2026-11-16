import { render, act, fireEvent } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserFavicon } from '../BrowserFavicon';
import {
  __resetFaviconDisplayCacheForTest,
  getRememberedPageFavicon,
  markFaviconSourceLoaded,
  rememberPageFavicon,
} from '../faviconDisplayCache';
import * as cache from '../../utils/siteMetaCache';

beforeEach(() => {
  vi.restoreAllMocks();
  __resetFaviconDisplayCacheForTest();
});

function mirrorFavicon(url: string, faviconUrl: string, faviconDataUri = '') {
  act(() => {
    cache.__mirrorUpsertForTest(url, {
      title: 'A',
      titleSource: '',
      faviconUrl,
      faviconDataUri,
      fetchedAt: 1,
      lastOkAt: 0,
      nextRetryAt: 0,
      failCount: 0,
    });
  });
}

const VISIBLE_IMG = '.adl-browser-tree__favicon:not(.adl-browser-tree__favicon--probe)';
const PROBE_IMG = '.adl-browser-tree__favicon--probe';

function visibleImg(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector(VISIBLE_IMG) as HTMLImageElement | null;
}

function probeImg(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector(PROBE_IMG) as HTMLImageElement | null;
}

function fallback(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.adl-browser-tree__link-fallback') as HTMLElement | null;
}

it('keeps the letter until the external favicon actually loads', () => {
  mirrorFavicon('https://external.example', 'https://external.example/favicon.ico');
  const { container } = render(<BrowserFavicon url="https://external.example" />);
  const probe = probeImg(container);
  expect(probe).not.toBeNull();
  expect(probe?.src).toContain('https://external.example/favicon.ico');
  // 加载完成前：没有可见图标，首字母兜底
  expect(visibleImg(container)).toBeNull();
  expect(fallback(container)?.style.display).not.toBe('none');

  act(() => {
    fireEvent.load(probe!);
  });
  expect(visibleImg(container)?.src).toContain('https://external.example/favicon.ico');
  expect(fallback(container)?.style.display).toBe('none');
});

it('renders img immediately when a data-URI is available', () => {
  mirrorFavicon(
    'https://hasdata.example',
    'https://hasdata.example/favicon.ico',
    'data:image/png;base64,AA',
  );
  const { container } = render(<BrowserFavicon url="https://hasdata.example" />);
  const img = visibleImg(container);
  expect(img).not.toBeNull();
  expect(img?.src).toContain('data:image/png;base64,AA');
  // 站点图标是 drag ghost 的常见起拖命中区，必须禁用浏览器原生图片拖拽。
  expect(img?.getAttribute('draggable')).toBe('false');
  expect(fallback(container)?.style.display).toBe('none');
});

it('shows fallback letter when meta resolved with empty faviconUrl', () => {
  mirrorFavicon('https://uncached.example', '');
  const { container } = render(<BrowserFavicon url="https://uncached.example" />);
  expect(fallback(container)?.textContent).toBe('U');
  expect(fallback(container)?.style.display).not.toBe('none');
});

it('shows empty placeholder (not letter/favicon) while meta fetch has not settled', () => {
  const { container } = render(<BrowserFavicon url="https://never-fetched.example" />);
  expect(fallback(container)?.style.display).toBe('none');
  expect(visibleImg(container)).toBeNull();
});

it('image error does not remove cache (no removeCachedSiteMeta call)', () => {
  mirrorFavicon(
    'https://err.example',
    'https://err.example/favicon.ico',
    'data:image/png;base64,AA',
  );
  const removeSpy = vi.spyOn(cache, 'removeCachedSiteMeta').mockImplementation(() => {});
  const { container } = render(<BrowserFavicon url="https://err.example" />);
  const img = visibleImg(container);
  expect(img).not.toBeNull();
  act(() => {
    fireEvent.error(img!);
  });
  expect(removeSpy).not.toHaveBeenCalled();
});

it('shows fallback when img load fails (degraded state)', () => {
  mirrorFavicon(
    'https://fail.example',
    'https://fail.example/favicon.ico',
    'data:image/png;base64,AA',
  );
  const { container } = render(<BrowserFavicon url="https://fail.example" />);
  const img = visibleImg(container);
  expect(img).not.toBeNull();
  act(() => {
    fireEvent.error(img!);
  });
  expect(visibleImg(container)).toBeNull();
  expect(fallback(container)?.style.display).not.toBe('none');
  // H1-A 回归拦截：degraded 后兜底字母必须显示站点首字母（而非空白）
  expect(fallback(container)?.textContent).toBe('F');
});

it('recovers from degraded state when mirror updates bring a new data-URI', () => {
  mirrorFavicon(
    'https://recover.example',
    'https://recover.example/favicon.ico',
    'data:image/png;base64,AA',
  );
  const { container } = render(<BrowserFavicon url="https://recover.example" />);
  act(() => {
    fireEvent.error(visibleImg(container)!);
  });
  expect(visibleImg(container)).toBeNull();
  mirrorFavicon(
    'https://recover.example',
    'https://cdn.example.com/favicon.ico',
    'data:image/png;base64,BB',
  );
  const img2 = visibleImg(container);
  expect(img2).not.toBeNull();
  expect(img2?.src).toContain('data:image/png;base64,BB');
  expect(fallback(container)?.style.display).toBe('none');
});

it('retries a transiently failing favicon without a URL change', () => {
  vi.useFakeTimers();
  try {
    mirrorFavicon('https://retry.example', 'https://retry.example/favicon.ico');
    const { container } = render(<BrowserFavicon url="https://retry.example" />);
    const firstProbe = probeImg(container);
    expect(firstProbe).not.toBeNull();
    act(() => {
      fireEvent.error(firstProbe!);
    });
    expect(visibleImg(container)).toBeNull();
    // 重试间隔到 → 重挂 probe 再次尝试（新 DOM 节点）
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const secondProbe = probeImg(container);
    expect(secondProbe).not.toBeNull();
    expect(secondProbe).not.toBe(firstProbe);
  } finally {
    vi.useRealTimers();
  }
});

it('stays degraded when a broadcast keeps the same data-URI (no remount flicker)', () => {
  // L6：data-URI 未变化时保持降级态，避免每次广播重挂 img → 失败 → 再降级的闪烁
  mirrorFavicon(
    'https://same.example',
    'https://same.example/favicon.ico',
    'data:image/png;base64,AA',
  );
  const { container } = render(<BrowserFavicon url="https://same.example" />);
  act(() => {
    fireEvent.error(visibleImg(container)!);
  });
  expect(visibleImg(container)).toBeNull();
  mirrorFavicon(
    'https://same.example',
    'https://same.example/favicon.ico',
    'data:image/png;base64,AA',
  );
  expect(visibleImg(container)).toBeNull();
  expect(fallback(container)?.style.display).not.toBe('none');
});

it('renders the new-tab page icon for an empty URL (事项 4)', () => {
  const { container } = render(<BrowserFavicon url="" />);
  expect(container.querySelector('svg.adl-icon')).not.toBeNull();
  expect(visibleImg(container)).toBeNull();
});

it('renders the new-tab page icon for about:blank (事项 4)', () => {
  const { container } = render(<BrowserFavicon url="about:blank" />);
  expect(container.querySelector('svg.adl-icon')).not.toBeNull();
  expect(visibleImg(container)).toBeNull();
});

it('does NOT render the new-tab page icon for a real URL (事项 4)', () => {
  const { container } = render(<BrowserFavicon url="https://real.example" />);
  expect(container.querySelector('svg.adl-icon')).toBeNull();
});

describe('pending placeholder policy', () => {
  it('passive (initial) mode shows the site initial immediately for a never-fetched URL', () => {
    const { container } = render(
      <BrowserFavicon url="https://imported.example/a" pending="initial" />,
    );
    expect(container.querySelector('.adl-spinner')).toBeNull();
    expect(fallback(container)?.style.display).not.toBe('none');
    expect(fallback(container)?.textContent).toBe('I');
  });

  it('passive (initial) mode keeps the initial across remounts (no spinner restart on expand)', () => {
    const first = render(<BrowserFavicon url="https://imported.example/b" pending="initial" />);
    expect(first.container.querySelector('.adl-spinner')).toBeNull();
    first.unmount();
    const second = render(<BrowserFavicon url="https://imported.example/b" pending="initial" />);
    expect(second.container.querySelector('.adl-spinner')).toBeNull();
    expect(fallback(second.container)?.textContent).toBe('I');
  });

  it('passive (initial) mode upgrades the initial to the real favicon when metadata arrives', () => {
    const { container } = render(
      <BrowserFavicon url="https://imported.example/c" pending="initial" />,
    );
    expect(fallback(container)?.textContent).toBe('I');
    mirrorFavicon(
      'https://imported.example/c',
      'https://imported.example/favicon.ico',
      'data:image/png;base64,CC',
    );
    const img = visibleImg(container);
    expect(img).not.toBeNull();
    expect(img?.src).toContain('data:image/png;base64,CC');
  });

  it('spinner (default) mode still keeps the spinner while meta has not settled', () => {
    const { container } = render(<BrowserFavicon url="https://live-tab.example" />);
    expect(container.querySelector('.adl-spinner')).not.toBeNull();
  });
});

describe('重挂不闪烁（2026-11-15 用户报告）', () => {
  it('SSR 首帧（effect 未执行）就输出记住的图标', () => {
    // RTL 的 render 会 flush effect，无法区分「lazy 初始化」与「effect 后填值」；
    // 服务端渲染不执行 effect，能真正锁住 render 期同步解析。
    const src = 'https://ssr-remember.example/favicon.ico';
    markFaviconSourceLoaded(src);
    rememberPageFavicon('https://ssr-remember.example', src);
    const html = renderToString(
      <BrowserFavicon url="https://ssr-remember.example" pending="initial" />,
    );
    expect(html).toContain('adl-browser-tree__favicon');
    expect(html).toContain(src);
  });

  it('SSR 首帧（effect 未执行）就输出书签内联快照', () => {
    // 删掉 resolveInitialSources 里的 snapshotReady 优先级后，快照既不在可见层
    // 也不在 probe 层（内联 data-URI 本来就 ready），SSR 输出会完全丢失该图标。
    const html = renderToString(
      <BrowserFavicon
        url="https://ssr-snapshot.example"
        pending="initial"
        snapshot="data:image/png;base64,SS"
      />,
    );
    expect(html).toContain('data:image/png;base64,SS');
    expect(html).not.toContain('adl-browser-tree__favicon--probe');
    expect(html).toMatch(/adl-browser-tree__link-fallback"[^>]*display:\s*none/);
  });

  it('已成功加载过的图标在重挂首帧直接显示，不再先闪首字母', () => {
    mirrorFavicon('https://remount.example', 'https://remount.example/favicon.ico');
    const first = render(<BrowserFavicon url="https://remount.example" pending="initial" />);
    act(() => {
      fireEvent.load(probeImg(first.container)!);
    });
    expect(visibleImg(first.container)).not.toBeNull();
    first.unmount();

    // 模拟折叠/展开或切换导航模式导致的重挂
    const second = render(<BrowserFavicon url="https://remount.example" pending="initial" />);
    expect(visibleImg(second.container)?.src).toContain('https://remount.example/favicon.ico');
    expect(fallback(second.container)?.style.display).toBe('none');
  });

  it('记住该页面显示过的图标：元数据暂缺时重挂也不退回占位', () => {
    // 2026-11-15 用户报告：单个书签每次展开都从无图标变真实图标。
    // 仅记 src 还不够——remount 时 getFaviconUrl 可能暂时为空，必须按页面 URL 记住。
    mirrorFavicon('https://remember.example', 'https://remember.example/favicon.ico');
    const first = render(<BrowserFavicon url="https://remember.example" pending="initial" />);
    act(() => {
      fireEvent.load(probeImg(first.container)!);
    });
    expect(visibleImg(first.container)).not.toBeNull();
    expect(getRememberedPageFavicon('https://remember.example')).toContain(
      'https://remember.example/favicon.ico',
    );
    first.unmount();

    // 模拟元数据镜像暂时无条目（getFaviconUrl 返回 ''）
    mirrorFavicon('https://remember.example', '');
    const second = render(<BrowserFavicon url="https://remember.example" pending="initial" />);
    expect(visibleImg(second.container)?.src).toContain('https://remember.example/favicon.ico');
    expect(fallback(second.container)?.style.display).toBe('none');
  });

  it('换 URL 时旧站图标不会被记到新页名下（跨站错图标回归）', () => {
    mirrorFavicon('https://a.example', 'https://a.example/favicon.ico');
    const { container, rerender } = render(
      <BrowserFavicon url="https://a.example" pending="initial" />,
    );
    act(() => {
      fireEvent.load(probeImg(container)!);
    });
    expect(visibleImg(container)?.src).toContain('https://a.example/favicon.ico');

    // 同一组件实例导航到无元数据的新页
    mirrorFavicon('https://b.example', '');
    rerender(<BrowserFavicon url="https://b.example" pending="initial" />);

    expect(getRememberedPageFavicon('https://b.example')).toBe('');
    expect(visibleImg(container)).toBeNull();
    expect(fallback(container)?.style.display).not.toBe('none');
  });

  it('可见图标加载失败时清除该页面的图标记忆', () => {
    mirrorFavicon('https://forget.example', 'https://forget.example/favicon.ico');
    const { container } = render(<BrowserFavicon url="https://forget.example" pending="initial" />);
    act(() => {
      fireEvent.load(probeImg(container)!);
    });
    expect(getRememberedPageFavicon('https://forget.example')).not.toBe('');
    act(() => {
      fireEvent.error(visibleImg(container)!);
    });
    expect(getRememberedPageFavicon('https://forget.example')).toBe('');
  });

  it('书签自带的内联图标快照首帧即可显示（导入书签不再先露首字母）', () => {
    const { container } = render(
      <BrowserFavicon
        url="https://snapshot.example/page"
        pending="initial"
        snapshot="data:image/png;base64,SS"
      />,
    );
    const img = visibleImg(container);
    expect(img).not.toBeNull();
    expect(img?.src).toContain('data:image/png;base64,SS');
    expect(fallback(container)?.style.display).toBe('none');
  });

  it('站点图标持续加载失败时退回书签快照（不会永远只剩首字母）', () => {
    vi.useFakeTimers();
    try {
      mirrorFavicon(
        'https://snapshot-fallback.example',
        'https://snapshot-fallback.example/favicon.ico',
      );
      const { container } = render(
        <BrowserFavicon
          url="https://snapshot-fallback.example"
          pending="initial"
          snapshot="data:image/png;base64,SF"
        />,
      );
      // 快照先立即显示；站点图标在后台探测
      expect(visibleImg(container)?.src).toContain('data:image/png;base64,SF');
      // 首次失败 + 6 次重试 = 7 次尝试，之后预算耗尽
      for (let i = 0; i < 7; i += 1) {
        act(() => {
          fireEvent.error(probeImg(container)!);
        });
        act(() => {
          vi.advanceTimersByTime(2000);
        });
      }
      // 重试耗尽（6 次 × 2s）后仍失败 → 保持快照，且不再重新探测。
      // 真正锁住折算分支的是「probe 不再挂载」：删掉 setExhaustedSrc/probe 清理会变红。
      expect(visibleImg(container)?.src).toContain('data:image/png;base64,SF');
      expect(fallback(container)?.style.display).toBe('none');
      expect(probeImg(container)).toBeNull();
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(probeImg(container)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
