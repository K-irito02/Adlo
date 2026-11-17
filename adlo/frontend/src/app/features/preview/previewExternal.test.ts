import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isWebViewRenderableFile,
  openLocalFileInBrowser,
  resolveBrowserFileUrl,
  resolvePreviewOwner,
  resolveWorkspaceRootStrict,
} from './previewExternal';
import { useAppStore } from '@stores/slicedStore';

describe('isWebViewRenderableFile', () => {
  it('accepts Chromium-native formats', () => {
    for (const path of ['a.mp4', 'dir/b.html', 'c.PDF', 'd.svg', 'e.png', 'f.webm']) {
      expect(isWebViewRenderableFile(path), path).toBe(true);
    }
  });

  it('rejects formats WebView2 cannot render', () => {
    for (const path of ['a.zip', 'b.exe', 'c.docx', 'd.doc', 'e.ttf', 'f.odt']) {
      expect(isWebViewRenderableFile(path), path).toBe(false);
    }
  });

  it('rejects files without an extension or with a hidden name only', () => {
    expect(isWebViewRenderableFile('Makefile')).toBe(false);
    expect(isWebViewRenderableFile('.gitignore')).toBe(false);
    expect(isWebViewRenderableFile(undefined)).toBe(false);
  });

  it('normalizes windows separators', () => {
    expect(isWebViewRenderableFile('C:\\ws\\clip.mp4')).toBe(true);
  });
});

describe('resolveWorkspaceRootStrict / resolveBrowserFileUrl', () => {
  afterEach(() => {
    useAppStore.setState({
      recentWorkspaces: [],
      appInfo: undefined,
      externalFileRoots: {},
    } as never);
  });

  it('resolves a workspace by id and encodes spaces and CJK', () => {
    useAppStore.setState({
      recentWorkspaces: [{ id: 'ws-1', path: 'C:\\ws', rootPath: 'C:\\ws' }],
    } as never);
    const url = resolveBrowserFileUrl('ws-1', 'clips/a b 中.mp4');
    expect(url).toContain('file:///C:/ws/clips/a%20b%20%E4%B8%AD.mp4');
  });

  it('returns null when the given workspace id is gone (no fallback to the current one)', () => {
    useAppStore.setState({
      recentWorkspaces: [{ id: 'ws-1', path: 'C:\\ws', rootPath: 'C:\\ws' }],
      appInfo: { currentWorkspace: { id: 'ws-current', rootPath: 'D:\\other' } },
    } as never);
    expect(resolveWorkspaceRootStrict('ws-missing')).toBeNull();
    expect(resolveBrowserFileUrl('ws-missing', 'clip.mp4')).toBeNull();
  });

  it('falls back to the current workspace only when no id is provided', () => {
    useAppStore.setState({
      appInfo: { currentWorkspace: { id: 'ws-current', rootPath: 'D:\\other' } },
    } as never);
    expect(resolveWorkspaceRootStrict(undefined)).toBe('D:\\other');
    expect(resolvePreviewOwner(undefined)).toEqual({ id: 'ws-current', root: 'D:\\other' });
  });

  it('returns the owner id and root for a known workspace', () => {
    useAppStore.setState({
      recentWorkspaces: [{ id: 'ws-1', path: 'C:\\ws', rootPath: 'C:\\ws' }],
    } as never);
    expect(resolvePreviewOwner('ws-1')).toEqual({ id: 'ws-1', root: 'C:\\ws' });
  });
});

describe('openLocalFileInBrowser', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens a center browser tab', () => {
    const browserOpenTab = vi.fn();
    const centerShowBrowserTab = vi.fn();
    const navigateRightTool = vi.fn();
    useAppStore.setState({
      browserOpenTab,
      centerShowBrowserTab,
      navigateRightTool,
      browserActiveTabId: 'tab-1',
    } as never);

    openLocalFileInBrowser('file:///C:/ws/a.mp4', 'center');

    expect(browserOpenTab).toHaveBeenCalledWith('file:///C:/ws/a.mp4');
    expect(centerShowBrowserTab).toHaveBeenCalledWith('tab-1');
    expect(navigateRightTool).not.toHaveBeenCalled();
  });

  it('opens the right browser panel', () => {
    const browserOpenTab = vi.fn();
    const centerShowBrowserTab = vi.fn();
    const navigateRightTool = vi.fn();
    useAppStore.setState({
      browserOpenTab,
      centerShowBrowserTab,
      navigateRightTool,
      browserActiveTabId: 'tab-1',
    } as never);

    openLocalFileInBrowser('file:///C:/ws/a.mp4', 'panel');

    expect(browserOpenTab).toHaveBeenCalledWith('file:///C:/ws/a.mp4');
    expect(navigateRightTool).toHaveBeenCalledWith('browser');
    expect(centerShowBrowserTab).not.toHaveBeenCalled();
  });
});
