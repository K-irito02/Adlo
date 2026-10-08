import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TerminalPanel } from '../TerminalPanel';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n/types';
import type { TerminalTabState } from '@stores/slices/terminalSlice';

// 本文件只验证右面板「自定义布局」按钮 → 卡片 → store 动作的接线；
// PTY 生命周期、布局 Hook 与工作区树均与卡片无关，予以隔离。
vi.mock('@features/terminal/useTerminalPtyLifecycle', () => ({
  useTerminalPtyLifecycle: () => ({
    handleXtermData: vi.fn(),
    handleXtermResize: vi.fn(),
    handleKillPane: vi.fn(),
    handleCreatePane: vi.fn(),
    handleClosePane: vi.fn(),
    handleCreateTab: vi.fn(),
    handleSelectTab: vi.fn(),
    handleCloseTab: vi.fn(),
    handleCloseAllTabs: vi.fn(),
  }),
}));

vi.mock('@features/terminal/useTerminalPaneLayout', () => ({
  useTerminalPaneLayout: () => ({
    layout: { mode: 'equal', colFractions: [1], rowFractions: [1], rects: {} },
    setMode: vi.fn(),
    resetAuto: vi.fn(),
    handleColDividerPointerDown: vi.fn(),
    handleRowDividerPointerDown: vi.fn(),
    handleFreeDragPointerDown: vi.fn(),
  }),
}));

vi.mock('@features/workspace-terminal', () => ({
  MultiWorkspaceTerminal: () => null,
}));

const t = {
  toolTerminal: '终端',
  panelNavigatorToggle: '折叠导航',
  terminalLabel: '终端目录',
  terminalLayoutModeLabel: '终端布局模式',
  terminalLayoutEqual: '均分',
  terminalLayoutFree: '自由',
  terminalAutoLayout: '恢复自动布局',
  terminalAddPane: '增加终端',
  terminalCustomLayout: '自定义布局',
  terminalCollapseAll: '折叠全部',
  terminalExpandAll: '展开全部',
  terminalClearAllTabs: '清空全部终端',
  terminalMoreActions: '更多终端操作',
  menuNewTerminal: '新建终端',
  shellTypeSelect: 'Shell 类型',
  terminalIndependent: '默认终端目录',
  terminalBindWorkspace: '绑定工作区',
  terminalCopy: '复制',
  terminalPaste: '粘贴',
  terminalClear: '清除',
  terminalKillProcess: '杀死进程',
  terminalPaneResizeDivider: '调整窗格大小',
  terminalPaneClearLabel: '清空内容',
  terminalPaneMaximize: '最大化',
  terminalPaneRestore: '还原',
  terminalPaneClose: '关闭窗口',
  terminalPaneBorders: '边界线',
  terminalActiveHighlight: '活动窗口高亮',
  terminalFontIncrease: '增大字号',
  terminalFontDecrease: '减小字号',
  close: '关闭',
  resizeTerminalNavigator: '调整终端导航宽度',
  terminalLayoutCardSwap: '交换位置',
  terminalLayoutCardSwapConfirm: '交换',
  terminalLayoutCardSwapRevert: '撤回',
  terminalLayoutCardSwapCancel: '取消',
  terminalLayoutCardSwapMode: '进入交换位置模式',
  terminalLayoutCardAnnotateHint: '双击方块标注（限 1 字符）',
  terminalLayoutCardSwapHint: '点击两个需要交换位置的方块',
} as unknown as CopyDict;

function makePanelTab(id: string, count: number): TerminalTabState {
  const panes = Array.from({ length: count }, (_, index) => ({
    id: `${id}-pane${index}`,
    profile: 'powershell' as const,
    status: 'idle' as const,
    colorIndex: index,
  }));
  return {
    id,
    workspaceId: '',
    title: 'PowerShell',
    profile: 'powershell',
    panes,
    activePaneId: panes[0].id,
    isPinned: false,
    sortOrder: 1,
    location: 'panel',
  };
}

function renderPanel() {
  return render(
    <TCopyProvider t={t} locale="zh-CN">
      <TerminalPanel />
    </TCopyProvider>,
  );
}

/** jsdom PointerEvent 构造丢弃坐标，改用带坐标的 MouseEvent 派发（与卡片测试同因）。 */
function dispatchPointer(
  target: Element | Document,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  init: MouseEventInit = {},
): void {
  act(() => {
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, ...init }),
    );
  });
}

