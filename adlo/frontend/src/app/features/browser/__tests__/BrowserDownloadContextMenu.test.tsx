import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import { BrowserDownloadContextMenu } from '../BrowserDownloadContextMenu';
import type { DownloadRecord } from '@shared/ipc/download';

const mockT = {
  browserDownloadOpenFile: 'Open file',
  browserDownloadShowInFolder: 'Show in folder',
  browserDownloadCopyLink: 'Copy link',
  browserDownloadRemoveRecord: 'Remove record',
  browserDownloadDeleteFile: 'Delete file',
  browserDownloadRedownload: 'Redownload',
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
    created_at: Date.now() / 1000,
    completed_at: Date.now() / 1000,
    source_tab_id: null,
    resumable: null,
    ...overrides,
  };
}

describe('BrowserDownloadContextMenu', () => {
  const defaultProps = {
    position: { x: 100, y: 100 },
    onClose: vi.fn(),
    onOpenFile: vi.fn(),
    onShowInFolder: vi.fn(),
    onDeleteFile: vi.fn(),
    onRemoveRecord: vi.fn(),
    onCopyLink: vi.fn(),
    onRedownload: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides redownload for http(s) completed record with existing file', () => {
    const record = makeRecord({ status: 'completed', file_path: '/downloads/file.zip' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadContextMenu
          {...defaultProps}
          record={record}
          fileState={{ id: record.id, exists: true, in_default_dir: true, error: null }}
        />
      </TCopyProvider>,
    );
    expect(
      screen.queryByRole('menuitem', { name: mockT.browserDownloadRedownload }),
    ).not.toBeInTheDocument();
  });

  it('shows redownload for completed record with missing file', () => {
    const record = makeRecord({ status: 'completed', file_path: '' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadContextMenu
          {...defaultProps}
          record={record}
          fileState={{ id: record.id, exists: false, in_default_dir: true, error: null }}
        />
      </TCopyProvider>,
    );
    expect(
      screen.getByRole('menuitem', { name: mockT.browserDownloadRedownload }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: mockT.browserDownloadOpenFile }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: mockT.browserDownloadShowInFolder }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: mockT.browserDownloadDeleteFile }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: mockT.browserDownloadRemoveRecord }),
    ).toBeInTheDocument();
  });

  it('shows redownload for failed record', () => {
    const record = makeRecord({ status: 'failed', file_path: '' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadContextMenu {...defaultProps} record={record} />
      </TCopyProvider>,
    );
    expect(
      screen.getByRole('menuitem', { name: mockT.browserDownloadRedownload }),
    ).toBeInTheDocument();
  });

  it('shows redownload for canceled record', () => {
    const record = makeRecord({ status: 'canceled', file_path: '' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadContextMenu {...defaultProps} record={record} />
      </TCopyProvider>,
    );
    expect(
      screen.getByRole('menuitem', { name: mockT.browserDownloadRedownload }),
    ).toBeInTheDocument();
  });

  it('hides redownload for active record', () => {
    const record = makeRecord({ status: 'in_progress' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadContextMenu {...defaultProps} record={record} />
      </TCopyProvider>,
    );
    expect(
      screen.queryByRole('menuitem', { name: mockT.browserDownloadRedownload }),
    ).not.toBeInTheDocument();
  });

  it('hides redownload for paused record', () => {
    const record = makeRecord({ status: 'paused' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadContextMenu {...defaultProps} record={record} />
      </TCopyProvider>,
    );
    expect(
      screen.queryByRole('menuitem', { name: mockT.browserDownloadRedownload }),
    ).not.toBeInTheDocument();
  });

  it('hides redownload and copy link for blob URLs', () => {
    const record = makeRecord({ url: 'blob://internal-id', status: 'failed', file_path: '' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadContextMenu {...defaultProps} record={record} />
      </TCopyProvider>,
    );
    expect(
      screen.queryByRole('menuitem', { name: mockT.browserDownloadRedownload }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: mockT.browserDownloadCopyLink }),
    ).not.toBeInTheDocument();
  });

  it('disables redownload while redownloading', () => {
    const record = makeRecord({ status: 'failed', file_path: '' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadContextMenu {...defaultProps} record={record} redownloading />
      </TCopyProvider>,
    );
    const item = screen.getByRole('menuitem', { name: mockT.browserDownloadRedownload });
    expect(item).toBeDisabled();
  });

  it('calls onRedownload when redownload item clicked', () => {
    const record = makeRecord({ status: 'failed', file_path: '' });
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadContextMenu {...defaultProps} record={record} />
      </TCopyProvider>,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: mockT.browserDownloadRedownload }));
    expect(defaultProps.onRedownload).toHaveBeenCalledWith(record);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
