import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listen } from '@tauri-apps/api/event';
import {
  tabStillDownloading,
  updateTabsForDownloadState,
  createBrowserDownloadsSlice,
} from '../browserDownloadsSlice';
import type { DownloadRecord, DownloadFileState } from '@shared/ipc/download';
import type { BrowserTabState } from '../browserTypes';
import type { StoreState } from '../../StoreState';
import {
  consumeDownloadSource,
  resetDownloadOnlyTabsForTest,
} from '@features/browser/downloadOnlyTabs';
import { downloadResetFailureCopy } from '@features/storage-settings/downloadPathReset';
import { zhCN } from '@i18n/zh-CN/index';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

beforeEach(() => {
  mockInvoke.mockReset();
  vi.mocked(listen).mockReset();
});

function download(overrides: Partial<DownloadRecord>): DownloadRecord {
  return {
    id: 'd1',
    url: 'https://example.com/file.zip',
    file_name: 'file.zip',
    file_path: '/tmp/file.zip',
    total_bytes: null,
    bytes_received: 0,
    mime_type: null,
    status: 'in_progress',
    interrupt_reason: null,
    created_at: 0,
    completed_at: null,
    source_tab_id: 'tab-1',
    ...overrides,
  };
}

function tab(id: string, isDownloading: boolean): BrowserTabState {
  return {
    id,
    url: '',
    title: '',
    isDownloading,
  } as BrowserTabState;
}

