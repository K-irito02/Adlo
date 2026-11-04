import { describe, it, expect, beforeEach } from 'vitest';
import { createUISlice } from '../uiSlice';
import type { UISlice } from '../uiSliceTypes';
import { flushCrossSliceWrites } from '@stores/storageHelpers';

// 单一归属（T19）：navigatorCollapsedByTool 的折叠 action 只由 uiSlice 提供，
// browser/terminal slice 的复写已删除。本文件承接被删用例的覆盖
// （browserSlice.test.ts 的 browser 槽位用例、terminalSlice.test.ts 的 terminal 槽位用例）。
function createMockStore() {
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
  state = { ...createUISlice(set as never, get as never) };
  return { get };
}

describe('uiSlice navigator collapsed (single owner)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('toggleNavigator toggles the browser slot from false to true and back', () => {
    const { get } = createMockStore();
    const api = get() as unknown as UISlice;
    api.toggleNavigator('browser');
    expect(
      (get() as Record<string, Record<string, boolean>>).navigatorCollapsedByTool.browser,
    ).toBe(true);
    api.toggleNavigator('browser');
    expect(
      (get() as Record<string, Record<string, boolean>>).navigatorCollapsedByTool.browser,
    ).toBe(false);
  });

  it('setNavigatorCollapsed sets the browser slot', () => {
    const { get } = createMockStore();
    const api = get() as unknown as UISlice;
    api.setNavigatorCollapsed('browser', true);
    expect(
      (get() as Record<string, Record<string, boolean>>).navigatorCollapsedByTool.browser,
    ).toBe(true);
    api.setNavigatorCollapsed('browser', false);
    expect(
      (get() as Record<string, Record<string, boolean>>).navigatorCollapsedByTool.browser,
    ).toBe(false);
  });

  it('toggleNavigator toggles the terminal slot without touching the browser slot', () => {
    const { get } = createMockStore();
    const api = get() as unknown as UISlice;
    api.toggleNavigator('terminal');
    const collapsed = (get() as Record<string, Record<string, boolean>>).navigatorCollapsedByTool;
    expect(collapsed.terminal).toBe(true);
    expect(collapsed.browser ?? false).toBe(false);
    api.toggleNavigator('terminal');
    expect(
      (get() as Record<string, Record<string, boolean>>).navigatorCollapsedByTool.terminal,
    ).toBe(false);
  });

  it('setNavigatorCollapsed writes through to the registry key', () => {
    const { get } = createMockStore();
    (get() as unknown as UISlice).setNavigatorCollapsed('terminal', true);
    flushCrossSliceWrites();
    expect(window.localStorage.getItem('adl:ui.navigatorCollapsed')).toBe(
      JSON.stringify({ ...(get() as unknown as UISlice).navigatorCollapsedByTool }),
    );
  });
});
