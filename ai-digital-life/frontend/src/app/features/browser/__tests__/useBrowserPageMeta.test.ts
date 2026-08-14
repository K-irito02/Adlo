import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useBrowserPageMeta,
  isPlaceholderTitle,
  shouldApplyExactMatchTitle,
} from '../useBrowserPageMeta';
import { existingFaviconBaseline } from '../faviconQuality';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import * as siteMetaCache from '@utils/siteMetaCache';

// Global store reset: useBrowserPageMeta reads/writes the module-level
// useAppStore singleton. Every test must start from a clean store regardless of
// which describe block runs (or whether a prior block's async side effects
// leaked), so per-describe resets are insufficient on their own. Also clear the
// persisted localStorage slice: browser tab mutations write through to storage,
// and a fresh store hydration (e.g. a re-imported module in a reused worker)
// would otherwise read a stale tab left behind by an earlier test.
beforeEach(() => {
  useAppStore.setState({
    browserTabs: [],
    browserActiveTabId: undefined,
    browserHistory: [],
    browserTabFolders: [],
    browserBookmarks: [],
    browserWorkspaceBookmarks: {},
  });
  try {
    window.localStorage.removeItem('adl-ui:browser-tabs');
    window.localStorage.removeItem('adl-ui:browser-active-tab');
    window.localStorage.removeItem('adl-ui:browser-tab-folders');
    window.localStorage.removeItem('adl-ui:browser-bookmarks');
    window.localStorage.removeItem('adl-ui:browser-bookmark-tabid-url-map');
  } catch {
    /* localStorage unavailable */
  }
});

describe('existingFaviconBaseline (quality-gate baseline helper)', () => {
  it('prefers the data-URI over the URL', () => {
    expect(
      existingFaviconBaseline({
        faviconDataUri: 'data:image/png;base64,AA',
        faviconUrl: 'https://a.com/favicon.ico',
      }),
    ).toBe('data:image/png;base64,AA');
  });

  it('falls back to the URL when no data-URI exists', () => {
    expect(
      existingFaviconBaseline({ faviconDataUri: '', faviconUrl: 'https://a.com/favicon.ico' }),
    ).toBe('https://a.com/favicon.ico');
  });

  it('returns an empty string when the cache holds only an empty data-URI', () => {
    expect(existingFaviconBaseline({ faviconDataUri: '', faviconUrl: '' })).toBe('');
  });

  it('returns an empty string for undefined entries', () => {
    expect(existingFaviconBaseline(undefined)).toBe('');
  });
});

describe('meta source priority', () => {
  it('should allow higher priority to overwrite lower priority within TTL', () => {
    const processed = new Map<string, { timestamp: number; source: string }>();
    const TTL = 2000;
    const PRIORITY = { com: 4, iframe: 3, http: 2, google: 1 };

    function shouldProcess(url: string, source: string): boolean {
      const entry = processed.get(url);
      if (!entry) {
        return true;
      }
      if (Date.now() - entry.timestamp > TTL) {
        processed.delete(url);
        return true;
      }
      return (
        PRIORITY[source as keyof typeof PRIORITY] > PRIORITY[entry.source as keyof typeof PRIORITY]
      );
    }

    expect(shouldProcess('https://example.com', 'http')).toBe(true);
    processed.set('https://example.com', { timestamp: Date.now(), source: 'http' });

    expect(shouldProcess('https://example.com', 'com')).toBe(true);

    processed.set('https://example.com', { timestamp: Date.now(), source: 'com' });
    expect(shouldProcess('https://example.com', 'google')).toBe(false);
    expect(shouldProcess('https://example.com', 'http')).toBe(false);
    expect(shouldProcess('https://example.com', 'iframe')).toBe(false);
  });

  it('should allow same priority to overwrite after TTL expiry', async () => {
    const processed = new Map<string, { timestamp: number; source: string }>();
    const TTL = 50;
    const PRIORITY = { com: 4, iframe: 3, http: 2, google: 1 };

    function shouldProcess(url: string, source: string): boolean {
      const entry = processed.get(url);
      if (!entry) {
        return true;
      }
      if (Date.now() - entry.timestamp > TTL) {
        processed.delete(url);
        return true;
      }
      return (
        PRIORITY[source as keyof typeof PRIORITY] > PRIORITY[entry.source as keyof typeof PRIORITY]
      );
    }

    processed.set('https://example.com', { timestamp: Date.now() - 100, source: 'com' });
    await new Promise((r) => setTimeout(r, 10));
    expect(shouldProcess('https://example.com', 'google')).toBe(true);
  });
});

