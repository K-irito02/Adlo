// src/app/features/terminal/__tests__/historyModel.style.test.ts
import { describe, expect, it } from 'vitest';
import { resolveRunStyle, type HistoryPalette } from '../historyModel';

const palette: HistoryPalette = {
  foreground: '#ffffff',
  background: '#000000',
  ansi: [
    '#000000', '#cd0000', '#00cd00', '#cdcd00', '#0000ee', '#cd00cd', '#00cdcd', '#e5e5e5',
    '#7f7f7f', '#ff0000', '#00ff00', '#ffff00', '#5c5cff', '#ff00ff', '#00ffff', '#ffffff',
  ],
};

describe('resolveRunStyle', () => {
  it('缺省前景用主题前景，不设背景', () => {
    expect(resolveRunStyle({ text: 'a' }, palette)).toEqual({ color: '#ffffff' });
  });

  it('调色板下标 0–15 取 ansi 表', () => {
    expect(resolveRunStyle({ text: 'a', fg: 2 }, palette).color).toBe('#00cd00');
  });

  it('调色板下标 16–255 按 256 色立方换算', () => {
    expect(resolveRunStyle({ text: 'a', fg: 196 }, palette).color).toBe('rgb(255, 0, 0)');
  });

  it('调色板下标 232–255 为灰阶', () => {
    expect(resolveRunStyle({ text: 'a', fg: 232 }, palette).color).toBe('rgb(8, 8, 8)');
  });

  it('直接色原样使用（主题切换时历史仍会正确重着色）', () => {
    expect(resolveRunStyle({ text: 'a', fg: '#123456' }, palette).color).toBe('#123456');
  });

  it('bold / italic / underline / dim 映射为 CSS', () => {
    expect(resolveRunStyle({ text: 'a', bold: true }, palette).fontWeight).toBe(700);
    expect(resolveRunStyle({ text: 'a', italic: true }, palette).fontStyle).toBe('italic');
    expect(resolveRunStyle({ text: 'a', underline: true }, palette).textDecoration).toBe('underline');
    expect(resolveRunStyle({ text: 'a', dim: true }, palette).opacity).toBe(0.6);
  });

  it('inverse 交换前景与背景', () => {
    const style = resolveRunStyle({ text: 'a', fg: 2, bg: 1, inverse: true }, palette);
    expect(style.color).toBe('#cd0000');
    expect(style.backgroundColor).toBe('#00cd00');
  });

  it('非 inverse 且带背景时同时输出前景与背景', () => {
    const style = resolveRunStyle({ text: 'a', bg: 1 }, palette);
    expect(style.color).toBe('#ffffff');
    expect(style.backgroundColor).toBe('#cd0000');
  });
});
