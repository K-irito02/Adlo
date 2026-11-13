import { beforeEach, describe, expect, it, vi } from 'vitest';

const browserOpenTab = vi.fn();
const centerShowBrowserTab = vi.fn();
const openExternal = vi.fn();
const openFile = vi.fn();
const openFileForWorkspace = vi.fn();
let config: { linkOpenMethod: string; fileOpenMethod: string };
let recentWorkspaces: { id: string; path: string; rootPath: string }[] = [];
let trees: Record<string, { name: string; path: string; kind: string; children: unknown[] }[]> = {};
const expandFileTreePathChain = vi.fn();
const setFileTreeClickedNode = vi.fn();
const requestFileTreeReveal = vi.fn();
const setFileTreePathExpanded = vi.fn();
const openFileOutsideWorkspaces = vi.fn(async () => true);
const navigateRightTool = vi.fn();
const showToast = vi.fn();
let externalFileRoots: Record<string, string> = {};

vi.mock('@stores/slicedStore', () => ({
  useAppStore: {
    getState: () => ({
      appInfo: { config, currentWorkspace: { id: 'ws1', path: 'C:/ws', rootPath: 'C:/ws' } },
      recentWorkspaces,
      externalFileRoots,
      workspaceTrees: trees,
      expandFileTreePathChain,
      setFileTreeClickedNode,
      requestFileTreeReveal,
      setFileTreePathExpanded,
      browserOpenTab,
      centerShowBrowserTab,
      openFile,
      openFileForWorkspace,
      openFileOutsideWorkspaces,
      navigateRightTool,
      showToast,
      browserActiveTabId: 't1',
    }),
  },
}));

vi.mock('@shared/env', () => ({ isTauriShell: () => true }));
vi.stubGlobal('window', { digitalLife: { window: { openExternal } } });

import {
  openFileByMethod,
  openMarkdownFileLink,
  openUrlByMethod,
  resolveLinkWorkspace,
  resolveMarkdownFileLink,
  resolveOwningWorkspace,
  revealWorkspaceDirectory,
} from '../openByMethod';

beforeEach(() => {
  vi.clearAllMocks();
  openFileOutsideWorkspaces.mockResolvedValue(true);
  recentWorkspaces = [];
  externalFileRoots = {};
  trees = {};
});

describe('openUrlByMethod', () => {
  it('opens in center', () => {
    config = { linkOpenMethod: 'middle', fileOpenMethod: 'panel' };
    openUrlByMethod('https://a.com');
    expect(browserOpenTab).toHaveBeenCalledWith('https://a.com');
    expect(centerShowBrowserTab).toHaveBeenCalledWith('t1');
    expect(navigateRightTool).not.toHaveBeenCalled();
  });
  it('opens in the right panel as a new tab and switches to it', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'panel' };
    openUrlByMethod('https://a.com');
    expect(browserOpenTab).toHaveBeenCalledWith('https://a.com');
    expect(centerShowBrowserTab).not.toHaveBeenCalled();
    expect(navigateRightTool).toHaveBeenCalledWith('browser');
  });
  it('opens externally', () => {
    config = { linkOpenMethod: 'external', fileOpenMethod: 'panel' };
    openUrlByMethod('https://a.com');
    expect(openExternal).toHaveBeenCalledWith('https://a.com');
    expect(navigateRightTool).not.toHaveBeenCalled();
  });
});

