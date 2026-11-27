import { createRef, type MutableRefObject } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserTabState } from '@stores/slices/browserSlice';

const consume = vi.hoisted(() => vi.fn());

vi.mock('./webViewLifecyclePolicy', () => ({
  consumeFreshAndDecideWebViewCreation: consume,
}));
vi.mock('@shared/env', () => ({ isTauriShell: () => true }));
vi.mock('./useBrowserThemeSync', () => ({ getResolvedTheme: () => 'light' }));
vi.mock('./browserPoolSingleton', () => ({
  shouldHostHideTab: () => true,
  browserPool: { destroyTab: vi.fn().mockResolvedValue(undefined) },
}));

import { useWebViewLifecycle } from './useWebViewLifecycle';
import { useAppStore } from '@stores/slicedStore';
import { rememberDownloadSource, resetDownloadOnlyTabsForTest } from './downloadOnlyTabs';

function tab(id: string, url: string): BrowserTabState {
  return {
    id,
    workspaceId: '',
    title: '',
    url,
    titleResolved: true,
    isPinned: false,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
    isDownloading: false,
  };
}

function setup(activeTab: BrowserTabState) {
  const createWebViewForTab = vi.fn().mockResolvedValue(null);
  const activateTabInPool = vi.fn().mockResolvedValue(undefined);
  const webViewActiveRef = createRef<boolean>() as MutableRefObject<boolean>;
  webViewActiveRef.current = false;
  const overlayActiveRef = createRef<boolean>() as MutableRefObject<boolean>;
  overlayActiveRef.current = false;

  const view = renderHook(() =>
    useWebViewLifecycle({
      hostId: 'panel',
      activeTab,
      webViewDisabled: false,
      isTabInPool: () => false,
      createWebViewForTab,
      activateTabInPool,
      webViewActiveRef,
      overlayActiveRef,
      updateWebViewBounds: vi.fn(),
    }),
  );
  return { ...view, createWebViewForTab, activateTabInPool };
}

describe('useWebViewLifecycle fresh consumption', () => {
  beforeEach(() => {
    consume.mockReset();
  });

  it('asks the policy before suppressing a download-URL WebView', async () => {
    consume.mockReturnValue({ isFresh: false, suppressDownload: true });
    const { createWebViewForTab } = setup(tab('t1', 'https://example.com/a.zip'));

    await waitFor(() => {
      expect(consume).toHaveBeenCalledWith('t1', 'https://example.com/a.zip');
    });
    expect(createWebViewForTab).not.toHaveBeenCalled();
  });

  it('creates the WebView when the policy reports a fresh tab', async () => {
    consume.mockReturnValue({ isFresh: true, suppressDownload: false });
    const { createWebViewForTab } = setup(tab('t2', 'https://example.com/a.zip'));

    await waitFor(() => {
      expect(createWebViewForTab).toHaveBeenCalledWith(
        't2',
        'https://example.com/a.zip',
        'light',
        'panel',
        undefined,
      );
    });
  });
});

describe('download-only tab lifecycle', () => {
  beforeEach(() => {
    resetDownloadOnlyTabsForTest();
    consume.mockReturnValue({ isFresh: true, suppressDownload: false });
    useAppStore.setState({
      browserTabs: [],
      browserTabsById: {},
      browserActiveTabId: '',
      centerTabs: [],
      centerActiveTabId: '',
      downloads: [],
    });
  });

  it('returns to the source and closes on completion', async () => {
    const source = tab('source', 'https://example.com/');
    const download = tab('dl', 'https://example.com/package.zip');
    useAppStore.setState({
      browserTabs: [source, download],
      browserTabsById: { source, dl: download },
      browserActiveTabId: 'dl',
      centerTabs: [],
      centerActiveTabId: '',
      downloads: [
        {
          id: 'd1',
          url: 'https://example.com/package.zip',
          file_name: 'package.zip',
          file_path: '',
          total_bytes: 10,
          bytes_received: 1,
          mime_type: null,
          status: 'in_progress',
          interrupt_reason: null,
          created_at: 0,
          completed_at: null,
          source_tab_id: 'dl',
        },
      ],
    });
    rememberDownloadSource('dl', 'source');

    setup(download);

    await waitFor(() => {
      expect(useAppStore.getState().browserActiveTabId).toBe('source');
    });

    useAppStore.setState((state) => ({
      downloads: state.downloads.map((d) => ({ ...d, status: 'completed' as const })),
    }));

    await waitFor(() => {
      expect(useAppStore.getState().browserTabs.map((t) => t.id)).toEqual(['source']);
    });
  });
});
