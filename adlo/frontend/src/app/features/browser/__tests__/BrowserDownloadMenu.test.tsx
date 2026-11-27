import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import { BrowserDownloadMenu } from '../BrowserDownloadMenu';
import type { DownloadRecord, DownloadFileState } from '@shared/ipc/download';
import { useAppStore } from '@stores/slicedStore';

vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...(actual as Record<string, unknown>),
    createPortal: (children: React.ReactNode) => children,
  };
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@stores/slicedStore', () => ({
  useAppStore: vi.fn(),
}));

vi.mock('../useDownloadItemActions', () => ({
  useDownloadItemActions: vi.fn(() => ({
    handleOpenFile: vi.fn(),
    handleShowInFolder: vi.fn(),
    handleDeleteFile: vi.fn(),
    handleRemoveRecord: vi.fn(),
    handleCopyLink: vi.fn(),
    handleRedownload: vi.fn(),
  })),
}));

const mockT = {
  browserDownloadTitle: 'Downloads',
  browserDownloadAutoSave: 'Auto-save',
  browserDownloadAskSave: 'Ask each time',
  browserDownloadSearch: 'Search downloads',
  browserDownloadNoRecords: 'No downloads yet',
  browserDownloadSettingsTitle: 'Download settings',
  browserClearHistory: 'Clear history',
  browserDownloadOpenFolder: 'Open folder',
  browserNoSearchResults: 'No matching results',
  browserDownloadActive: 'In progress',
  browserDownloadCompleted: 'Completed',
  browserDownloadFailed: 'Failed',
  browserDownloadPaused: 'Paused',
  browserDownloadCanceled: 'Canceled',
};

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
    created_at: 1000,
    completed_at: 1000,
    source_tab_id: null,
    resumable: null,
    ...overrides,
  };
}

function makeFileState(overrides: Partial<DownloadFileState> = {}): DownloadFileState {
  return {
    id: 'dl-1',
    exists: true,
    in_default_dir: true,
    error: null,
    ...overrides,
  };
}

function createMockState(overrides: Record<string, unknown> = {}) {
  return {
    downloads: [],
    downloadFileStates: {},
    redownloadingIds: new Set<string>(),
    activeDownloads: {},
    pauseDownload: vi.fn(),
    resumeDownload: vi.fn(),
    cancelDownload: vi.fn(),
    fetchDownloads: vi.fn(() => Promise.resolve()),
    refreshDownloadFileStates: vi.fn(() => Promise.resolve()),
    downloadSettings: {
      mode: 'auto',
      default_path: '/downloads',
      auto_migrate_on_path_change: false,
    },
    updateDownloadSettings: vi.fn(() => Promise.resolve({ ok: true })),
    clearDownloadHistory: vi.fn(() => Promise.resolve()),
    setActiveSettingsGroup: vi.fn(),
    navigateRightTool: vi.fn(),
    showToast: vi.fn(),
    ...overrides,
  };
}

describe('BrowserDownloadMenu', () => {
  const mockOnClose = vi.fn();
  const menuRef = { current: document.createElement('div') };
  const anchorRef = { current: document.createElement('button') };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAppStore).mockImplementation((selector: (state: any) => any) => {
      return selector(createMockState());
    });
  });

  function renderMenu(props: Partial<React.ComponentProps<typeof BrowserDownloadMenu>> = {}) {
    return render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadMenu
          onClose={mockOnClose}
          menuRef={menuRef}
          anchorRef={anchorRef}
          {...props}
        />
      </TCopyProvider>,
    );
  }

  it('renders empty state when no downloads exist', () => {
    renderMenu();
    expect(screen.getByText(mockT.browserDownloadNoRecords)).toBeInTheDocument();
  });

  it('refreshes downloads and file states when opened', async () => {
    const fetchDownloads = vi.fn(() => Promise.resolve());
    const refreshDownloadFileStates = vi.fn(() => Promise.resolve());
    const record = makeRecord({ id: 'dl-1' });

    vi.mocked(useAppStore).mockImplementation((selector: (state: any) => any) => {
      return selector(
        createMockState({
          downloads: [record],
          fetchDownloads,
          refreshDownloadFileStates,
        }),
      );
    });

    renderMenu();

    await waitFor(() => expect(fetchDownloads).toHaveBeenCalledTimes(1));
    expect(refreshDownloadFileStates).toHaveBeenCalledTimes(1);
    expect(refreshDownloadFileStates).toHaveBeenCalledWith(['dl-1']);
  });

  it('renders all records in a flat list sorted by created_at DESC', () => {
    const older = makeRecord({ id: 'older', file_name: 'older.zip', created_at: 1000 });
    const newer = makeRecord({ id: 'newer', file_name: 'newer.zip', created_at: 3000 });
    const middle = makeRecord({
      id: 'middle',
      file_name: 'middle.zip',
      status: 'failed',
      created_at: 2000,
    });

    vi.mocked(useAppStore).mockImplementation((selector: (state: any) => any) => {
      return selector(
        createMockState({
          downloads: [older, newer, middle],
          downloadFileStates: {
            older: makeFileState({ id: 'older' }),
            newer: makeFileState({ id: 'newer' }),
            middle: makeFileState({ id: 'middle' }),
          },
        }),
      );
    });

    renderMenu();
    const items = screen.getAllByRole('listitem', { hidden: true });
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('newer.zip');
    expect(items[1]).toHaveTextContent('middle.zip');
    expect(items[2]).toHaveTextContent('older.zip');
  });

  it('does not render status group headings', () => {
    const active = makeRecord({
      id: 'active',
      file_name: 'active.zip',
      status: 'in_progress',
      created_at: 1000,
    });
    const paused = makeRecord({
      id: 'paused',
      file_name: 'paused.zip',
      status: 'paused',
      created_at: 2000,
    });
    const failed = makeRecord({
      id: 'failed',
      file_name: 'failed.zip',
      status: 'failed',
      created_at: 3000,
    });
    const completed = makeRecord({
      id: 'completed',
      file_name: 'completed.zip',
      status: 'completed',
      created_at: 4000,
    });
    const canceled = makeRecord({
      id: 'canceled',
      file_name: 'canceled.zip',
      status: 'canceled',
      created_at: 5000,
    });

    vi.mocked(useAppStore).mockImplementation((selector: (state: any) => any) => {
      return selector(
        createMockState({ downloads: [active, paused, failed, completed, canceled] }),
      );
    });

    renderMenu();
    expect(document.querySelectorAll('.adl-download-menu__group-label')).toHaveLength(0);
    expect(screen.getAllByRole('listitem', { hidden: true })).toHaveLength(5);
  });
});
