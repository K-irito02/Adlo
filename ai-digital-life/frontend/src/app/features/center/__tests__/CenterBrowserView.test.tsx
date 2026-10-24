import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CenterBrowserView } from '../CenterBrowserView';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import { browserPool } from '@features/browser/browserPoolSingleton';
import type { CopyDict } from '@i18n/types';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { ShortcutSite } from '@stores/slices/browserLandingSlice';

vi.mock('@features/browser/checkEmbed', () => ({
  isEmbedBlocked: () => true,
  checkEmbed: async () => true,
}));

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
    // 无参 browserToggleBookmark() 取 store 的 browserActiveTabId，而它被
    // clampPanelActiveTab 恒夹到面板标签 → 中心侧必须显式传自己的 (url,title)。
    const centerTab = { ...makeTab('b1', 'https://x.test'), title: 'CenterTitle' };
    const panelTab = {
      ...makeTab('p1', 'https://panel.test'),
      title: 'PanelTitle',
      location: 'panel' as const,
    };
    const spy = vi.fn();
    const realToggle = useAppStore.getState().browserToggleBookmark;
    useAppStore.setState({
      browserTabs: [centerTab, panelTab],
      browserTabsById: { b1: centerTab, p1: panelTab },
      browserActiveTabId: 'p1',
      // 只关心 (url,title) 元组，其余字段与断言无关
      browserBookmarks: [{ url: 'https://x.test', title: 'CenterTitle' }] as never,
      browserToggleBookmark: spy as never,
    });

    try {
      renderView('b1');
      fireEvent.click(screen.getByRole('button', { name: 'Remove bookmark' }));
      expect(spy).toHaveBeenCalledWith({ url: 'https://x.test', title: 'CenterTitle' });
    } finally {
      useAppStore.setState({ browserToggleBookmark: realToggle, browserBookmarks: [] });
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
});
