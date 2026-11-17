import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviewExternalActions } from './PreviewExternalActions';
import { useAppStore } from '@stores/slicedStore';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      previewOpenInBrowserTab: '在中心浏览器标签打开',
      previewOpenInBrowserPanel: '在右侧浏览器面板打开',
    },
    formatT: (dict: Record<string, string>, key: string) => dict[key] ?? key,
  }),
}));

let tauri = true;
vi.mock('@shared/env', () => ({
  isTauriShell: () => tauri,
}));

describe('PreviewExternalActions', () => {
  afterEach(() => {
    tauri = true;
    useAppStore.setState({ recentWorkspaces: [] } as never);
  });

  function seedWorkspace() {
    useAppStore.setState({
      recentWorkspaces: [{ id: 'ws-1', path: 'C:\\ws', rootPath: 'C:\\ws' }],
    } as never);
  }

  it('renders both entries for a renderable file on desktop', () => {
    seedWorkspace();
    render(<PreviewExternalActions filePath="clip.mp4" workspaceId="ws-1" />);
    expect(screen.getByRole('button', { name: '在中心浏览器标签打开' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '在右侧浏览器面板打开' })).toBeTruthy();
  });

  it('stays hidden outside the desktop shell', () => {
    tauri = false;
    seedWorkspace();
    render(<PreviewExternalActions filePath="clip.mp4" workspaceId="ws-1" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('stays hidden when the workspace id is unknown', () => {
    seedWorkspace();
    render(<PreviewExternalActions filePath="clip.mp4" workspaceId="ws-missing" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
