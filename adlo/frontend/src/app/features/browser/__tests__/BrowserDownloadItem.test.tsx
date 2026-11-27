import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import { BrowserDownloadItem } from '../BrowserDownloadItem';
import type { DownloadRecord, DownloadFileState } from '@shared/ipc/download';
import { useAppStore } from '@stores/slicedStore';

vi.mock('@stores/slicedStore', () => ({
  useAppStore: vi.fn(),
}));

const mockHandleOpenFile = vi.fn();
vi.mock('../useDownloadItemActions', () => ({
  useDownloadItemActions: vi.fn(() => ({
    handleOpenFile: mockHandleOpenFile,
  })),
}));

const mockT = {
  browserDownloadPause: 'Pause',
  browserDownloadResume: 'Resume',
  browserDownloadCancel: 'Cancel',
  browserDownloadSpeed: '{speed}/s',
  browserDownloadOf: ' of ',
  browserDownloadFailed: 'Failed',
  browserDownloadFailedReason: 'Failed: {reason}',
  browserDownloadMissingFile: 'File missing',
  browserDownloadNonDefaultLocation: 'Non-default location',
  browserDownloadCanceled: 'Canceled',
  browserDownloadPaused: 'Paused',
  browserDownloadPreparing: 'Preparing…',
  browserDownloadPauseDialogTitle: 'Server does not support pause',
  browserDownloadPauseDialogDesc:
    'The server hosting this download does not support resuming. Pausing will restart the download from the beginning.',
  browserDownloadPauseDialogConfirm: 'Pause anyway',
  browserDownloadPauseDialogCancel: 'Cancel',
  browserContextMore: 'More options',
};

