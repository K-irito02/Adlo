import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createUIWidthSlice } from '../uiSliceWidths';
import type { UIWidthSlice } from '../uiSliceWidths';
import {
  LEFT_PANEL_WIDTH_KEY,
  LEFT_PANEL_WIDTH_MIN,
  LEFT_PANEL_WIDTH_MAX,
  DEFAULT_LEFT_PANEL_WIDTH,
} from '../uiSliceTypes';

function createSlice() {
  let state: Record<string, unknown> = {};
  const get = () => state;
  const set = (partial: unknown) => {
    if (typeof partial === 'function') {
      const next = (partial as (s: Record<string, unknown>) => Record<string, unknown>)(state);
      state = { ...state, ...next };
    } else {
      state = { ...state, ...(partial as Record<string, unknown>) };
    }
  };
  const slice = createUIWidthSlice(set as never, get as never);
  state = { ...slice };
  // 每次经 get() 读新鲜状态：setter 经 set() 更新 backing state，快照对象本身不会变。
  return { current: () => get() as unknown as UIWidthSlice };
}

describe('uiSliceWidths leftbarWidth persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults to DEFAULT_LEFT_PANEL_WIDTH when nothing is stored', () => {
    expect(createSlice().current().leftbarWidth).toBe(DEFAULT_LEFT_PANEL_WIDTH);
  });

  it('restores a stored width within bounds', () => {
    window.localStorage.setItem(LEFT_PANEL_WIDTH_KEY, '240');
    expect(createSlice().current().leftbarWidth).toBe(240);
  });

  it('clamps an out-of-range stored width', () => {
    window.localStorage.setItem(LEFT_PANEL_WIDTH_KEY, '9999');
    expect(createSlice().current().leftbarWidth).toBe(LEFT_PANEL_WIDTH_MAX);
    window.localStorage.setItem(LEFT_PANEL_WIDTH_KEY, '1');
    expect(createSlice().current().leftbarWidth).toBe(LEFT_PANEL_WIDTH_MIN);
  });

  it('setLeftbarWidth clamps and writes through to localStorage', () => {
    const { current } = createSlice();
    current().setLeftbarWidth(300);
    expect(current().leftbarWidth).toBe(LEFT_PANEL_WIDTH_MAX);
    expect(window.localStorage.getItem(LEFT_PANEL_WIDTH_KEY)).toBe(String(LEFT_PANEL_WIDTH_MAX));
    current().setLeftbarWidth(200);
    expect(current().leftbarWidth).toBe(200);
    expect(window.localStorage.getItem(LEFT_PANEL_WIDTH_KEY)).toBe('200');
  });
});
