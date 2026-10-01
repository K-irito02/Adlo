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
      get().browserSetLocation(browserTabId, 'center');
      get().centerAddTab('browser', browserTabId);
      clampPanelActiveTab();
    },

    centerShowTerminalTab: (terminalTabId: string) => {
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
        get().browserSetLocation(tab.refId, 'panel');
        get().browserSelectTab(tab.refId);
      } else if (tab.kind === 'terminal' && tab.refId) {
        get().terminalSetLocation(tab.refId, 'panel');
        get().terminalSelectTab(tab.refId);
      }
      get().centerRemoveTab(centerTabId);
    },
  };
}
