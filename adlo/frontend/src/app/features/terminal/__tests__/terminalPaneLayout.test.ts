import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import {
  autoRectForIndex,
  computeGrid,
  defaultPaneLayout,
  equalFractions,
  normalizePaneLayout,
  normalizePaneLayoutMap,
  resizeFractions,
  TERMINAL_PANE_LAYOUT_KEY,
  terminalPaneLayoutStore,
} from '../terminalPaneLayout';

describe('terminal pane layout math', () => {
  it('computeGrid balances panes', () => {
    expect(computeGrid(1)).toEqual({ cols: 1, rows: 1 });
    expect(computeGrid(2)).toEqual({ cols: 2, rows: 1 });
    expect(computeGrid(3)).toEqual({ cols: 2, rows: 2 });
    expect(computeGrid(4)).toEqual({ cols: 2, rows: 2 });
    expect(computeGrid(5)).toEqual({ cols: 3, rows: 2 });
  });

  it('equalFractions sums to 1', () => {
    expect(equalFractions(4)).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it('equalFractions is empty for a non-positive count', () => {
    expect(equalFractions(0)).toEqual([]);
  });

  it('normalizePaneLayout repairs fraction length and mode', () => {
    const l = normalizePaneLayout({ mode: 'bogus', colFractions: [1], rowFractions: [] }, 4);
    expect(l.mode).toBe('equal');
    expect(l.colFractions).toHaveLength(2);
    expect(l.rowFractions).toHaveLength(2);
  });

  it('normalizePaneLayout keeps a valid free layout and drops bad rects', () => {
    const l = normalizePaneLayout(
      {
        mode: 'free',
        colFractions: [0.5, 0.5],
        rowFractions: [0.5, 0.5],
        rects: {
          valid: { x: 0, y: 0.25, w: 0.5, h: 0.5 },
          outOfRange: { x: 2, y: 0, w: 0.5, h: 0.5 },
          malformed: { x: 0, y: 0 },
        },
      },
      4,
    );
    expect(l.mode).toBe('free');
    expect(l.rects).toEqual({ valid: { x: 0, y: 0.25, w: 0.5, h: 0.5 } });
  });

  it('resizeFractions preserves total and clamps to minPx', () => {
    const out = resizeFractions([0.5, 0.5], 0, 0.1, 50, 400);
    expect(out[0] + out[1]).toBeCloseTo(1);
    expect(out[0]).toBeGreaterThan(0.5);
    const clamped = resizeFractions([0.2, 0.8], 0, -0.5, 100, 400);
    expect(clamped[0] * 400).toBeGreaterThanOrEqual(100 - 0.001);
  });

  it('resizeFractions splits evenly when the total is below twice the minimum (L8)', () => {
    // minPx=100 / totalPx=100 → minFraction=1；两轨道 sum=1 < 2 → 各取一半。
    const out = resizeFractions([0.5, 0.5], 0, 0.3, 100, 100);
    expect(out[0]).toBeCloseTo(0.5);
    expect(out[1]).toBeCloseTo(0.5);
  });

  it('autoRectForIndex tiles the grid', () => {
    expect(autoRectForIndex(0, 4)).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
    expect(autoRectForIndex(3, 4)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });

  it('defaultPaneLayout derives fractions from the grid', () => {
    expect(defaultPaneLayout(5)).toEqual({
      mode: 'equal',
      colFractions: [1 / 3, 1 / 3, 1 / 3],
      rowFractions: [0.5, 0.5],
      rects: {},
    });
  });
});

describe('normalizePaneLayoutMap shape validation', () => {
  it('returns undefined for a non-object payload', () => {
    expect(normalizePaneLayoutMap('nope')).toBeUndefined();
    expect(normalizePaneLayoutMap(null)).toBeUndefined();
    expect(normalizePaneLayoutMap([])).toBeUndefined();
  });

  it('keeps fraction length untouched and repairs mode / rects', () => {
    const map = normalizePaneLayoutMap({
      tabA: {
        mode: 'free',
        colFractions: [0.3, 0.7],
        rowFractions: [1],
        rects: { p1: { x: 0, y: 0, w: 1, h: 1 } },
      },
    });
    expect(map).toEqual({
      tabA: {
        mode: 'free',
        colFractions: [0.3, 0.7],
        rowFractions: [1],
        rects: { p1: { x: 0, y: 0, w: 1, h: 1 } },
      },
    });
  });

  it('drops entries whose fractions are not non-negative finite arrays', () => {
    const map = normalizePaneLayoutMap({
      good: { mode: 'equal', colFractions: [0.5, 0.5], rowFractions: [1], rects: {} },
      badFractions: {
        mode: 'equal',
        colFractions: [-1, 1],
        rowFractions: [1],
        rects: {},
      },
      badShape: 'not-a-layout',
    });
    expect(Object.keys(map ?? {})).toEqual(['good']);
  });
});

describe('terminalPaneLayoutStore per-tab persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    terminalPaneLayoutStore.apply({});
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('saves and loads a single tab layout and persists through the shared channel', () => {
    const layout = defaultPaneLayout(2);
    terminalPaneLayoutStore.saveForTab('terminal-1', layout);
    expect(terminalPaneLayoutStore.loadForTab('terminal-1')).toEqual(layout);
    expect(terminalPaneLayoutStore.loadForTab('terminal-missing')).toBeUndefined();
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem(TERMINAL_PANE_LAYOUT_KEY) ?? 'null')).toEqual({
      'terminal-1': layout,
    });
  });

  it('loadForTab returns undefined without a tab id', () => {
    expect(terminalPaneLayoutStore.loadForTab(undefined)).toBeUndefined();
  });

  it('saveAll / loadAll round-trips the whole map', () => {
    const map = { 'terminal-1': defaultPaneLayout(1), 'terminal-2': defaultPaneLayout(4) };
    terminalPaneLayoutStore.saveAll(map);
    expect(terminalPaneLayoutStore.loadAll()).toEqual(map);
  });
});
