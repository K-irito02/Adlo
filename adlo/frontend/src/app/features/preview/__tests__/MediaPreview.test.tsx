import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MediaPreview } from '../MediaPreview';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      mediaPreviewFailed: 'Media preview failed: {error}',
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

  it('shows an empty-file notice for empty base64', async () => {
    render(<MediaPreview media={media({ base64: '' })} kind="image" />);
    await waitFor(() => {
      expect(screen.getByText('The file is empty')).toBeTruthy();
    });
  });
});
