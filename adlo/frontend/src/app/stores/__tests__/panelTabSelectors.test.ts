import { afterEach, describe, expect, it } from 'vitest';
import type { BrowserTabState } from '../slices/browserSlice';
import type { TerminalTabState } from '../slices/terminalSliceTypes';
import { useAppStore } from '../slicedStore';
import { panelTabSelectors } from '../selectors';

function browserTab(id: string, location?: 'panel' | 'center'): BrowserTabState {
  return {
    id,
    workspaceId: '',
    title: id,
    url: `https://${id}.test`,
    titleResolved: true,
    isPinned: false,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
    isDownloading: false,
    ...(location ? { location } : {}),
  };
}

function terminalTab(id: string, location?: 'panel' | 'center'): TerminalTabState {
  const pane = {
    id: `${id}-pane0`,
    profile: 'powershell',
    status: 'idle',
    colorIndex: 0,
  } as const;
  return {
    id,
    workspaceId: '',
    title: id,
    profile: 'powershell',
    panes: [pane],
    activePaneId: pane.id,
    isPinned: false,
    sortOrder: 0,
    ...(location ? { location } : {}),
  };
}

afterEach(() => {
  useAppStore.setState({
    browserTabs: [],
    browserTabsById: {},
    terminalTabs: [],
    terminalTabsById: {},
  });
});

describe('panelTabSelectors（面板标签唯一入口）', () => {
  it('列表与计数都排除中心标签', () => {
    useAppStore.setState({
      browserTabs: [browserTab('panel-b'), browserTab('center-b', 'center')],
      terminalTabs: [terminalTab('panel-t'), terminalTab('center-t', 'center')],
    });
    const state = useAppStore.getState();

    expect(panelTabSelectors.getPanelBrowserTabs(state).map((tab) => tab.id)).toEqual(['panel-b']);
    expect(panelTabSelectors.getPanelTerminalTabs(state).map((tab) => tab.id)).toEqual(['panel-t']);
    expect(panelTabSelectors.getPanelBrowserTabCount(state)).toBe(1);
    expect(panelTabSelectors.getPanelTerminalTabCount(state)).toBe(1);
  });

  it('缺省 location 的标签按面板标签处理', () => {
    useAppStore.setState({
      browserTabs: [browserTab('legacy-b')],
      terminalTabs: [terminalTab('legacy-t')],
    });
    const state = useAppStore.getState();

    expect(panelTabSelectors.getPanelBrowserTabCount(state)).toBe(1);
    expect(panelTabSelectors.getPanelTerminalTabCount(state)).toBe(1);
  });
});
