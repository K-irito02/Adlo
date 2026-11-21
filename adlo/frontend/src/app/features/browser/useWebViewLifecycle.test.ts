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
vi.mock('./browserPoolSingleton', () => ({ shouldHostHideTab: () => true }));

import { useWebViewLifecycle } from './useWebViewLifecycle';

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
      );
    });
  });
});
