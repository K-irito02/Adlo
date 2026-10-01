import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TCopyProvider } from '../i18n/TCopyContext';
import type { CopyDict } from '../i18n/types';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { CenterTabStrip } from './CenterTabStrip';

afterEach(cleanup);

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

function renderStrip() {
  return render(
    <TestProvider>
      <CenterTabStrip />
    </TestProvider>,
  );
}

describe('CenterTabStrip', () => {
  beforeEach(() =>
    useAppStore.setState({
      centerTabs: [],
      centerActiveTabId: '',
      browserTabs: [],
      browserTabsById: {},
      terminalTabs: [],
      terminalTabsById: {},
    }),
  );

  it('渲染标签并支持切换', () => {
    const a = useAppStore.getState().centerAddTab('launcher', null);
    const b = useAppStore.getState().centerAddTab('launcher', null);
    renderStrip();
    fireEvent.click(screen.getAllByRole('tab')[0]);
    expect(useAppStore.getState().centerActiveTabId).toBe(a);
    fireEvent.click(screen.getAllByRole('tab')[1]);
    expect(useAppStore.getState().centerActiveTabId).toBe(b);
  });

  it('点击 + 新建 launcher 标签', () => {
    renderStrip();
    fireEvent.click(screen.getByRole('button', { name: 'centerNewTab' }));
    const tabs = useAppStore.getState().centerTabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].kind).toBe('launcher');
  });

  it('关闭按钮移除对应标签', () => {
    const a = useAppStore.getState().centerAddTab('launcher', null);
    useAppStore.getState().centerAddTab('launcher', null);
    renderStrip();
    fireEvent.click(screen.getAllByRole('button', { name: 'close' })[0]);
    const tabs = useAppStore.getState().centerTabs;
    expect(tabs.some((tab) => tab.id === a)).toBe(false);
    expect(tabs).toHaveLength(1);
  });

  it('关闭 browser 中心标签同时移除底层标签与中心项', () => {
    const refId = 'b1';
    const browserTab: BrowserTabState = {
      id: refId,
      workspaceId: '',
      title: 'Example',
      url: 'https://example.test',
      titleResolved: true,
      isPinned: false,
      sortOrder: 0,
      isPlayingAudio: false,
      isAudioMuted: false,
      isDownloading: false,
      location: 'center',
    };
    useAppStore.setState({
      browserTabs: [browserTab],
      browserTabsById: { [refId]: browserTab },
    });
    const centerId = useAppStore.getState().centerAddTab('browser', refId);
    renderStrip();
    fireEvent.click(screen.getAllByRole('button', { name: 'close' })[0]);
    const state = useAppStore.getState();
    expect(state.browserTabs.some((tab) => tab.id === refId)).toBe(false);
    expect(state.centerTabs.some((tab) => tab.id === centerId)).toBe(false);
  });
});
