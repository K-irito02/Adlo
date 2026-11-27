import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { useBrowserDownloads } from './useBrowserDownloads';
import type { DownloadRecord } from '@shared/ipc/download';

describe('useBrowserDownloads', () => {
  beforeEach(() => {
    useAppStore.setState({ isTauri: false, downloads: [] });
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

  it('refreshes file states when downloadSettings.default_path changes', async () => {
    const refreshDownloadFileStates = vi.fn();
    useAppStore.setState({
      isTauri: true,
      downloads: [],
      downloadSettings: {
        mode: 'auto',
        default_path: '/old',
        auto_migrate_on_path_change: false,
      },
      refreshDownloadFileStates,
    });

    const { unmount } = renderHook(() => useBrowserDownloads());

    act(() =>
      useAppStore.setState({
        downloads: [{ id: 'd1' }, { id: 'd2' }] as DownloadRecord[],
      }),
    );

    expect(refreshDownloadFileStates).not.toHaveBeenCalled();

    act(() =>
      useAppStore.setState({
        downloadSettings: {
          mode: 'auto',
          default_path: '/new',
          auto_migrate_on_path_change: false,
        },
      }),
    );

    await waitFor(() => expect(refreshDownloadFileStates).toHaveBeenCalledTimes(1));
    expect(refreshDownloadFileStates).toHaveBeenCalledWith(['d1', 'd2']);

    unmount();
  });

  it('throttles window focus refreshes to 2 seconds', async () => {
    vi.useFakeTimers();
    const refreshDownloadFileStates = vi.fn();
    useAppStore.setState({
      isTauri: true,
      downloads: [],
      refreshDownloadFileStates,
    });

    const { unmount } = renderHook(() => useBrowserDownloads());

    act(() =>
      useAppStore.setState({
        downloads: [{ id: 'd1' }] as DownloadRecord[],
      }),
    );

    act(() => window.dispatchEvent(new Event('focus')));
    expect(refreshDownloadFileStates).toHaveBeenCalledTimes(1);

    act(() => window.dispatchEvent(new Event('focus')));
    expect(refreshDownloadFileStates).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(2000));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(refreshDownloadFileStates).toHaveBeenCalledTimes(2);

    unmount();
    vi.useRealTimers();
  });
});
