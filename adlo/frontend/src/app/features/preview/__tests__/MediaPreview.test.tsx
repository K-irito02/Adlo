import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MediaPreview } from '../MediaPreview';
import { useAppStore } from '@stores/slicedStore';

vi.mock('@shared/env', () => ({ isTauriShell: () => true }));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      mediaPreviewFailed: 'Media preview failed: {error}',
      mediaPreviewDecodeFailed: 'cannot decode',
      previewOpenInBrowserTab: 'center',
      previewOpenInBrowserPanel: 'panel',
      changesPreviewBinary: 'Binary file',
      mediaEmptyFile: 'The file is empty',
    },
    formatT: (dict: Record<string, string>, key: string, params?: Record<string, unknown>) => {
      let out = dict[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          out = out.replace(`{${k}}`, String(v));
        }
      }
      return out;
    },
  }),
}));

function media(overrides: Record<string, unknown> = {}) {
  return {
    path: 'clip.mp4',
    mime: 'video/mp4',
    base64: 'AAECAw==',
    size: 4,
    lastModifiedAt: 1,
    ...overrides,
  } as never;
}

describe('MediaPreview', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('renders video with native controls', async () => {
    render(<MediaPreview media={media()} kind="video" />);
    await waitFor(() => {
      expect(document.querySelector('video')).toBeTruthy();
    });
  });

  it('recovers after a decode failure when a valid file arrives', async () => {
    const { rerender } = render(
      <MediaPreview media={media({ base64: '!!!not-base64!!!' })} kind="video" />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Media preview failed/u)).toBeTruthy();
    });
    rerender(<MediaPreview media={media()} kind="video" />);
    await waitFor(() => {
      expect(document.querySelector('video')).toBeTruthy();
    });
    expect(screen.queryByText(/Media preview failed/u)).toBeNull();
  });

  it('shows a decode error after the media element fires onError', async () => {
    render(<MediaPreview media={media()} kind="video" />);
    const video = await waitFor(() => {
      const node = document.querySelector('video');
      expect(node).toBeTruthy();
      return node as HTMLVideoElement;
    });
    video.dispatchEvent(new Event('error'));
    await waitFor(() => {
      expect(screen.getByText(/cannot decode/u)).toBeTruthy();
    });
  });

  it('shows the browser fallback entries after a decode error', async () => {
    useAppStore.setState({
      recentWorkspaces: [{ id: 'ws-1', path: 'C:\\ws', rootPath: 'C:\\ws' }],
    } as never);
    render(<MediaPreview media={media()} kind="video" workspaceId="ws-1" />);
    const video = await waitFor(() => {
      const node = document.querySelector('video');
      expect(node).toBeTruthy();
      return node as HTMLVideoElement;
    });
    video.dispatchEvent(new Event('error'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'center' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'panel' })).toBeTruthy();
    });
  });

  it('shows an empty-file notice for empty base64', async () => {
    render(<MediaPreview media={media({ base64: '' })} kind="image" />);
    await waitFor(() => {
      expect(screen.getByText('The file is empty')).toBeTruthy();
    });
  });
});
