// src/app/features/terminal/__tests__/historyModel.style.test.ts
import { describe, expect, it } from 'vitest';
import { resolveRunStyle, type HistoryPalette } from '../historyModel';
import { HISTORY_ANSI_DEFAULTS } from '../terminalXtermPool';

// 用生产调色板（xterm 默认 Tango 表）作夹具，避免断言值被误读为生产色
const palette: HistoryPalette = {
  foreground: '#ffffff',
  background: '#000000',
  ansi: HISTORY_ANSI_DEFAULTS,
};

describe('resolveRunStyle', () => {
  it('缺省前景用主题前景，不设背景', () => {
    expect(resolveRunStyle({ text: 'a' }, palette)).toEqual({ color: '#ffffff' });
  });

  it('调色板下标 0–15 取 ansi 表', () => {
    expect(resolveRunStyle({ text: 'a', fg: 2 }, palette).color).toBe('#4e9a06');
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

  it('粗体的 0–7 号标准色按 8–15 号亮色渲染（xterm drawBoldTextInBrightColors 默认开）', () => {
    // 蓝目录是典型：实时终端粗体蓝显示亮蓝，历史必须同口径
    expect(resolveRunStyle({ text: 'd', fg: 4, bold: true }, palette).color).toBe('#729fcf');
    expect(resolveRunStyle({ text: 'd', fg: 4 }, palette).color).toBe('#3465a4');
  });

  it('粗体不影响 8–15 号亮色与直接色', () => {
    expect(resolveRunStyle({ text: 'd', fg: 12, bold: true }, palette).color).toBe('#729fcf');
    expect(resolveRunStyle({ text: 'd', fg: '#123456', bold: true }, palette).color).toBe(
      '#123456',
    );
  });

  it('粗体 + inverse：提亮作用在交换后的前景（xterm 同序），背景不提亮', () => {
    // xterm 渲染器先交换 fg/bg，再对交换后的前景做粗体提亮：
    // {fg:4, bg:1, inverse, bold} → 前景取 bg=1 提亮为 9，背景取 fg=4 原值
    const style = resolveRunStyle({ text: 'a', fg: 4, bg: 1, inverse: true, bold: true }, palette);
    expect(style.color).toBe('#ef2929');
    expect(style.backgroundColor).toBe('#3465a4');
  });

  it('number 恒按调色板下标解析（含边界 255 与 0）', () => {
    // 真彩色在提取期已定型为 hex 字符串（见 extract 测试），number 只可能是下标；
    // 255 = 灰阶末位、0 = ansi[0]，不得被误判成真彩色打包值
    expect(resolveRunStyle({ text: 'a', fg: 255 }, palette).color).toBe('rgb(238, 238, 238)');
    expect(resolveRunStyle({ text: 'a', fg: 0 }, palette).color).toBe('#2e3436');
  });

  it('提取期定型的真彩色 hex 字符串原样使用（fg 与 bg）', () => {
    expect(resolveRunStyle({ text: 'a', fg: '#0000ff' }, palette).color).toBe('#0000ff');
    expect(resolveRunStyle({ text: 'a', bg: '#1e90ff' }, palette).backgroundColor).toBe('#1e90ff');
  });

  it('inverse 交换前景与背景', () => {
    const style = resolveRunStyle({ text: 'a', fg: 2, bg: 1, inverse: true }, palette);
    expect(style.color).toBe('#cc0000');
    expect(style.backgroundColor).toBe('#4e9a06');
  });

  it('非 inverse 且带背景时同时输出前景与背景', () => {
    const style = resolveRunStyle({ text: 'a', bg: 1 }, palette);
    expect(style.color).toBe('#ffffff');
    expect(style.backgroundColor).toBe('#cc0000');
  });
});
