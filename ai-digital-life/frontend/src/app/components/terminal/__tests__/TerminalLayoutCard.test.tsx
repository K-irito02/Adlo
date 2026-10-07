// src/app/components/terminal/__tests__/TerminalLayoutCard.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TerminalPane } from '@stores/slices/terminalSliceTypes';
import { paneColor } from '@features/terminal/paneColors';
import { TerminalLayoutCard } from '../TerminalLayoutCard';

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

  it('exposes a swap-mode entry button', () => {
    const { container } = renderCard(makePanes(2));
    const toggle = container.querySelector('.adl-layout-card__swap-toggle');
    expect(toggle).not.toBeNull();
    expect(screen.getByRole('button', { name: '交换位置' })).not.toBeNull();
  });
});
