import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MediaPreview } from '../MediaPreview';
import { useAppStore } from '@stores/slicedStore';

vi.mock('@shared/env', () => ({ isTauriShell: () => true }));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      mediaPreviewDecodeFailed: 'cannot decode (AVS3/HEVC)',
      mediaUnsupportedFormat: 'The built-in player does not support this format (e.g. MKV/AVI)',
      mediaEmptyFileTitle: 'Empty file',
      mediaEmptyFile: 'The file is empty',
      mediaOpenWithSystem: 'Open with system player',
      mediaOpenWithSystemHint: 'Open with the system default app',
      mediaOpenWithSystemFailed: 'Could not open the file with the system default app',
      mediaZoomIn: 'Zoom in',
      mediaZoomOut: 'Zoom out',
      mediaZoomReset: 'Reset to 100%',
      mediaZoomHint: 'Ctrl + wheel to zoom',
      changesPreviewBinary: 'Binary file',
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
    size: 4,
    lastModifiedAt: 1,
    url: 'http://127.0.0.1:1234/workspace/media?path=clip.mp4&v=1',
    ...overrides,
  } as never;
}

describe('MediaPreview（Range URL 直连 + 缩放视区）', () => {
  it('renders video inside the zoom viewport pointing at the streaming URL', async () => {
    render(<MediaPreview media={media()} kind="video" />);
    const video = await waitFor(() => {
      const node = document.querySelector('video');
      expect(node).toBeTruthy();
      return node as HTMLVideoElement;
    });
    expect(video.getAttribute('src')).toBe(
      'http://127.0.0.1:1234/workspace/media?path=clip.mp4&v=1',
    );
    expect(video.hasAttribute('controls')).toBe(true);
    // 图片/视频都在缩放视区内（胶囊与 100% 语义依赖这个容器）。
    expect(screen.getByTestId('media-zoom-viewport')).toBeTruthy();
    expect(screen.getByTestId('media-zoom-nav')).toBeTruthy();
  });

  it('resets the decode error when a new file arrives', async () => {
    const { rerender } = render(<MediaPreview media={media()} kind="video" />);
    const video = await waitFor(() => {
      const node = document.querySelector('video');
      expect(node).toBeTruthy();
      return node as HTMLVideoElement;
    });
    video.dispatchEvent(new Event('error'));
    await waitFor(() => {
      expect(screen.getByText(/does not support this format/u)).toBeTruthy();
    });

    rerender(
      <MediaPreview
        media={media({
          path: 'other.mp4',
          url: 'http://127.0.0.1:1234/workspace/media?path=other.mp4&v=2',
        })}
        kind="video"
      />,
    );
    await waitFor(() => {
      expect(document.querySelector('video')).toBeTruthy();
    });
    expect(screen.queryByText(/does not support this format/u)).toBeNull();
  });

  it('offers the system player on decode failure and calls the bridge', async () => {
    // 口径（Q4）：可见文案只说"内置播放器不支持此格式"，不再追加"请用系统播放器打开"。
    const openInDefaultApp = vi.fn(async () => ({ ok: true as const, data: true }));
    vi.stubGlobal('digitalLife', { workspace: { openInDefaultApp } });
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

    const button = await waitFor(() =>
      screen.getByRole('button', { name: 'Open with the system default app' }),
    );
    expect(button.textContent).toBe('Open with system player');
    expect(screen.getByText(/does not support this format/u)).toBeTruthy();
    expect(screen.queryByText(/Media preview failed/u)).toBeNull();

    button.click();
    await waitFor(() => {
      expect(openInDefaultApp).toHaveBeenCalledWith('C:\\ws', 'clip.mp4');
    });
  });

  it('shows a neutral empty state for 0-byte files without the system player', () => {
    render(<MediaPreview media={media({ path: 'empty.png', size: 0 })} kind="image" />);
    expect(screen.getByText('Empty file')).toBeTruthy();
    expect(screen.getByText('The file is empty')).toBeTruthy();
    // 空文件用系统播放器也打不开：不给无效入口（Q1）。
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(document.querySelector('img')).toBeNull();
  });

  it('renders nothing for the legacy-office placeholder (url is empty)', () => {
    const { container } = render(
      <MediaPreview media={media({ path: 'legacy.doc', size: 0, url: '' })} kind="image" />,
    );
    expect(container.innerHTML).toBe('');
  });
});
