import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { TerminalTabState } from '@stores/slices/terminalSliceTypes';
import { useAppStore } from '@stores/slicedStore';
import { useRightPanelViewProps } from './useRightPanelViewProps';

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

describe('useRightPanelViewProps badges（只统计右侧面板标签）', () => {
  it('中心的浏览器/终端标签不计入徽章', () => {
    useAppStore.setState({
      browserTabs: [browserTab('panel-browser'), browserTab('center-browser', 'center')],
      terminalTabs: [terminalTab('panel-terminal'), terminalTab('center-terminal', 'center')],
    });

    const { result } = renderHook(() => useRightPanelViewProps());

    expect(result.current.badges.browser).toBe(1);
    expect(result.current.badges.terminal).toBe(1);
  });

  it('从中心转回右侧面板的标签重新计入徽章', () => {
    useAppStore.setState({
      browserTabs: [browserTab('moved-browser', 'center')],
      terminalTabs: [terminalTab('moved-terminal', 'center')],
    });

    const { result } = renderHook(() => useRightPanelViewProps());
    expect(result.current.badges.browser).toBe(0);
    expect(result.current.badges.terminal).toBe(0);

    act(() => {
      useAppStore.getState().browserSetLocation('moved-browser', 'panel');
      useAppStore.getState().terminalSetLocation('moved-terminal', 'panel');
    });

    expect(result.current.badges.browser).toBe(1);
    expect(result.current.badges.terminal).toBe(1);
  });

  it('缺省 location 的标签按面板标签计入徽章', () => {
    useAppStore.setState({
      browserTabs: [browserTab('legacy-browser')],
      terminalTabs: [terminalTab('legacy-terminal')],
    });

    const { result } = renderHook(() => useRightPanelViewProps());

    expect(result.current.badges.browser).toBe(1);
    expect(result.current.badges.terminal).toBe(1);
  });
});

function snapshot(staged: string[], unstaged: string[], untracked: string[] = []) {
  return { isRepo: true, staged, unstaged, untracked, conflicts: [] };
}

function workspace(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    path: `C:\\ws\\${id}`,
    rootPath: `C:\\ws\\${id}`,
    available: true,
    ...overrides,
  };
}

describe('useRightPanelViewProps badges.changes（与变更面板同源）', () => {
  it('非当前工作区的变更也计入徽章（不再恒为 0）', () => {
    useAppStore.setState({
      recentWorkspaces: [workspace('ws-current'), workspace('ws-other')],
      gitSnapshot: snapshot([], []),
      gitSnapshots: { 'ws-other': snapshot(['b.ts'], ['c.ts']) },
      appInfo: {
        currentWorkspace: { id: 'ws-current', gitSnapshot: snapshot([], []) },
      },
    } as never);

    const { result } = renderHook(() => useRightPanelViewProps());

    expect(result.current.badges.changes).toBe(2);
  });

  it('多工作区变更按合集求和，隐藏的工作区不计入', () => {
    useAppStore.setState({
      recentWorkspaces: [
        workspace('ws-a'),
        workspace('ws-b'),
        workspace('ws-hidden', { removedFromSidebar: true }),
        workspace('ws-unavailable', { available: false }),
      ],
      gitSnapshots: {
        'ws-a': snapshot(['a.ts'], []),
        'ws-b': snapshot([], ['b.ts', 'c.ts']),
        'ws-hidden': snapshot(['x.ts'], ['y.ts']),
        'ws-unavailable': snapshot(['z.ts'], []),
      },
    } as never);

    const { result } = renderHook(() => useRightPanelViewProps());

    expect(result.current.badges.changes).toBe(3);
  });

  it('快照尚未到达时回退当前工作区单例', () => {
    useAppStore.setState({
      recentWorkspaces: [],
      gitSnapshots: {},
      gitSnapshot: snapshot(['a.ts'], ['b.ts']),
    } as never);

    const { result } = renderHook(() => useRightPanelViewProps());

    expect(result.current.badges.changes).toBe(2);
  });
});