describe('openFileByMethod', () => {
  it('opens in the visible file panel within the workspace', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'panel' };
    openFileByMethod('C:/ws/src/a.md');
    expect(openFileForWorkspace).toHaveBeenCalledWith('ws1', 'C:/ws', 'src/a.md');
    expect(navigateRightTool).toHaveBeenCalledWith('files');
    expect(openFileOutsideWorkspaces).not.toHaveBeenCalled();
  });
  it('opens externally as a file:// URL, not a raw Windows path', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'external' };
    openFileByMethod('C:/ws/src/a.md');
    expect(openExternal).toHaveBeenCalledWith('file:///C:/ws/src/a.md');
  });
  it('builds a well-formed file:// URL for UNC network paths', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'external' };
    openFileByMethod('\\\\server\\share\\x.md');
    expect(openExternal).toHaveBeenCalledWith('file://server/share/x.md');
  });
  it('opens in the file-owning workspace instead of the current one', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'panel' };
    recentWorkspaces = [{ id: 'ws2', path: 'C:/ws2', rootPath: 'C:/ws2' }];
    openFileByMethod('C:/ws2/src/a.md', 'ws2');
    expect(openFileForWorkspace).toHaveBeenCalledWith('ws2', 'C:/ws2', 'src/a.md');
    expect(navigateRightTool).toHaveBeenCalledWith('files');
    recentWorkspaces = [];
  });

  it('infers the owning recent workspace from an absolute agent-link path', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'panel' };
    recentWorkspaces = [
      { id: 'ws2', path: 'E:/Test-Workspace-1', rootPath: 'E:/Test-Workspace-1' },
      { id: 'ws3', path: 'E:/Test-Workspace-1/nested', rootPath: 'E:/Test-Workspace-1/nested' },
    ];
    openFileByMethod('E:\\Test-Workspace-1\\current-time.md');
    expect(openFileForWorkspace).toHaveBeenCalledWith(
      'ws2',
      'E:/Test-Workspace-1',
      'current-time.md',
    );
    recentWorkspaces = [];
  });

  it('opens a file outside every workspace through the hidden workspace', async () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'panel' };
    openFileByMethod('E:\\Downloads\\photo.png');
    expect(openFileForWorkspace).not.toHaveBeenCalled();
    expect(openFileOutsideWorkspaces).toHaveBeenCalledWith('E:\\Downloads\\photo.png');
    await vi.waitFor(() => expect(navigateRightTool).toHaveBeenCalledWith('files'));
  });

  it('does not switch the panel and warns when the path cannot be parsed', async () => {
    openFileOutsideWorkspaces.mockResolvedValueOnce(false);
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'panel' };
    openFileByMethod('docs\\relative.md');
    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.any(String), 'warning'));
    expect(navigateRightTool).not.toHaveBeenCalled();
  });
});

describe('resolveOwningWorkspace', () => {
  it('ignores hidden external workspaces so real workspaces always win', () => {
    recentWorkspaces = [
      { id: 'workspace_real', path: 'E:/Downloads', rootPath: 'E:/Downloads' },
      { id: 'external-abc-123', path: 'E:/Downloads/sub', rootPath: 'E:/Downloads/sub' },
    ];
    expect(resolveOwningWorkspace('E:/Downloads/sub/photo.png')).toEqual({
      id: 'workspace_real',
      root: 'E:/Downloads',
    });
  });
});

describe('resolveLinkWorkspace', () => {
  it('prefers the file-owning workspace over the current one', () => {
    recentWorkspaces = [{ id: 'ws2', path: 'C:/ws2', rootPath: 'C:/ws2' }];
    expect(resolveLinkWorkspace('ws2')).toEqual({ id: 'ws2', root: 'C:/ws2' });
    recentWorkspaces = [];
  });
  it('falls back to the current workspace for unknown ids', () => {
    expect(resolveLinkWorkspace('nope')).toEqual({ id: 'ws1', root: 'C:/ws' });
    expect(resolveLinkWorkspace(undefined)).toEqual({ id: 'ws1', root: 'C:/ws' });
  });
});

describe('resolveMarkdownFileLink', () => {
  it('resolves a same-directory relative link', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'docs/readme.md', 'other.md')).toBe(
      'C:\\ws\\docs\\other.md',
    );
  });
  it('resolves a relative link for a workspace-root file', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'readme.md', 'other.md')).toBe('C:\\ws\\other.md');
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
  it('returns null for an absolute path that escapes the workspace via ..', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'a.md', 'C:/ws/../x.md')).toBeNull();
  });
  it('resolves a file:// URL inside the workspace', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'a.md', 'file:///C:/ws/src/x.md')).toBe(
      'C:\\ws\\src\\x.md',
    );
  });
  it('returns null for a file:// URL that escapes the workspace via ..', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'a.md', 'file:///C:/ws/../x.md')).toBeNull();
  });
  it('treats a leading slash as workspace-root relative', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'docs/a.md', '/src/x.md')).toBe('C:\\ws\\src\\x.md');
  });
  it('strips hash fragments from relative file links', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'docs/a.md', 'other.md#sec')).toBe(
      'C:\\ws\\docs\\other.md',
    );
  });

  it('strips hash fragments from absolute file links', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'a.md', 'C:/ws/src/x.md#sec')).toBe(
      'C:\\ws\\src\\x.md',
    );
  });

  it('returns null for an empty href', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'a.md', '   ')).toBeNull();
  });
  it('decodes percent-encoded relative file links', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'docs/a.md', 'my%20file.md')).toBe(
      'C:\\ws\\docs\\my file.md',
    );
  });
  it('strips query strings from file links', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'docs/a.md', 'other.md?raw=true')).toBe(
      'C:\\ws\\docs\\other.md',
    );
  });
  it('rejects UNC network paths instead of rewriting them into the workspace', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'a.md', '\\\\server\\share\\x.md')).toBeNull();
  });
  it('rejects protocol-relative network URLs instead of resolving them as files', () => {
    expect(resolveMarkdownFileLink('C:\\ws', 'a.md', '//cdn.example.com/x.md')).toBeNull();
  });
});

