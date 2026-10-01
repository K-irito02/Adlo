import { describe, it, expect, afterEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CenterBrowserView } from '../CenterBrowserView';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
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

function renderView(browserTabId: string, centerTabId = 'c1') {
  return render(
    <TCopyProvider t={t} locale="zh-CN">
      <CenterBrowserView centerTabId={centerTabId} browserTabId={browserTabId} />
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
});
