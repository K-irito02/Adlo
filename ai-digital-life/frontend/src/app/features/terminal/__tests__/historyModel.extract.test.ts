import { describe, expect, it } from 'vitest';
import { extractLines, type ExtractCell, type ExtractLine, type ExtractSource } from '../historyModel';

function cell(ch: string, opts: Partial<ExtractCell> = {}): ExtractCell {
  return {
    getChars: () => ch,
    getWidth: () => (ch === '中' ? 2 : 1),
    isFgDefault: () => opts.isFgDefault?.() ?? true,
    getFgColor: () => opts.getFgColor?.() ?? 0,
    isBgDefault: () => opts.isBgDefault?.() ?? true,
    getBgColor: () => opts.getBgColor?.() ?? 0,
    isBold: () => opts.isBold?.() ?? false,
    isItalic: () => false,
    isUnderline: () => false,
    isDim: () => false,
    isInverse: () => false,
  };
}

function line(cells: ExtractCell[]): ExtractLine {
  return { getCell: (x) => cells[x] };
}

function source(rows: ExtractLine[], type: 'normal' | 'alternate' = 'normal'): ExtractSource {
  return { activeType: type, length: rows.length, getLine: (y) => rows[y] };
}

function buffer(rows: ExtractLine[], type: 'normal' | 'alternate' = 'normal') {
  return { active: source(rows, type), normal: source(rows, 'normal') };
}

describe('extractLines', () => {
  it('把连续同样式单元格合并为一个 run', () => {
    expect(extractLines(buffer([line([cell('a'), cell('b'), cell('c')])]), 0, 1)).toEqual([
      [{ text: 'abc' }],
    ]);
  });

  it('样式变化处切分 run 并记录语义色', () => {
    const rows = [
      line([
        cell('a'),
        cell('b', { isFgDefault: () => false, getFgColor: () => 2 }),
        cell('c', { isFgDefault: () => false, getFgColor: () => 2 }),
      ]),
    ];
    expect(extractLines(buffer(rows), 0, 1)).toEqual([[{ text: 'a' }, { text: 'bc', fg: 2 }]]);
  });

  it('行尾右裁裁掉纯空白', () => {
    expect(extractLines(buffer([line([cell('a'), cell(' '), cell(' ')])]), 0, 1)).toEqual([
      [{ text: 'a' }],
    ]);
  });

  it('保留带非默认背景色的尾部单元格（不丢色块）', () => {
    const rows = [
      line([cell('a'), cell(' ', { isBgDefault: () => false, getBgColor: () => 4 })]),
    ];
    expect(extractLines(buffer(rows), 0, 1)).toEqual([[{ text: 'a' }, { text: ' ', bg: 4 }]]);
  });

  it('只返回给定行区间，空行保留为空数组', () => {
    const rows = [line([cell('a')]), line([]), line([cell('c')])];
    expect(extractLines(buffer(rows), 1, 3)).toEqual([[], [{ text: 'c' }]]);
  });

  it('备用缓冲区激活时改取 normal', () => {
    expect(extractLines(buffer([line([cell('n')])], 'alternate'), 0, 1)).toEqual([[{ text: 'n' }]]);
  });
});
