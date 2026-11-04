import { describe, it, expect, beforeEach } from 'vitest';
import { createSystemMonitorSlice } from '../systemMonitorSlice';
import type { SystemMonitorSlice } from '../systemMonitorSlice';
import { persistField } from '../../persisted/apply';
import { hydrateAll, resetHydrationForTest } from '../../persisted/hydrate';
import { flushCrossSliceWrites } from '../../storageHelpers';

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
  const slice = createSystemMonitorSlice(set as never, get as never);
  state = { ...slice };
  // 每次经 get() 读最新状态：toggle 经 set() 回写 backing state，与生产行为一致。
  return { current: () => get() as unknown as SystemMonitorSlice };
}

describe('systemMonitorSlice collapsed persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetHydrationForTest();
  });

  it('defaults to collapsed when nothing is stored (registry fallback true)', () => {
    expect(createSlice().current().sysmonCollapsed).toBe(true);
    expect(hydrateAll().patch.sysmonCollapsed).toBe(true);
  });

  it('restores expanded from the registry key', () => {
    persistField('adl:ui.sysmonCollapsed', false);
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.sysmonCollapsed).toBe(false);
  });

  it('falls back to collapsed on dirty stored value', () => {
    window.localStorage.setItem('adl:ui.sysmonCollapsed', '"yes"');
    const result = hydrateAll();
    expect(result.patch.sysmonCollapsed).toBe(true);
    expect(result.dirtyKeys).toContain('adl:ui.sysmonCollapsed');
  });

  it('toggle flips state and persists through the shared channel', () => {
    const { current } = createSlice();
    expect(current().sysmonCollapsed).toBe(true);
    current().toggleSysmonCollapsed();
    expect(current().sysmonCollapsed).toBe(false);
    flushCrossSliceWrites();
    expect(window.localStorage.getItem('adl:ui.sysmonCollapsed')).toBe('false');
    resetHydrationForTest();
    expect(hydrateAll().patch.sysmonCollapsed).toBe(false);
  });
});
