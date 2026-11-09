// src/app/components/terminal/__tests__/TerminalLayoutCard.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TerminalPane } from '@stores/slices/terminalSliceTypes';
import { paneColor } from '@features/terminal/paneColors';
import { TerminalLayoutCard } from '../TerminalLayoutCard';

// 用哨兵文案 mock useTCopy，断言卡片显示的是 copy（而非硬编码字面量）。
const COPY = vi.hoisted(() => ({
  terminalCustomLayout: 'CUSTOM_LAYOUT',
  close: 'CLOSE',
  terminalLayoutCardSwap: 'SWAP_TOGGLE',
  terminalLayoutCardSwapConfirm: 'SWAP_CONFIRM',
  terminalLayoutCardSwapRevert: 'SWAP_REVERT',
  terminalLayoutCardSwapCancel: 'SWAP_CANCEL',
  terminalLayoutCardSwapMode: 'SWAP_MODE',
  terminalLayoutCardAnnotateHint: 'ANNOTATE_HINT',
  terminalLayoutCardSwapHint: 'SWAP_HINT',
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({ t: COPY, locale: 'en-US', formatT: vi.fn() }),
}));

function makePanes(count: number): TerminalPane[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    profile: 'bash' as const,
    status: 'idle' as const,
    colorIndex: index,
  }));
}

function renderCard(panes: TerminalPane[]) {
  const onMove = vi.fn();
  const onSwap = vi.fn();
  const onLabelChange = vi.fn();
  const onClose = vi.fn();
  const { container, rerender } = render(
    <TerminalLayoutCard
      panes={panes}
      onMove={onMove}
      onSwap={onSwap}
      onLabelChange={onLabelChange}
      onClose={onClose}
    />,
  );
  const props = { onMove, onSwap, onLabelChange, onClose };
  return {
    container,
    onMove,
    onSwap,
    onLabelChange,
    onClose,
    rerenderWith: (next: TerminalPane[]) =>
      rerender(
        <TerminalLayoutCard
          panes={next}
          onMove={props.onMove}
          onSwap={props.onSwap}
          onLabelChange={props.onLabelChange}
          onClose={props.onClose}
        />,
      ),
  };
}

/** 方块身份色经 CSS 自定义属性 `--pane-tile-color` 交给主题混合（背景由 CSS 合成）。 */
function tileColorOf(square: HTMLElement): string {
  return square.style.getPropertyValue('--pane-tile-color').trim();
}

function squaresOf(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      '.adl-layout-card__square:not(.adl-layout-card__square--placeholder)',
    ),
  );
}

/** 指针事件派发：本仓库 jsdom 的 PointerEvent 构造丢弃坐标 init，
 * 故用携带坐标的 MouseEvent 按指针类型名派发（React 与文档监听均按类型名订阅）。
 * 局限：右键门控（button 非 0）、多点触摸（isPrimary=false）走真实 PointerEvent
 * 分支，此替身测不到——相关门控以代码审查覆盖，见实现注释。 */
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

/** 3 窗格（cols=2）：槽位中心 slot0=(20,20) slot1=(68,20) slot2=(20,68)。 */
function pointerDragSquare(fromEl: HTMLElement, toPoint: number[], fromPoint = [20, 20]): void {
  dispatchPointer(fromEl, 'pointerdown', {
    button: 0,
    clientX: fromPoint[0],
    clientY: fromPoint[1],
  });
  dispatchPointer(document, 'pointermove', { clientX: toPoint[0], clientY: toPoint[1] });
  dispatchPointer(document, 'pointerup', { clientX: toPoint[0], clientY: toPoint[1] });
}

