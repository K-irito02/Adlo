import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { consumeFreshAndDecideWebViewCreation } from '@features/browser/webViewLifecyclePolicy';

const reset = () =>
  useAppStore.setState({
    browserTabs: [],
    browserTabsById: {},
    browserActiveTabId: '',
    browserFreshTabIds: new Set<string>(),
    browserTabReferrers: {},
    browserShareProfile: true,
    browserBookmarkFolders: [],
    centerTabs: [],
    centerActiveTabId: '',
  });

function openSourceTab(url: string, host: 'center' | 'panel'): string {
  useAppStore.getState().browserOpenTab(url);
  const id = useAppStore.getState().browserActiveTabId;
  if (host === 'center') {
    useAppStore.getState().centerShowBrowserTab(id);
  }
  return id;
}

describe('browserOpenNewWindowTab', () => {
  beforeEach(reset);

  it('opens a center tab when the request comes from a center page', () => {
    const sourceId = openSourceTab('https://source.example/', 'center');
    const centerBefore = useAppStore.getState().centerTabs.length;

    useAppStore
      .getState()
      .browserOpenNewWindowTab({ tabId: sourceId, url: 'https://target.example/page' });

    const state = useAppStore.getState();
    const target = state.browserTabs.find((tab) => tab.url === 'https://target.example/page');
    expect(target).toBeTruthy();
    expect(target?.location).toBe('center');
    expect(state.centerTabs).toHaveLength(centerBefore + 1);
    expect(state.centerTabs.some((tab) => tab.refId === target?.id)).toBe(true);
    expect(state.centerActiveTabId).toBe(
      state.centerTabs.find((tab) => tab.refId === target?.id)?.id,
    );
    expect(state.browserActiveTabId).not.toBe(target?.id);
    expect(state.browserFreshTabIds.has(target!.id)).toBe(true);
  });

  it('keeps a panel page request in the panel', () => {
    const sourceId = openSourceTab('https://source.example/', 'panel');
    const centerBefore = useAppStore.getState().centerTabs.length;

    useAppStore
      .getState()
      .browserOpenNewWindowTab({ tabId: sourceId, url: 'https://target.example/page' });

    const state = useAppStore.getState();
    const target = state.browserTabs.find((tab) => tab.url === 'https://target.example/page');
    expect(target).toBeTruthy();
    expect(target?.location).toBeUndefined();
    expect(state.centerTabs).toHaveLength(centerBefore);
    expect(state.browserFreshTabIds.has(target!.id)).toBe(true);
  });

  it('falls back to the panel when the source tab is unknown', () => {
    useAppStore
      .getState()
      .browserOpenNewWindowTab({ tabId: 'missing', url: 'https://target.example/page' });

    const state = useAppStore.getState();
    const target = state.browserTabs.find((tab) => tab.url === 'https://target.example/page');
    expect(target?.location).toBeUndefined();
    expect(state.centerTabs).toHaveLength(0);
  });

  it('marks a center download-URL tab fresh so the lifecycle is told not to suppress it', () => {
    const sourceId = openSourceTab('https://source.example/', 'center');

    useAppStore
      .getState()
      .browserOpenNewWindowTab({ tabId: sourceId, url: 'https://example.com/package.zip' });

    const state = useAppStore.getState();
    const target = state.browserTabs.find((tab) => tab.url === 'https://example.com/package.zip');
    expect(target?.location).toBe('center');
    expect(state.browserFreshTabIds.has(target!.id)).toBe(true);
    expect(consumeFreshAndDecideWebViewCreation(target!.id, target!.url)).toEqual({
      isFresh: true,
      suppressDownload: false,
    });
  });

  it('consumes the fresh marker exactly once', () => {
    useAppStore.getState().browserMarkTabFresh('tab-1');
    expect(useAppStore.getState().browserConsumeTabFresh('tab-1')).toBe(true);
    expect(useAppStore.getState().browserConsumeTabFresh('tab-1')).toBe(false);
  });

  it('browserOpenTab snapshots the shared-profile setting at creation time', () => {
    useAppStore.setState({ browserShareProfile: false });
    useAppStore.getState().browserOpenTab('https://example.com');
    expect(useAppStore.getState().browserTabs[0].shareProfile).toBe(false);
  });

  it('stores the referrer once for the new tab and consumes it on WebView creation', () => {
    const sourceId = openSourceTab('https://source.example/list', 'panel');

    useAppStore.getState().browserOpenNewWindowTab({
      tabId: sourceId,
      url: 'https://target.example/page',
      referrer: 'https://source.example/list',
    });

    const target = useAppStore
      .getState()
      .browserTabs.find((tab) => tab.url === 'https://target.example/page');
    expect(target).toBeTruthy();
    expect(useAppStore.getState().browserTabReferrers[target!.id]).toBe(
      'https://source.example/list',
    );
    expect(useAppStore.getState().browserConsumeTabReferrer(target!.id)).toBe(
      'https://source.example/list',
    );
    expect(useAppStore.getState().browserConsumeTabReferrer(target!.id)).toBeUndefined();
  });

  it('drops the pending referrer when the new tab is closed', () => {
    const sourceId = openSourceTab('https://source.example/list', 'panel');
    useAppStore.getState().browserOpenNewWindowTab({
      tabId: sourceId,
      url: 'https://target.example/page',
      referrer: 'https://source.example/list',
    });
    const target = useAppStore
      .getState()
      .browserTabs.find((tab) => tab.url === 'https://target.example/page');
    expect(useAppStore.getState().browserTabReferrers[target!.id]).toBe(
      'https://source.example/list',
    );

    useAppStore.getState().browserCloseTab(target!.id);

    expect(useAppStore.getState().browserTabReferrers[target!.id]).toBeUndefined();
  });

  it('drops panel referrers when all panel tabs are closed', () => {
    const sourceId = openSourceTab('https://source.example/list', 'panel');
    useAppStore.getState().browserOpenNewWindowTab({
      tabId: sourceId,
      url: 'https://target.example/page',
      referrer: 'https://source.example/list',
    });
    const target = useAppStore
      .getState()
      .browserTabs.find((tab) => tab.url === 'https://target.example/page');
    expect(useAppStore.getState().browserTabReferrers[target!.id]).toBeTruthy();

    useAppStore.getState().browserCloseAllTabs();

    expect(useAppStore.getState().browserTabReferrers[target!.id]).toBeUndefined();
  });
});
