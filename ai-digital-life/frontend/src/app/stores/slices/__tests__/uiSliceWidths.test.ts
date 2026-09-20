import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createUIWidthSlice } from '../uiSliceWidths';
import type { UIWidthSlice } from '../uiSliceWidths';
import { persistField } from '@stores/persisted/apply';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import {
  DEFAULT_LEFT_PANEL_WIDTH,
  LEFT_PANEL_WIDTH_MIN,
  LEFT_PANEL_WIDTH_MAX,
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
    resetHydrationForTest();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults to DEFAULT_LEFT_PANEL_WIDTH before hydration', () => {
    expect(createSlice().current().leftbarWidth).toBe(DEFAULT_LEFT_PANEL_WIDTH);
  });

  it('restores a stored width within bounds via registry hydration', () => {
    persistField('adl:ui.leftPanelWidth', 240);
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.leftbarWidth).toBe(240);
  });

  it('clamps an out-of-range persisted width on hydration', () => {
    localStorage.setItem('adl:ui.leftPanelWidth', '9999');
    expect(hydrateAll().patch.leftbarWidth).toBe(LEFT_PANEL_WIDTH_MAX);
    resetHydrationForTest();
    localStorage.setItem('adl:ui.leftPanelWidth', '1');
    expect(hydrateAll().patch.leftbarWidth).toBe(LEFT_PANEL_WIDTH_MIN);
  });

  it('setLeftbarWidth writes the value through to the registry key', () => {
    const { current } = createSlice();
    current().setLeftbarWidth(200);
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.leftbarWidth).toBe(200);
  });
});