describe('revealWorkspaceDirectory', () => {
  const dirTree = {
    ws1: [
      {
        name: 'docs',
        path: 'docs',
        kind: 'directory',
        children: [
          {
            name: 'analysis',
            path: 'docs/analysis',
            kind: 'directory',
            children: [
              {
                name: 'adlo',
                path: 'docs/analysis/adlo',
                kind: 'directory',
                children: [],
              },
            ],
          },
        ],
      },
      { name: 'README.md', path: 'README.md', kind: 'file', children: [] },
    ],
  };

  it('expands and selects a known directory without opening a file', () => {
    trees = dirTree;
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'panel' };
    expect(revealWorkspaceDirectory('ws1', 'docs/analysis/adlo')).toBe(true);
    expect(setFileTreePathExpanded).toHaveBeenCalledWith('ws1', 'docs', true);
    expect(setFileTreePathExpanded).toHaveBeenCalledWith('ws1', 'docs/analysis', true);
    expect(setFileTreeClickedNode).toHaveBeenCalledWith('ws1', 'docs/analysis/adlo', 'directory');
    expect(openFileForWorkspace).not.toHaveBeenCalled();
  });

  it('returns false for files and unknown paths', () => {
    trees = dirTree;
    expect(revealWorkspaceDirectory('ws1', 'README.md')).toBe(false);
    expect(revealWorkspaceDirectory('ws1', 'docs/missing')).toBe(false);
    expect(revealWorkspaceDirectory('ws1', '')).toBe(false);
    // 实现走 setFileTreePathExpanded 逐层展开：断言该函数未被调用，而非无关函数。
    expect(setFileTreePathExpanded).not.toHaveBeenCalled();
    expect(setFileTreeClickedNode).not.toHaveBeenCalled();
    expect(requestFileTreeReveal).not.toHaveBeenCalled();
  });
});

describe('openMarkdownFileLink', () => {
  it('reveals a known directory link instead of reading it as a file', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'panel' };
    trees = {
      ws1: [
        {
          name: 'docs',
          path: 'docs',
          kind: 'directory',
          children: [],
        },
      ],
    };
    openMarkdownFileLink('ws1', 'a.md', 'docs/');
    expect(setFileTreeClickedNode).toHaveBeenCalledWith('ws1', 'docs', 'directory');
    expect(requestFileTreeReveal).toHaveBeenCalledWith('ws1', 'docs');
    expect(openFileForWorkspace).not.toHaveBeenCalled();
  });

  it('opens a file link through the owning workspace', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'panel' };
    openMarkdownFileLink('ws1', 'docs/a.md', 'other.md');
    expect(openFileForWorkspace).toHaveBeenCalledWith('ws1', 'C:/ws', 'docs/other.md');
    expect(setFileTreeClickedNode).toHaveBeenCalledWith('ws1', 'docs/other.md', 'file');
    expect(requestFileTreeReveal).toHaveBeenCalledWith('ws1', 'docs/other.md');
  });

  it('reveals an unloaded directory-shaped link without reading it as a file', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'panel' };
    trees = {};
    openMarkdownFileLink('ws1', 'a.md', 'newdir/');
    // 树未加载 → revealWorkspaceDirectory 为 false，但尾部分隔符表明是目录：
    // 只做目录揭示，不调文件读取。
    expect(setFileTreeClickedNode).toHaveBeenCalledWith('ws1', 'newdir', 'directory');
    expect(openFileForWorkspace).not.toHaveBeenCalled();
  });

  it('still reveals as directory when the link carries a query string', () => {
    config = { linkOpenMethod: 'panel', fileOpenMethod: 'panel' };
    trees = {};
    openMarkdownFileLink('ws1', 'a.md', 'newdir/?raw=true');
    expect(setFileTreeClickedNode).toHaveBeenCalledWith('ws1', 'newdir', 'directory');
    expect(openFileForWorkspace).not.toHaveBeenCalled();
  });
});
