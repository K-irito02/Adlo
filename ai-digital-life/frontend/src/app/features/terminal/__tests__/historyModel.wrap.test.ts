import { describe, expect, it } from 'vitest';
import { cellWidthOf, wrapLines } from '../historyModel';

describe('cellWidthOf', () => {
  it('ASCII 计 1 格，CJK 与全角计 2 格', () => {
    expect(cellWidthOf('a')).toBe(1);
    expect(cellWidthOf('中')).toBe(2);
    expect(cellWidthOf('，')).toBe(2);
    expect(cellWidthOf('Ａ')).toBe(2);
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
});
