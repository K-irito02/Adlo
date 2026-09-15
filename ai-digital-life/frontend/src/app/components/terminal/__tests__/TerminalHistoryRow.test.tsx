import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TerminalHistoryRow } from '../TerminalHistoryRow';
import type { HistoryPalette } from '@features/terminal/historyModel';

const palette: HistoryPalette = {
  foreground: '#ffffff',
  background: '#000000',
  ansi: Array.from({ length: 16 }, () => '#888888'),
};

describe('TerminalHistoryRow 网格路径', () => {
  it('纯 ASCII 窄字符行走快速路径（整 run 一个 span）', () => {
    const { container } = render(
      <TerminalHistoryRow runs={[{ text: 'D:\\>ls' }]} palette={palette} />,
    );
    expect(container.querySelectorAll('.adl-terminal-history-cell')).toHaveLength(0);
    expect(screen.getByText('D:\\>ls')).toBeInTheDocument();
  });

  it('含 CJK 的行走逐字钉格路径（每字一格，宽字占 2 格）', () => {
    const { container } = render(
      <TerminalHistoryRow runs={[{ text: 'a中b' }]} palette={palette} />,
    );
    const cells = container.querySelectorAll('.adl-terminal-history-cell');
    expect(cells).toHaveLength(3);
    expect(cells[0].getAttribute('style')).toContain('calc(1 * var(--adl-terminal-cell-width');
    expect(cells[1].getAttribute('style')).toContain('calc(2 * var(--adl-terminal-cell-width');
    expect(cells[2].getAttribute('style')).toContain('calc(1 * var(--adl-terminal-cell-width');
  });

  it('粗体行走逐字钉格路径（浏览器粗体字形步进不可靠）', () => {
    const { container } = render(
      <TerminalHistoryRow runs={[{ text: 'ab', bold: true }]} palette={palette} />,
    );
    expect(container.querySelectorAll('.adl-terminal-history-cell')).toHaveLength(2);
  });

  it('钉格行保留 run 的语义颜色', () => {
    render(<TerminalHistoryRow runs={[{ text: '中', fg: 1 }]} palette={palette} />);
    const cell = document.querySelector('.adl-terminal-history-cell') as HTMLElement;
    expect(cell.textContent).toBe('中');
    const run = cell.parentElement as HTMLElement;
    expect(run.style.color).not.toBe('');
  });
});
