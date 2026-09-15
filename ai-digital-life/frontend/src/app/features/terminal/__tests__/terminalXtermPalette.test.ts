import { describe, expect, it } from 'vitest';
import { HISTORY_ANSI_DEFAULTS } from '../terminalXtermPool';

// xterm 默认 16 色（Tango）：逐字抄自所装 @xterm/xterm 的 DEFAULT_ANSI_COLORS。
// 历史区与实时终端（theme 未配 ansi 色 → xterm 回退同一套）必须同表，
// 否则目录蓝（#3465a4 vs #0000ee）这类颜色两边对不上。此测试锁死该表，防回退。
describe('HISTORY_ANSI_DEFAULTS 与 xterm 默认一致', () => {
  it('16 个基础色为 Tango 值', () => {
    expect(HISTORY_ANSI_DEFAULTS).toEqual([
      '#2e3436',
      '#cc0000',
      '#4e9a06',
      '#c4a000',
      '#3465a4',
      '#75507b',
      '#06989a',
      '#d3d7cf',
      '#555753',
      '#ef2929',
      '#8ae234',
      '#fce94f',
      '#729fcf',
      '#ad7fa8',
      '#34e2e2',
      '#eeeeec',
    ]);
  });
});
