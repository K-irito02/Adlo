import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviewExternalActions } from './PreviewExternalActions';
import { useAppStore } from '@stores/slicedStore';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      previewOpenInBrowserTab: '中间打开',
      previewOpenInBrowserPanel: '右侧打开',
      previewOpenInBrowserTabHint: '在中间浏览器标签打开',
      previewOpenInBrowserPanelHint: '在右侧浏览器面板打开',
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

  it('renders both entries for an HTML document on desktop', () => {
    seedWorkspace();
    render(<PreviewExternalActions filePath="pages/index.html" workspaceId="ws-1" />);
    // 可见文字保持简短；完整含义在无障碍名称与 title 里。
    const center = screen.getByRole('button', { name: '在中间浏览器标签打开' });
    const panel = screen.getByRole('button', { name: '在右侧浏览器面板打开' });
    expect(center.textContent).toBe('中间打开');
    expect(panel.textContent).toBe('右侧打开');
    expect(center.getAttribute('title')).toBe('在中间浏览器标签打开');
    expect(panel.getAttribute('title')).toBe('在右侧浏览器面板打开');
  });

  it('stays hidden for media (streaming preview owns it)', () => {
    seedWorkspace();
    render(<PreviewExternalActions filePath="clip.mp4" workspaceId="ws-1" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('stays hidden outside the desktop shell', () => {
    tauri = false;
    seedWorkspace();
    render(<PreviewExternalActions filePath="pages/index.html" workspaceId="ws-1" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('stays hidden when the workspace id is unknown', () => {
    seedWorkspace();
    render(<PreviewExternalActions filePath="pages/index.html" workspaceId="ws-missing" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
