import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSystemMonitorSlice, SYSMON_COLLAPSED_KEY } from '../systemMonitorSlice';
import type { SystemMonitorSlice } from '../systemMonitorSlice';

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
  // 每次经 get() 读新鲜状态：toggle 经 set() 更新 backing state，快照对象本身不会变。
  return { current: () => get() as unknown as SystemMonitorSlice };
}

describe('systemMonitorSlice collapsed persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults to collapsed when nothing is stored', () => {
    expect(createSlice().current().sysmonCollapsed).toBe(true);
  });

  it('restores expanded when flag is 0', () => {
    window.localStorage.setItem(SYSMON_COLLAPSED_KEY, '0');
    expect(createSlice().current().sysmonCollapsed).toBe(false);
  });

  it('restores collapsed when flag is 1', () => {
    window.localStorage.setItem(SYSMON_COLLAPSED_KEY, '1');
    expect(createSlice().current().sysmonCollapsed).toBe(true);
  });

  it('falls back to collapsed on dirty stored value', () => {
    window.localStorage.setItem(SYSMON_COLLAPSED_KEY, 'true');
    expect(createSlice().current().sysmonCollapsed).toBe(true);
  });

  it('toggle flips state and writes the flag synchronously', () => {
    const { current } = createSlice();
    expect(current().sysmonCollapsed).toBe(true);
    current().toggleSysmonCollapsed();
    expect(current().sysmonCollapsed).toBe(false);
    expect(window.localStorage.getItem(SYSMON_COLLAPSED_KEY)).toBe('0');
    current().toggleSysmonCollapsed();
    expect(current().sysmonCollapsed).toBe(true);
    expect(window.localStorage.getItem(SYSMON_COLLAPSED_KEY)).toBe('1');
  });
});