describe('isPlaceholderTitle', () => {
  it('treats an empty title as a placeholder', () => {
    expect(isPlaceholderTitle('', 'https://a.com')).toBe(true);
  });

  it('treats a title equal to the URL as a placeholder', () => {
    expect(isPlaceholderTitle('https://a.com/video', 'https://a.com/video')).toBe(true);
  });

  it('treats a raw http(s) URL title as a placeholder', () => {
    expect(isPlaceholderTitle('https://other.example/x', 'https://a.com/video')).toBe(true);
  });

  it('treats a real page title as non-placeholder', () => {
    expect(isPlaceholderTitle('第一个视频标题', 'https://a.com/video')).toBe(false);
  });

  it('treats the bare hostname as a placeholder (douyin.com regression)', () => {
    expect(isPlaceholderTitle('douyin.com', 'https://www.douyin.com/')).toBe(true);
    expect(isPlaceholderTitle('www.douyin.com', 'https://www.douyin.com/')).toBe(true);
  });

  it('does not treat an unrelated word as the hostname placeholder', () => {
    expect(isPlaceholderTitle('douyin.com', 'https://www.bilibili.com/')).toBe(false);
  });
});

describe('shouldApplyExactMatchTitle', () => {
  it('never applies an empty incoming title', () => {
    expect(shouldApplyExactMatchTitle('当前', 'https://a.com/video', '', 'com')).toBe(false);
    expect(shouldApplyExactMatchTitle('', 'https://a.com/video', '', 'http')).toBe(false);
  });

  it('applies http even when current title is already a real title (upgrade)', () => {
    expect(shouldApplyExactMatchTitle('旧标题', 'https://a.com/video', '新标题', 'http')).toBe(
      true,
    );
  });

  it('applies iframe when current title is already a real title (upgrade)', () => {
    expect(shouldApplyExactMatchTitle('旧标题', 'https://a.com/video', '新标题', 'iframe')).toBe(
      true,
    );
  });

  it('blocks com from clobbering an existing real title with a different stale title', () => {
    // Douyin regression: com reports the stale first-video title while the
    // URL advanced; the fetched http title must survive.
    expect(
      shouldApplyExactMatchTitle(
        '第一个视频标题',
        'https://douyin.com/video/2',
        '第二个视频标题',
        'com',
      ),
    ).toBe(false);
  });

  it('allows com to fill a placeholder current title', () => {
    expect(shouldApplyExactMatchTitle('', 'https://a.com/video', '真实标题', 'com')).toBe(true);
    expect(
      shouldApplyExactMatchTitle('https://a.com/video', 'https://a.com/video', '真实标题', 'com'),
    ).toBe(true);
  });

  it('allows com to upgrade a hostname placeholder current title (douyin regression)', () => {
    expect(
      shouldApplyExactMatchTitle(
        'douyin.com',
        'https://www.douyin.com/',
        '抖音-记录美好生活',
        'com',
      ),
    ).toBe(true);
  });

  it('blocks a hostname placeholder incoming title from being applied (douyin regression)', () => {
    expect(shouldApplyExactMatchTitle('', 'https://www.douyin.com/', 'douyin.com', 'com')).toBe(
      false,
    );
  });

  it('skips when incoming equals current (no-op)', () => {
    expect(shouldApplyExactMatchTitle('同名', 'https://a.com/video', '同名', 'http')).toBe(false);
  });

  it('blocks google from upgrading a real title', () => {
    expect(
      shouldApplyExactMatchTitle('真实标题', 'https://a.com/video', '谷歌标题', 'google'),
    ).toBe(false);
  });

  it('allows com to upgrade a com-sourced real title (real-time update, non-video site)', () => {
    // e.g. a chat/mail page whose document.title legally gains "(3)" — com is
    // allowed to update a title that itself came from com.
    expect(
      shouldApplyExactMatchTitle('收件箱', 'https://a.com/mail', '收件箱 (3)', 'com', 'com'),
    ).toBe(true);
  });

  it('allows com to upgrade a google-sourced real title (real-time update)', () => {
    expect(
      shouldApplyExactMatchTitle('页面标题', 'https://a.com/p', '页面标题 (2)', 'com', 'google'),
    ).toBe(true);
  });

  it('blocks com from overwriting an http-sourced real title (douyin regression stays)', () => {
    // The stale native title must never clobber a title actually fetched over
    // http for this URL — even when both are "real" titles.
    expect(
      shouldApplyExactMatchTitle(
        '第一个视频标题',
        'https://douyin.com/video/2',
        '第二个视频标题',
        'com',
        'http',
      ),
    ).toBe(false);
  });

  it('blocks com from overwriting an iframe-sourced real title', () => {
    expect(
      shouldApplyExactMatchTitle(
        '视频标题',
        'https://douyin.com/video/3',
        '别的标题',
        'com',
        'iframe',
      ),
    ).toBe(false);
  });

  it('treats an unknown current source conservatively (com cannot overwrite)', () => {
    // No provenance recorded (e.g. title was set before this hook mounted):
    // a stale com title must not overwrite it.
    expect(shouldApplyExactMatchTitle('已有标题', 'https://a.com/video', '新的标题', 'com')).toBe(
      false,
    );
  });
});

