import { describe, it, expect } from 'vitest';
import { applyIdlePass, collectProtectedActiveTabIds } from '../useBrowserSuspendScheduler';
import type { BrowserTabState } from '@stores/slices/browserSlice';

const tab = (id: string, patch: Partial<BrowserTabState> = {}): BrowserTabState => ({
  id,
  workspaceId: '',
  title: id,
  url: 'https://x.test',
  titleResolved: true,
  isPinned: false,
  sortOrder: 0,
  isPlayingAudio: false,
  isAudioMuted: false,
  isDownloading: false,
  ...patch,
});

describe('面板挂起调度保护中心活动标签（dsh 标签按普通标签处理）', () => {
  it('受保护集合覆盖面板活动与中心活动浏览器标签，不含非活动标签', () => {
    const ids = collectProtectedActiveTabIds({
      browserTabs: [
        tab('panel'),
        tab('center', { location: 'center' }),
        tab('other-center', { location: 'center' }),
      ],
      browserActiveTabId: 'panel',
      centerTabs: [
        { id: 'c1', kind: 'launcher', refId: null },
        { id: 'c2', kind: 'browser', refId: 'center' },
      ],
      centerActiveTabId: 'c2',
    });
    expect(ids.has('panel')).toBe(true);
    expect(ids.has('center')).toBe(true);
    // 非活动的中心标签不享受额外保护（dsh 标签已改为普通标签）。
    expect(ids.has('other-center')).toBe(false);
  });

  it('applyIdlePass 只把真正闲置的面板标签判为可挂起', () => {
    const state = {
      browserTabs: [tab('panel'), tab('center')],
      browserActiveTabId: 'panel',
      centerTabs: [{ id: 'c2', kind: 'browser', refId: 'center' }],
      centerActiveTabId: 'c2',
    };
    const ids = applyIdlePass({
      tabs: [...state.browserTabs, tab('idle')],
      protectedActiveTabIds: collectProtectedActiveTabIds(state),
      inPool: () => true,
      lastActivatedMs: { panel: 0, center: 0, idle: 0 },
      idleMs: 5_000,
      protected: () => false,
      now: 10_000,
    });
    expect(ids).toEqual(['idle']);
  });
});
