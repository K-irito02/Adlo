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
  browserLocalPorts: 'Local ports',
  browserAddShortcut: 'Add shortcut',
  browserAddShortcutTitle: 'Add shortcut',
  browserAddManualPort: 'Add port',
  browserRefreshPorts: 'Refresh ports',
  browserCannotOpenEmbedded: 'Cannot embed this site',
  browserOpenExternal: 'Open externally',
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

  it('落地页点击快捷站点新建中心浏览器标签', () => {
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
    const created = s.browserTabs.find((x) => x.url === 'https://example.com');
    expect(created).toBeTruthy();
    expect(created?.location).toBe('center');
    expect(s.centerTabs.some((c) => c.refId === created?.id)).toBe(true);
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

  it('点击收藏标签按钮打开收藏目录对话框', async () => {
    const tab = makeTab('b1', 'https://x.test');
    useAppStore.setState({
      browserTabs: [tab],
      browserTabsById: { b1: tab },
      browserActiveTabId: 'b1',
    });
    renderView('b1');

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bookmark' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
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

      // 拖拽右侧面板覆盖中间区 → shell body 获得浮层类（useRightPanelLayout 写入）
      await act(async () => {
        shellBody.classList.add('is-rightpanel-overlay-expanded');
      });
      await waitFor(() => expect(content?.hasAttribute('data-webview-active')).toBe(false));

      // 回到停靠态 → 恢复避让标记
      await act(async () => {
        shellBody.classList.remove('is-rightpanel-overlay-expanded');
      });
      await waitFor(() => expect(content?.hasAttribute('data-webview-active')).toBe(true));

      unmount();
    } finally {
      shellBody.remove();
      browserPool.reset();
      useAppStore.setState({ isTauri: false });
    }
  });
});