describe('TerminalLayoutCard', () => {
  it('renders one square per pane inside the card grid', () => {
    const { container } = renderCard(makePanes(3));
    expect(container.querySelector('.adl-layout-card')).not.toBeNull();
    expect(container.querySelector('.adl-layout-card__grid')).not.toBeNull();
    expect(squaresOf(container)).toHaveLength(3);
  });

  it('orders squares by pane order and exposes paneColor(colorIndex) for theme mixing', () => {
    const panes = makePanes(4);
    const { container } = renderCard(panes);
    const squares = squaresOf(container);
    expect(squares.map(tileColorOf)).toEqual(panes.map((pane) => paneColor(pane.colorIndex)));
  });

  it('shows the pane label when present, else renders empty', () => {
    const panes = makePanes(2);
    panes[1].label = '中';
    const { container } = renderCard(panes);
    const squares = squaresOf(container);
    expect(squares[0].textContent).toBe('');
    expect(squares[1].textContent).toBe('中');
  });

  it('renders copy from useTCopy rather than hardcoded literals', () => {
    const { container } = renderCard(makePanes(2));
    expect(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapMode })).not.toBeNull();
    expect(container.querySelector('.adl-layout-card__hint')?.textContent).toBe(
      COPY.terminalLayoutCardAnnotateHint,
    );
  });

  it('renders a close button that calls onClose', () => {
    const { onClose } = renderCard(makePanes(2));
    fireEvent.click(screen.getByRole('button', { name: COPY.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes modal dialog semantics and moves focus into the card on open (L7)', () => {
    const { container } = renderCard(makePanes(2));
    const card = container.querySelector<HTMLElement>('.adl-layout-card');
    expect(card?.getAttribute('role')).toBe('dialog');
    expect(card?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(card);
  });
});

describe('TerminalLayoutCard reorder (B 缝隙滑动)', () => {
  it('拖到目标槽位松手 → onMove(原下标, 落点下标)', () => {
    const { container, onMove } = renderCard(makePanes(3));
    const squares = squaresOf(container);
    pointerDragSquare(squares[0], [20, 68]);
    expect(onMove).toHaveBeenCalledWith(0, 2);
  });

  it('居中后拖拽落点按布局坐标计算（不被 FLIP transform 污染）', () => {
    const { container, onMove } = renderCard(makePanes(3));
    const squares = squaresOf(container);
    const grid = container.querySelector<HTMLElement>('.adl-layout-card__grid');
    expect(grid).not.toBeNull();
    const rect = {
      left: 100,
      top: 100,
      width: 200,
      height: 200,
      right: 300,
      bottom: 300,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect;
    const rectSpy = vi.spyOn(grid as HTMLElement, 'getBoundingClientRect').mockReturnValue(rect);
    Object.defineProperty(squares[0], 'offsetWidth', { value: 40, configurable: true });

    // cols=2、tile=40、gap=8 → 内容宽 88；网格 200 宽居中 → 原点 x=156、y=100。
    // 从首块中心拖到第二列中心：新算法 floor((224-156)/48)=1；旧算法 floor((224-100)/48)=2。
    pointerDragSquare(squares[0], [224, 120], [176, 120]);
    expect(onMove).toHaveBeenCalledWith(0, 1);

    rectSpy.mockRestore();
  });

  it('拖拽中本地顺序实时变化（其它方块让位），松手才提交一次', () => {
    const { container, onMove } = renderCard(makePanes(3));
    const panes = makePanes(3);
    const squares = squaresOf(container);
    dispatchPointer(squares[0], 'pointerdown', { button: 0, clientX: 20, clientY: 20 });
    dispatchPointer(document, 'pointermove', { clientX: 20, clientY: 68 });
    // 本地已重排为 [p2,p3,p1]，但尚未提交
    expect(squaresOf(container).map(tileColorOf)).toEqual(
      [panes[1], panes[2], panes[0]].map((pane) => paneColor(pane.colorIndex)),
    );
    expect(onMove).not.toHaveBeenCalled();
    dispatchPointer(document, 'pointerup');
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(0, 2);
  });

  it('阈值内微移视为点击，不提交', () => {
    const { container, onMove } = renderCard(makePanes(3));
    const squares = squaresOf(container);
    pointerDragSquare(squares[0], [70, 22], [68, 20]);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('纯点击（无位移）不提交', () => {
    const { container, onMove } = renderCard(makePanes(3));
    const squares = squaresOf(container);
    dispatchPointer(squares[0], 'pointerdown', { button: 0, clientX: 0, clientY: 0 });
    dispatchPointer(document, 'pointerup');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('取消拖拽不提交（本地顺序丢弃）', () => {
    const { container, onMove } = renderCard(makePanes(3));
    const squares = squaresOf(container);
    dispatchPointer(squares[0], 'pointerdown', { button: 0, clientX: 20, clientY: 20 });
    dispatchPointer(document, 'pointermove', { clientX: 20, clientY: 68 });
    dispatchPointer(document, 'pointercancel');
    expect(onMove).not.toHaveBeenCalled();
    // 本地顺序已回退
    expect(squaresOf(container).map(tileColorOf)).toEqual(
      makePanes(3).map((pane) => paneColor(pane.colorIndex)),
    );
  });

  it('拖拽源高亮 is-dragging，结束后清除', () => {
    const { container } = renderCard(makePanes(3));
    const squares = squaresOf(container);
    dispatchPointer(squares[0], 'pointerdown', { button: 0, clientX: 20, clientY: 20 });
    dispatchPointer(document, 'pointermove', { clientX: 20, clientY: 68 });
    // keyed DOM 节点复用：原数组下标 0 的节点仍是被拖方块
    expect(squares[0].classList.contains('is-dragging')).toBe(true);
    dispatchPointer(document, 'pointerup');
    expect(squares[0].classList.contains('is-dragging')).toBe(false);
  });

  it('同一帧内 move+up：落点取最新本地序，不偏旧', () => {
    const { container, onMove } = renderCard(makePanes(3));
    const squares = squaresOf(container);
    dispatchPointer(squares[0], 'pointerdown', { button: 0, clientX: 20, clientY: 20 });
    // move 与 up 同一 act 内派发（重渲染来不及 flush）：ref 同步写保证落点新鲜
    act(() => {
      document.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 20, clientY: 68 }),
      );
      document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    });
    expect(onMove).toHaveBeenCalledWith(0, 2);
  });

  it('交换模式下指针拖拽被忽略', async () => {
    const user = userEvent.setup();
    const { container, onMove } = renderCard(makePanes(3));
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapMode }));
    const squares = squaresOf(container);
    pointerDragSquare(squares[0], [20, 68]);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('反向拖拽 2→0 → onMove(2, 0)', () => {
    const { container, onMove } = renderCard(makePanes(3));
    const squares = squaresOf(container);
    // slot2 中心 (20,68) → slot0 中心 (20,20)
    dispatchPointer(squares[2], 'pointerdown', { button: 0, clientX: 20, clientY: 68 });
    dispatchPointer(document, 'pointermove', { clientX: 20, clientY: 20 });
    dispatchPointer(document, 'pointerup');
    expect(onMove).toHaveBeenCalledWith(2, 0);
  });

  it('4 窗格 0→2 → onMove(0, 2)（remove+insert 终序语义）', () => {
    const { container, onMove } = renderCard(makePanes(4));
    const squares = squaresOf(container);
    expect(squares).toHaveLength(4);
    dispatchPointer(squares[0], 'pointerdown', { button: 0, clientX: 20, clientY: 20 });
    dispatchPointer(document, 'pointermove', { clientX: 20, clientY: 68 });
    dispatchPointer(document, 'pointerup');
    expect(onMove).toHaveBeenCalledWith(0, 2);
  });

  it('拖出卡片再松手仍提交且卡片不崩', () => {
    const { container, onMove } = renderCard(makePanes(3));
    const squares = squaresOf(container);
    dispatchPointer(squares[0], 'pointerdown', { button: 0, clientX: 20, clientY: 20 });
    // 远拖出卡片：槽位钳到末尾 slot2
    dispatchPointer(document, 'pointermove', { clientX: 500, clientY: 500 });
    dispatchPointer(document, 'pointerup');
    expect(onMove).toHaveBeenCalledWith(0, 2);
    // 卡片不受宿主关闭竞跑影响（关闭只监听卡片外 mousedown，本次手势无第二次按下）
    expect(container.querySelector('.adl-layout-card')).not.toBeNull();
  });

  it('拖入末行占位格 → 移到末尾', () => {
    // 5 窗格 → cols=3 rows=2，slot5 为占位；slot5 中心约 (116,68)
    const { container, onMove } = renderCard(makePanes(5));
    const squares = squaresOf(container);
    expect(squares).toHaveLength(5);
    dispatchPointer(squares[0], 'pointerdown', { button: 0, clientX: 20, clientY: 20 });
    dispatchPointer(document, 'pointermove', { clientX: 116, clientY: 68 });
    dispatchPointer(document, 'pointerup');
    expect(onMove).toHaveBeenCalledWith(0, 4);
  });

  it('窗口失焦取消拖拽，不提交且本地回退', () => {
    const { container, onMove } = renderCard(makePanes(3));
    const squares = squaresOf(container);
    dispatchPointer(squares[0], 'pointerdown', { button: 0, clientX: 20, clientY: 20 });
    dispatchPointer(document, 'pointermove', { clientX: 20, clientY: 68 });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(onMove).not.toHaveBeenCalled();
    expect(squaresOf(container).map(tileColorOf)).toEqual(
      makePanes(3).map((pane) => paneColor(pane.colorIndex)),
    );
  });

  it('拖拽中滚动取消拖拽，不提交且本地回退', () => {
    const { container, onMove } = renderCard(makePanes(3));
    const squares = squaresOf(container);
    dispatchPointer(squares[0], 'pointerdown', { button: 0, clientX: 20, clientY: 20 });
    dispatchPointer(document, 'pointermove', { clientX: 20, clientY: 68 });
    act(() => {
      document.dispatchEvent(new Event('scroll'));
    });
    expect(onMove).not.toHaveBeenCalled();
    expect(squaresOf(container).map(tileColorOf)).toEqual(
      makePanes(3).map((pane) => paneColor(pane.colorIndex)),
    );
  });

  it('拖后紧跟的 click 被吞掉，不误选中（交换模式）', async () => {
    const user = userEvent.setup();
    const { container } = renderCard(makePanes(3));
    const squares = squaresOf(container);
    // 普通模式拖拽一次，浏览器随后派发的 click 应被抑制
    pointerDragSquare(squares[0], [20, 68]);
    // 再进入交换模式并点击方块：若抑制失效，此次点击会选中
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapMode }));
    fireEvent.click(squaresOf(container)[0]);
    for (const square of squaresOf(container)) {
      expect(square).toHaveAttribute('aria-pressed', 'false');
    }
  });
});

