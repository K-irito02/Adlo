import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TCopyProvider } from '@i18n/TCopyContext';
import type { CopyDict } from '@i18n/types';
import { BrowserNavSearchMode } from '../BrowserNavSearchMode';
import type { BookmarkFolder } from '@stores/slices/browserTypes';
import type { BrowserHistoryState } from '@stores/slices/browserTypes';
import type { BrowserTabState } from '@stores/slices/browserSlice';

const t = new Proxy(
  {},
  {
    get: (_target, key: string) => key,
  },
) as unknown as CopyDict;

const folder: BookmarkFolder = {
  id: 'f1',
  name: 'F',
  createdAt: 0,
  entries: [
    {
      id: 'bm-3000',
      url: 'http://localhost:3000/app',
      title: '三千',
      addedAt: 0,
      lastModifiedAt: 0,
    },
    {
      id: 'bm-5173',
      url: 'https://localhost:5173/app',
      title: '五千',
      addedAt: 0,
      lastModifiedAt: 0,
    },
  ],
};

const defaultBookmarks = [
  { title: '三千', url: 'http://localhost:3000/app' },
  { title: '五千', url: 'https://localhost:5173/app' },
];

function makeTab(id: string, url: string, title = 'Tab'): BrowserTabState {
  return {
    id,
    workspaceId: 'ws',
    title,
    url,
    titleResolved: true,
    isPinned: false,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
    isDownloading: false,
  };
}

function renderSearch(
  searchResults: { title: string; url: string; source?: string }[],
  history: BrowserHistoryState[] = [],
  folders: BookmarkFolder[] = [folder],
  options: { bookmarks?: { title: string; url: string }[]; tabs?: BrowserTabState[] } = {},
) {
  const onRemoveBookmarkTab = vi.fn();
  const onDeleteTab = vi.fn();
  const onEditTab = vi.fn();
  const onOpenTabInNewTab = vi.fn();
  const utils = render(
    <TCopyProvider t={t} locale="zh-CN">
      <BrowserNavSearchMode
        searchResults={searchResults.map((result) => ({
          ...result,
          source: result.source ?? 'browserSavedTabs',
        }))}
        browserTabs={options.tabs ?? []}
        browserHistory={history}
        browserBookmarks={options.bookmarks ?? defaultBookmarks}
        browserBookmarkFolders={folders}
        browserWorkspaceBookmarks={{}}
        onSelectResult={vi.fn()}
        onRefreshTab={vi.fn()}
        onEditTab={onEditTab}
        onDeleteTab={onDeleteTab}
        onCopyTabLink={vi.fn()}
        onOpenTabInNewTab={onOpenTabInNewTab}
        onOpenTabInCurrentTab={vi.fn()}
        onRemoveBookmarkTab={onRemoveBookmarkTab}
      />
    </TCopyProvider>,
  );
  return { ...utils, onRemoveBookmarkTab, onDeleteTab, onEditTab, onOpenTabInNewTab };
}

function rowOf(container: HTMLElement, label: string): Element {
  const row = [...container.querySelectorAll('.adl-filetree__row')].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  expect(row).toBeDefined();
  return row as Element;
}

function openRowMenu(container: HTMLElement, label: string) {
  fireEvent.contextMenu(rowOf(container, label), { clientX: 10, clientY: 10 });
}

