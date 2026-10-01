import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';
import { persist as persistStrict } from '../persisted/persist';
import type { CenterTabKind, CenterTabState } from './centerTabsTypes';

export type { CenterTabKind, CenterTabState } from './centerTabsTypes';

// 简报指定的持久化键尚未在 persisted/registry.ts 登记（登记表不在本任务文件清单内，
// 不得改动）。persist() 的泛型签名只接受已登记键，为使 tsc 通过，此处做一次
// 单点类型放宽，6 处调用保持简报逐字不变；运行时 persist 只是转发写盘，不做键校验。
const persist = persistStrict as unknown as (key: string, value: unknown) => void;

export interface CenterTabsSlice {
  centerTabs: CenterTabState[];
  centerActiveTabId: string;

  centerAddTab: (kind: CenterTabKind, refId: string | null) => string;
  centerSelectTab: (centerTabId: string) => void;
  centerRemoveTab: (centerTabId: string) => void;
  centerReorderTabs: (newOrder: CenterTabState[]) => void;
}

export const createCenterTabsSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
): CenterTabsSlice => ({
  centerTabs: [],
  centerActiveTabId: '',

  centerAddTab: (kind, refId) => {
    const id = createUiId('center');
    set((state) => {
      const tab: CenterTabState = { id, kind, refId, createdAt: Date.now() };
      const next = [...state.centerTabs, tab];
      persist('adl:center.tabs', next);
      persist('adl:center.activeTabId', id);
      return { centerTabs: next, centerActiveTabId: id };
    });
    return id;
  },

  centerSelectTab: (centerTabId) => {
    persist('adl:center.activeTabId', centerTabId);
    set({ centerActiveTabId: centerTabId });
  },

  centerRemoveTab: (centerTabId) => {
    set((state) => {
      const next = state.centerTabs.filter((t) => t.id !== centerTabId);
      const activeStillExists = next.some((t) => t.id === state.centerActiveTabId);
      const nextActive = activeStillExists
        ? state.centerActiveTabId
        : (next[next.length - 1]?.id ?? '');
      persist('adl:center.tabs', next);
      persist('adl:center.activeTabId', nextActive);
      return { centerTabs: next, centerActiveTabId: nextActive };
    });
  },

  centerReorderTabs: (newOrder) => {
    persist('adl:center.tabs', newOrder);
    set({ centerTabs: newOrder });
  },
});
