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

describe('多段回放组合（锁定「后段不覆盖前段」的算法契约）', () => {
  /** 用假缓冲区驱动与 TerminalHistoryView 相同的组合算法，断言行号与内容不被覆盖 */
  function compose(segments: string[], rows = 46) {
    const buffer: string[] = [];
    let cursorRow = 0;
    for (const snapshot of segments) {
      const lines = snapshot.split('\n');
      for (const line of lines) {
        buffer[cursorRow] = line;
        cursorRow += 1;
      }
      // 写完最后一段文本后光标仍停在该行（快照不以换行结尾）
      cursorRow -= 1;
      const lastContentRow = findLastContentRow(cursorRow, rows, (row) => buffer[row] ?? '');
      const newlines = newlinesToAdvance(cursorRow, lastContentRow);
      cursorRow += newlines;
      buffer[cursorRow] = historySeparator(Date.parse('2026-09-13T07:51:00')).trim();
      // 分隔条自身以 \r\n\r\n 结束：本行 + 其下的一行空白
      cursorRow += 2;
    }
    return { buffer, cursorRow };
  }

  it('写第二段后，第一段内容与分隔条原样保留', () => {
    const first = ['seg1-line1', 'seg1-line2'].join('\n');
    const second = ['seg2-line1', 'seg2-line2', 'seg2-line3'].join('\n');
    const { buffer } = compose([first, second]);
    expect(buffer[0]).toBe('seg1-line1');
    expect(buffer[1]).toBe('seg1-line2');
    expect(buffer[2]).toContain('───');
    expect(buffer[4]).toBe('seg2-line1');
    expect(buffer[6]).toBe('seg2-line3');
    expect(buffer[7]).toContain('───');
  });

  it('内容行与它自己的分隔条紧挨，段与段之间隔一行', () => {
    const { buffer } = compose([['a', 'b'].join('\n'), ['c'].join('\n')]);
    expect(buffer[1]).toBe('b');
    expect(buffer[2]).toContain('───');
    expect(buffer[3]).toBeFalsy();
    expect(buffer[4]).toBe('c');
  });

  it('快照末尾的光标回拉不影响定位（以缓冲区实际内容为准）', () => {
    // SerializeAddon 会在快照末尾把光标恢复到它自己的光标位置（可能在内容中部），
    // 因此不能用「光标所在行」当边界，必须扫描缓冲区找最底部的实际内容行。
    const buffer: string[] = [];
    let cursorRow = 0;
    for (const line of ['x', 'y', 'z']) {
      buffer[cursorRow] = line;
      cursorRow += 1;
    }
    cursorRow -= 1;
    // 模拟快照末尾的光标回拉：光标被拉回内容顶部
    cursorRow = 0;
    const lastContentRow = findLastContentRow(cursorRow, 46, (row) => buffer[row] ?? '');
    const newlines = newlinesToAdvance(cursorRow, lastContentRow);
    cursorRow += newlines;
    buffer[cursorRow] = historySeparator(Date.parse('2026-09-13T07:51:00')).trim();
    expect(lastContentRow).toBe(2);
    expect(newlines).toBe(3);
    expect(cursorRow).toBe(3);
    expect(buffer[2]).toBe('z');
  });
});