describe('browserDownloadsSlice — blob failure toast', () => {
  it('uses the resolved system language and shows the English toast', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
    const showToast = vi.fn();
    let state = {} as never;
    const set = (partial: unknown) => {
      const next =
        typeof partial === 'function'
          ? (partial as (s: never) => Record<string, unknown>)(state)
          : (partial as Record<string, unknown>);
      state = { ...(state as Record<string, unknown>), ...next } as never;
    };
    const get = () => state;
    const slice = createBrowserDownloadsSlice(set as never, get as never);
    state = {
      ...slice,
      isTauri: true,
      showToast,
      appInfo: { config: { language: 'system' } },
      downloads: [],
      activeDownloads: {},
      browserTabs: [],
      browserTabsById: {},
    } as never;

    const handlers: ((event: { payload: Record<string, unknown> }) => void)[] = [];
    vi.mocked(listen).mockImplementation(((
      name: string,
      cb: (event: { payload: Record<string, unknown> }) => void,
    ) => {
      if (name === 'browser-download-error') {
        handlers.push(cb);
      }
      return Promise.resolve(() => {});
    }) as never);

    slice.subscribeDownloadEvents();
    handlers[0]({
      payload: {
        id: '',
        url: 'blob://local/x.bin',
        fileName: 'x.bin',
        reason: 'too large',
        canRetry: false,
      },
    });

    expect(showToast).toHaveBeenCalledWith('Download failed: x.bin', 'error');
  });

  it('does not toast when the error event matches an existing record', async () => {
    const showToast = vi.fn();
    let state = {} as never;
    const set = (partial: unknown) => {
      const next =
        typeof partial === 'function'
          ? (partial as (s: never) => Record<string, unknown>)(state)
          : (partial as Record<string, unknown>);
      state = { ...(state as Record<string, unknown>), ...next } as never;
    };
    const get = () => state;
    const slice = createBrowserDownloadsSlice(set as never, get as never);
    state = {
      ...slice,
      isTauri: true,
      showToast,
      appInfo: { config: { language: 'en-US' } },
      downloads: [download({ id: 'd1' })],
      activeDownloads: {},
      browserTabs: [],
      browserTabsById: {},
    } as never;

    const handlers: ((event: { payload: Record<string, unknown> }) => void)[] = [];
    vi.mocked(listen).mockImplementation(((
      name: string,
      cb: (event: { payload: Record<string, unknown> }) => void,
    ) => {
      if (name === 'browser-download-error') {
        handlers.push(cb);
      }
      return Promise.resolve(() => {});
    }) as never);

    slice.subscribeDownloadEvents();
    handlers[0]({
      payload: {
        id: 'd1',
        url: 'blob://local/x.bin',
        fileName: 'x.bin',
        reason: 'too large',
        canRetry: false,
      },
    });

    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('browserDownloadsSlice — tabStillDownloading', () => {
  it('returns false when there is no source tab', () => {
    expect(tabStillDownloading([download({ source_tab_id: null })], null)).toBe(false);
    expect(tabStillDownloading([], undefined)).toBe(false);
  });

  it('returns true when another in_progress download for the same tab remains', () => {
    const downloads = [
      download({ id: 'a', status: 'completed' }),
      download({ id: 'b', status: 'in_progress' }),
    ];
    expect(tabStillDownloading(downloads, 'tab-1')).toBe(true);
  });

  it('returns false when no in_progress download for the tab remains', () => {
    const downloads = [
      download({ id: 'a', status: 'completed' }),
      download({ id: 'b', status: 'failed' }),
    ];
    expect(tabStillDownloading(downloads, 'tab-1')).toBe(false);
  });

  it('ignores downloads from other tabs', () => {
    const downloads = [download({ id: 'other', status: 'in_progress', source_tab_id: 'tab-2' })];
    expect(tabStillDownloading(downloads, 'tab-1')).toBe(false);
  });

  it('treats paused downloads as not protecting the tab', () => {
    const downloads = [download({ id: 'a', status: 'paused' })];
    expect(tabStillDownloading(downloads, 'tab-1')).toBe(false);
  });
});

describe('browserDownloadsSlice — updateTabsForDownloadState', () => {
  it('keeps isDownloading true when the same tab still has an active download', () => {
    const tabs = [tab('tab-1', false)];
    const downloads = [
      download({ id: 'a', status: 'completed' }),
      download({ id: 'b', status: 'in_progress' }),
    ];
    const next = updateTabsForDownloadState(tabs, downloads, 'tab-1');
    expect(next[0].isDownloading).toBe(true);
  });

  it('clears isDownloading when no active download remains for the tab', () => {
    const tabs = [tab('tab-1', true)];
    const downloads = [download({ id: 'a', status: 'completed' })];
    const next = updateTabsForDownloadState(tabs, downloads, 'tab-1');
    expect(next[0].isDownloading).toBe(false);
  });

  it('leaves tabs untouched when no source tab is provided', () => {
    const tabs = [tab('tab-1', true)];
    const next = updateTabsForDownloadState(tabs, [], undefined);
    expect(next).toBe(tabs);
  });
});

describe('browserDownloadsSlice — initial state', () => {
  it('defaults to auto-save before first fetch', () => {
    const slice = createBrowserDownloadsSlice(
      () => undefined,
      () => ({}) as StoreState,
    );
    expect(slice.downloadSettings.mode).toBe('auto');
    expect(slice.downloadSettingsLoaded).toBe(false);
  });
});

describe('browserDownloadsSlice — fetchDownloadSettings ingest', () => {
  it('normalizes a missing auto_migrate field to false and marks loaded', async () => {
    mockInvoke.mockResolvedValue({
      ok: true,
      data: { mode: 'ask', default_path: 'D:/dl' },
    });
    let state = {} as StoreState;
    const set = (partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) => {
      state = {
        ...state,
        ...(typeof partial === 'function' ? partial(state) : partial),
      } as StoreState;
    };
    const slice = createBrowserDownloadsSlice(set, () => state);
    const ok = await slice.fetchDownloadSettings();
    expect(ok).toBe(true);
    expect(state.downloadSettings.auto_migrate_on_path_change).toBe(false);
    expect(state.downloadSettingsLoaded).toBe(true);
    mockInvoke.mockReset();
  });
});

function fileState(overrides: Partial<DownloadFileState> = {}): DownloadFileState {
  return {
    id: 'd1',
    exists: true,
    in_default_dir: true,
    error: null,
    ...overrides,
  };
}

function buildSlice(overrides: Record<string, unknown> = {}) {
  let state = {} as StoreState;
  const set = (partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) => {
    state = {
      ...state,
      ...(typeof partial === 'function' ? partial(state) : partial),
    } as StoreState;
  };
  const get = () => state;
  const slice = createBrowserDownloadsSlice(set, get);
  state = {
    ...slice,
    isTauri: true,
    browserOpenTab: vi.fn(),
    browserTabs: [],
    browserTabsById: {},
    downloads: [],
    activeDownloads: {},
    downloadFileStates: {},
    redownloadingIds: new Set<string>(),
    ...overrides,
  } as never;

  const handlers: Record<string, ((event: { payload: unknown }) => void)[]> = {};
  vi.mocked(listen).mockImplementation(((
    name: string,
    cb: (event: { payload: unknown }) => void,
  ) => {
    (handlers[name] ??= []).push(cb);
    return Promise.resolve(() => {});
  }) as never);

  return { slice, get, handlers };
}

describe('browserDownloadsSlice — refreshDownloadFileStates', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('calls download_file_states and maps results into downloadFileStates', async () => {
    mockInvoke.mockResolvedValue({
      ok: true,
      data: [
        fileState({ id: 'd1', exists: true, in_default_dir: false }),
        fileState({ id: 'd2', exists: false, in_default_dir: true, error: 'missing' }),
      ],
    });
    const { slice, get } = buildSlice();

    await slice.refreshDownloadFileStates(['d1', 'd2']);

    expect(mockInvoke).toHaveBeenCalledWith('download_file_states', { ids: ['d1', 'd2'] });
    expect(get().downloadFileStates['d1']).toEqual(
      fileState({ id: 'd1', exists: true, in_default_dir: false }),
    );
    expect(get().downloadFileStates['d2']).toEqual(
      fileState({ id: 'd2', exists: false, in_default_dir: true, error: 'missing' }),
    );
  });

  it('keeps the map unchanged when the command fails', async () => {
    mockInvoke.mockResolvedValue({ ok: false, error: { code: 'Internal', message: 'boom' } });
    const { slice, get } = buildSlice({
      downloadFileStates: { d1: fileState() },
    });

    await slice.refreshDownloadFileStates(['d1']);

    expect(get().downloadFileStates['d1']).toEqual(fileState());
  });
});

describe('browserDownloadsSlice — browser-download-started invalidation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('upserts by id and clears downloadFileStates and redownloadingIds for that id', async () => {
    const { slice, get, handlers } = buildSlice({
      downloads: [download({ id: 'd1', file_name: 'old.zip' }), download({ id: 'd2' })],
      downloadFileStates: { d1: fileState(), d2: fileState({ id: 'd2' }) },
      redownloadingIds: new Set(['d1']),
    });
    slice.subscribeDownloadEvents();

    handlers['browser-download-started']?.[0]({
      payload: download({ id: 'd1', file_name: 'new.zip' }),
    });

    const downloads = get().downloads;
    expect(downloads).toHaveLength(2);
    expect(downloads.find((d) => d.id === 'd1')?.file_name).toBe('new.zip');
    expect(downloads.find((d) => d.id === 'd2')).toBeDefined();
    expect(get().downloadFileStates['d1']).toBeUndefined();
    expect(get().downloadFileStates['d2']).toBeDefined();
    expect(get().redownloadingIds.has('d1')).toBe(false);
  });

  it('prepends a brand-new download record', async () => {
    const { slice, get, handlers } = buildSlice({
      downloads: [download({ id: 'd2' })],
    });
    slice.subscribeDownloadEvents();

    handlers['browser-download-started']?.[0]({
      payload: download({ id: 'd1' }),
    });

    const downloads = get().downloads;
    expect(downloads).toHaveLength(2);
    expect(downloads[0].id).toBe('d1');
  });
});

