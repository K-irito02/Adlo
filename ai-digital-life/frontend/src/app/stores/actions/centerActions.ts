import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';

export function createCenterActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  const clampPanelActiveTab = () => {
    const s = get();
    const panelBrowserTabs = s.browserTabs.filter((t) => t.location !== 'center');
    if (!panelBrowserTabs.some((t) => t.id === s.browserActiveTabId)) {
      set({ browserActiveTabId: panelBrowserTabs[panelBrowserTabs.length - 1]?.id ?? '' });
    }
    const panelTerminalTabs = s.terminalTabs.filter((t) => t.location !== 'center');
    if (!panelTerminalTabs.some((t) => t.id === s.terminalActiveTabId)) {
      set({ terminalActiveTabId: panelTerminalTabs[panelTerminalTabs.length - 1]?.id ?? '' });
    }
  };

  return {
    clampPanelActiveTab,

    centerShowBrowserTab: (browserTabId: string) => {
      if (!get().browserTabsById[browserTabId]) {
        return;
      }
      get().browserSetLocation(browserTabId, 'center');
      get().centerAddTab('browser', browserTabId);
      clampPanelActiveTab();
    },

    centerShowTerminalTab: (terminalTabId: string) => {
      if (!get().terminalTabsById[terminalTabId]) {
        return;
      }
      get().terminalSetLocation(terminalTabId, 'center');
      get().centerAddTab('terminal', terminalTabId);
      clampPanelActiveTab();
    },

    centerReturnToPanel: (centerTabId: string) => {
      const tab = get().centerTabs.find((t) => t.id === centerTabId);
      if (!tab) {
        return;
      }
      if (tab.kind === 'browser' && tab.refId) {
        if (!get().browserTabsById[tab.refId]) {
          // 底层标签已不存在：跳过 setLocation+select，只摘除中心标签并重夹面板活动标签。
          get().centerRemoveTab(centerTabId);
          clampPanelActiveTab();
          return;
        }
        get().browserSetLocation(tab.refId, 'panel');
        get().browserSelectTab(tab.refId);
      } else if (tab.kind === 'terminal' && tab.refId) {
        if (!get().terminalTabsById[tab.refId]) {
          get().centerRemoveTab(centerTabId);
          clampPanelActiveTab();
          return;
        }
        get().terminalSetLocation(tab.refId, 'panel');
        get().terminalSelectTab(tab.refId);
      }
      get().centerRemoveTab(centerTabId);
    },
  };
}