interface HandlePageMetaMeta {
  title: string;
  favicon: string;
  faviconDataUri?: string;
  url: string;
}

describe('useBrowserPageMeta write path (siteMetaCache mock backend)', () => {
  beforeEach(async () => {
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
    useAppStore.setState({
      browserTabs: [],
      browserActiveTabId: undefined,
      browserHistory: [],
      browserTabFolders: [],
      browserBookmarks: [],
      browserWorkspaceBookmarks: {},
    });
  });

  async function handle(meta: HandlePageMetaMeta, source?: 'com' | 'http' | 'iframe' | 'google') {
    const pendingNavigationsRef = { current: new Set<string>() };
    const { result } = renderHook(() => useBrowserPageMeta(pendingNavigationsRef));
    await act(async () => {
      result.current.handlePageMeta(meta, source ?? 'http');
    });
  }

  it('successful fetch writes a full entry via setCachedSiteMeta', async () => {
    await handle({
      title: 'X',
      favicon: 'https://x.com/f.png',
      faviconDataUri: 'data:image/png;base64,AAA',
      url: 'https://write-full.example',
    });
    const entry = siteMetaCache.getCachedSiteMeta('https://write-full.example')!;
    expect(entry).toMatchObject({
      title: 'X',
      faviconUrl: 'https://x.com/f.png',
      faviconDataUri: 'data:image/png;base64,AAA',
    });
    expect(typeof entry.fetchedAt).toBe('number');
  });

  it('meta with no title and no favicon (failed-fetch contract) does NOT write', async () => {
    await handle({ title: '', favicon: '', url: 'https://write-no-meta.example' });
    expect(siteMetaCache.getCachedSiteMeta('https://write-no-meta.example')).toBeUndefined();
  });

  it('meta with title but no favicon does NOT write (render falls back at draw time)', async () => {
    await handle({ title: 'X', favicon: '', url: 'https://write-title-only.example' });
    expect(siteMetaCache.getCachedSiteMeta('https://write-title-only.example')).toBeUndefined();
  });

  it('meta with favicon but empty faviconDataUri still caches title + faviconUrl', async () => {
    await handle({
      title: 'X',
      favicon: 'https://x.com/f.png',
      faviconDataUri: '',
      url: 'https://write-empty-datauri.example',
    });
    const entry = siteMetaCache.getCachedSiteMeta('https://write-empty-datauri.example')!;
    expect(entry.title).toBe('X');
    expect(entry.faviconUrl).toBe('https://x.com/f.png');
    expect(entry.faviconDataUri).toBe('');
  });

  it('keeps existing cached favicon data-URI (no write) when a URL-only favicon arrives', async () => {
    siteMetaCache.setCachedSiteMeta('https://write-keep-existing.example', {
      title: 'Old',
      faviconUrl: 'https://x.com/old.ico',
      faviconDataUri: 'data:image/png;base64,OLD',
      fetchedAt: 1,
    });
    await handle({
      title: 'X',
      favicon: 'https://x.com/better.png',
      faviconDataUri: '',
      url: 'https://write-keep-existing.example',
    });
    const entry = siteMetaCache.getCachedSiteMeta('https://write-keep-existing.example')!;
    expect(entry.faviconDataUri).toBe('data:image/png;base64,OLD');
    expect(entry.faviconUrl).toBe('https://x.com/old.ico');
    expect(entry.title).toBe('Old');
  });

  it('Google S2 favicon (low quality) does NOT overwrite a cached high-quality faviconUrl', async () => {
    siteMetaCache.setCachedSiteMeta('https://quality-s2.example', {
      title: 'Q',
      faviconUrl: 'https://cdn.example.com/icons/icon-512.png',
      faviconDataUri: '',
      fetchedAt: 1,
    });
    await handle({
      title: 'Q',
      favicon: 'https://www.google.com/s2/favicons?domain=quality-s2.example&sz=64',
      url: 'https://quality-s2.example',
    });
    const entry = siteMetaCache.getCachedSiteMeta('https://quality-s2.example')!;
    expect(entry.faviconUrl).toBe('https://cdn.example.com/icons/icon-512.png');
    expect(entry.faviconDataUri).toBe('');
  });

  it('favicon.ico (low quality) does NOT overwrite a cached high-quality faviconUrl', async () => {
    siteMetaCache.setCachedSiteMeta('https://quality-ico.example', {
      title: 'Q',
      faviconUrl: 'https://cdn.example.com/icons/icon-512.png',
      faviconDataUri: '',
      fetchedAt: 1,
    });
    await handle({
      title: 'Q',
      favicon: 'https://quality-ico.example/favicon.ico',
      url: 'https://quality-ico.example',
    });
    const entry = siteMetaCache.getCachedSiteMeta('https://quality-ico.example')!;
    expect(entry.faviconUrl).toBe('https://cdn.example.com/icons/icon-512.png');
  });

  it('dataUri-only cache + low-quality URL favicon does NOT write a faviconUrl', async () => {
    siteMetaCache.setCachedSiteMeta('https://quality-datauri-only.example', {
      title: 'Q',
      faviconUrl: '',
      faviconDataUri: 'data:image/png;base64,OLD',
      fetchedAt: 1,
    });
    await handle({
      title: 'Q',
      favicon: 'https://quality-datauri-only.example/favicon.ico',
      faviconDataUri: '',
      url: 'https://quality-datauri-only.example',
    });
    const entry = siteMetaCache.getCachedSiteMeta('https://quality-datauri-only.example')!;
    expect(entry.faviconUrl).toBe('');
    expect(entry.faviconDataUri).toBe('data:image/png;base64,OLD');
  });
});

