import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { TCopyProvider } from '../i18n/TCopyContext';
import type { CopyDict } from '../i18n/types';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { TerminalTabState } from '@stores/slices/terminalSlice';
import { CenterTabStrip } from './CenterTabStrip';
import { calcDropIndex } from './centerTabDrag';
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

  it('「+」位于滚动区内且排在标签之后', () => {
    useAppStore.getState().centerAddTab('launcher', null);
    renderStrip();
    const scroll = document.querySelector('.adl-center-tab-strip__scroll');
    const add = document.querySelector('.adl-center-tab-strip__add');
    expect(scroll).not.toBeNull();
    expect(add).not.toBeNull();
    expect(scroll!.contains(add!)).toBe(true);
    const tab = screen.getAllByRole('tab')[0];
    expect(tab.compareDocumentPosition(add!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('根据滚动指标切换两端渐隐标记', () => {
    renderStrip();
    const strip = document.querySelector('.adl-center-tab-strip') as HTMLElement;
    const scroller = document.querySelector('.adl-center-tab-strip__scroll') as HTMLElement;

    const setMetrics = (scrollLeft: number, scrollWidth: number, clientWidth: number) => {
      Object.defineProperty(scroller, 'scrollLeft', {
        configurable: true,
        writable: true,
        value: scrollLeft,
      });
      Object.defineProperty(scroller, 'scrollWidth', {
        configurable: true,
        value: scrollWidth,
      });
      Object.defineProperty(scroller, 'clientWidth', {
        configurable: true,
        value: clientWidth,
      });
      fireEvent.scroll(scroller);
    };

    setMetrics(0, 400, 400);
    expect(strip.getAttribute('data-fade-left')).toBe('false');
    expect(strip.getAttribute('data-fade-right')).toBe('false');

    setMetrics(0, 1000, 400);
    expect(strip.getAttribute('data-fade-left')).toBe('false');
    expect(strip.getAttribute('data-fade-right')).toBe('true');

    setMetrics(300, 1000, 400);
    expect(strip.getAttribute('data-fade-left')).toBe('true');
    expect(strip.getAttribute('data-fade-right')).toBe('true');

    setMetrics(600, 1000, 400);
    expect(strip.getAttribute('data-fade-left')).toBe('true');
    expect(strip.getAttribute('data-fade-right')).toBe('false');
  });

  it('tablist 只包住标签，「+」在 tablist 之外', () => {
    useAppStore.getState().centerAddTab('launcher', null);
    renderStrip();
    const scroll = document.querySelector('.adl-center-tab-strip__scroll');
    const tablist = document.querySelector('[role="tablist"]');
    const add = document.querySelector('.adl-center-tab-strip__add');
    expect(tablist).not.toBeNull();
    expect(tablist).not.toBe(scroll);
    expect(tablist!.querySelectorAll('[role="tab"]').length).toBeGreaterThan(0);
    expect(tablist!.contains(add!)).toBe(false);
    expect(scroll!.contains(add!)).toBe(true);
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

describe('CenterTabStrip 拖拽排序（B·滑动让位）', () => {
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

  it('calcDropIndex 按中点统计插入序号', () => {
    expect(calcDropIndex([50, 150, 250], 10)).toBe(0);
    expect(calcDropIndex([50, 150, 250], 160)).toBe(2);
    expect(calcDropIndex([50, 150, 250], 400)).toBe(3);
    expect(calcDropIndex([], 100)).toBe(0);
  });

  /** jsdom 无布局：为标签 mock offsetLeft/offsetWidth（内容坐标）。 */
  function mockLayout(tabs: HTMLElement[], width = 100, gap = 4) {
    tabs.forEach((el, i) => {
      Object.defineProperty(el, 'offsetLeft', { value: i * (width + gap), configurable: true });
      Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true });
    });
  }

  /** 全局 test-setup 已提供 PointerEvent polyfill；此 helper 仍用 MouseEvent
      手工构造指针字段，便于显式控制 pointerType/buttons，语义与 polyfill 一致。
      pointerType/buttons 需手工定义（MouseEvent 无 pointerType，buttons 默认为 0；
      实现要求 mouse 且左键位 buttons & 1，故默认 pointerType 'mouse'、buttons 1）。 */
  function pointer(
    el: HTMLElement,
    type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
    clientX: number,
    opts?: { pointerId?: number; pointerType?: string; button?: number; buttons?: number },
  ) {
    const evt = new window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      button: opts?.button ?? 0,
    });
    Object.defineProperty(evt, 'pointerId', { value: opts?.pointerId ?? 1 });
    Object.defineProperty(evt, 'pointerType', { value: opts?.pointerType ?? 'mouse' });
    Object.defineProperty(evt, 'buttons', { value: opts?.buttons ?? 1 });
    act(() => {
      el.dispatchEvent(evt);
    });
  }

  function renderThreeTabs() {
    const a = useAppStore.getState().centerAddTab('launcher', null);
    const b = useAppStore.getState().centerAddTab('launcher', null);
    const c = useAppStore.getState().centerAddTab('launcher', null);
    renderStrip();
    const tabs = screen.getAllByRole('tab') as HTMLElement[];
    mockLayout(tabs);
    return { ids: [a, b, c], tabs };
  }

  it('阈值内移动不进入拖拽，单击仍选中', () => {
    const { ids, tabs } = renderThreeTabs();
    pointer(tabs[0], 'pointerdown', 50);
    pointer(tabs[0], 'pointermove', 52);
    pointer(tabs[0], 'pointerup', 52);
    fireEvent.click(tabs[0]);
    expect(useAppStore.getState().centerActiveTabId).toBe(ids[0]);
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual(ids);
  });

  it('拖首标签到末尾松手提交新顺序，且不改变选中', () => {
    const { ids, tabs } = renderThreeTabs();
    const activeBefore = useAppStore.getState().centerActiveTabId;
    pointer(tabs[0], 'pointerdown', 50);
    pointer(tabs[0], 'pointermove', 300);
    pointer(tabs[0], 'pointerup', 300);
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual([ids[1], ids[2], ids[0]]);
    // 拖拽只排序不切换选中；拖拽后的 click 被吞掉。
    expect(useAppStore.getState().centerActiveTabId).toBe(activeBefore);
    fireEvent.click(tabs[0]);
    expect(useAppStore.getState().centerActiveTabId).toBe(activeBefore);
  });

  it('原地松手（目标即原位）不写 store', () => {
    const { ids, tabs } = renderThreeTabs();
    const before = useAppStore.getState().centerTabs;
    pointer(tabs[1], 'pointerdown', 150);
    pointer(tabs[1], 'pointermove', 170);
    pointer(tabs[1], 'pointerup', 170);
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual(ids);
    expect(useAppStore.getState().centerTabs).toBe(before);
  });

  it('操作按钮上按下不启动拖拽', () => {
    const { ids } = renderThreeTabs();
    const closeBtn = screen.getAllByRole('button', { name: 'close' })[0] as HTMLElement;
    pointer(closeBtn, 'pointerdown', 90);
    pointer(closeBtn, 'pointermove', 300);
    pointer(closeBtn, 'pointerup', 300);
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual(ids);
  });

  it('Escape 取消拖拽不提交', () => {
    const { ids, tabs } = renderThreeTabs();
    pointer(tabs[0], 'pointerdown', 50);
    pointer(tabs[0], 'pointermove', 300);
    fireEvent.keyDown(window, { key: 'Escape' });
    pointer(tabs[0], 'pointerup', 300);
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual(ids);
  });

  it('拖拽中挂 is-dragging 与 data-dragging（CSS 由此隐藏按钮并取消名称遮挡）', () => {
    renderThreeTabs();
    const scroller = document.querySelector('.adl-center-tab-strip__scroll') as HTMLElement;
    const tabs = screen.getAllByRole('tab') as HTMLElement[];
    pointer(tabs[0], 'pointerdown', 50);
    pointer(tabs[0], 'pointermove', 300);
    // CSS 契约：被拖项 is-dragging（提起来）+ 条 data-dragging（藏按钮、去名称 mask）。
    expect(tabs[0].classList.contains('is-dragging')).toBe(true);
    expect(scroller.getAttribute('data-dragging')).toBe('true');
    pointer(tabs[0], 'pointerup', 300);
    expect(tabs[0].classList.contains('is-dragging')).toBe(false);
    expect(scroller.getAttribute('data-dragging')).toBeNull();
  });

  it('捕获缺失时元素外松手仍提交（window 兜底）', () => {
    const { ids, tabs } = renderThreeTabs();
    pointer(tabs[0], 'pointerdown', 50);
    pointer(tabs[0], 'pointermove', 300);
    // 元素外松手：只冒泡到 window，不经过标签本体 handler。
    const evt = new window.MouseEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      clientX: 300,
      button: 0,
    });
    Object.defineProperty(evt, 'pointerId', { value: 1 });
    act(() => {
      document.body.dispatchEvent(evt);
    });
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual([ids[1], ids[2], ids[0]]);
  });

  it('第二路指针的移动与松手不干扰本次拖拽', () => {
    const { ids, tabs } = renderThreeTabs();
    pointer(tabs[0], 'pointerdown', 50);
    pointer(tabs[0], 'pointermove', 300);
    // 第二指（pointerId 2）在同一标签上移动与松手：应被忽略。
    const move2 = new window.MouseEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      clientX: 60,
      button: 0,
    });
    Object.defineProperty(move2, 'pointerId', { value: 2 });
    act(() => {
      tabs[0].dispatchEvent(move2);
    });
    const up2 = new window.MouseEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      clientX: 60,
      button: 0,
    });
    Object.defineProperty(up2, 'pointerId', { value: 2 });
    act(() => {
      tabs[0].dispatchEvent(up2);
    });
    // 本次拖拽仍在：第一指松手正常提交。
    pointer(tabs[0], 'pointerup', 300);
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual([ids[1], ids[2], ids[0]]);
  });

  it('pointercancel 后直接点击仍可选中（不吞点击）', () => {
    const { ids, tabs } = renderThreeTabs();
    pointer(tabs[0], 'pointerdown', 50);
    pointer(tabs[0], 'pointermove', 300);
    pointer(tabs[0], 'pointercancel', 300);
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual(ids);
    fireEvent.click(tabs[1]);
    expect(useAppStore.getState().centerActiveTabId).toBe(ids[1]);
  });

  it('拖拽中途外部删除标签则中止提交', () => {
    const { ids, tabs } = renderThreeTabs();
    pointer(tabs[0], 'pointerdown', 50);
    pointer(tabs[0], 'pointermove', 300);
    // 中途外部删除第三个标签：快照失配，松手不得提交重排。
    useAppStore.getState().centerRemoveTab(ids[2]);
    pointer(tabs[0], 'pointermove', 310);
    pointer(tabs[0], 'pointerup', 310);
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual([ids[0], ids[1]]);
  });

  it('反向拖尾标签到首位', () => {
    const { ids, tabs } = renderThreeTabs();
    // tab2 中点 258，从右侧（clientX 260）向左拖到 30。
    pointer(tabs[2], 'pointerdown', 260);
    pointer(tabs[2], 'pointermove', 30);
    pointer(tabs[2], 'pointerup', 30);
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual([ids[2], ids[0], ids[1]]);
  });

  it('拖拽中途外部纯重排则中止提交', () => {
    const { ids, tabs } = renderThreeTabs();
    pointer(tabs[0], 'pointerdown', 50);
    pointer(tabs[0], 'pointermove', 300);
    // 中途外部纯重排（同集合不同顺序）：快照有序失配，松手不得提交。
    const reordered = [ids[2], ids[0], ids[1]].map(
      (id) => useAppStore.getState().centerTabs.find((t) => t.id === id)!,
    );
    useAppStore.getState().centerReorderTabs(reordered);
    pointer(tabs[0], 'pointermove', 310);
    pointer(tabs[0], 'pointerup', 310);
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual([ids[2], ids[0], ids[1]]);
  });

  it('拖拽提交后键盘 Enter 不被吞', () => {
    const { ids, tabs } = renderThreeTabs();
    pointer(tabs[0], 'pointerdown', 50);
    pointer(tabs[0], 'pointermove', 300);
    pointer(tabs[0], 'pointerup', 300);
    // 拖拽后的连带 click 被吞，但键盘激活走独立入口，不受影响。
    fireEvent.keyDown(tabs[1], { key: 'Enter' });
    expect(useAppStore.getState().centerActiveTabId).toBe(ids[1]);
  });

  it('触屏不进入拖拽，点击仍选中', () => {
    const { ids, tabs } = renderThreeTabs();
    pointer(tabs[0], 'pointerdown', 50, { pointerType: 'touch' });
    pointer(tabs[0], 'pointermove', 300, { pointerType: 'touch' });
    pointer(tabs[0], 'pointerup', 300, { pointerType: 'touch' });
    expect(tabs[0].classList.contains('is-dragging')).toBe(false);
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual(ids);
    fireEvent.click(tabs[0]);
    expect(useAppStore.getState().centerActiveTabId).toBe(ids[0]);
  });

  it('拖拽中右键抬起不提交，左键松手才提交', () => {
    const { ids, tabs } = renderThreeTabs();
    pointer(tabs[0], 'pointerdown', 50);
    pointer(tabs[0], 'pointermove', 300);
    // 同鼠标右键抬起：忽略，拖拽继续。
    pointer(tabs[0], 'pointerup', 300, { button: 2 });
    expect(tabs[0].classList.contains('is-dragging')).toBe(true);
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual(ids);
    pointer(tabs[0], 'pointerup', 300);
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual([ids[1], ids[2], ids[0]]);
  });

  it('window blur 中止拖拽不提交', () => {
    const { ids, tabs } = renderThreeTabs();
    pointer(tabs[0], 'pointerdown', 50);
    pointer(tabs[0], 'pointermove', 300);
    act(() => {
      window.dispatchEvent(new window.Event('blur'));
    });
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual(ids);
    expect(tabs[0].classList.contains('is-dragging')).toBe(false);
  });

  it('calcDropIndex 中点相等时归入右侧', () => {
    expect(calcDropIndex([50, 150, 250], 150)).toBe(1);
  });

  it('window 兜底提交后触屏点按仍可选中', () => {
    const { ids, tabs } = renderThreeTabs();
    pointer(tabs[0], 'pointerdown', 50);
    pointer(tabs[0], 'pointermove', 300);
    // 元素外松手：window 兜底提交，suppress 武装且无 click 跟随。
    const outside = new window.MouseEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      clientX: 300,
      button: 0,
    });
    Object.defineProperty(outside, 'pointerId', { value: 1 });
    act(() => {
      document.body.dispatchEvent(outside);
    });
    expect(useAppStore.getState().centerTabs.map((t) => t.id)).toEqual([ids[1], ids[2], ids[0]]);
    // 触屏点按 tabs[1]：down 先清陈旧 suppress（pointerType 门控之后不清的回归锁），click 选中。
    pointer(tabs[1], 'pointerdown', 150, { pointerType: 'touch' });
    pointer(tabs[1], 'pointerup', 150, { pointerType: 'touch' });
    fireEvent.click(tabs[1]);
    expect(useAppStore.getState().centerActiveTabId).toBe(ids[1]);
  });
});
