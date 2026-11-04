import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import { BrowserDownloadPauseDialog } from '../BrowserDownloadPauseDialog';

const mockT = {
  browserDownloadPauseDialogTitle: 'Server does not support pause',
  browserDownloadPauseDialogDesc:
    'The server hosting this download does not support resuming. Pausing will restart the download from the beginning.',
  browserDownloadPauseDialogConfirm: 'Pause anyway',
  browserDownloadPauseDialogCancel: 'Cancel',
};

describe('BrowserDownloadPauseDialog', () => {
  const defaultProps = {
    open: true,
    fileName: 'test-file.zip',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open', () => {
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadPauseDialog {...defaultProps} />
      </TCopyProvider>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadPauseDialog {...defaultProps} open={false} />
      </TCopyProvider>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('displays the file name', () => {
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadPauseDialog {...defaultProps} />
      </TCopyProvider>,
    );
    expect(screen.getByText('test-file.zip')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadPauseDialog {...defaultProps} />
      </TCopyProvider>,
    );
    const confirmButton = screen.getByRole('button', { name: /pause anyway/i });
    fireEvent.click(confirmButton);
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', () => {
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadPauseDialog {...defaultProps} />
      </TCopyProvider>,
    );
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when overlay is clicked', () => {
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadPauseDialog {...defaultProps} />
      </TCopyProvider>,
    );
    const overlay = screen.getByRole('dialog');
    fireEvent.click(overlay);
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Escape key is pressed', () => {
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadPauseDialog {...defaultProps} />
      </TCopyProvider>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('focuses confirm button on open', () => {
    render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <BrowserDownloadPauseDialog {...defaultProps} />
      </TCopyProvider>,
    );
    const confirmButton = screen.getByRole('button', { name: /pause anyway/i });
    expect(confirmButton).toHaveFocus();
  });
});
