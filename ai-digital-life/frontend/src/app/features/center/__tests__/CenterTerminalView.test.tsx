import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

// 布局 Hook 的 spy：断言工具栏控件确实调用 setMode / resetAuto（C4 接线）。
const paneLayoutMock = vi.hoisted(() => ({
  setMode: vi.fn(),
  resetAuto: vi.fn(),
}));

vi.mock('@features/terminal/useTerminalPaneLayout', () => ({
  useTerminalPaneLayout: () => ({
    layout: { mode: 'equal', colFractions: [1], rowFractions: [1], rects: {} },
    setMode: paneLayoutMock.setMode,
    resetAuto: paneLayoutMock.resetAuto,
    handleColDividerPointerDown: vi.fn(),
    handleRowDividerPointerDown: vi.fn(),
    handleFreeDragPointerDown: vi.fn(),
  }),
}));

const t = {
  menuNewTerminal: '新建终端',
  terminalNewTerminal: '新建终端',
  terminalBindWorkspace: '绑定工作区',
  terminalIndependent: '默认终端目录',
  terminalShellLabel: 'Shell',
  toolTerminal: '终端',
  terminalMoreActions: '更多终端操作',
  terminalKillProcess: '杀死进程',
  terminalAddPane: '增加终端',
  terminalPaneClose: '关闭窗口',
  terminalPaneBorders: '边界线',
  terminalActiveHighlight: '活动窗口高亮',
  terminalFontIncrease: '增大字号',
  terminalFontDecrease: '减小字号',
  terminalKillProcessHintTitle: '结束鼠标最近一次所点击的终端窗口',
  terminalKillProcessHintBody: '· 只影响这一格',
  terminalPaneClearLabel: '清空内容',
  terminalPaneMaximize: '最大化',
  terminalPaneRestore: '还原',
  terminalShellNotFound: '未找到终端程序',
  terminalLayoutEqual: '均分',
  terminalLayoutFree: '自由',
  terminalLayoutModeLabel: '终端布局模式',
  terminalAutoLayout: '恢复自动布局',
  terminalCustomLayout: '自定义布局',
  close: '关闭',
  terminalPaneResizeDivider: '调整窗格大小',
  terminalLayoutCardSwap: '交换位置',
  terminalLayoutCardSwapConfirm: '交换',
  terminalLayoutCardSwapRevert: '撤回',
  terminalLayoutCardSwapCancel: '取消',
  terminalLayoutCardSwapMode: '进入交换位置模式',
  terminalLayoutCardAnnotateHint: '双击方块标注（限 1 字符）',
  terminalLayoutCardSwapHint: '点击两个需要交换位置的方块',
} as unknown as CopyDict;

function makeTerminalTab(id: string, location: 'panel' | 'center'): TerminalTabState {
  const pane = {
    id: `${id}-pane0`,
    profile: 'powershell',
    status: 'idle',
    colorIndex: 0,
  } as const;
  return {
    id,
    workspaceId: '',
    title: 'PowerShell',
    profile: 'powershell',
    panes: [pane],
    activePaneId: pane.id,
    isPinned: false,
    sortOrder: 1,
    location,
  };
}

/** 可用工作区条目（字段与 RecentWorkspaceEntry 结构一致，按需扩展） */
function makeWorkspace(id: string, name: string) {
  return {
    id,
    path: `E:\\${id}`,
    rootPath: `E:\\${id}`,
    name,
    lastOpenedAt: 1,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
  };
}

function makeMultiPaneTab(id: string, count: number): TerminalTabState {
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
    location: 'center',
  };
}

