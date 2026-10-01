import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';
import { persist } from '../persisted/persist';
import type { CenterTabKind, CenterTabState } from './centerTabsTypes';

export type { CenterTabKind, CenterTabState } from './centerTabsTypes';

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
      const filtered = state.centerTabs.filter((t) => t.id !== centerTabId);
      // 不变量（spec §5）：关闭最后一个中心标签后自动新建一个 launcher，并激活它。
      // 在同一 set 更新内完成，保证 centerTabs 永不为空且 active 原子地指向新标签。
      const launcher: CenterTabState = {
        id: createUiId('center'),
        kind: 'launcher',
        refId: null,
        createdAt: Date.now(),
      };
      const next = filtered.length === 0 ? [launcher] : filtered;
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