describe('browserDownloadsSlice — browser-download-finished invalidation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('success deletes the file state and schedules a single-id refresh', async () => {
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      data: [fileState({ id: 'd1', exists: true })],
    });
    const { slice, get, handlers } = buildSlice({
      downloads: [download({ id: 'd1', status: 'in_progress' })],
      activeDownloads: { d1: { id: 'd1', bytes_received: 0, speed: 0, estimated_end_time: null } },
      downloadFileStates: { d1: fileState() },
    });
    slice.subscribeDownloadEvents();

    handlers['browser-download-finished']?.[0]({
      payload: {
        id: 'd1',
        url: 'https://example.com/file.zip',
        filePath: '/tmp/file.zip',
        success: true,
      },
    });

    expect(get().downloadFileStates['d1']).toBeUndefined();
    expect(get().activeDownloads['d1']).toBeUndefined();

    // flush the scheduled refresh microtask
    await Promise.resolve();
    await Promise.resolve();

    expect(mockInvoke).toHaveBeenCalledWith('download_file_states', { ids: ['d1'] });
  });

  it('failure deletes the file state without scheduling a refresh', async () => {
    const { slice, get, handlers } = buildSlice({
      downloads: [download({ id: 'd1', status: 'in_progress' })],
      downloadFileStates: { d1: fileState() },
    });
    slice.subscribeDownloadEvents();

    handlers['browser-download-finished']?.[0]({
      payload: { id: 'd1', url: 'https://example.com/file.zip', filePath: '', success: false },
    });

    expect(get().downloadFileStates['d1']).toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();
    expect(mockInvoke).not.toHaveBeenCalledWith('download_file_states', expect.anything());
  });
});

