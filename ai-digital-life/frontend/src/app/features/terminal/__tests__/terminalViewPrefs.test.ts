import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TERMINAL_VIEW_PREFS,
  HISTORY_RATIO_MAX,
  HISTORY_RATIO_MIN,
  normalizeTerminalViewPrefs,
  ratioFromPointer,
} from '../terminalViewPrefs';

describe('normalizeTerminalViewPrefs', () => {
  it('缺失或非法数据回落到默认值', () => {
    expect(normalizeTerminalViewPrefs(null)).toEqual(DEFAULT_TERMINAL_VIEW_PREFS);
    expect(normalizeTerminalViewPrefs({ mode: 'nope', historyRatio: 'x' })).toEqual(
      DEFAULT_TERMINAL_VIEW_PREFS,
    );
  });

  it('保留合法值并夹紧比例', () => {
    expect(
      normalizeTerminalViewPrefs({ mode: 'dual', historyFirst: false, historyRatio: 0.5 }),
    ).toEqual({ mode: 'dual', historyFirst: false, historyRatio: 0.5 });
    expect(normalizeTerminalViewPrefs({ historyRatio: 9 }).historyRatio).toBe(HISTORY_RATIO_MAX);
    expect(normalizeTerminalViewPrefs({ historyRatio: -3 }).historyRatio).toBe(HISTORY_RATIO_MIN);
  });

  it('historyFirst 仅在显式 false 时才为 false', () => {
    expect(normalizeTerminalViewPrefs({ historyFirst: true }).historyFirst).toBe(true);
    expect(normalizeTerminalViewPrefs({ historyFirst: false }).historyFirst).toBe(false);
    expect(normalizeTerminalViewPrefs({}).historyFirst).toBe(true);
  });
});

describe('ratioFromPointer', () => {
  it('历史区在首位时，占比等于指针在主轴上的位置占比', () => {
    expect(ratioFromPointer({ pointerMain: 180, mainSize: 600, historyFirst: true })).toBeCloseTo(
      0.3,
    );
  });

  it('历史区在末位时取补集，拖拽手感一致', () => {
    expect(ratioFromPointer({ pointerMain: 420, mainSize: 600, historyFirst: false })).toBeCloseTo(
      0.3,
    );
  });

  it('夹紧到上下限，避免任一侧被拖没', () => {
    expect(ratioFromPointer({ pointerMain: 6, mainSize: 600, historyFirst: true })).toBe(
      HISTORY_RATIO_MIN,
    );
    expect(ratioFromPointer({ pointerMain: 594, mainSize: 600, historyFirst: true })).toBe(
      HISTORY_RATIO_MAX,
    );
  });

  it('容器尺寸未知时回到默认占比', () => {
    expect(ratioFromPointer({ pointerMain: 100, mainSize: 0, historyFirst: true })).toBe(
      DEFAULT_TERMINAL_VIEW_PREFS.historyRatio,
    );
  });

  it('面板很矮时用像素下限包络兜底，不产生非法区间', () => {
    const ratio = ratioFromPointer({ pointerMain: 75, mainSize: 150, historyFirst: true });
    expect(ratio).toBeGreaterThanOrEqual(HISTORY_RATIO_MIN);
    expect(ratio).toBeLessThanOrEqual(HISTORY_RATIO_MAX);
  });
});

describe('ratioFromPointer 边界补充', () => {
  it('historyFirst=false 时同样被夹紧到上下限', () => {
    expect(ratioFromPointer({ pointerMain: 594, mainSize: 600, historyFirst: false })).toBe(
      HISTORY_RATIO_MIN,
    );
    expect(ratioFromPointer({ pointerMain: 6, mainSize: 600, historyFirst: false })).toBe(
      HISTORY_RATIO_MAX,
    );
  });

  it('mainSize 低于两个像素下限之和时落入包络区间（比例仍合法）', () => {
    for (const mainSize of [150, 130, 100]) {
      const ratio = ratioFromPointer({ pointerMain: mainSize / 2, mainSize, historyFirst: true });
      expect(ratio).toBeGreaterThanOrEqual(HISTORY_RATIO_MIN);
      expect(ratio).toBeLessThanOrEqual(HISTORY_RATIO_MAX);
      expect(Number.isFinite(ratio)).toBe(true);
    }
  });
});