describe('TerminalLayoutCard swap mode', () => {
  it('交换后保留模式：onSwap 被调用、选择清空、可连续交换', async () => {
    const user = userEvent.setup();
    const { container, onSwap } = renderCard(makePanes(3));
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapMode }));

    const squares = squaresOf(container);
    await user.click(squares[0]);
    await user.click(squares[2]);

    const confirm = screen.getByRole('button', { name: COPY.terminalLayoutCardSwapConfirm });
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(onSwap).toHaveBeenCalledWith('p1', 'p3');
    // 仍在交换模式：确认按钮还在，但选择已清空故禁用
    expect(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapConfirm })).toBeDisabled();
    expect(container.querySelector('.adl-layout-card__hint')?.textContent).toBe(
      COPY.terminalLayoutCardSwapHint,
    );
  });

  it('disables confirm until two squares are selected', async () => {
    const user = userEvent.setup();
    const { container, onSwap } = renderCard(makePanes(3));
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapMode }));

    const confirm = screen.getByRole('button', { name: COPY.terminalLayoutCardSwapConfirm });
    expect(confirm).toBeDisabled();

    await user.click(squaresOf(container)[0]);
    expect(confirm).toBeDisabled();

    await user.click(squaresOf(container)[1]);
    expect(confirm).toBeEnabled();
    expect(onSwap).not.toHaveBeenCalled();
  });

  it('exits swap mode via cancel without swapping', async () => {
    const user = userEvent.setup();
    const { container, onSwap } = renderCard(makePanes(2));
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapMode }));
    await user.click(squaresOf(container)[0]);
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapCancel }));

    expect(onSwap).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapMode })).not.toBeNull();
    expect(screen.queryByRole('button', { name: COPY.terminalLayoutCardSwapConfirm })).toBeNull();
  });
});

