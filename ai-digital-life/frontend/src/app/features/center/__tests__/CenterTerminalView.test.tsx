import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CenterTerminalView } from '../CenterTerminalView';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n/types';
import type { TerminalTabState } from '@stores/slices/terminalSlice';

// 中心终端视图的渲染组合测试：隔离 PTY 生命周期（本文件不验证真实 PTY，
// 只验证「选择器 → 绑定 → 会话工具栏/主区」的视图接线）。真实 PTY 行为由
// terminal 回归套件覆盖。
vi.mock('@features/terminal/useTerminalPtyLifecycle', () => ({
  useTerminalPtyLifecycle: () => ({
    xtermRef: { current: null },
    historySegments: [],
    handleXtermData: vi.fn(),
    handleXtermResize: vi.fn(),
    handleCreateTab: vi.fn(),
    handleSelectTab: vi.fn(),
    handleCloseTab: vi.fn(),
    handleCloseAllTabs: vi.fn(),
    handleKill: vi.fn(),
    deleteHistoryForTab: vi.fn(async () => undefined),
  }),
}));

const t = {
  menuNewTerminal: '新建终端',
  terminalNewTerminal: '新建终端',
  terminalBindWorkspace: '绑定工作区',
  terminalIndependent: '默认终端目录',
  terminalShellLabel: 'Shell',
  toolTerminal: '终端',
  terminalViewLayoutLabel: '终端视图布局',
  terminalViewSingle: '单列',
  terminalViewDual: '双列',
  terminalSwapAreas: '交换历史与实时终端位置',
  terminalMoreActions: '更多终端操作',
  terminalCopy: '复制',
  terminalPaste: '粘贴',
  terminalClear: '清除',
  terminalKillProcess: '杀死进程',
  terminalHistorySegmentUnavailable: '历史段不可用',
  terminalDividerLabel: '拖拽调整只读历史区大小',
  terminalRegionCollapseTitle: '还原',
  terminalRegionExpandTitle: '最大化',
  terminalHistoryDeleteLabel: '删除历史',
  terminalHistoryDeleteTitle: '删除历史标题',
  terminalLiveClearLabel: '清空',
  terminalLiveClearTitle: '清空标题',
  terminalShellNotFound: '未找到终端程序',
} as unknown as CopyDict;

function makeTerminalTab(id: string, location: 'panel' | 'center'): TerminalTabState {
  return {
    id,
    workspaceId: '',
    title: 'PowerShell',
    profile: 'powershell',
    status: 'idle',
    isPinned: false,
    sortOrder: 1,
    location,
  };
}

function renderView(centerTabId: string, terminalTabId: string | null) {
  return render(
    <TCopyProvider t={t} locale="zh-CN">
      <CenterTerminalView centerTabId={centerTabId} terminalTabId={terminalTabId} />
    </TCopyProvider>,
  );
}

beforeEach(() => {
  useAppStore.setState({
    centerTabs: [{ id: 'c1', kind: 'terminal', refId: null, createdAt: 1 }],
    centerActiveTabId: 'c1',
    terminalTabs: [],
    terminalTabsById: {},
    terminalActiveTabId: '',
    recentWorkspaces: [],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CenterTerminalView', () => {
  it('refId=null 时渲染终端选择器', () => {
    renderView('c1', null);
    expect(screen.getByRole('button', { name: /终端/i })).toBeTruthy();
  });

  it('选择器创建终端：移动到中心并回填 refId', () => {
    const panelTab = makeTerminalTab('tp', 'panel');
    useAppStore.setState({
      terminalTabs: [panelTab],
      terminalTabsById: { tp: panelTab },
      terminalActiveTabId: 'tp',
    });

    renderView('c1', null);
    fireEvent.click(screen.getByRole('button', { name: /终端/i }));

    const s = useAppStore.getState();
    const created = s.terminalTabs.find((x) => x.location === 'center');
    expect(created).toBeTruthy();
    expect(s.centerTabs.find((c) => c.id === 'c1')?.refId).toBe(created?.id);
    // 面板活动标签被重夹：不再指向已移入中心的标签
    expect(s.terminalActiveTabId).not.toBe(created?.id);
  });

  it('terminalTabId 非空时渲染只含单双列/交换/菜单的工具栏', () => {
    const centerTerm = makeTerminalTab('tc', 'center');
    useAppStore.setState({
      terminalTabs: [centerTerm],
      terminalTabsById: { tc: centerTerm },
      terminalActiveTabId: 'tc',
    });

    renderView('c1', 'tc');

    expect(screen.getByRole('button', { name: '单列' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '双列' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '交换历史与实时终端位置' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '更多终端操作' })).toBeTruthy();
    // 无新建终端复合按钮、无左侧目录导航开关
    expect(screen.queryByRole('button', { name: '新建终端' })).toBeNull();
    expect(screen.queryByRole('button', { name: '终端目录' })).toBeNull();
  });

  it('会话已终止且无 session 时用项目 warning SVG 图标（非硬编码字符）', () => {
    const dead: TerminalTabState = {
      ...makeTerminalTab('td', 'center'),
      status: 'terminated',
      sessionId: undefined,
    };
    useAppStore.setState({
      terminalTabs: [dead],
      terminalTabsById: { td: dead },
      terminalActiveTabId: 'td',
    });

    const { container } = renderView('c1', 'td');

    expect(screen.getByText('未找到终端程序')).toBeTruthy();
    // 装饰性 SVG 图标，不再是 '⚠' 文字符。
    expect(container.querySelector('.adl-terminal-error-note svg')).toBeTruthy();
    expect(screen.queryByText('⚠')).toBeNull();
  });
});
