import { describe, expect, it } from 'vitest';
import { cellWidthOf, splitCellGroups, wrapLines } from '../historyModel';

describe('cellWidthOf', () => {
  it('ASCII 计 1 格，CJK 与全角计 2 格', () => {
    expect(cellWidthOf('a')).toBe(1);
    expect(cellWidthOf('中')).toBe(2);
    expect(cellWidthOf('，')).toBe(2);
    expect(cellWidthOf('Ａ')).toBe(2);
  });

  it('零宽码点计 0 格（组合标记 / ZWJ / 变体选择符），与 xterm wcwidth 同口径', () => {
    expect(cellWidthOf('\u0301')).toBe(0); // COMBINING ACUTE ACCENT
    expect(cellWidthOf('\u200d')).toBe(0); // ZWJ
    expect(cellWidthOf('\u200c')).toBe(0); // ZWNJ
    expect(cellWidthOf('\ufe0f')).toBe(0); // VS16
    expect(cellWidthOf('\ufe0e')).toBe(0); // VS15
    expect(cellWidthOf('\u200b')).toBe(0); // ZERO WIDTH SPACE
  });
});

describe('splitCellGroups', () => {
  it('零宽字符并入前一基字符，宽度累加（与 xterm 把零宽字符并入前一格一致）', () => {
    // 带组合音标的 e：一个格，宽 1
    expect(splitCellGroups('e\u0301')).toEqual([{ text: 'e\u0301', width: 1 }]);
    // ZWJ emoji 序列：xterm 缓冲里是 3 个宽格（ZWJ 并入前格），共 6 格
    const family = '\u{1F468}\u200d\u{1F469}\u200d\u{1F467}';
    expect(splitCellGroups(family)).toEqual([
      { text: '\u{1F468}\u200d', width: 2 },
      { text: '\u{1F469}\u200d', width: 2 },
      { text: '\u{1F467}', width: 2 },
    ]);
    // VS16 只并入前格、不加宽：U+2764 属 EAW=N（1 格），xterm 的 wcwidth 同样给 1
    expect(splitCellGroups('\u2764\ufe0f')).toEqual([{ text: '\u2764\ufe0f', width: 1 }]);
  });

  it('纯 ASCII 与 CJK 逐字成组', () => {
    expect(splitCellGroups('a中')).toEqual([
      { text: 'a', width: 1 },
      { text: '中', width: 2 },
    ]);
  });
});

describe('wrapLines', () => {
  it('不超列时原样保留', () => {
    expect(wrapLines([[{ text: 'abc' }]], 10)).toEqual([[{ text: 'abc' }]]);
  });

  it('正好等于 cols 不折行', () => {
    expect(wrapLines([[{ text: 'abcdefghij' }]], 10)).toEqual([[{ text: 'abcdefghij' }]]);
  });

  it('超出一格时折成两行', () => {
    expect(wrapLines([[{ text: 'abcdefghijk' }]], 10)).toEqual([
      [{ text: 'abcdefghij' }],
      [{ text: 'k' }],
    ]);
  });

  it('宽字符不跨列边界切开，整体推到下一显示行', () => {
    expect(wrapLines([[{ text: '123456789中' }]], 10)).toEqual([
      [{ text: '123456789' }],
      [{ text: '中' }],
    ]);
  });

  it('折行后保留样式', () => {
    expect(wrapLines([[{ text: 'aaaaabbbbb', fg: 1 }]], 5)).toEqual([
      [{ text: 'aaaaa', fg: 1 }],
      [{ text: 'bbbbb', fg: 1 }],
    ]);
  });

  it('空行折行后仍是空行', () => {
    expect(wrapLines([[]], 5)).toEqual([[]]);
  });

  it('零宽码点不占列：带组合音标的文本不多算一格', () => {
    // 'e' + U+0301 = 1 格；旧实现（码点各计 1/1）会算成 2 格
    expect(wrapLines([[{ text: 'e\u0301' }]], 1)).toEqual([[{ text: 'e\u0301' }]]);
  });

  it('ZWJ emoji 序列按 xterm 格数折行（3 个宽格 = 6 列，不因 ZWJ 多算）', () => {
    const family = '\u{1F468}\u200d\u{1F469}\u200d\u{1F467}';
    // 8 列：'ab'(2) + family(6) 正好装下。旧口径把 ZWJ 各计 1 格（共 8 格）会误折行。
    expect(wrapLines([[{ text: `ab${family}` }]], 8)).toEqual([[{ text: `ab${family}` }]]);
    // 7 列：按 xterm 的格模型在格边界折（序列本身在缓冲里就是 3 个独立宽格）
    expect(wrapLines([[{ text: `ab${family}` }]], 7)).toEqual([
      [{ text: 'ab\u{1F468}\u200d\u{1F469}\u200d' }],
      [{ text: '\u{1F467}' }],
    ]);
  });
});