describe('TerminalLayoutCard swap revert', () => {
  it('撤回撤销上次交换（再交换一次），保留模式；历史清空后禁用撤回', async () => {
    const user = userEvent.setup();
    const { container, onSwap } = renderCard(makePanes(3));
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapMode }));

    const revert = screen.getByRole('button', { name: COPY.terminalLayoutCardSwapRevert });
    // 无历史时禁用
    expect(revert).toBeDisabled();

    const squares = squaresOf(container);
    await user.click(squares[0]);
    await user.click(squares[1]);
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapConfirm }));
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(revert).toBeEnabled();

    await user.click(revert);
    // 撤回 = 把最后一对再交换一次
    expect(onSwap).toHaveBeenCalledTimes(2);
    expect(onSwap).toHaveBeenNthCalledWith(2, 'p1', 'p2');
    expect(revert).toBeDisabled();
    // 仍在交换模式
    expect(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapConfirm })).not.toBeNull();
  });

  it('退出模式清空历史：重新进入后撤回禁用', async () => {
    const user = userEvent.setup();
    const { container } = renderCard(makePanes(3));
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapMode }));

    const squares = squaresOf(container);
    await user.click(squares[0]);
    await user.click(squares[1]);
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapConfirm }));
    expect(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapRevert })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapCancel }));
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapMode }));
    expect(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapRevert })).toBeDisabled();
  });

  it('增删窗格后选择与撤回历史失效（引用旧身份不再还原）', async () => {
    const user = userEvent.setup();
    const { container, onSwap, rerenderWith } = renderCard(makePanes(3));
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapMode }));

    const squares = squaresOf(container);
    await user.click(squares[0]);
    await user.click(squares[1]);
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapConfirm }));
    expect(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapRevert })).toBeEnabled();

    // 外部删掉一个窗格：选择与历史一并失效
    rerenderWith(makePanes(2));
    expect(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapRevert })).toBeDisabled();
    expect(onSwap).toHaveBeenCalledTimes(1);
  });

  it('进入交换模式后提示文案切换，退出后恢复', async () => {
    const user = userEvent.setup();
    const { container } = renderCard(makePanes(2));
    expect(container.querySelector('.adl-layout-card__hint')?.textContent).toBe(
      COPY.terminalLayoutCardAnnotateHint,
    );
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapMode }));
    expect(container.querySelector('.adl-layout-card__hint')?.textContent).toBe(
      COPY.terminalLayoutCardSwapHint,
    );
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapCancel }));
    expect(container.querySelector('.adl-layout-card__hint')?.textContent).toBe(
      COPY.terminalLayoutCardAnnotateHint,
    );
  });
});