describe('browserDownloadsSlice — other event invalidation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [
      'browser-download-error',
      { id: 'd1', url: '', fileName: '', reason: 'boom', canRetry: false },
    ],
    ['browser-download-paused', { id: 'd1' }],
    ['browser-download-canceled', { id: 'd1' }],
  ] as const)('%s deletes the file state for the id', (eventName, payload) => {
    const { slice, get, handlers } = buildSlice({
      downloads: [download({ id: 'd1', status: 'in_progress' })],
      activeDownloads: { d1: { id: 'd1', bytes_received: 0, speed: 0, estimated_end_time: null } },
      downloadFileStates: { d1: fileState() },
    });
    slice.subscribeDownloadEvents();

    handlers[eventName]?.[0]({ payload });

    expect(get().downloadFileStates['d1']).toBeUndefined();
  });
});

describe('browserDownloadsSlice — record/file removal clears file state', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('removeDownloadRecord deletes the corresponding state', async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: undefined });
    const { slice, get } = buildSlice({
      downloads: [download({ id: 'd1' }), download({ id: 'd2' })],
      downloadFileStates: { d1: fileState(), d2: fileState({ id: 'd2' }) },
      redownloadingIds: new Set(['d1']),
    });

    await slice.removeDownloadRecord('d1');

    expect(mockInvoke).toHaveBeenCalledWith('download_remove_record', { id: 'd1' });
    expect(get().downloads.map((d) => d.id)).toEqual(['d2']);
    expect(get().downloadFileStates['d1']).toBeUndefined();
    expect(get().downloadFileStates['d2']).toBeDefined();
    expect(get().redownloadingIds.has('d1')).toBe(false);
  });

  it('deleteDownloadFile deletes the corresponding state', async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: undefined });
    const { slice, get } = buildSlice({
      downloads: [download({ id: 'd1' })],
      downloadFileStates: { d1: fileState() },
      redownloadingIds: new Set(['d1']),
    });

    await slice.deleteDownloadFile('d1');

    expect(mockInvoke).toHaveBeenCalledWith('download_delete_file_and_record', { id: 'd1' });
    expect(get().downloads).toHaveLength(0);
    expect(get().downloadFileStates['d1']).toBeUndefined();
    expect(get().redownloadingIds.has('d1')).toBe(false);
  });

  it('clearDownloadHistory empties downloads and transient maps/sets', async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: undefined });
    const { slice, get } = buildSlice({
      downloads: [download({ id: 'd1' })],
      downloadFileStates: { d1: fileState() },
      redownloadingIds: new Set(['d1']),
    });

    await slice.clearDownloadHistory();

    expect(mockInvoke).toHaveBeenCalledWith('download_clear_history', {});
    expect(get().downloads).toHaveLength(0);
    expect(Object.keys(get().downloadFileStates)).toHaveLength(0);
    expect(get().redownloadingIds.size).toBe(0);
  });
});

