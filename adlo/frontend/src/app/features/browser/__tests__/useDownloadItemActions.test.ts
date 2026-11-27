import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDownloadItemActions } from '../useDownloadItemActions';
import { useAppStore } from '@stores/slicedStore';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import type { DownloadRecord } from '@shared/ipc/download';

const mockT = {
  browserToastActionFailed: 'Action failed',
};

const mockRedownloadDownload = vi.fn();
const mockShowToast = vi.fn();

function makeRecord(overrides: Partial<DownloadRecord> = {}): DownloadRecord {
  return {
    id: 'dl-1',
    url: 'https://example.com/file.zip',
    file_name: 'file.zip',
    file_path: '/downloads/file.zip',
    total_bytes: 1000,
    bytes_received: 1000,
    mime_type: 'application/zip',
    status: 'completed',
    interrupt_reason: null,
    created_at: Date.now() / 1000,
    completed_at: Date.now() / 1000,
    source_tab_id: null,
    resumable: null,
    ...overrides,
  };
}

describe('useDownloadItemActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      redownloadDownload: mockRedownloadDownload,
      showToast: mockShowToast,
    });
  });

  it('calls redownloadDownload with id and tabId when tabId is provided', async () => {
    mockRedownloadDownload.mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useDownloadItemActions('tab-1'), {
      wrapper: ({ children }) => TCopyProvider({ t: mockT as any, locale: 'en-US', children }),
    });
    await act(async () => {
      await result.current.handleRedownload(makeRecord());
    });
    expect(mockRedownloadDownload).toHaveBeenCalledWith('dl-1', 'tab-1');
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('calls redownloadDownload with id and undefined when tabId is omitted', async () => {
    mockRedownloadDownload.mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useDownloadItemActions(), {
      wrapper: ({ children }) => TCopyProvider({ t: mockT as any, locale: 'en-US', children }),
    });
    await act(async () => {
      await result.current.handleRedownload(makeRecord());
    });
    expect(mockRedownloadDownload).toHaveBeenCalledWith('dl-1', undefined);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('shows error toast when redownload fails', async () => {
    mockRedownloadDownload.mockResolvedValueOnce({
      ok: false,
      error: { code: 'Internal', message: 'boom' },
    });
    const { result } = renderHook(() => useDownloadItemActions('tab-1'), {
      wrapper: ({ children }) => TCopyProvider({ t: mockT as any, locale: 'en-US', children }),
    });
    await act(async () => {
      await result.current.handleRedownload(makeRecord());
    });
    expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('shows error toast when redownload throws', async () => {
    mockRedownloadDownload.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useDownloadItemActions('tab-1'), {
      wrapper: ({ children }) => TCopyProvider({ t: mockT as any, locale: 'en-US', children }),
    });
    await act(async () => {
      await result.current.handleRedownload(makeRecord());
    });
    expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });
});
