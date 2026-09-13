import { describe, expect, it } from 'vitest';
import { findLastContentRow, historySeparator, newlinesToAdvance } from '../terminalHistoryCompose';

describe('historySeparator', () => {
  it('紧贴内容：以 \\r 起头（不带前导换行），并以空行结尾', () => {
    const at = new Date(2026, 8, 13, 7, 51, 0).getTime();
    const separator = historySeparator(at);
    expect(separator.startsWith('\r')).toBe(true);
    expect(separator.startsWith('\r\n')).toBe(false);
    expect(separator.endsWith('\r\n\r\n')).toBe(true);
    expect(separator).toContain('07:51:00 2026-09-13');
    expect(separator).toContain('\x1b[90m');
  });

  it('个位数月/日/时分秒补零', () => {
    const at = new Date(2026, 0, 2, 3, 4, 5).getTime();
    expect(historySeparator(at)).toContain('03:04:05 2026-01-02');
  });
});

describe('newlinesToAdvance', () => {
  it('光标已在本段内容下一行时不再补换行', () => {
    expect(newlinesToAdvance(11, 10)).toBe(0);
  });

  it('光标停在内容中部时补到内容末尾的下一行', () => {
    expect(newlinesToAdvance(3, 10)).toBe(8);
  });

  it('光标正好停在最后一行内容上时再下移一行', () => {
    expect(newlinesToAdvance(5, 5)).toBe(1);
  });

  it('光标越界到内容之下时不回退', () => {
    expect(newlinesToAdvance(20, 10)).toBe(0);
  });

  it('下方已无内容时不再下移（防止逐行空转把分隔条顶到上千行之外）', () => {
    expect(newlinesToAdvance(5, null)).toBe(0);
  });
});

describe('findLastContentRow', () => {
  const rows: Record<number, string> = {
    0: 'PS E:\\workspace> ls',
    1: '',
    2: 'AGENTS.md  docs',
    3: '',
    4: '',
  };
  const rowText = (row: number) => rows[row] ?? '';

  it('取光标及其下方最后一个非空行', () => {
    expect(findLastContentRow(0, 5, rowText)).toBe(2);
  });

  it('光标下方没有任何内容时返回 null（而不是光标行本身）', () => {
    expect(findLastContentRow(3, 5, rowText)).toBeNull();
  });

  it('全空时返回 null', () => {
    expect(findLastContentRow(0, 5, () => '')).toBeNull();
  });

  it('光标所在行本身有内容时返回该行', () => {
    expect(findLastContentRow(2, 5, rowText)).toBe(2);
  });

  it('只扫描光标行及以下，不受上方历史影响', () => {
    const withHistory = (row: number) => (row === 0 ? '历史内容' : row === 6 ? '本段输出' : '');
    expect(findLastContentRow(5, 9, withHistory)).toBe(6);
  });
});
