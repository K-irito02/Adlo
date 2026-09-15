import { describe, expect, it } from 'vitest';
import { extractLines, type ExtractCell, type ExtractLine, type ExtractSource } from '../historyModel';

function cell(ch: string, opts: Partial<ExtractCell> = {}): ExtractCell {
  return {
    getChars: () => ch,
    getWidth: () => opts.getWidth?.() ?? (ch === '中' ? 2 : 1),
    isFgDefault: () => opts.isFgDefault?.() ?? true,
    getFgColor: () => opts.getFgColor?.() ?? 0,
    isFgRGB: () => opts.isFgRGB?.() ?? false,
    isBgDefault: () => opts.isBgDefault?.() ?? true,
    getBgColor: () => opts.getBgColor?.() ?? 0,
    isBgRGB: () => opts.isBgRGB?.() ?? false,
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

  it('空白单元格还原为空格，保留列对齐（xterm 渲染器同款回退）', () => {
    // xterm 空白格 getChars() 为空串、宽度 1；渲染器按 WHITESPACE_CELL_CHAR 画成空格。
    // 若不还原，`ls` 多列输出的列间空白会消失，历史行被压缩、与实时终端对不上。
    const blank = cell('', { getWidth: () => 1 });
    const rows = [
      line([cell('a'), blank, blank, cell('b'), cell('c')]),
    ];
    expect(extractLines(buffer(rows), 0, 1)).toEqual([[{ text: 'a  bc' }]]);
  });

  it('宽度 0 的宽字符占位格不产出字符（避免多出一个空格）', () => {
    const placeholder = cell('', { getWidth: () => 0 });
    const rows = [line([cell('中'), placeholder, cell('a')])];
    expect(extractLines(buffer(rows), 0, 1)).toEqual([[{ text: '中a' }]]);
  });

  it('真彩色按 color mode 定型为 hex，调色板色仍存下标（含 255 重叠边界）', () => {
    // 真彩色纯蓝 0x0000ff = 255，与调色板下标 255 数值完全相同；
    // 单看数值无法区分，必须按 isFgRGB() 定型，否则纯蓝会被当灰阶末位渲染
    const rows = [
      line([
        cell('a', { isFgDefault: () => false, getFgColor: () => 0x0000ff, isFgRGB: () => true }),
        cell('b', { isFgDefault: () => false, getFgColor: () => 255 }),
        cell('c', { isBgDefault: () => false, getBgColor: () => 0x1e90ff, isBgRGB: () => true }),
      ]),
    ];
    expect(extractLines(buffer(rows), 0, 1)).toEqual([
      [{ text: 'a', fg: '#0000ff' }, { text: 'b', fg: 255 }, { text: 'c', bg: '#1e90ff' }],
    ]);
  });

  it('只返回给定行区间，空行保留为空数组', () => {
    const rows = [line([cell('a')]), line([]), line([cell('c')])];
    expect(extractLines(buffer(rows), 1, 3)).toEqual([[], [{ text: 'c' }]]);
  });

  it('备用缓冲区激活时改取 normal', () => {
    expect(extractLines(buffer([line([cell('n')])], 'alternate'), 0, 1)).toEqual([[{ text: 'n' }]]);
  });
});
