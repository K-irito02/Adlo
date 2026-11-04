import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAppStore } from '@stores/slicedStore';
import { applyIdlePass, useBrowserSuspendScheduler } from '../useBrowserSuspendScheduler';
import type { BrowserTabState } from '@stores/slices/browserSlice';

const tab = (id: string, patch: Partial<BrowserTabState> = {}): BrowserTabState => ({
  id,
  workspaceId: '',
  title: 't',
  url: 'https://x.com',
  titleResolved: true,
  isPinned: false,
  sortOrder: 0,
  isPlayingAudio: false,
  isAudioMuted: false,
  isDownloading: false,
  ...patch,
});

describe('applyIdlePass (idle)', () => {
  const now = 10_000;
  it('suspends idle unprotected inactive in-pool tabs, oldest first', () => {
    expect(
      applyIdlePass({
        tabs: [tab('old'), tab('new'), tab('active')],
        protectedActiveTabIds: new Set(['active']),
        inPool: (id) => id !== 'active',
        lastActivatedMs: { old: 1_000, new: 9_000 },
        idleMs: 5_000,
        protected: (t) => t.isPinned || t.isPlayingAudio,
        now,
      }),
    ).toEqual(['old']);
  });
  it('skips protected (pinned/audio) and active tabs', () => {
    expect(
      applyIdlePass({
        tabs: [
          tab('pinned', { isPinned: true }),
          tab('audio', { isPlayingAudio: true }),
          tab('ok'),
        ],
        protectedActiveTabIds: new Set(),
        inPool: () => true,
        lastActivatedMs: { pinned: 0, audio: 0, ok: 0 },
        idleMs: 5_000,
        protected: (t) => t.isPinned || t.isPlayingAudio,
        now,
      }),
    ).toEqual(['ok']);
  });
  it('returns [] when nothing is idle', () => {
    expect(
      applyIdlePass({
        tabs: [tab('fresh')],
        protectedActiveTabIds: new Set(),
        inPool: () => true,
        lastActivatedMs: { fresh: 9_500 },
        idleMs: 5_000,
        protected: () => false,
        now,
      }),
    ).toEqual([]);
  });
  it('never suspends a tab with no recorded activation (idleMs=0 / memory pass)', () => {
    expect(
      applyIdlePass({
        tabs: [tab('never'), tab('old')],
        protectedActiveTabIds: new Set(),
        inPool: () => true,
        lastActivatedMs: { old: 0 }, // 'never' has no entry
        idleMs: 0,
        protected: (t) => t.isPinned || t.isPlayingAudio,
        now,
      }),
    ).toEqual(['old']); // never-activated tab is excluded; genuinely-old activated tab still selected
  });
  // idleMs=0（内存压力 pass）语义：不按闲置时长过滤——即使最近激活的记录 tab 也会被选中。
  // 这验证 applyIdlePass 保留 idleMs=0 的内存语义；"Off/阈值<=0 不发起闲置挂起"由 hook 层
  // 以 idleMs > 0 门控实现（见 useBrowserSuspendScheduler tick()），而非在此处改 applyIdlePass。
  it('idleMs=0 (memory pass) still returns a recently-activated recorded tab', () => {
    expect(
      applyIdlePass({
        tabs: [tab('recent')],
        protectedActiveTabIds: new Set(),
        inPool: () => true,
        lastActivatedMs: { recent: now }, // 刚激活也满足 now - ms >= 0
        idleMs: 0,
        protected: (t) => t.isPinned || t.isPlayingAudio,
        now,
      }),
    ).toEqual(['recent']);
  });
  it('skips downloading tabs when protected includes isDownloading', () => {
    expect(
      applyIdlePass({
        tabs: [tab('downloading', { isDownloading: true }), tab('ok')],
        protectedActiveTabIds: new Set(),
        inPool: () => true,
        lastActivatedMs: { downloading: 0, ok: 0 },
        idleMs: 5_000,
        protected: (t) => t.isPinned || t.isPlayingAudio || t.isDownloading,
        now,
      }),
    ).toEqual(['ok']);
  });
});

describe('useBrowserSuspendScheduler whitelist (事项 4)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function seedHook(tabs: BrowserTabState[], activeTabId: string) {
    useAppStore.setState({
      appInfo: {
        appName: 'test',
        version: '0.0.0',
        config: {
          browserInactiveTabSuspendMs: 1,
          browserSuspendWhitelistEnabled: true,
          browserSuspendWhitelist: [{ origin: 'https://keep.example.com' }],
        },
      },
      browserTabs: tabs,
      browserActiveTabId: activeTabId,
      centerTabs: [],
      centerActiveTabId: '',
    } as never);
  }

  const hookTabs = () => [
    tab('w', { url: 'https://keep.example.com/a?x=1' }),
    tab('y', { url: 'https://other.example.com/' }),
  ];

  it('never suspends whitelisted origins but suspends other idle tabs', () => {
    vi.useFakeTimers();
    const removeFromPool = vi.fn(async (_tabId: string) => {});
    seedHook(hookTabs(), 'w');
    const hook = renderHook(() =>
      useBrowserSuspendScheduler({
        isVisible: true,
        removeFromPool,
        isTabInPool: () => true,
      }),
    );
    // tick1 记录 w；切到 y 再跑一轮记录 y；最后全不活跃，两者都满足闲置阈值。
    useAppStore.setState({ browserActiveTabId: 'y' });
    vi.advanceTimersByTime(20_000);
    useAppStore.setState({ browserActiveTabId: '' });
    vi.advanceTimersByTime(20_000);
    const suspended = removeFromPool.mock.calls.map((call) => call[0]);
    expect(suspended).toContain('y');
    expect(suspended).not.toContain('w');
    hook.unmount();
  });

  it('suspends whitelisted origins while the switch is off', () => {
    vi.useFakeTimers();
    const removeFromPool = vi.fn(async (_tabId: string) => {});
    seedHook(hookTabs(), 'w');
    useAppStore.setState({
      appInfo: {
        ...(useAppStore.getState().appInfo as object),
        config: {
          ...(useAppStore.getState().appInfo?.config as object),
          browserSuspendWhitelistEnabled: false,
        },
      } as never,
    });
    const hook = renderHook(() =>
      useBrowserSuspendScheduler({
        isVisible: true,
        removeFromPool,
        isTabInPool: () => true,
      }),
    );
    useAppStore.setState({ browserActiveTabId: 'y' });
    vi.advanceTimersByTime(20_000);
    useAppStore.setState({ browserActiveTabId: '' });
    vi.advanceTimersByTime(20_000);
    const suspended = removeFromPool.mock.calls.map((call) => call[0]);
    expect(suspended).toContain('w');
    expect(suspended).toContain('y');
    hook.unmount();
  });
});
