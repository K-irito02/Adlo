import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as mod from '../useBrowserPageMeta';
import { useAppStore } from '@stores/slicedStore';
import * as siteMetaCache from '@utils/siteMetaCache';
import { pageMetaClient } from '@utils/pageMetaClient';
import { historyDedupKey } from '@utils/browserDisplayUtils';
import type { PageMetaUpdatedPayload } from '@shared/ipc/browser';

const { applyBroadcastTitle, titleSourceRef } = mod;

vi.mock('@utils/pageMetaClient', () => ({
  pageMetaClient: {
    subscribeUpdated: vi.fn(),
    report: vi.fn(),
  },
}));

let capturedListener: ((p: PageMetaUpdatedPayload) => void) | undefined;

describe('useBrowserPageMeta history title dedup (⑤)', () => {
  beforeEach(async () => {
    capturedListener = undefined;
    vi.mocked(pageMetaClient.subscribeUpdated).mockImplementation((cb) => {
      capturedListener = cb;
      return () => {};
    });
    vi.mocked(pageMetaClient.report).mockReset();
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
    useAppStore.setState({
      browserTabs: [],
      browserHistory: [
        { id: 'h1', url: 'https://example.com/page#section', title: 'Old', visitedAt: Date.now() },
      ],
    });
  });

  afterEach(() => {
    useAppStore.setState({ browserHistory: [], browserTabs: [] });
  });

  it('broadcast for a hash-variant URL updates the dedup-matching history entry title', () => {
    renderHook(() => mod.useBrowserPageMeta());
    expect(capturedListener).toBeDefined();
    act(() => {
      capturedListener!({
        url: 'https://example.com/page#section',
        title: 'NewTitle',
        faviconUrl: '',
        faviconDataUri: '',
        source: 'http',
      });
    });
    const entry = useAppStore
      .getState()
      .browserHistory.find(
        (h) => historyDedupKey(h.url) === historyDedupKey('https://example.com/page'),
      );
    expect(entry?.title).toBe('NewTitle');
  });
});

describe('useBrowserPageMeta handlePageMeta http(s) guard (⑩)', () => {
  beforeEach(async () => {
    vi.mocked(pageMetaClient.report).mockReset();
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
    useAppStore.setState({
      browserTabs: [
        {
          id: 'tab1',
          workspaceId: 'ws1',
          title: '',
          url: 'https://example.com/',
          titleResolved: false,
          isPinned: false,
          sortOrder: 0,
          isPlayingAudio: false,
          isAudioMuted: false,
          isDownloading: false,
        },
      ],
      browserActiveTabId: 'tab1',
      browserHistory: [],
    });
  });

  afterEach(() => {
    useAppStore.setState({ browserHistory: [], browserTabs: [], browserActiveTabId: '' });
    titleSourceRef.clear();
  });

  it('non-http(s) meta url is ignored: no tab/history update and no report', () => {
    const { result } = renderHook(() => mod.useBrowserPageMeta());
    act(() => {
      result.current.handlePageMeta({ url: 'about:blank', title: 'X', favicon: '' });
    });
    expect(useAppStore.getState().browserTabs[0].title).toBe('');
    expect(vi.mocked(pageMetaClient.report)).not.toHaveBeenCalled();
    expect(siteMetaCache.getCachedSiteMeta('about:blank')).toBeUndefined();
  });

  it('http(s) meta url is processed normally', () => {
    const { result } = renderHook(() => mod.useBrowserPageMeta());
    act(() => {
      result.current.handlePageMeta({
        url: 'https://example.com/',
        title: '真实标题',
        favicon: '',
      });
    });
    expect(useAppStore.getState().browserTabs[0].title).toBe('真实标题');
    expect(vi.mocked(pageMetaClient.report)).toHaveBeenCalledTimes(1);
  });
});

describe('applyBroadcastTitle (light app gate)', () => {
  it('applyBroadcastTitle: placeholder tab is filled by com broadcast', () => {
    expect(applyBroadcastTitle({ title: '', id: 't1' }, 'https://a.com/', '新标题', 'com')).toBe(
      true,
    );
    expect(
      applyBroadcastTitle({ title: 'a.com', id: 't1' }, 'https://a.com/', '新标题', 'com'),
    ).toBe(true);
  });

  it('applyBroadcastTitle: http/iframe overwrites anything', () => {
    expect(
      applyBroadcastTitle({ title: '真实', id: 't1' }, 'https://a.com/', '新标题', 'http'),
    ).toBe(true);
  });

  it('applyBroadcastTitle: com does not overwrite http-sourced title', () => {
    titleSourceRef.set('t1', 'http');
    expect(
      applyBroadcastTitle(
        { title: '真实', id: 't1' },
        'https://a.com/',
        '陈旧',
        'com',
        titleSourceRef.get('t1'),
      ),
    ).toBe(false);
  });
});
