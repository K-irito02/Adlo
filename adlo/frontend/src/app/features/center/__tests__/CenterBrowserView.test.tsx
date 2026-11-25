import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CenterBrowserView } from '../CenterBrowserView';
import { computeCenterOverlayActive } from '../centerOverlay';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import { browserPool } from '@features/browser/browserPoolSingleton';
import type { CopyDict } from '@i18n/types';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { ShortcutSite } from '@stores/slices/browserLandingSlice';
import type * as BrowserLandingModule from '@features/browser/browser-landing';

const embedState = vi.hoisted(() => ({
  blocked: true,
  /** `isEmbedBlocked` 的返回；undefined 表示强制走异步 checkEmbed。 */
  cached: true as boolean | undefined,
  deferred: null as Promise<boolean> | null,
}));

vi.mock('@features/browser/checkEmbed', () => ({
  isEmbedBlocked: () => embedState.cached,
  checkEmbed: async () => embedState.deferred ?? embedState.blocked,
}));

const landingProbe = vi.hoisted(() => ({ active: null as boolean | null }));

vi.mock('@features/browser/browser-landing', async (importOriginal) => {
  const actual = await importOriginal<typeof BrowserLandingModule>();
  return {
    ...actual,
    BrowserLandingPage: (props: Parameters<typeof actual.BrowserLandingPage>[0]) => {
      landingProbe.active = props.active ?? null;
      return actual.BrowserLandingPage(props);
    },
  };
});

const t = {
  toolBrowser: 'Browser',
  browserBack: 'Back',
  browserForward: 'Forward',
  browserRefresh: 'Refresh',
  browserAddress: 'Address',
  browserCopyLink: 'Copy link',
  copySuccessClipboard: 'Copied',
  bookmark: 'Bookmark',
  unbookmark: 'Remove bookmark',
  browserSearchEngineSettings: 'Search engine settings',
  browserDownloadTitle: 'Downloads',
  browserContextMore: 'More actions',
  newTabPage: 'New tab page',
  browserShortcuts: 'Shortcuts',
  browserLocalPreview: 'Local preview',
  browserBlankTab: 'New tab',
  browserLocalPorts: 'Local ports',
  browserAddShortcut: 'Add shortcut',
  browserAddShortcutTitle: 'Add shortcut',
  browserAddManualPort: 'Add port',
  browserRefreshPorts: 'Refresh ports',
  browserCannotOpenEmbedded: 'Cannot embed this site',
  browserOpenExternal: 'Open externally',
  browserBookmarkToFolderTitle: 'BookmarkToFolder',
  browserBookmarkName: 'Bookmark name',
  browserBookmarkNamePlaceholder: 'Bookmark name',
} as unknown as CopyDict;

function makeTab(id: string, url: string): BrowserTabState {
  return {
    id,
    workspaceId: '',
    title: '',
    url,
    titleResolved: false,
    isPinned: false,
    sortOrder: 1,
    isPlayingAudio: false,
    isAudioMuted: false,
    isDownloading: false,
    location: 'center',
  };
}

function renderView(browserTabId: string) {
  return render(
    <TCopyProvider t={t} locale="zh-CN">
      <CenterBrowserView browserTabId={browserTabId} />
    </TCopyProvider>,
  );
}

afterEach(() => {
  embedState.blocked = true;
  embedState.cached = true;
  embedState.deferred = null;
  useAppStore.setState({
    browserTabs: [],
    browserTabsById: {},
    browserActiveTabId: '',
    centerTabs: [],
    centerActiveTabId: '',
    browserShortcuts: [],
    browserPendingBookmark: null,
  });
});