describe('useBrowserPageMeta exactMatch duplicate-URL tabs', () => {
  function makeTab(id: string, url: string, title = ''): BrowserTabState {
    return {
      id,
      workspaceId: 'ws1',
      title,
      url,
      isPinned: false,
      sortOrder: 0,
      isPlayingAudio: false,
      isAudioMuted: false,
    };
  }

  beforeEach(async () => {
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
    useAppStore.setState({
      browserTabs: [],
      browserActiveTabId: undefined,
      browserHistory: [],
      browserTabFolders: [],
      browserBookmarks: [],
      browserWorkspaceBookmarks: {},
    });
  });

  async function fireMeta(title: string, url: string) {
    const pendingNavigationsRef = { current: new Set<string>() };
    const { result } = renderHook(() => useBrowserPageMeta(pendingNavigationsRef));
    await act(async () => {
      result.current.handlePageMeta({ title, favicon: '', url }, 'com');
    });
  }

  it('fills the title on BOTH duplicate-URL tabs, not just the first', async () => {
    const url = 'https://www.bilibili.com/video/BV1RSKJ6AE9R?t=7';
    useAppStore.setState({
      browserTabs: [makeTab('tab-a', url, ''), makeTab('tab-b', url, '')],
      browserActiveTabId: 'tab-b',
    });

    await fireMeta('标题A_bilibili', url);

    const tabs = useAppStore.getState().browserTabs;
    expect(tabs.find((t) => t.id === 'tab-a')?.title).toBe('标题A_bilibili');
    expect(tabs.find((t) => t.id === 'tab-b')?.title).toBe('标题A_bilibili');
  });

  it('leaves a duplicate tab title untouched when the incoming title is a placeholder', async () => {
    const url = 'https://www.bilibili.com/video/BV1RSKJ6AE9R?t=7';
    useAppStore.setState({
      browserTabs: [makeTab('tab-a', url, ''), makeTab('tab-b', url, '真实标题')],
      browserActiveTabId: 'tab-a',
    });

    // com reports the bare hostname (placeholder) — must NOT clobber tab-b's
    // real title, and should not fill tab-a with a placeholder either.
    await fireMeta('bilibili.com', url);

    const tabs = useAppStore.getState().browserTabs;
    expect(tabs.find((t) => t.id === 'tab-a')?.title).toBe('');
    expect(tabs.find((t) => t.id === 'tab-b')?.title).toBe('真实标题');
  });
});

