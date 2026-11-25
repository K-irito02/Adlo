import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';
import { persist } from '../persisted/persist';
import { invokeIpc } from '../../../tauri-bridge/tauri-shared';
import { DEFAULT_CONFIGURED_PORTS } from './browserSliceShared';
import type {
  ShortcutSite,
  LocalPort,
  BackgroundMode,
  BackgroundFit,
  BackgroundConfig,
  BackgroundAdjust,
} from './browserTypes';

export type {
  ShortcutSite,
  LocalPort,
  BackgroundMode,
  BackgroundFit,
  BackgroundConfig,
  BackgroundAdjust,
};

export interface BrowserLandingSlice {
  browserShortcuts: ShortcutSite[];
  browserLocalPorts: LocalPort[];
  browserPortScanning: boolean;
  browserBgConfig: BackgroundConfig;
  browserConfiguredPorts: number[];

  browserAddShortcut: (site: Omit<ShortcutSite, 'id' | 'sortOrder' | 'createdAt'>) => string;
  browserRenameShortcut: (id: string, name: string) => void;
  browserDeleteShortcut: (id: string) => void;
  browserReorderShortcuts: (ids: string[]) => void;
  browserSetLocalPorts: (ports: LocalPort[]) => void;
  browserAddManualPort: (port: number, label?: string) => string;
  browserUpdateLocalPort: (
    id: string,
    patch: Partial<Pick<LocalPort, 'label' | 'sortOrder'>>,
  ) => void;
  browserDeleteLocalPort: (id: string) => void;
  browserReorderLocalPorts: (ids: string[]) => void;
  browserSetPortScanning: (scanning: boolean) => void;
  browserScanPorts: (ports: number[]) => Promise<void>;
  browserSetBgConfig: (config: BackgroundConfig) => void;
  browserResetBgConfig: () => void;
  browserSetConfiguredPorts: (ports: number[]) => void;
  browserAddConfiguredPort: (port: number) => void;
  browserRemoveConfiguredPort: (port: number) => void;
}