describe('BrowserNavSearchMode 书签行归属', () => {
  it('同 host/path 不同端口的书签行锚定各自的条目 id', () => {
    const { container, onRemoveBookmarkTab } = renderSearch([
      { title: '五千', url: 'https://localhost:5173/app' },
    ]);
    openRowMenu(container, '五千');
    fireEvent.click(screen.getByText('browserUnbookmark'));
    expect(onRemoveBookmarkTab).toHaveBeenCalledWith('bm-5173', 'https://localhost:5173/app');
  });

  it('同一 URL 收藏进两个目录时，按标题锚定自己的条目（顺序无关）', () => {
    const duplicateFolder: BookmarkFolder = {
      id: 'f-dup',
      name: 'Dup',
      createdAt: 0,
      entries: [
        { id: 'bm-dup-1', url: 'http://dup.test/app', title: 'A', addedAt: 0, lastModifiedAt: 0 },
        { id: 'bm-dup-2', url: 'http://dup.test/app', title: 'B', addedAt: 0, lastModifiedAt: 0 },
      ],
    };
    // 搜索结果顺序与目录顺序相反：B 在前、A 在后。
    const { container, onRemoveBookmarkTab } = renderSearch(
      [
        { title: 'B', url: 'http://dup.test/app' },
        { title: 'A', url: 'http://dup.test/app' },
      ],
      [],
      [duplicateFolder],
    );
    openRowMenu(container, 'B');
    fireEvent.click(screen.getByText('browserUnbookmark'));

    openRowMenu(container, 'A');
    fireEvent.click(screen.getByText('browserUnbookmark'));

    expect(onRemoveBookmarkTab.mock.calls).toEqual([
      ['bm-dup-2', 'http://dup.test/app'],
      ['bm-dup-1', 'http://dup.test/app'],
    ]);
  });

  it('同一 URL 既收藏又访问过时，默认来源为收藏则书签优先', () => {
    const history: BrowserHistoryState[] = [
      { id: 'h-1', url: 'http://localhost:3000/app', title: '三千', visitedAt: 1 },
    ];
    const { container, onRemoveBookmarkTab, onDeleteTab } = renderSearch(
      [{ title: '三千', url: 'http://localhost:3000/app' }],
      history,
    );
    openRowMenu(container, '三千');
    expect(screen.queryByText('browserContextOpenCurrent')).toBeNull();
    fireEvent.click(screen.getByText('browserUnbookmark'));
    expect(onRemoveBookmarkTab).toHaveBeenCalledWith('bm-3000', 'http://localhost:3000/app');
    expect(onDeleteTab).not.toHaveBeenCalled();
  });

  it('历史域搜出的行仍按历史处理（删除历史，不删书签）', () => {
    const history: BrowserHistoryState[] = [
      { id: 'h-1', url: 'http://localhost:3000/app', title: '三千', visitedAt: 1 },
    ];
    const { container, onRemoveBookmarkTab, onDeleteTab } = renderSearch(
      [{ title: '三千', url: 'http://localhost:3000/app', source: 'browserHistoryTabs' }],
      history,
    );
    openRowMenu(container, '三千');
    fireEvent.click(screen.getByText('browserContextDelete'));
    expect(onDeleteTab).toHaveBeenCalledWith('h-1', 'http://localhost:3000/app');
    expect(onRemoveBookmarkTab).not.toHaveBeenCalled();
  });

  it('纯书签行的「编辑」按条目 id 打开（不再因无 tabId 被裁掉）', () => {
    const { container, onEditTab, onRemoveBookmarkTab } = renderSearch([
      { title: '五千', url: 'https://localhost:5173/app' },
    ]);
    openRowMenu(container, '五千');
    fireEvent.click(screen.getByText('browserContextEdit'));
    expect(onEditTab).toHaveBeenCalledWith('bm-5173', '五千', 'https://localhost:5173/app');

    // 「删除」同样按条目级移除，而不是关标签/删历史。
    openRowMenu(container, '五千');
    fireEvent.click(screen.getByText('browserContextDelete'));
    expect(onRemoveBookmarkTab).toHaveBeenCalledWith('bm-5173', 'https://localhost:5173/app');
  });

  it('global-only 书签不会抢同 URL 目录条目的 id', () => {
    const mixedFolder: BookmarkFolder = {
      id: 'f-mixed-id',
      name: 'MixedId',
      createdAt: 0,
      entries: [
        {
          id: 'bm-official',
          url: 'https://mixed.test/app',
          title: '官方标题',
          addedAt: 0,
          lastModifiedAt: 0,
        },
      ],
    };
    const { container } = renderSearch(
      [{ title: '全局标题', url: 'https://mixed.test/app' }],
      [],
      [mixedFolder],
      {
        bookmarks: [...defaultBookmarks, { title: '全局标题', url: 'https://mixed.test/app' }],
      },
    );
    openRowMenu(container, '全局标题');
    // 标题不匹配时不得回退到同 URL 的其它条目：不应出现依赖 bookmarkId 的编辑/删除。
    expect(screen.getByText('browserUnbookmark')).toBeDefined();
    expect(screen.queryByText('browserContextEdit')).toBeNull();
    expect(screen.queryByText('browserContextDelete')).toBeNull();
  });

  it('历史行即使有同名活标签，也不提供依赖 tabId 的编辑（刷新保留）', () => {
    const history: BrowserHistoryState[] = [
      { id: 'h-live', url: 'https://history-live.test/app', title: 'HistoryLive', visitedAt: 1 },
    ];
    const { container } = renderSearch(
      [
        {
          title: 'HistoryLive',
          url: 'https://history-live.test/app',
          source: 'browserHistoryTabs',
        },
      ],
      history,
      [folder],
      { tabs: [makeTab('tab-live', 'https://history-live.test/app', 'HistoryLive')] },
    );
    openRowMenu(container, 'HistoryLive');
    expect(screen.queryByText('browserContextEdit')).toBeNull();
    // 刷新对历史 id 有效（写回历史标题），与树/列表菜单及悬停按钮一致。
    expect(screen.getByText('browserRefreshMeta')).toBeDefined();
    // 「在当前标签打开」按 URL 生效；删除仍走历史 id。
    expect(screen.getByText('browserContextOpenCurrent')).toBeDefined();
    expect(screen.getByText('browserContextDelete')).toBeDefined();
  });

  it('仅存在于全局索引的书签仍按书签行处理（不被当成历史）', () => {
    const { container, onDeleteTab, onOpenTabInNewTab } = renderSearch(
      [{ title: 'GlobalOnly', url: 'https://global-only.test/app' }],
      [],
      [folder],
      {
        bookmarks: [
          ...defaultBookmarks,
          { title: 'GlobalOnly', url: 'https://global-only.test/app' },
        ],
      },
    );
    // browserBookmarks 有该 URL，但 folders 里没有条目。
    fireEvent.contextMenu(rowOf(container, 'GlobalOnly'), { clientX: 10, clientY: 10 });
    // 书签行有「取消收藏」入口，但不是历史行（没有可删的历史 tabId）。
    expect(screen.getByText('browserUnbookmark')).toBeDefined();
    expect(screen.queryByText('browserContextDelete')).toBeNull();
    expect(screen.queryByText('browserContextOpenCurrent')).toBeNull();
    // 标题隔离：书签行新标签打开不把快照标题当页面标题（isSavedBookmark=true）。
    fireEvent.click(screen.getByText('browserContextOpenNewTab'));
    expect(onOpenTabInNewTab).toHaveBeenCalledWith('https://global-only.test/app', undefined);
    expect(onDeleteTab).not.toHaveBeenCalled();
  });

  it('已打开标签行不消耗书签条目 id（后续书签行仍锚定自己的条目）', () => {
    const duplicateFolder: BookmarkFolder = {
      id: 'f-mixed',
      name: 'Mixed',
      createdAt: 0,
      entries: [
        { id: 'bm-one', url: 'https://dup.test/app', title: 'One', addedAt: 0, lastModifiedAt: 0 },
        { id: 'bm-two', url: 'https://dup.test/app', title: 'Two', addedAt: 0, lastModifiedAt: 0 },
      ],
    };
    const { container, onRemoveBookmarkTab } = renderSearch(
      [
        { title: 'One', url: 'https://dup.test/app', source: 'browserOpenTabs' },
        { title: 'One', url: 'https://dup.test/app' },
      ],
      [],
      [duplicateFolder],
      { tabs: [makeTab('tab-1', 'https://dup.test/app')] },
    );
    // 第一行是活标签，第二行是书签（同标题）。若活标签行消耗了 bm-one，
    // 第二行将无条目可锚定（旧 shift/回退行为），取消收藏不会命中 bm-one。
    const rows = [...container.querySelectorAll('.adl-filetree__row')];
    fireEvent.contextMenu(rows[1], { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getAllByText('browserUnbookmark')[0]);
    expect(onRemoveBookmarkTab).toHaveBeenCalledWith('bm-one', 'https://dup.test/app');
  });
});