describe('TerminalLayoutCard grid mirrors terminal area', () => {
  it('列数与 computeGrid 一致（固定 40px 方块），末行不足留空占位', () => {
    const { container } = renderCard(makePanes(3));
    const grid = container.querySelector<HTMLElement>('.adl-layout-card__grid');
    expect(grid?.style.gridTemplateColumns).toBe('repeat(2, 40px)');
    // 3 窗格 → 2×2 网格，1 个占位
    expect(container.querySelectorAll('.adl-layout-card__square--placeholder')).toHaveLength(1);
    expect(squaresOf(container)).toHaveLength(3);
  });

  it('方块列宽固定（px），不随窗格数量用 1fr 拉伸', () => {
    for (const count of [1, 2, 5]) {
      const { container, unmount } = render(
        <TerminalLayoutCard
          panes={makePanes(count)}
          onMove={vi.fn()}
          onSwap={vi.fn()}
          onLabelChange={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      const grid = container.querySelector<HTMLElement>('.adl-layout-card__grid');
      expect(grid?.style.gridTemplateColumns).toMatch(/^repeat\(\d+, 40px\)$/);
      unmount();
    }
  });
});

describe('TerminalLayoutCard keyboard', () => {
  it('Enter in swap mode toggles selection via aria-pressed', async () => {
    const user = userEvent.setup();
    const { container } = renderCard(makePanes(3));
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapMode }));

    const square = squaresOf(container)[0];
    expect(square).toHaveAttribute('aria-pressed', 'false');
    square.focus();

    await user.keyboard('{Enter}');
    expect(squaresOf(container)[0]).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{Enter}');
    expect(squaresOf(container)[0]).toHaveAttribute('aria-pressed', 'false');
  });

  it('Space in swap mode toggles selection', async () => {
    const user = userEvent.setup();
    const { container } = renderCard(makePanes(3));
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapMode }));

    squaresOf(container)[0].focus();
    await user.keyboard(' ');
    expect(squaresOf(container)[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('Enter outside swap mode enters label editing', async () => {
    const user = userEvent.setup();
    const { container } = renderCard(makePanes(2));

    squaresOf(container)[0].focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('textbox')).not.toBeNull();
  });
});

describe('TerminalLayoutCard label editing', () => {
  it('commits the label on Enter after a double-click', async () => {
    const user = userEvent.setup();
    const { container, onLabelChange } = renderCard(makePanes(2));
    await user.dblClick(squaresOf(container)[0]);

    const input = screen.getByRole('textbox');
    expect(input).not.toHaveAttribute('maxLength');
    await user.type(input, '中');
    await user.keyboard('{Enter}');

    expect(onLabelChange).toHaveBeenCalledWith('p1', '中');
  });

  it('truncates input to the first code point on commit', () => {
    const { container, onLabelChange } = renderCard(makePanes(2));
    fireEvent.doubleClick(squaresOf(container)[0]);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '中文' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onLabelChange).toHaveBeenCalledWith('p1', '中');
  });

  it('commits the label on blur', () => {
    const { container, onLabelChange } = renderCard(makePanes(2));
    fireEvent.doubleClick(squaresOf(container)[0]);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '中' } });
    fireEvent.blur(input);

    expect(onLabelChange).toHaveBeenCalledWith('p1', '中');
  });

  it('keeps the typed draft when the editing input itself is double-clicked', () => {
    const { container } = renderCard(makePanes(2));
    fireEvent.doubleClick(squaresOf(container)[0]);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '中' } });
    fireEvent.doubleClick(input);

    expect(screen.getByRole('textbox')).toHaveValue('中');
  });

  it('cancels editing on Escape without committing', () => {
    const { container, onLabelChange } = renderCard(makePanes(2));
    fireEvent.doubleClick(squaresOf(container)[0]);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '中' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onLabelChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
