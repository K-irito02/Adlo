// src/app/components/terminal/__tests__/TerminalLayoutCard.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  terminalLayoutCardSwapCancel: 'SWAP_CANCEL',
  terminalLayoutCardAnnotateHint: 'ANNOTATE_HINT',
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
  const { container } = render(
    <TerminalLayoutCard
      panes={panes}
      onMove={onMove}
      onSwap={onSwap}
      onLabelChange={onLabelChange}
      onClose={onClose}
    />,
  );
  return { container, onMove, onSwap, onLabelChange, onClose };
}

// jsdom 会把 hex 归一化为 `rgb(...)`；两侧都过一遍同样的归一化再比对。
function normalize(color: string): string {
  const probe = document.createElement('div');
  probe.style.background = color;
  return probe.style.background;
}

function squaresOf(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.adl-layout-card__square'));
}

// jsdom 26 无 DataTransfer：拖拽测试显式注入一个可断言的 dataTransfer 替身。
function dragDataTransfer() {
  return { setData: vi.fn(), effectAllowed: 'none' };
}

describe('TerminalLayoutCard', () => {
  it('renders one square per pane inside the card grid', () => {
    const { container } = renderCard(makePanes(3));
    expect(container.querySelector('.adl-layout-card')).not.toBeNull();
    expect(container.querySelector('.adl-layout-card__grid')).not.toBeNull();
    expect(squaresOf(container)).toHaveLength(3);
  });

  it('orders squares by pane order and paints each with paneColor(colorIndex)', () => {
    const panes = makePanes(4);
    const { container } = renderCard(panes);
    const squares = squaresOf(container);
    expect(squares.map((square) => square.style.background)).toEqual(
      panes.map((pane) => normalize(paneColor(pane.colorIndex))),
    );
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
    expect(screen.getByRole('button', { name: COPY.terminalLayoutCardSwap })).not.toBeNull();
    expect(container.querySelector('.adl-layout-card__hint')?.textContent).toBe(
      COPY.terminalLayoutCardAnnotateHint,
    );
  });

  it('renders a close button that calls onClose', () => {
    const { onClose } = renderCard(makePanes(2));
    fireEvent.click(screen.getByRole('button', { name: COPY.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('TerminalLayoutCard reorder', () => {
  it('calls onMove(fromIndex, toIndex) when a square is dropped onto another', () => {
    const { container, onMove } = renderCard(makePanes(3));
    const squares = squaresOf(container);
    fireEvent.dragStart(squares[0], { dataTransfer: dragDataTransfer() });
    fireEvent.dragOver(squares[2]);
    fireEvent.drop(squares[2]);
    expect(onMove).toHaveBeenCalledWith(0, 2);
  });

  it('does not call onMove when a square is dropped on itself', () => {
    const { container, onMove } = renderCard(makePanes(3));
    const squares = squaresOf(container);
    fireEvent.dragStart(squares[1], { dataTransfer: dragDataTransfer() });
    fireEvent.drop(squares[1]);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('sets dataTransfer on drag start so native DnD (Firefox) can start the drag', () => {
    const { container } = renderCard(makePanes(3));
    const dataTransfer = dragDataTransfer();
    fireEvent.dragStart(squaresOf(container)[0], { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '0');
    expect(dataTransfer.effectAllowed).toBe('move');
  });
});

describe('TerminalLayoutCard swap mode', () => {
  it('confirms onSwap(a, b) after selecting two squares, then exits mode', async () => {
    const user = userEvent.setup();
    const { container, onSwap } = renderCard(makePanes(3));
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwap }));

    const squares = squaresOf(container);
    await user.click(squares[0]);
    await user.click(squares[2]);

    const confirm = screen.getByRole('button', { name: COPY.terminalLayoutCardSwapConfirm });
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(onSwap).toHaveBeenCalledWith('p1', 'p3');
    expect(screen.queryByRole('button', { name: COPY.terminalLayoutCardSwapConfirm })).toBeNull();
  });

  it('disables confirm until two squares are selected', async () => {
    const user = userEvent.setup();
    const { container, onSwap } = renderCard(makePanes(3));
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwap }));

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
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwap }));
    await user.click(squaresOf(container)[0]);
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwapCancel }));

    expect(onSwap).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: COPY.terminalLayoutCardSwap })).not.toBeNull();
    expect(screen.queryByRole('button', { name: COPY.terminalLayoutCardSwapConfirm })).toBeNull();
  });
});

describe('TerminalLayoutCard keyboard', () => {
  it('Enter in swap mode toggles selection via aria-pressed', async () => {
    const user = userEvent.setup();
    const { container } = renderCard(makePanes(3));
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwap }));

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
    await user.click(screen.getByRole('button', { name: COPY.terminalLayoutCardSwap }));

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
    expect(input).toHaveAttribute('maxLength', '1');
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