function renderView(centerTabId: string, terminalTabId: string | null) {
  return render(
    <TCopyProvider t={t} locale="zh-CN">
      <CenterTerminalView centerTabId={centerTabId} terminalTabId={terminalTabId} />
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

  it('绑定工作区下拉可选并作用于新建终端：新标签带所选 workspaceId', () => {
    useAppStore.setState({
      recentWorkspaces: [makeWorkspace('ws-1', '工作区一'), makeWorkspace('ws-2', '工作区二')],
    });

    renderView('c1', null);

    // SettingsSelect 为自定义 listbox：触发器 button + 经 Portal 挂 body 的菜单
    fireEvent.click(screen.getByRole('button', { name: '绑定工作区' }));
    fireEvent.click(screen.getByRole('option', { name: '工作区二' }));
    expect(screen.getByRole('button', { name: '绑定工作区' }).textContent).toContain('工作区二');

    fireEvent.click(screen.getByRole('button', { name: '新建终端' }));

    const created = useAppStore.getState().terminalTabs.find((x) => x.location === 'center');
    expect(created?.workspaceId).toBe('ws-2');
  });

  it('所选工作区变为不可用后回退为「默认终端目录」（不展示裸 ID、不绑定失效工作区）', () => {
    useAppStore.setState({ recentWorkspaces: [makeWorkspace('ws-1', '工作区一')] });
    renderView('c1', null);

    fireEvent.click(screen.getByRole('button', { name: '绑定工作区' }));
    fireEvent.click(screen.getByRole('option', { name: '工作区一' }));
    expect(screen.getByRole('button', { name: '绑定工作区' }).textContent).toContain('工作区一');

    // 卡片打开期间该工作区变为不可用 → 下拉与创建都回退到「默认终端目录」
    act(() => {
      useAppStore.setState({
        recentWorkspaces: [{ ...makeWorkspace('ws-1', '工作区一'), available: false }],
      });
    });

    expect(screen.getByRole('button', { name: '绑定工作区' }).textContent).toContain(
      '默认终端目录',
    );
    fireEvent.click(screen.getByRole('button', { name: '新建终端' }));
    const created = useAppStore.getState().terminalTabs.find((x) => x.location === 'center');
    expect(created?.workspaceId).toBe('');
  });

  it('terminalTabId 非空时工具栏含菜单与增加终端，主区渲染一个窗格', () => {
    const centerTerm = makeTerminalTab('tc', 'center');
    useAppStore.setState({
      terminalTabs: [centerTerm],
      terminalTabsById: { tc: centerTerm },
      terminalActiveTabId: 'tc',
    });

    const { container } = renderView('c1', 'tc');

    expect(screen.getByRole('button', { name: '更多终端操作' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '增加终端' })).toBeTruthy();
    // 旧的单双列 / 交换 / 新建终端 / 目录导航入口全部移除
    expect(screen.queryByRole('button', { name: '单列' })).toBeNull();
    expect(screen.queryByRole('button', { name: '双列' })).toBeNull();
    expect(screen.queryByRole('button', { name: /交换/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '新建终端' })).toBeNull();
    expect(screen.queryByRole('button', { name: '终端目录' })).toBeNull();
    // 主区渲染一个窗格，内含一个实时终端
    expect(container.querySelectorAll('.adl-terminal-pane')).toHaveLength(1);
    expect(container.querySelectorAll('.adl-terminal-canvas')).toHaveLength(1);
    expect(container.querySelector('.adl-terminal-live')).not.toBeNull();
  });

  it('工具栏渲染均分/自由分段与恢复自动布局，并分别调用 setMode / resetAuto', () => {
    const centerTerm = makeTerminalTab('tc', 'center');
    useAppStore.setState({
      terminalTabs: [centerTerm],
      terminalTabsById: { tc: centerTerm },
      terminalActiveTabId: 'tc',
    });

    renderView('c1', 'tc');

    const equalBtn = screen.getByRole('button', { name: '均分' });
    const freeBtn = screen.getByRole('button', { name: '自由' });
    const resetBtn = screen.getByRole('button', { name: '恢复自动布局' });
    // 分段选择器：aria-pressed 反映当前 mode（mock 为 equal）。
    expect(equalBtn.getAttribute('aria-pressed')).toBe('true');
    expect(freeBtn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(freeBtn);
    expect(paneLayoutMock.setMode).toHaveBeenCalledWith('free');

    fireEvent.click(resetBtn);
    expect(paneLayoutMock.resetAuto).toHaveBeenCalledTimes(1);
  });

  it('会话已终止且无 session 时用项目 warning SVG 图标（非硬编码字符）', () => {
    const deadPane = {
      id: 'td-pane0',
      profile: 'powershell',
      status: 'terminated',
      colorIndex: 0,
    } as const;
    const dead: TerminalTabState = {
      ...makeTerminalTab('td', 'center'),
      panes: [deadPane],
      activePaneId: deadPane.id,
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

describe('CenterTerminalView 自定义布局卡片接线', () => {
  function setTwoPaneTab(): void {
    const tab = makeMultiPaneTab('tc', 2);
    useAppStore.setState({
      terminalTabs: [tab],
      terminalTabsById: { tc: tab },
      terminalActiveTabId: 'tc',
    });
  }

  it('自定义布局按钮开合卡片，渲染与窗格数一致的方块，外部点击关闭', () => {
    setTwoPaneTab();
    const { container } = renderView('c1', 'tc');

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
    setTwoPaneTab();
    const { container } = renderView('c1', 'tc');

    fireEvent.click(screen.getByRole('button', { name: '自定义布局' }));
    expect(container.querySelector('.adl-layout-card')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('.adl-layout-card')).toBeNull();
  });

  it('卡片拖拽排序接线到 store（terminalReorderPanes）', () => {
    setTwoPaneTab();
    const { container } = renderView('c1', 'tc');

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

    expect(useAppStore.getState().terminalTabsById['tc'].panes.map((pane) => pane.id)).toEqual([
      'tc-pane1',
      'tc-pane0',
    ]);
  });

  it('卡片交换接线到 store（terminalSwapPanes）', () => {
    setTwoPaneTab();
    const { container } = renderView('c1', 'tc');

    fireEvent.click(screen.getByRole('button', { name: '自定义布局' }));
    fireEvent.click(screen.getByRole('button', { name: '进入交换位置模式' }));
    const squares = container.querySelectorAll(
      '.adl-layout-card__square:not(.adl-layout-card__square--placeholder)',
    );
    fireEvent.click(squares[0]);
    fireEvent.click(squares[1]);
    fireEvent.click(screen.getByRole('button', { name: '交换' }));

    expect(useAppStore.getState().terminalTabsById['tc'].panes.map((pane) => pane.id)).toEqual([
      'tc-pane1',
      'tc-pane0',
    ]);
  });

  it('卡片双击标注接线到 store（terminalUpdatePane，限 1 码点）', () => {
    setTwoPaneTab();
    const { container } = renderView('c1', 'tc');

    fireEvent.click(screen.getByRole('button', { name: '自定义布局' }));
    fireEvent.doubleClick(container.querySelectorAll('.adl-layout-card__square')[0]);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '中文' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useAppStore.getState().terminalTabsById['tc'].panes[0].label).toBe('中');
  });

  it('清空标注写入 undefined，使序列化时省略 label 键', () => {
    setTwoPaneTab();
    const { container } = renderView('c1', 'tc');

    fireEvent.click(screen.getByRole('button', { name: '自定义布局' }));
    fireEvent.doubleClick(container.querySelectorAll('.adl-layout-card__square')[0]);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const pane = useAppStore.getState().terminalTabsById['tc'].panes[0];
    expect(pane.label).toBeUndefined();
    expect(JSON.stringify(pane)).not.toContain('"label"');
  });

  it('编辑标注时按 Esc 只取消编辑，不关闭卡片', () => {
    setTwoPaneTab();
    const { container } = renderView('c1', 'tc');

    fireEvent.click(screen.getByRole('button', { name: '自定义布局' }));
    fireEvent.doubleClick(container.querySelectorAll('.adl-layout-card__square')[0]);
    const input = screen.getByRole('textbox');

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(container.querySelector('.adl-layout-card')).not.toBeNull();
  });

  it('中心宿主每个窗格都渲染「清空内容」按钮（aria-label 来自 i18n）', () => {
    const tab = makeMultiPaneTab('tc', 2);
    useAppStore.setState({
      terminalTabs: [tab],
      terminalTabsById: { tc: tab },
      terminalActiveTabId: 'tc',
    });

    renderView('c1', 'tc');

    expect(screen.getAllByRole('button', { name: '清空内容' })).toHaveLength(2);
  });
});

describe('CenterTerminalView 工具栏布局（跟进 24，中心专属）', () => {
  it('操作控件靠左、右侧只留更多终端操作（均分模式 5 控件在左）', () => {
    const tab = makeMultiPaneTab('tc', 2);
    useAppStore.setState({
      terminalTabs: [tab],
      terminalTabsById: { tc: tab },
      terminalActiveTabId: 'tc',
    });
    const { container } = renderView('c1', 'tc');

    const toolbar = container.querySelector('.adl-tool-context--files') as HTMLElement;
    const groups = toolbar.querySelectorAll(':scope > .adl-tool-context__group');
    expect(groups).toHaveLength(2);
    const [leftGroup, rightGroup] = Array.from(groups);

    const leftNames = Array.from(leftGroup.querySelectorAll('button')).map(
      // 分段按钮无 aria-label，取文本；图标按钮取 aria-label
      (button) => button.textContent?.trim() || button.getAttribute('aria-label'),
    );
    expect(leftNames).toEqual(['均分', '自由', '恢复自动布局', '增加终端', '自定义布局']);

    const rightButtons = rightGroup.querySelectorAll('button');
    expect(rightButtons).toHaveLength(1);
    expect(rightButtons[0].getAttribute('aria-label')).toBe('更多终端操作');
  });
});
