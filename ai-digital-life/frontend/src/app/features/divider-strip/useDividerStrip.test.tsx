import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TCopyProvider } from '@i18n/TCopyContext';
import type { CopyDict } from '@i18n/types';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { browserPool } from '@features/browser/browserPoolSingleton';
import { useDividerStrip } from './useDividerStrip';

vi.mock('@shared/env', () => ({ isTauriShell: () => true }));
vi.mock('../../../tauri-bridge/tauri-shared', () => ({ subscribeChannel: () => () => {} }));

const t = { resizeSidebar: 'Resize sidebar' } as unknown as CopyDict;

const stripShow = vi.fn().mockResolvedValue(undefined);
const stripHide = vi.fn().mockResolvedValue(undefined);
const stripSetBounds = vi.fn().mockResolvedValue(undefined);

const tab = {
  id: 'b1',
  workspaceId: '',
  title: 'x',
  url: 'https://x.test',
  titleResolved: true,
  isPinned: false,
  sortOrder: 1,
  isPlayingAudio: false,
  isAudioMuted: false,
  isDownloading: false,
  location: 'panel',
} as BrowserTabState;

const layout = {
  applyPanelGeometry: vi.fn(() => ({
    nextWidth: 400,
    nextMode: 'docked' as const,
    effectiveAnchorWidth: undefined,
  })),
  clampPanelWidthToShell: vi.fn((w: number) => w),
  setRightPanelWidth: vi.fn(),
};

type StripOptions = Parameters<typeof useDividerStrip>[0];

/** 与生产一致：panelRef 是稳定对象（RightPanel 的 useRef），只有 props 会变。 */
function makePanelRef(): StripOptions['panelRef'] {
  const el = document.createElement('div');
  // jsdom 下 rect 恒为 0，会让 computeBounds 返回 null（条带不展示）——显式给几何。
  el.getBoundingClientRect = () =>
    ({
      left: 1200,
      top: 36,
      right: 1920,
      bottom: 1116,
      width: 720,
      height: 1080,
      x: 1200,
      y: 36,
    }) as DOMRect;
  document.body.appendChild(el);
  return { current: el };
}

function makeOptions(
  panelRef: StripOptions['panelRef'],
  overrides: Partial<StripOptions> = {},
): StripOptions {
  return {
    panelRef,
    collapsed: false,
    activeRightTool: 'browser',
    rightPanelWidth: 400,
    rightPanelMode: 'docked',
    leftCollapsed: false,
    layout,
    ...overrides,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <TCopyProvider t={t} locale="zh-CN">
    {children}
  </TCopyProvider>
);

function renderStrip(overrides: Partial<StripOptions> = {}) {
  return renderHook((p: StripOptions) => useDividerStrip(p), {
    initialProps: makeOptions(makePanelRef(), overrides),
    wrapper,
  });
}

/** `navigatorCollapsedByTool` 是 Record<ToolId, boolean>（全 tool 必填）。 */
function navigatorCollapsedFor(browser: boolean) {
  return {
    browser,
    terminal: false,
    files: false,
    changes: false,
    settings: false,
    communicate: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    browser: {
      createForTab: vi.fn().mockResolvedValue(null),
      dividerStripShow: stripShow,
      dividerStripHide: stripHide,
      dividerStripSetBounds: stripSetBounds,
    },
  };
  useAppStore.setState({
    isTauri: true,
    startupOverlayHidden: true,
    navigatorCollapsedByTool: navigatorCollapsedFor(true),
    browserTabs: [tab],
    browserTabsById: { b1: tab },
    browserActiveTabId: 'b1',
    siblingWebviewNonce: 0,
    centerTabs: [],
    centerActiveTabId: '',
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  browserPool.reset();
});

describe('useDividerStrip 显隐口径', () => {
  it('面板导航器收起（面板 WebView 压住边界命中带）时展示桥接条', async () => {
    renderStrip();
    await waitFor(() => expect(stripShow).toHaveBeenCalled());
  });

  it('面板导航器展开时不展示（DOM 手柄命中带可命中）', async () => {
    useAppStore.setState({ navigatorCollapsedByTool: navigatorCollapsedFor(false) });
    renderStrip();
    await waitFor(() => expect(stripHide).toHaveBeenCalled());
    expect(stripShow).not.toHaveBeenCalled();
  });

  it('显隐只看面板侧：导航器展开时不展示，收起后同一中心状态才展示', async () => {
    // 迭代 0 的条件在「中心有 WebView + docked」时无脑展示 → 本用例上半段即其反例；
    // 下半段（收起后同一中心状态确实展示）同时是"中心确实处于活跃态"的阳性对照，
    // 否则上半段会退化成空断言（中心 url 为空时 resolveCenterWebView 本就返回非活跃）。
    const centerTab = {
      ...tab,
      id: 'center-1',
      url: 'https://dsh.test',
      location: 'center' as const,
    };
    useAppStore.setState({
      navigatorCollapsedByTool: navigatorCollapsedFor(false),
      centerTabs: [{ id: 'c1', kind: 'browser', refId: 'center-1', createdAt: 1 }],
      centerActiveTabId: 'c1',
      browserTabsById: { b1: tab, 'center-1': centerTab },
    });
    await browserPool.createForTab('center-1', 'https://dsh.test');

    const panelRef = makePanelRef();
    const options = makeOptions(panelRef);
    renderHook((p: StripOptions) => useDividerStrip(p), { initialProps: options, wrapper });

    // ① 导航器展开（DOM 命中带可命中）⇒ 不展示，即便中心侧确有活跃 WebView
    await waitFor(() => expect(stripHide).toHaveBeenCalled());
    expect(stripShow).not.toHaveBeenCalled();

    // ② 仅切换导航器收起（中心侧状态不变）⇒ 展示
    useAppStore.setState({ navigatorCollapsedByTool: navigatorCollapsedFor(true) });
    await waitFor(() => expect(stripShow).toHaveBeenCalled());
  });

  it('回归：面板进入 overlay 态（中心 WebView 已被隐藏）后桥接条不得消失', async () => {
    // 用户实测：拖拽边界使中间区 WebView2 隐藏后边界再也拖不动。
    // 桥接条的职责是"抢回被面板自身 WebView 盖住的命中带"，与中心区状态、
    // docked/overlay 无关；overlay 态缺少其它兜底，恰恰更依赖它。
    const panelRef = makePanelRef();
    const options = makeOptions(panelRef);
    const { rerender } = renderHook((p: StripOptions) => useDividerStrip(p), {
      initialProps: options,
      wrapper,
    });
    await waitFor(() => expect(stripShow).toHaveBeenCalled());
    // 让 reconcile 内的 await 落定（shownRef 落地）。
    await act(async () => {});
    const hidesBefore = stripHide.mock.calls.length;
    const showsBefore = stripShow.mock.calls.length;

    rerender({ ...options, rightPanelMode: 'overlay_partial' });

    // 条带仍在线：只跟随几何（setBounds），既未隐藏也未销毁重建。
    await waitFor(() => expect(stripSetBounds).toHaveBeenCalled());
    expect(stripHide.mock.calls.length).toBe(hidesBefore);
    expect(stripShow.mock.calls.length).toBe(showsBefore);
  });
});