describe('CenterBrowserView', () => {
  it('地址栏展开不计入中心 overlay（展开不得隐藏 WebView2）', () => {
    expect(
      computeCenterOverlayActive({
        browserMenuOpen: false,
        searchEnginePopoverOpen: false,
        bookmarkDialogOpen: false,
        createDirDialogOpen: false,
        addressExpanded: true,
      }),
    ).toBe(false);
    expect(
      computeCenterOverlayActive({
        browserMenuOpen: true,
        searchEnginePopoverOpen: false,
        bookmarkDialogOpen: false,
        createDirDialogOpen: false,
        addressExpanded: true,
      }),
    ).toBe(true);
  });

  it('渲染地址栏', () => {
    renderView('');
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('空 URL 的标签渲染落地页', () => {
    const tab = makeTab('b1', '');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { b1: tab },
      browserActiveTabId: 'b1',
    });
    renderView('b1');
    expect(screen.getByText('Shortcuts')).toBeTruthy();
    expect(screen.getByText('Local ports')).toBeTruthy();
  });

  it('落地页点击快捷站点就地导航当前中心标签（事项 7，不新建标签）', () => {
    const tab = makeTab('b1', '');
    const site: ShortcutSite = {
      id: 's1',
      name: 'Example',
      url: 'https://example.com',
      sortOrder: 1,
      createdAt: 1,
    };
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { b1: tab },
      browserActiveTabId: 'b1',
      browserShortcuts: [site],
    });
    const { container } = renderView('b1');
    const card = container.querySelector('.adl-shortcut-card') as HTMLElement;
    expect(card).toBeTruthy();
    fireEvent.click(card);

    const s = useAppStore.getState();
    // 不新建标签：仍只有一个标签，且就是原来的 b1，就地导航到快捷站点。
    expect(s.browserTabs).toHaveLength(1);
    expect(s.browserTabsById['b1'].url).toBe('https://example.com');
  });

  it('中心地址栏提交就地导航，不跟随面板新建/当前开关（事项 7）', async () => {
    const tab = makeTab('b1', 'https://old.example.com');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { b1: tab },
      browserActiveTabId: 'b1',
      // 开关切到"新建标签"模式：中心仍必须就地导航。isTauri 显式 false
      //（浏览器模式），不依赖运行环境默认值，防 flaky。
      browserNavigateInPlace: false,
      isTauri: false,
    });
    renderView('b1');
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://new.example.com' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(useAppStore.getState().browserTabs).toHaveLength(1);
    });
    expect(useAppStore.getState().browserTabsById['b1'].url).toBe('https://new.example.com');
  });

  it('切换引擎只重搜中心当前标签，后台面板标签不动', async () => {
    embedState.blocked = false;
    embedState.cached = false;
    useAppStore.getState().initializeSearchEngines();
    useAppStore.getState().setDefaultSearchEngine('百度');
    const query = '测试搜索';
    const centerTab = makeTab('c1', `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`);
    const bgTab: BrowserTabState = {
      ...makeTab('p1', 'https://www.sogou.com/web?query=%E5%90%8E%E5%8F%B0'),
      location: undefined,
    };
    useAppStore.setState({
      browserTabs: [centerTab, bgTab],
      browserTabsById: { c1: centerTab, p1: bgTab },
      browserActiveTabId: 'p1',
      isTauri: false,
    });
    renderView('c1');

    fireEvent.click(screen.getByRole('button', { name: 'Search engine settings' }));
    fireEvent.click(screen.getByText('Google'));

    await waitFor(() => {
      expect(useAppStore.getState().browserTabsById['c1'].url).toBe(
        `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      );
    });
    expect(useAppStore.getState().browserTabsById['p1'].url).toBe(bgTab.url);
  });

  it('非搜索页切换引擎不重载当前中心标签', async () => {
    embedState.blocked = false;
    embedState.cached = false;
    useAppStore.getState().initializeSearchEngines();
    useAppStore.getState().setDefaultSearchEngine('百度');
    const tab = makeTab('c1', 'https://example.com/article');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { c1: tab },
      browserActiveTabId: 'c1',
      isTauri: false,
    });
    renderView('c1');

    fireEvent.click(screen.getByRole('button', { name: 'Search engine settings' }));
    fireEvent.click(screen.getByText('Google'));
    await act(async () => {});

    expect(useAppStore.getState().browserTabsById['c1'].url).toBe('https://example.com/article');
  });

  it('切换引擎被嵌入预检拒绝时仍更新标签并显示兜底', async () => {
    embedState.blocked = true;
    embedState.cached = true;
    useAppStore.getState().initializeSearchEngines();
    useAppStore.getState().setDefaultSearchEngine('百度');
    const query = '拒绝测试';
    const tab = makeTab('c1', `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`);
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { c1: tab },
      browserActiveTabId: 'c1',
      isTauri: false,
    });
    renderView('c1');

    fireEvent.click(screen.getByRole('button', { name: 'Search engine settings' }));
    fireEvent.click(screen.getByText('Google'));

    await waitFor(() => {
      expect(useAppStore.getState().browserTabsById['c1'].url).toBe(
        `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      );
    });
    expect(screen.getByRole('button', { name: 'Open externally' })).toBeTruthy();
  });

  it('does not apply a deferred engine switch after the center tab changed', async () => {
    embedState.blocked = false;
    embedState.cached = undefined;
    let resolveCheck: (value: boolean) => void = () => {};
    embedState.deferred = new Promise((resolve) => {
      resolveCheck = resolve;
    });
    useAppStore.getState().initializeSearchEngines();
    useAppStore.getState().setDefaultSearchEngine('百度');
    const query = '竞态测试';
    const baiduUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
    const first = makeTab('c1', baiduUrl);
    const second = makeTab('c2', 'https://example.com/');
    useAppStore.setState({
      browserTabs: [first, second],
      browserTabsById: { c1: first, c2: second },
      browserActiveTabId: 'c1',
      isTauri: false,
    });
    const view = renderView('c1');

    fireEvent.click(screen.getByRole('button', { name: 'Search engine settings' }));
    fireEvent.click(screen.getByText('Google'));
    view.rerender(
      <TCopyProvider t={t} locale="zh-CN">
        <CenterBrowserView browserTabId="c2" />
      </TCopyProvider>,
    );

    await act(async () => {
      resolveCheck(false);
      await Promise.resolve();
    });

    expect(useAppStore.getState().browserTabsById['c1'].url).toBe(baiduUrl);
  });

  it('does not overwrite a newer same-tab navigation when the precheck resolves later', async () => {
    embedState.blocked = false;
    embedState.cached = undefined;
    let resolveCheck: (value: boolean) => void = () => {};
    embedState.deferred = new Promise((resolve) => {
      resolveCheck = resolve;
    });
    useAppStore.getState().initializeSearchEngines();
    useAppStore.getState().setDefaultSearchEngine('百度');
    const tab = makeTab('c1', `https://www.baidu.com/s?wd=${encodeURIComponent('旧查询')}`);
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { c1: tab },
      browserActiveTabId: 'c1',
      isTauri: false,
    });
    renderView('c1');

    fireEvent.click(screen.getByRole('button', { name: 'Search engine settings' }));
    fireEvent.click(screen.getByText('Google'));
    act(() => {
      useAppStore
        .getState()
        .browserUpdateTab('c1', { url: 'https://example.com/newer-navigation' });
    });

    await act(async () => {
      resolveCheck(false);
      await Promise.resolve();
    });

    expect(useAppStore.getState().browserTabsById['c1'].url).toBe(
      'https://example.com/newer-navigation',
    );
  });

  it('嵌入被拒时渲染外部打开兜底', () => {
    const tab = makeTab('b1', 'https://blocked.example.com');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { b1: tab },
      browserActiveTabId: 'b1',
    });
    renderView('b1');
    expect(screen.getByRole('button', { name: 'Open externally' })).toBeTruthy();
  });

  it('data-webview-active 门控：仅已入池的原生 WebView 才标记', async () => {
    const tab = makeTab('b1', 'https://x.test');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { b1: tab },
      browserActiveTabId: 'b1',
      isTauri: true,
    });
    await browserPool.createForTab('b1', 'https://x.test');
    try {
      const { container, unmount } = renderView('b1');
      expect(
        container
          .querySelector('.adl-center-browser__content')
          ?.hasAttribute('data-webview-active'),
      ).toBe(true);
      unmount();
    } finally {
      browserPool.reset();
      useAppStore.setState({ isTauri: false });
    }
  });

  it('data-webview-active 门控：未入池时不标记（tooltip 无需避让）', () => {
    const tab = makeTab('b1', 'https://x.test');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { b1: tab },
      browserActiveTabId: 'b1',
      isTauri: true,
    });
    try {
      const { container, unmount } = renderView('b1');
      expect(
        container
          .querySelector('.adl-center-browser__content')
          ?.hasAttribute('data-webview-active'),
      ).toBe(false);
      unmount();
    } finally {
      useAppStore.setState({ isTauri: false });
    }
  });

  it('工具栏复用面板作用域类（地址栏 / 菜单 / 收缩行为与右侧面板同源）', () => {
    const tab = makeTab('b1', 'https://x.test');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { b1: tab },
      browserActiveTabId: 'b1',
    });
    const { container } = renderView('b1');
    const root = container.querySelector('.adl-center-browser');
    expect(root?.classList.contains('adl-tool-panel')).toBe(true);
    expect(root?.classList.contains('adl-tool-panel--browser')).toBe(true);
    expect(container.querySelector('.adl-tool-search--address')).toBeTruthy();
  });

  it('不订阅待收藏项投递：store 投递不会让中心开框（防与面板双弹窗）', async () => {
    // 生产接线守卫：若 CenterBrowserView 漏传 watchStorePending:false，本用例必失败。
    const tab = makeTab('b1', 'https://x.test');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { b1: tab },
      browserActiveTabId: 'b1',
    });
    renderView('b1');

    await act(async () => {
      useAppStore.getState().browserSetPendingBookmark({ url: 'https://p.test', title: 'Pending' });
    });
    await act(async () => {});

    expect(screen.queryByRole('dialog')).toBeNull();
    // 投递仍留在 store 中，交由面板侧消费
    expect(useAppStore.getState().browserPendingBookmark).not.toBeNull();
  });

  it('回归：已收藏时点击收藏按钮，取消的是中心标签的书签（而非面板活动标签）', () => {
    // store 的 browserActiveTabId 被 clampPanelActiveTab 恒夹到面板标签 →
    // 中心侧必须用**自己的**活动标签 URL 取消收藏。
    const centerTab = { ...makeTab('b1', 'https://x.test'), title: 'CenterTitle' };
    const panelTab = {
      ...makeTab('p1', 'https://panel.test'),
      title: 'PanelTitle',
      location: 'panel' as const,
    };
    const spy = vi.fn();
    const realRemove = useAppStore.getState().browserRemoveBookmarksForUrl;
    useAppStore.setState({
      browserTabs: [centerTab, panelTab],
      browserTabsById: { b1: centerTab, p1: panelTab },
      browserActiveTabId: 'p1',
      // 收藏身份只看 URL，标题是快照
      browserBookmarks: [{ url: 'https://x.test', title: 'ImportedTitle' }] as never,
      browserRemoveBookmarksForUrl: spy as never,
    });

    try {
      renderView('b1');
      fireEvent.click(screen.getByRole('button', { name: 'Remove bookmark' }));
      expect(spy).toHaveBeenCalledWith('https://x.test');
    } finally {
      useAppStore.setState({ browserRemoveBookmarksForUrl: realRemove, browserBookmarks: [] });
    }
  });

  it('点击收藏标签按钮打开收藏目录对话框（含中心活动标签的名称预填）', async () => {
    const tab = { ...makeTab('b1', 'https://x.test'), title: 'CenterTitle' };
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { b1: tab },
      browserActiveTabId: 'b1',
    });
    renderView('b1');

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bookmark' }));

    // 无障碍名 = i18n 标题；名称输入预填中心活动标签标题 → 证明 hook 拿到了中心的 activeTab
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'BookmarkToFolder' })).toBeTruthy(),
    );
    expect(screen.getByDisplayValue('CenterTitle')).toBeTruthy();
  });

  it('右侧面板进入浮层态时隐藏中心 WebView 并撤销 tooltip 避让标记', async () => {
    const shellBody = document.createElement('div');
    shellBody.className = 'adl-shell__body';
    document.body.appendChild(shellBody);

    const tab = makeTab('b1', 'https://x.test');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { b1: tab },
      browserActiveTabId: 'b1',
      isTauri: true,
    });
    await browserPool.createForTab('b1', 'https://x.test');

    try {
      const { container, unmount } = renderView('b1');
      const content = container.querySelector('.adl-center-browser__content');
      expect(content?.hasAttribute('data-webview-active')).toBe(true);

      // 拖拽右侧面板覆盖中心 → shell body 获得浮层类（useRightPanelLayout 写入）。
      // 两个类都要覆盖：-expanded = overlay_full，-active = overlay_partial（含 expanded）。
      for (const overlayClass of [
        'is-rightpanel-overlay-expanded',
        'is-rightpanel-overlay-active',
      ]) {
        await act(async () => {
          shellBody.classList.add(overlayClass);
        });
        await waitFor(() => expect(content?.hasAttribute('data-webview-active')).toBe(false));

        // 回到停靠态 → 恢复避让标记
        await act(async () => {
          shellBody.classList.remove(overlayClass);
        });
        await waitFor(() => expect(content?.hasAttribute('data-webview-active')).toBe(true));
      }

      unmount();
    } finally {
      shellBody.remove();
      browserPool.reset();
      useAppStore.setState({ isTauri: false });
    }
  });

  it('把 !centerObscured 透传给着陆页（浮层遮挡时 active=false）', async () => {
    const shellBody = document.createElement('div');
    shellBody.className = 'adl-shell__body';
    document.body.appendChild(shellBody);
    landingProbe.active = null;

    const tab = makeTab('b1', '');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { b1: tab },
      browserActiveTabId: 'b1',
    });

    try {
      renderView('b1');
      expect(landingProbe.active).toBe(true);

      await act(async () => {
        shellBody.classList.add('is-rightpanel-overlay-active');
      });
      await waitFor(() => expect(landingProbe.active).toBe(false));
    } finally {
      shellBody.remove();
    }
  });
});