describe('useBrowserPageMeta provenance state machine (single hook instance)', () => {
  function makeTab(id: string, url: string, title = ''): BrowserTabState {
    return {
      id,
      workspaceId: 'ws1',
      title,
      url,
      isPinned: false,
      sortOrder: 0,
      isPlayingAudio: false,
      isAudioMuted: false,
    };
  }

  beforeEach(async () => {
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
    useAppStore.setState({
      browserTabs: [],
      browserActiveTabId: undefined,
      browserHistory: [],
      browserTabFolders: [],
      browserBookmarks: [],
      browserWorkspaceBookmarks: {},
    });
  });

  function mount() {
    const pendingNavigationsRef = { current: new Set<string>() };
    const { result } = renderHook(() => useBrowserPageMeta(pendingNavigationsRef));
    return {
      handle: (meta: { title: string; url: string }, source: 'com' | 'http') =>
        act(async () => {
          result.current.handlePageMeta({ title: meta.title, favicon: '', url: meta.url }, source);
        }),
    };
  }

  it('allows com to update a title it established (real-time (3) unread badge)', async () => {
    const url = 'https://mail.example.com/inbox';
    useAppStore.setState({
      browserTabs: [makeTab('tab-mail', url, '')],
      browserActiveTabId: 'tab-mail',
    });
    const { handle } = mount();

    await handle({ title: '收件箱', url }, 'com');
    await handle({ title: '收件箱 (3)', url }, 'com');

    const tab = useAppStore.getState().browserTabs[0];
    expect(tab.title).toBe('收件箱 (3)');
  });

  it('blocks a stale com title from overwriting an http-fetched title (douyin regression)', async () => {
    const url = 'https://douyin.com/video/2';
    useAppStore.setState({
      browserTabs: [makeTab('tab-dy', url, '')],
      browserActiveTabId: 'tab-dy',
    });
    const { handle } = mount();

    // http prefetch establishes the correct fetched title first.
    await handle({ title: '第二个视频标题', url }, 'http');
    // A stale com (document.title still the first video) event arrives later.
    await handle({ title: '第一个视频标题', url }, 'com');

    const tab = useAppStore.getState().browserTabs[0];
    expect(tab.title).toBe('第二个视频标题');
  });

  it('keeps provenance per-tab: placeholder tab does not flip another tab http title', async () => {
    const url = 'https://www.bilibili.com/video/BV1RSKJ6AE9R?t=7';
    // tab-empty iterates FIRST: if provenance were shared per-URL, its com
    // write would flip the shared source to com and let the stale com title
    // clobber tab-fetched's http-fetched title. Per-tab keying must prevent it.
    useAppStore.setState({
      browserTabs: [makeTab('tab-empty', url, ''), makeTab('tab-fetched', url, '抓取标题')],
      browserActiveTabId: 'tab-empty',
    });
    const { handle } = mount();

    await handle({ title: '过期com标题', url }, 'com');

    const tabs = useAppStore.getState().browserTabs;
    expect(tabs.find((t) => t.id === 'tab-fetched')?.title).toBe('抓取标题');
  });

  it('blocks com once http established the title, per tab independently', async () => {
    const url = 'https://douyin.com/video/2';
    useAppStore.setState({
      browserTabs: [makeTab('tab-dy-a', url, ''), makeTab('tab-dy-b', url, '')],
      browserActiveTabId: 'tab-dy-a',
    });
    const { handle } = mount();

    // http prefetch establishes the correct fetched title on BOTH tabs
    // (http may always fill placeholders).
    await handle({ title: '第二个视频标题', url }, 'http');

    // A stale com event must not overwrite either http-fetched title.
    await handle({ title: '第一个视频标题', url }, 'com');

    const tabs = useAppStore.getState().browserTabs;
    expect(tabs.every((t) => t.title === '第二个视频标题')).toBe(true);
  });

  it('gates the title in the activeTab branch when a stale com event targets a new URL', async () => {
    const newUrl = 'https://douyin.com/video/2';
    const oldUrl = 'https://douyin.com/video/1';
    // The tab is on the OLD URL. First an http prefetch establishes the
    // authoritative title via the exactMatch branch (URL matches the tab), so
    // the tab's provenance becomes http. Then a stale com event for the NEW URL
    // arrives before onUrlChanged — the tab still shows the old URL, so it is
    // handled by the activeTab branch (not exactMatch). The com title must be
    // gated: the tab advances to the new URL but keeps the http-fetched title.
    useAppStore.setState({
      browserTabs: [makeTab('tab-old', oldUrl, '')],
      browserActiveTabId: 'tab-old',
    });
    const { handle } = mount();

    await handle({ title: '视频2标题', url: oldUrl }, 'http');
    await handle({ title: '视频1标题', url: newUrl }, 'com');

    const tab = useAppStore.getState().browserTabs[0];
    expect(tab.url).toBe(newUrl);
    expect(tab.title).toBe('视频2标题');
  });
});