export const createBrowserLandingSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): BrowserLandingSlice => ({
  browserShortcuts: [],
  browserLocalPorts: [],
  browserPortScanning: false,
  browserBgConfig: { mode: 'default', fit: 'cover' },
  browserConfiguredPorts: DEFAULT_CONFIGURED_PORTS,

  browserAddShortcut: (site) => {
    let id = '';
    set((state) => {
      const maxSortOrder =
        state.browserShortcuts.length > 0
          ? Math.max(...state.browserShortcuts.map((s) => s.sortOrder))
          : 0;
      id = createUiId('shortcut');
      const newSite: ShortcutSite = {
        id,
        name: site.name,
        url: site.url,
        icon: site.icon,
        sortOrder: maxSortOrder + 1,
        createdAt: Date.now(),
      };
      const nextShortcuts = [...state.browserShortcuts, newSite];
      persist('adl:browser.shortcuts', nextShortcuts);
      return { browserShortcuts: nextShortcuts };
    });
    return id;
  },

  browserRenameShortcut: (id, name) =>
    set((state) => {
      const nextShortcuts = state.browserShortcuts.map((s) => (s.id === id ? { ...s, name } : s));
      persist('adl:browser.shortcuts', nextShortcuts);
      return { browserShortcuts: nextShortcuts };
    }),

  browserDeleteShortcut: (id) =>
    set((state) => {
      const nextShortcuts = state.browserShortcuts.filter((s) => s.id !== id);
      persist('adl:browser.shortcuts', nextShortcuts);
      return { browserShortcuts: nextShortcuts };
    }),

  browserReorderShortcuts: (ids) =>
    set((state) => {
      const idSet = new Set(ids);
      const remaining = state.browserShortcuts.filter((s) => idSet.has(s.id));
      const other = state.browserShortcuts.filter((s) => !idSet.has(s.id));
      const ordered = ids.map((id, idx) => {
        const site = remaining.find((s) => s.id === id)!;
        return { ...site, sortOrder: idx };
      });
      const nextShortcuts = [...ordered, ...other];
      persist('adl:browser.shortcuts', nextShortcuts);
      return { browserShortcuts: nextShortcuts };
    }),

  browserSetLocalPorts: (ports) =>
    set(() => {
      const withSort = ports.map((p, idx) => ({ ...p, sortOrder: p.sortOrder ?? idx }));
      persist('adl:browser.localPorts', withSort);
      return { browserLocalPorts: withSort };
    }),

  browserAddManualPort: (port, label) => {
    let id = '';
    set((state) => {
      const maxSortOrder =
        state.browserLocalPorts.length > 0
          ? Math.max(...state.browserLocalPorts.map((p) => p.sortOrder))
          : 0;
      id = createUiId('localport');
      const newPort: LocalPort = {
        id,
        host: 'localhost',
        port,
        label,
        isAutoDiscovered: false,
        healthy: true,
        lastAliveAt: Date.now(),
        sortOrder: maxSortOrder + 1,
      };
      const nextPorts = [...state.browserLocalPorts, newPort];
      persist('adl:browser.localPorts', nextPorts);
      return { browserLocalPorts: nextPorts };
    });
    return id;
  },

  browserDeleteLocalPort: (id) =>
    set((state) => {
      const nextPorts = state.browserLocalPorts.filter((p) => p.id !== id);
      persist('adl:browser.localPorts', nextPorts);
      return { browserLocalPorts: nextPorts };
    }),

  browserUpdateLocalPort: (id, patch) =>
    set((state) => {
      const nextPorts = state.browserLocalPorts.map((p) => (p.id === id ? { ...p, ...patch } : p));
      persist('adl:browser.localPorts', nextPorts);
      return { browserLocalPorts: nextPorts };
    }),

  browserReorderLocalPorts: (ids) =>
    set((state) => {
      const idSet = new Set(ids);
      const remaining = state.browserLocalPorts.filter((p) => idSet.has(p.id));
      const other = state.browserLocalPorts.filter((p) => !idSet.has(p.id));
      const ordered = ids.map((id, idx) => {
        const port = remaining.find((p) => p.id === id)!;
        return { ...port, sortOrder: idx };
      });
      const nextPorts = [...ordered, ...other];
      persist('adl:browser.localPorts', nextPorts);
      return { browserLocalPorts: nextPorts };
    }),

  browserSetPortScanning: (scanning) => set({ browserPortScanning: scanning }),

  browserScanPorts: async (ports) => {
    set({ browserPortScanning: true });
    try {
      const result = await invokeIpc<{ port: number; isOpen: boolean; responseTimeMs: number }[]>(
        'browser_scan_ports',
        { ports },
      );
      if (!result.ok) {
        return;
      }
      const openPorts = result.data.filter((p) => p.isOpen);
      const current = _get().browserLocalPorts;
      const existingKeys = new Set(current.map((p) => `${p.host}:${p.port}`));
      const maxSortOrder = current.length > 0 ? Math.max(...current.map((p) => p.sortOrder)) : 0;

      // Update health status for existing ports
      const openPortSet = new Set(openPorts.map((p) => p.port));
      const updatedCurrent = current.map((p) => {
        const isHealthy = openPortSet.has(p.port);
        return { ...p, healthy: isHealthy, lastAliveAt: isHealthy ? Date.now() : p.lastAliveAt };
      });

      // Add new ports that don't exist yet
      const newPorts: LocalPort[] = openPorts
        .filter((p) => !existingKeys.has(`localhost:${p.port}`))
        .map((p, idx) => ({
          id: createUiId('localport'),
          host: 'localhost',
          port: p.port,
          isAutoDiscovered: true,
          healthy: true,
          lastAliveAt: Date.now(),
          sortOrder: maxSortOrder + idx + 1,
        }));

      const next = [...updatedCurrent, ...newPorts];
      persist('adl:browser.localPorts', next);
      set({ browserLocalPorts: next });
    } catch {
      // scan failed — leave previous state
    } finally {
      set({ browserPortScanning: false });
    }
  },

  browserSetBgConfig: (config) => {
    persist('adl:browser.bgConfig', config);
    set({ browserBgConfig: config });
  },

  browserResetBgConfig: () => {
    const defaultConfig: BackgroundConfig = { mode: 'default', fit: 'cover' };
    persist('adl:browser.bgConfig', defaultConfig);
    set({ browserBgConfig: defaultConfig });
  },

  browserSetConfiguredPorts: (ports) => {
    const unique = [...new Set(ports.filter((p) => Number.isFinite(p) && p > 0 && p <= 65535))];
    persist('adl:browser.configuredPorts', unique);
    set({ browserConfiguredPorts: unique });
  },

  browserAddConfiguredPort: (port) => {
    set((state) => {
      if (
        !Number.isFinite(port) ||
        port <= 0 ||
        port > 65535 ||
        state.browserConfiguredPorts.includes(port)
      ) {
        return state;
      }
      const next = [...state.browserConfiguredPorts, port];
      persist('adl:browser.configuredPorts', next);
      return { browserConfiguredPorts: next };
    });
  },

  browserRemoveConfiguredPort: (port) => {
    set((state) => {
      const next = state.browserConfiguredPorts.filter((p) => p !== port);
      persist('adl:browser.configuredPorts', next);
      return { browserConfiguredPorts: next };
    });
  },
});