beforeEach(() => {
  const tab = makePanelTab('tp', 2);
  useAppStore.setState({
    terminalTabs: [tab],
    terminalTabsById: { tp: tab },
    terminalActiveTabId: 'tp',
    recentWorkspaces: [],
    terminalWorkspaceExpanded: {},
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('TerminalPanel 自定义布局卡片接线', () => {
  it('自定义布局按钮开合卡片，渲染与窗格数一致的方块，外部点击关闭', () => {
    const { container } = renderPanel();

    expect(container.querySelector('.adl-layout-card')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '自定义布局' }));
    expect(container.querySelector('.adl-layout-card')).not.toBeNull();
    expect(
      container.querySelectorAll(
        '.adl-layout-card__square:not(.adl-layout-card__square--placeholder)',
      ),
    ).toHaveLength(2);

    fireEvent.mouseDown(document.body);
    expect(container.querySelector('.adl-layout-card')).toBeNull();
  });

  it('Esc 关闭卡片', () => {
    const { container } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '自定义布局' }));
    expect(container.querySelector('.adl-layout-card')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('.adl-layout-card')).toBeNull();
  });

  it('卡片头部关闭按钮调用宿主 onClose 关闭卡片', () => {
    const { container } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '自定义布局' }));
    expect(container.querySelector('.adl-layout-card')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(container.querySelector('.adl-layout-card')).toBeNull();
  });

  it('卡片拖拽排序接线到 store（terminalReorderPanes）', () => {
    const { container } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '自定义布局' }));
    // 2 窗格（cols=2）：槽位中心 slot0=(20,20) slot1=(68,20)；
    // jsdom PointerEvent 构造丢弃坐标，改用带坐标的 MouseEvent 派发。
    const squares = Array.from(
      container.querySelectorAll(
        '.adl-layout-card__square:not(.adl-layout-card__square--placeholder)',
      ),
    );
    dispatchPointer(squares[0], 'pointerdown', { button: 0, clientX: 20, clientY: 20 });
    dispatchPointer(document, 'pointermove', { clientX: 68, clientY: 20 });
    dispatchPointer(document, 'pointerup');

    expect(useAppStore.getState().terminalTabsById['tp'].panes.map((pane) => pane.id)).toEqual([
      'tp-pane1',
      'tp-pane0',
    ]);
  });

  it('卡片双击标注接线到 store（terminalUpdatePane，限 1 码点）', () => {
    const { container } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '自定义布局' }));
    fireEvent.doubleClick(container.querySelectorAll('.adl-layout-card__square')[0]);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '中文' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useAppStore.getState().terminalTabsById['tp'].panes[0].label).toBe('中');
  });
});

describe('TerminalPanel 更多终端操作 → 边界线', () => {
  it('开关切换 store 并落到网格 has-borders/no-borders 类名', () => {
    useAppStore.setState({ terminalShowPaneBorders: true });
    const { container } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '更多终端操作' }));
    const checkbox = screen.getByRole('menuitemcheckbox', { name: '边界线' });
    expect(checkbox.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(checkbox);
    expect(useAppStore.getState().terminalShowPaneBorders).toBe(false);
    expect(
      container.querySelector('.adl-terminal-pane-grid')?.classList.contains('no-borders'),
    ).toBe(true);

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '边界线' }));
    expect(useAppStore.getState().terminalShowPaneBorders).toBe(true);
    expect(
      container.querySelector('.adl-terminal-pane-grid')?.classList.contains('has-borders'),
    ).toBe(true);
  });

  it('活动窗口高亮开关切换 store 并落到网格类名', () => {
    useAppStore.setState({ terminalShowActiveHighlight: true });
    const { container } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '更多终端操作' }));
    const checkbox = screen.getByRole('menuitemcheckbox', { name: '活动窗口高亮' });
    expect(checkbox.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(checkbox);
    expect(useAppStore.getState().terminalShowActiveHighlight).toBe(false);
    expect(
      container.querySelector('.adl-terminal-pane-grid')?.classList.contains('no-active-highlight'),
    ).toBe(true);
  });

  it('增大/减小字号步进 store（上界禁用增大）', () => {
    useAppStore.setState({ terminalFontSize: 13 });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '更多终端操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '增大字号' }));
    expect(useAppStore.getState().terminalFontSize).toBe(14);

    act(() => {
      useAppStore.setState({ terminalFontSize: 24 });
    });
    expect(screen.getByRole('menuitem', { name: '增大字号' })).toBeDisabled();
    fireEvent.click(screen.getByRole('menuitem', { name: '减小字号' }));
    expect(useAppStore.getState().terminalFontSize).toBe(23);
  });
});