describe('browserDownloadsSlice — redownloadDownload', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    vi.useRealTimers();
  });

  it('with tabId invokes download_redownload and keeps redownloadingIds until started', async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: undefined });
    const { slice, get, handlers } = buildSlice();

    const result = await slice.redownloadDownload('d1', 'tab-1');

    expect(result.ok).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('download_redownload', { id: 'd1', tabId: 'tab-1' });
    expect(get().redownloadingIds.has('d1')).toBe(true);

    slice.subscribeDownloadEvents();
    handlers['browser-download-started']?.[0]({ payload: download({ id: 'd1' }) });

    expect(get().redownloadingIds.has('d1')).toBe(false);
  });

  it('with tabId clears redownloadingIds immediately on invoke failure', async () => {
    mockInvoke.mockResolvedValue({ ok: false, error: { code: 'Internal', message: 'nope' } });
    const { slice, get } = buildSlice();

    const result = await slice.redownloadDownload('d1', 'tab-1');

    expect(result.ok).toBe(false);
    expect(get().redownloadingIds.has('d1')).toBe(false);
  });

  it('without tabId invokes download_prepare_redownload, opens url, and keeps redownloadingIds until started', async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: undefined });
    const record = download({ id: 'd1', url: 'https://example.com/file.zip' });
    const { slice, get, handlers } = buildSlice({
      downloads: [record],
    });

    const result = await slice.redownloadDownload('d1');

    expect(result.ok).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('download_prepare_redownload', { id: 'd1' });
    expect(get().browserOpenTab).toHaveBeenCalledWith('https://example.com/file.zip');
    expect(get().redownloadingIds.has('d1')).toBe(true);

    slice.subscribeDownloadEvents();
    handlers['browser-download-started']?.[0]({ payload: download({ id: 'd1' }) });

    expect(get().redownloadingIds.has('d1')).toBe(false);
  });

  it('without tabId remembers the source tab for the fallback new tab', async () => {
    resetDownloadOnlyTabsForTest();
    mockInvoke.mockResolvedValue({ ok: true, data: undefined });
    const record = download({ id: 'd1', url: 'https://example.com/file.zip' });
    const { slice, get } = buildSlice({
      downloads: [record],
      browserActiveTabId: 'source-tab',
      browserOpenTab: vi.fn(() => {
        // The real store sets the new tab active synchronously inside browserOpenTab.
        get().browserActiveTabId = 'new-tab';
      }),
    });

    const result = await slice.redownloadDownload('d1');

    expect(result.ok).toBe(true);
    expect(get().browserOpenTab).toHaveBeenCalledWith('https://example.com/file.zip');
    expect(consumeDownloadSource('new-tab')).toBe('source-tab');
  });

  it('without tabId skips source registration when no active tab is available', async () => {
    resetDownloadOnlyTabsForTest();
    mockInvoke.mockResolvedValue({ ok: true, data: undefined });
    const record = download({ id: 'd1', url: 'https://example.com/file.zip' });
    const { slice, get } = buildSlice({
      downloads: [record],
      browserActiveTabId: '',
      browserOpenTab: vi.fn(() => {
        (get() as { browserActiveTabId: string }).browserActiveTabId = '';
      }),
    });

    await slice.redownloadDownload('d1');

    expect(consumeDownloadSource('new-tab')).toBeUndefined();
  });

  it('without tabId clears redownloadingIds immediately when prepare fails', async () => {
    mockInvoke.mockResolvedValue({ ok: false, error: { code: 'Internal', message: 'nope' } });
    const record = download({ id: 'd1', url: 'https://example.com/file.zip' });
    const { slice, get } = buildSlice({
      downloads: [record],
    });

    const result = await slice.redownloadDownload('d1');

    expect(result.ok).toBe(false);
    expect(get().browserOpenTab).not.toHaveBeenCalled();
    expect(get().redownloadingIds.has('d1')).toBe(false);
  });
});

