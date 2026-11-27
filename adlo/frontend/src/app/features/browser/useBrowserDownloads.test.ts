import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { useBrowserDownloads } from './useBrowserDownloads';

describe('useBrowserDownloads', () => {
  beforeEach(() => {
    useAppStore.setState({ isTauri: false });
  });

  it('subscribes download events after the Tauri bridge becomes ready', () => {
    const unsubscribe = vi.fn();
    const subscribeDownloadEvents = vi.fn(() => unsubscribe);
    const fetchDownloads = vi.fn();
    const fetchDownloadSettings = vi.fn();
    useAppStore.setState({
      isTauri: false,
      subscribeDownloadEvents,
      fetchDownloads,
      fetchDownloadSettings,
    });

    const { unmount } = renderHook(() => useBrowserDownloads());

    // App 根挂载时 isTauri 仍为 false：不能订阅一次就永久放弃。
    expect(subscribeDownloadEvents).not.toHaveBeenCalled();
    expect(fetchDownloads).not.toHaveBeenCalled();

    act(() => useAppStore.setState({ isTauri: true }));

    expect(subscribeDownloadEvents).toHaveBeenCalledTimes(1);
    expect(fetchDownloads).toHaveBeenCalledTimes(1);
    expect(fetchDownloadSettings).toHaveBeenCalledTimes(1);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
