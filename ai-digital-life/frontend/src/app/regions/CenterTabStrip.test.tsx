import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TCopyProvider } from '../i18n/TCopyContext';
import type { CopyDict } from '../i18n/types';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { TerminalTabState } from '@stores/slices/terminalSlice';
import { CenterTabStrip } from './CenterTabStrip';
import { browserPool } from '@features/browser/browserPoolSingleton';

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

  it('关闭 browser 中心标签同时回收共享池中的 WebView', async () => {
    browserPool.reset();
    const refId = 'b-pool';
    const browserTab: BrowserTabState = {
      id: refId,
      workspaceId: '',
      title: 'Pooled',
      url: 'https://pooled.test',
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
    useAppStore.getState().centerAddTab('browser', refId);
    await browserPool.createForTab(refId, browserTab.url);
    expect(browserPool.isTabInPool(refId)).toBe(true);

    renderStrip();
    fireEvent.click(screen.getAllByRole('button', { name: 'close' })[0]);

    expect(browserPool.isTabInPool(refId)).toBe(false);
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

  it('终端中心标签双击进入重命名，Enter 提交新名称到 store', () => {
    const refId = 't-rename';
    const terminalTab: TerminalTabState = {
      id: refId,
      workspaceId: '',
      title: 'Old Name',
      profile: 'powershell',
      panes: [{ id: `${refId}-pane0`, profile: 'powershell', status: 'running', colorIndex: 0 }],
      activePaneId: `${refId}-pane0`,
      isPinned: false,
      sortOrder: 0,
      location: 'center',
    };
    useAppStore.setState({
      terminalTabs: [terminalTab],
      terminalTabsById: { [refId]: terminalTab },
    });
    useAppStore.getState().centerAddTab('terminal', refId);
    renderStrip();

    fireEvent.doubleClick(screen.getByRole('tab'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useAppStore.getState().terminalTabsById[refId].title).toBe('New Name');
  });

  it('重命名输入框内双击不会重置已输入文本', () => {
    const refId = 't-dbl';
    const terminalTab: TerminalTabState = {
      id: refId,
      workspaceId: '',
      title: 'Old',
      profile: 'powershell',
      panes: [{ id: `${refId}-pane0`, profile: 'powershell', status: 'running', colorIndex: 0 }],
      activePaneId: `${refId}-pane0`,
      isPinned: false,
      sortOrder: 0,
      location: 'center',
    };
    useAppStore.setState({
      terminalTabs: [terminalTab],
      terminalTabsById: { [refId]: terminalTab },
    });
    useAppStore.getState().centerAddTab('terminal', refId);
    renderStrip();

    fireEvent.doubleClick(screen.getByRole('tab'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Edited' } });
    fireEvent.doubleClick(input);

    expect(input.value).toBe('Edited');
  });

  it('重命名输入框内的按键不会冒泡被父标签吞掉并抢走选择', () => {
    const refId = 't-space';
    const terminalTab: TerminalTabState = {
      id: refId,
      workspaceId: '',
      title: 'Old',
      profile: 'powershell',
      panes: [{ id: `${refId}-pane0`, profile: 'powershell', status: 'running', colorIndex: 0 }],
      activePaneId: `${refId}-pane0`,
      isPinned: false,
      sortOrder: 0,
      location: 'center',
    };
    useAppStore.setState({
      terminalTabs: [terminalTab],
      terminalTabsById: { [refId]: terminalTab },
    });
    useAppStore.getState().centerAddTab('terminal', refId);
    const other = useAppStore.getState().centerAddTab('launcher', null);
    useAppStore.getState().centerSelectTab(other);
    renderStrip();

    // 双击第一个（终端）标签进入编辑；当前活动标签仍是 other
    fireEvent.doubleClick(screen.getAllByRole('tab')[0]);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: ' ' });

    // 守卫 event.target !== event.currentTarget：父标签未抢走选择
    expect(useAppStore.getState().centerActiveTabId).toBe(other);
  });

  it('重命名按 Escape 取消，不写入 store 且退出编辑', () => {
    const refId = 't-esc';
    const terminalTab: TerminalTabState = {
      id: refId,
      workspaceId: '',
      title: 'Old',
      profile: 'powershell',
      panes: [{ id: `${refId}-pane0`, profile: 'powershell', status: 'running', colorIndex: 0 }],
      activePaneId: `${refId}-pane0`,
      isPinned: false,
      sortOrder: 0,
      location: 'center',
    };
    useAppStore.setState({
      terminalTabs: [terminalTab],
      terminalTabsById: { [refId]: terminalTab },
    });
    useAppStore.getState().centerAddTab('terminal', refId);
    renderStrip();

    fireEvent.doubleClick(screen.getByRole('tab'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(useAppStore.getState().terminalTabsById[refId].title).toBe('Old');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('双击非终端标签不进入重命名', () => {
    useAppStore.getState().centerAddTab('launcher', null);
    renderStrip();
    fireEvent.doubleClick(screen.getByRole('tab'));
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('空白标题提交不覆盖原标题', () => {
    const refId = 't-blank';
    const terminalTab: TerminalTabState = {
      id: refId,
      workspaceId: '',
      title: 'Keep',
      profile: 'powershell',
      panes: [{ id: `${refId}-pane0`, profile: 'powershell', status: 'running', colorIndex: 0 }],
      activePaneId: `${refId}-pane0`,
      isPinned: false,
      sortOrder: 0,
      location: 'center',
    };
    useAppStore.setState({
      terminalTabs: [terminalTab],
      terminalTabsById: { [refId]: terminalTab },
    });
    useAppStore.getState().centerAddTab('terminal', refId);
    renderStrip();

    fireEvent.doubleClick(screen.getByRole('tab'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useAppStore.getState().terminalTabsById[refId].title).toBe('Keep');
  });
});