describe('browserDownloadsSlice — redownloadDownload 15s timeout', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears redownloadingIds and toasts if the command never resolves within 15s', async () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    const showToast = vi.fn();
    const { slice, get } = buildSlice({
      showToast,
      appInfo: { config: { language: 'zh-CN' } },
    });

    void slice.redownloadDownload('d1', 'tab-1');
    expect(get().redownloadingIds.has('d1')).toBe(true);

    await vi.advanceTimersByTimeAsync(15000);

    expect(get().redownloadingIds.has('d1')).toBe(false);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('重新下载未开始', 'error');
  });

  it('uses the English timeout toast for an en-US locale', async () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    const showToast = vi.fn();
    const { slice } = buildSlice({
      showToast,
      appInfo: { config: { language: 'en-US' } },
    });

    void slice.redownloadDownload('d1', 'tab-1');
    await vi.advanceTimersByTimeAsync(15000);

    expect(showToast).toHaveBeenCalledWith('Redownload did not start', 'error');
  });

  it('cancels the fallback toast when the record is removed mid-prepare', async () => {
    mockInvoke.mockImplementation((cmd: string) =>
      cmd === 'download_remove_record' ? Promise.resolve({ ok: true }) : new Promise(() => {}),
    );
    const showToast = vi.fn();
    const { slice, get } = buildSlice({
      showToast,
      downloads: [download({ id: 'd1' })],
      appInfo: { config: { language: 'zh-CN' } },
    });

    void slice.redownloadDownload('d1', 'tab-1');
    await slice.removeDownloadRecord('d1');
    await vi.advanceTimersByTimeAsync(15000);

    expect(get().downloads).toHaveLength(0);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('cancels all fallback toasts when history is cleared mid-prepare', async () => {
    mockInvoke.mockImplementation((cmd: string) =>
      cmd === 'download_clear_history' ? Promise.resolve({ ok: true }) : new Promise(() => {}),
    );
    const showToast = vi.fn();
    const { slice, get } = buildSlice({
      showToast,
      downloads: [download({ id: 'd1' })],
      appInfo: { config: { language: 'zh-CN' } },
    });

    void slice.redownloadDownload('d1', 'tab-1');
    await slice.clearDownloadHistory();
    await vi.advanceTimersByTimeAsync(15000);

    expect(get().downloads).toHaveLength(0);
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('browserDownloadsSlice — changeDownloadPath migration result', () => {
  const migration = { ok: true as const, data: { migrated: 2, missing: 1 } };
  const records = [download({ id: 'd1', status: 'completed' })];
  const states = [fileState({ id: 'd1', exists: true, in_default_dir: true })];

  function mockPathChange(outcome: unknown) {
    mockInvoke.mockImplementation((cmd: string) => {
      switch (cmd) {
        case 'download_change_default_path':
          // 接受已拒绝的 Promise，用于模拟 Tauri 对 Rust Err 的普通对象拒绝。
          return outcome instanceof Promise ? outcome : Promise.resolve(outcome);
        case 'download_get_settings':
          return Promise.resolve({
            ok: true,
            data: { mode: 'auto', default_path: 'D:/new', auto_migrate_on_path_change: true },
          });
        case 'download_get_default_path':
          return Promise.resolve({ ok: true, data: 'C:/Users/u/Downloads' });
        case 'download_list':
          return Promise.resolve({ ok: true, data: records });
        case 'download_file_states':
          return Promise.resolve({ ok: true, data: states });
        default:
          return Promise.resolve({ ok: true, data: undefined });
      }
    });
  }

  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('returns migrated/missing counts and refreshes downloads + file states on success', async () => {
    mockPathChange(migration);
    const { slice, get } = buildSlice();

    const result = await slice.changeDownloadPath('D:/new', true);

    expect(result).toEqual(migration);
    expect(mockInvoke).toHaveBeenCalledWith('download_change_default_path', {
      newPath: 'D:/new',
      migrate: true,
    });
    expect(mockInvoke).toHaveBeenCalledWith('download_list');
    expect(mockInvoke).toHaveBeenCalledWith('download_file_states', { ids: ['d1'] });
    expect(get().downloadFileStates['d1']).toEqual(states[0]);
  });

  it('refreshes downloads + file states when downloads_active blocks migration', async () => {
    mockPathChange({
      ok: false,
      error: { code: 'Internal', message: 'Internal error: downloads_active' },
    });
    const { slice } = buildSlice();

    const result = await slice.changeDownloadPath('D:/new', true);

    expect(result.ok).toBe(false);
    expect(mockInvoke).toHaveBeenCalledWith('download_list');
    expect(mockInvoke).toHaveBeenCalledWith('download_file_states', { ids: ['d1'] });
  });

  it('preserves a plain-object rejection message and maps the prefixed sentinel', async () => {
    const message = 'Internal error: downloads_active';
    // Tauri rejects a Rust Err with a plain object, not an Error instance.
    mockPathChange(Promise.reject({ code: 'Internal', message }));
    const { slice } = buildSlice();

    const result = await slice.changeDownloadPath('D:/new', true);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe(message);
      expect(downloadResetFailureCopy(zhCN, 'downloadPath', result.error, true)).toBe(
        zhCN.storageDownloadMigrateBlockedActive,
      );
    }
  });

  it('refreshes downloads + file states on a generic migration failure', async () => {
    mockPathChange({ ok: false, error: { code: 'Internal', message: 'boom' } });
    const { slice } = buildSlice();

    const result = await slice.changeDownloadPath('D:/new', true);

    expect(result.ok).toBe(false);
    expect(mockInvoke).toHaveBeenCalledWith('download_list');
    expect(mockInvoke).toHaveBeenCalledWith('download_file_states', { ids: ['d1'] });
  });
});
