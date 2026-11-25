import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { zhCN } from '@i18n/zh-CN';

const ctx = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  actions: {} as Record<string, unknown>,
}));

const landingProbe = vi.hoisted(() => ({ active: null as boolean | null }));

vi.mock('./BrowserPanelStateContext', () => ({ useBrowserPanelState: () => ctx.state }));
vi.mock('./BrowserPanelActionsContext', () => ({ useBrowserPanelActions: () => ctx.actions }));
vi.mock('./SafeIframe', () => ({ SafeIframe: () => <iframe title="test-iframe" /> }));
vi.mock('./browser-landing', () => ({
  BrowserLandingPage: (props: { active?: boolean }) => {
    landingProbe.active = props.active ?? null;
    return <div data-testid="landing" />;
  },
}));

import { BrowserIframeStack } from './BrowserIframeStack';
import { useAppStore } from '@stores/slicedStore';

function tab(): BrowserTabState {
  return {
    id: 'b1',
    workspaceId: '',
    title: '',
    url: 'https://example.com/',
    titleResolved: true,
    isPinned: false,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
    isDownloading: false,
  };
}

function setState(overrides: Record<string, unknown> = {}, validated = false) {
  const activeTab = tab();
  ctx.state = {
    t: zhCN,
    activeTab,
    hasActiveTab: true,
    browserTabs: [activeTab],
    isBrowserVisible: true,
    loadingTabId: null,
    iframeRef: { current: null },
    iframeBlockedDetected: false,
    iframeLoadError: false,
    isEmbedPending: false,
    validatedUrlsRef: { current: new Set<string>(validated ? [activeTab.url] : []) },
    activatedTabIdsRef: { current: new Set<string>() },
    ...overrides,
  };
}

describe('BrowserIframeStack embed fallback', () => {
  beforeEach(() => {
    useAppStore.setState({ isTauri: false });
    ctx.actions = { handleIframeLoad: vi.fn(), handleIframeError: vi.fn() };
  });

  afterEach(cleanup);

  it('renders the blocked overlay in browser mode instead of a blank area', () => {
    setState({ iframeBlockedDetected: true });

    render(<BrowserIframeStack />);

    expect(screen.getByText(zhCN.browserCannotOpenEmbedded)).toBeTruthy();
    expect(screen.getByRole('button', { name: zhCN.browserOpenExternal })).toBeTruthy();
  });

  it('keeps rendering the normal iframe without the overlay', () => {
    setState({}, true);

    render(<BrowserIframeStack />);

    expect(screen.getByTitle('test-iframe')).toBeTruthy();
    expect(screen.queryByText(zhCN.browserCannotOpenEmbedded)).toBeNull();
  });

  it('把 isBrowserVisible 透传给着陆页（面板收起/切工具时为 false）', () => {
    const emptyTab = { ...tab(), url: '' };
    setState({
      activeTab: emptyTab,
      browserTabs: [emptyTab],
      hasActiveTab: true,
      isBrowserVisible: false,
    });

    render(<BrowserIframeStack />);

    expect(screen.getByTestId('landing')).toBeTruthy();
    expect(landingProbe.active).toBe(false);
  });
});