function makeRecord(overrides: Partial<DownloadRecord> = {}): DownloadRecord {
  return {
    id: 'dl-1',
    url: 'https://example.com/file.zip',
    file_name: 'file.zip',
    file_path: '/downloads/file.zip',
    total_bytes: 1000,
    bytes_received: 500,
    mime_type: 'application/zip',
    status: 'in_progress',
    interrupt_reason: null,
    created_at: Date.now() / 1000,
    completed_at: null,
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

describe('BrowserDownloadItem', () => {
  const mockPauseDownload = vi.fn();
  const mockResumeDownload = vi.fn();
  const mockCancelDownload = vi.fn();
  const mockOnContextMenu = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAppStore).mockImplementation((selector: (state: any) => any) => {
      const state = {
        activeDownloads: {},
        pauseDownload: mockPauseDownload,
        resumeDownload: mockResumeDownload,
        cancelDownload: mockCancelDownload,
      };
      return selector(state);
    });
  });

  it('renders download item with file name', () => {
    const record = makeRecord();
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem record={record} onContextMenu={mockOnContextMenu} />
      </TCopyProvider>,
    );
    expect(screen.getByText('file.zip')).toBeInTheDocument();
  });

  it('shows pause button when download is active', () => {
    const record = makeRecord({ status: 'in_progress' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem record={record} onContextMenu={mockOnContextMenu} />
      </TCopyProvider>,
    );
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
  });

  it('does not show pause button when download is not active', () => {
    const record = makeRecord({ status: 'completed' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem record={record} onContextMenu={mockOnContextMenu} />
      </TCopyProvider>,
    );
    expect(screen.queryByRole('button', { name: /pause/i })).not.toBeInTheDocument();
  });

  it('calls pauseDownload directly when resumable is true', async () => {
    const record = makeRecord({ status: 'in_progress', resumable: true });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem record={record} onContextMenu={mockOnContextMenu} />
      </TCopyProvider>,
    );
    const pauseButton = screen.getByRole('button', { name: /pause/i });
    await fireEvent.click(pauseButton);
    expect(mockPauseDownload).toHaveBeenCalledWith('dl-1');
  });

  it('calls pauseDownload directly when resumable is null (unknown)', async () => {
    const record = makeRecord({ status: 'in_progress', resumable: null });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem record={record} onContextMenu={mockOnContextMenu} />
      </TCopyProvider>,
    );
    const pauseButton = screen.getByRole('button', { name: /pause/i });
    await fireEvent.click(pauseButton);
    expect(mockPauseDownload).toHaveBeenCalledWith('dl-1');
  });

  it('shows pause confirmation dialog when resumable is false', async () => {
    const record = makeRecord({ status: 'in_progress', resumable: false });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem record={record} onContextMenu={mockOnContextMenu} />
      </TCopyProvider>,
    );
    const pauseButton = screen.getByRole('button', { name: /pause/i });
    await fireEvent.click(pauseButton);
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getAllByText('file.zip').length).toBeGreaterThanOrEqual(1);
  });

  it('calls pauseDownload after confirming dialog for non-resumable download', async () => {
    const record = makeRecord({ status: 'in_progress', resumable: false });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem record={record} onContextMenu={mockOnContextMenu} />
      </TCopyProvider>,
    );
    const pauseButton = screen.getByRole('button', { name: /pause/i });
    await fireEvent.click(pauseButton);
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const confirmButton = screen.getByRole('button', { name: /pause anyway/i });
    await fireEvent.click(confirmButton);
    expect(mockPauseDownload).toHaveBeenCalledWith('dl-1');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('does not call pauseDownload after canceling dialog', async () => {
    const record = makeRecord({ status: 'in_progress', resumable: false });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem record={record} onContextMenu={mockOnContextMenu} />
      </TCopyProvider>,
    );
    const pauseButton = screen.getByRole('button', { name: /pause/i });
    await fireEvent.click(pauseButton);
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const dialog = screen.getByRole('dialog');
    const cancelButton = dialog.querySelector('.adl-btn--secondary') as HTMLButtonElement;
    fireEvent.click(cancelButton);
    expect(mockPauseDownload).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('shows resume button when download is paused', () => {
    const record = makeRecord({ status: 'paused' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem record={record} onContextMenu={mockOnContextMenu} />
      </TCopyProvider>,
    );
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
  });

  it('shows cancel button when download is active or paused', () => {
    const activeRecord = makeRecord({ status: 'in_progress' });
    const { unmount } = render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem record={activeRecord} onContextMenu={mockOnContextMenu} />
      </TCopyProvider>,
    );
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    unmount();

    const pausedRecord = makeRecord({ status: 'paused' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem record={pausedRecord} onContextMenu={mockOnContextMenu} />
      </TCopyProvider>,
    );
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('renders completed file as missing and disables open when exists is false', () => {
    const record = makeRecord({ status: 'completed', file_path: '/downloads/file.zip' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem
          record={record}
          onContextMenu={mockOnContextMenu}
          fileState={makeFileState({ exists: false })}
        />
      </TCopyProvider>,
    );
    const item = screen.getByRole('listitem');
    expect(item.classList.contains('adl-download-item--missing')).toBe(true);
    const name = item.querySelector('.adl-download-item__name');
    expect(name).toBeInTheDocument();
    expect(item.classList.contains('adl-download-item--missing')).toBe(true);
    expect(screen.getByText(mockT.browserDownloadMissingFile)).toBeInTheDocument();
    fireEvent.click(item);
    expect(mockHandleOpenFile).not.toHaveBeenCalled();
  });

  it('renders non-default location badge with full path tooltip', () => {
    const record = makeRecord({ status: 'completed', file_path: '/elsewhere/file.zip' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem
          record={record}
          onContextMenu={mockOnContextMenu}
          fileState={makeFileState({ in_default_dir: false })}
        />
      </TCopyProvider>,
    );
    const badge = screen.getByText(mockT.browserDownloadNonDefaultLocation);
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('title')).toBe('/elsewhere/file.zip');
  });

  it('renders failed status text with reason', () => {
    const record = makeRecord({
      status: 'failed',
      interrupt_reason: 'network error',
    });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem record={record} onContextMenu={mockOnContextMenu} />
      </TCopyProvider>,
    );
    expect(screen.getByText('Failed: network error')).toBeInTheDocument();
  });

  it('renders canceled status text', () => {
    const record = makeRecord({ status: 'canceled' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem record={record} onContextMenu={mockOnContextMenu} />
      </TCopyProvider>,
    );
    expect(screen.getByText(mockT.browserDownloadCanceled)).toBeInTheDocument();
  });

  it('renders paused status text', () => {
    const record = makeRecord({ status: 'paused' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem record={record} onContextMenu={mockOnContextMenu} />
      </TCopyProvider>,
    );
    expect(screen.getByText(mockT.browserDownloadPaused)).toBeInTheDocument();
  });

  it('renders preparing status text when redownloading', () => {
    const record = makeRecord({ status: 'failed' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadItem record={record} onContextMenu={mockOnContextMenu} redownloading />
      </TCopyProvider>,
    );
    expect(screen.getByText(mockT.browserDownloadPreparing)).toBeInTheDocument();
  });
});
