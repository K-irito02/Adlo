import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TerminalHistoryDivider, formatDividerTime } from '../TerminalHistoryDivider';

describe('formatDividerTime', () => {
  it('固定为 HH:MM:SS YYYY-MM-DD，不随 locale 变化', () => {
    const at = new Date(2026, 8, 14, 22, 10, 5).getTime();
    expect(formatDividerTime(at)).toBe('22:10:05 2026-09-14');
  });

  it('补零到两位', () => {
    const at = new Date(2026, 0, 2, 3, 4, 5).getTime();
    expect(formatDividerTime(at)).toBe('03:04:05 2026-01-02');
  });
});

describe('TerminalHistoryDivider', () => {
  it('渲染为两条撑满的线夹一个居中文本', () => {
    const at = new Date(2026, 8, 14, 22, 10, 5).getTime();
    const { container } = render(<TerminalHistoryDivider at={at} label={formatDividerTime} />);
    expect(container.querySelectorAll('.adl-terminal-history-divider__line').length).toBe(2);
    expect(container.textContent).toContain('22:10:05 2026-09-14');
  });
});
