import { beforeEach, describe, expect, it, vi } from 'vitest';

const browserOpenTab = vi.fn();
const centerShowBrowserTab = vi.fn();
const openExternal = vi.fn();
const openFile = vi.fn();
const openFileForWorkspace = vi.fn();
let config: { linkOpenMethod: string; fileOpenMethod: string };

vi.mock('@stores/slicedStore', () => ({
  useAppStore: {
    getState: () => ({
      appInfo: { config, currentWorkspace: { id: 'ws1', path: 'C:/ws', rootPath: 'C:/ws' } },
      browserOpenTab,
      centerShowBrowserTab,
      openFile,
      openFileForWorkspace,
      browserActiveTabId: 't1',
    }),
  },
}));

vi.mock('@shared/env', () => ({ isTauriShell: () => true }));
vi.stubGlobal('window', { digitalLife: { window: { openExternal } } });

import { openFileByMethod, openUrlByMethod, resolveMarkdownFileLink } from '../openByMethod';

beforeEach(() => vi.clearAllMocks());

describe('openUrlByMethod', () => {
  it('opens in center', () => {
    config = { linkOpenMethod: 'middle', fileOpenMethod: 'panel' };
    openUrlByMethod('https://a.com');
    expect(browserOpenTab).toHaveBeenCalledWith('https://a.com');
    expect(centerShowBrowserTab).toHaveBeenCalledWith('t1');
  });
  it('opens in panel as new tab', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'panel' };
    openUrlByMethod('https://a.com');
    expect(browserOpenTab).toHaveBeenCalledWith('https://a.com');
    expect(centerShowBrowserTab).not.toHaveBeenCalled();
  });
  it('opens externally', () => {
    config = { linkOpenMethod: 'external', fileOpenMethod: 'panel' };
    openUrlByMethod('https://a.com');
    expect(openExternal).toHaveBeenCalledWith('https://a.com');
  });
});

describe('openFileByMethod', () => {
  it('opens in file panel within workspace', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'panel' };
    openFileByMethod('C:/ws/src/a.md');
    expect(openFileForWorkspace).toHaveBeenCalledWith('ws1', 'C:/ws', 'src/a.md');
  });
  it('opens externally', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'external' };
    openFileByMethod('C:/ws/src/a.md');
    expect(openExternal).toHaveBeenCalledWith('C:/ws/src/a.md');
  });
});

describe('resolveMarkdownFileLink', () => {
  it('resolves a same-directory relative link', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'docs/readme.md', 'other.md')).toBe(
      'C:\\ws\\docs\\other.md',
    );
  });
  it('resolves a parent-directory link with ..', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'docs/sub/a.md', '../b.md')).toBe(
      'C:\\ws\\docs\\b.md',
    );
  });
  it('returns null when a relative link escapes the workspace', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'a.md', '../../b.md')).toBeNull();
  });
  it('resolves an absolute path inside the workspace', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'a.md', 'C:/ws/src/x.md')).toBe('C:\\ws\\src\\x.md');
  });
  it('returns null for an absolute path outside the workspace', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'a.md', 'D:/other/x.md')).toBeNull();
  });
  it('resolves a file:// URL inside the workspace', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'a.md', 'file:///C:/ws/src/x.md')).toBe(
      'C:\\ws\\src\\x.md',
    );
  });
  it('treats a leading slash as workspace-root relative', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'docs/a.md', '/src/x.md')).toBe('C:\\ws\\src\\x.md');
  });
  it('returns null for an empty href', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'a.md', '   ')).toBeNull();
  });
});
