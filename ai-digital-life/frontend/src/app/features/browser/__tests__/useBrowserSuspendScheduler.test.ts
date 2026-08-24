import { describe, expect, it } from 'vitest';
import { applyIdlePass } from '../useBrowserSuspendScheduler';
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
  ...patch,
});

describe('applyIdlePass (idle)', () => {
  const now = 10_000;
  it('suspends idle unprotected inactive in-pool tabs, oldest first', () => {
    expect(
      applyIdlePass({
        tabs: [tab('old'), tab('new'), tab('active')],
        activeTabId: 'active',
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
        activeTabId: 'none',
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
        activeTabId: 'none',
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
        activeTabId: 'none',
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
        activeTabId: 'none',
        inPool: () => true,
        lastActivatedMs: { recent: now }, // 刚激活也满足 now - ms >= 0
        idleMs: 0,
        protected: (t) => t.isPinned || t.isPlayingAudio,
        now,
      }),
    ).toEqual(['recent']);
  });
});
