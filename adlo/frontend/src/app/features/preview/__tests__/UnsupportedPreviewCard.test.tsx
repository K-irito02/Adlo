import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UnsupportedPreviewCard } from '../UnsupportedPreviewCard';
import { useAppStore } from '@stores/slicedStore';

vi.mock('@shared/env', () => ({ isTauriShell: () => true }));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      mediaOpenWithSystem: 'Open with system player',
      mediaOpenWithSystemHint: 'Open with the system default app',
      mediaOpenWithSystemFailed: 'Could not open the file with the system default app',
    },
    formatT: (dict: Record<string, string>, key: string) => dict[key] ?? key,
  }),
}));

describe('UnsupportedPreviewCard（统一兜底卡）', () => {
  it('shows title and hint without a system button when no filePath is given', () => {
    render(<UnsupportedPreviewCard title="Empty file" hint="The file is empty" />);
    expect(screen.getByText('Empty file')).toBeTruthy();
    expect(screen.getByText('The file is empty')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('opens the file with the system default app when filePath is provided', async () => {
    const openInDefaultApp = vi.fn(async () => ({ ok: true as const, data: true }));
    vi.stubGlobal('digitalLife', { workspace: { openInDefaultApp } });
    useAppStore.setState({
      recentWorkspaces: [{ id: 'ws-1', path: 'C:\\ws', rootPath: 'C:\\ws' }],
    } as never);

    render(
      <UnsupportedPreviewCard
        title="This file type cannot be previewed"
        filePath="office/05-odt.odt"
        workspaceId="ws-1"
        alert
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Open with the system default app' });
    fireEvent.click(button);
    await waitFor(() => {
      expect(openInDefaultApp).toHaveBeenCalledWith('C:\\ws', 'office/05-odt.odt');
    });
  });

  it('keeps the technical detail out of the visible text (title attribute only)', () => {
    render(<UnsupportedPreviewCard title="Unsupported" detail="cannot decode (AVS3)" />);
    expect(screen.getByText('Unsupported')).toBeTruthy();
    expect(screen.queryByText(/AVS3/u)).toBeNull();
    expect(screen.getByRole('status').getAttribute('title')).toBe('cannot decode (AVS3)');
  });
});
