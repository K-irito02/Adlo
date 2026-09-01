import type { StoreState } from '../StoreState';
import { createUiId, makePersistedWriter, readJson } from '../shared';
import { invokeIpc } from '../../../tauri-bridge/tauri-shared';
import {
  BROWSER_SHORTCUTS_KEY,
  BROWSER_LOCAL_PORTS_KEY,
  BROWSER_BG_CONFIG_KEY,
  BROWSER_CONFIGURED_PORTS_KEY,
  DEFAULT_CONFIGURED_PORTS,
} from './browserSliceShared';
import type {
  ShortcutSite,
  LocalPort,
  BackgroundMode,
  BackgroundFit,
  BackgroundConfig,
} from './browserTypes';

export type { ShortcutSite, LocalPort, BackgroundMode, BackgroundFit, BackgroundConfig };

const writeShortcuts = makePersistedWriter(BROWSER_SHORTCUTS_KEY);
const writeLocalPorts = makePersistedWriter(BROWSER_LOCAL_PORTS_KEY);
const writeBgConfig = makePersistedWriter(BROWSER_BG_CONFIG_KEY);
const writeConfiguredPorts = makePersistedWriter(BROWSER_CONFIGURED_PORTS_KEY);

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
  browserConfiguredPorts: readJson<number[]>(
    BROWSER_CONFIGURED_PORTS_KEY,
    DEFAULT_CONFIGURED_PORTS,
  ),

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
      writeShortcuts(nextShortcuts);
      return { browserShortcuts: nextShortcuts };
    });
    return id;
  },

  browserRenameShortcut: (id, name) =>
    set((state) => {
      const nextShortcuts = state.browserShortcuts.map((s) => (s.id === id ? { ...s, name } : s));
      writeShortcuts(nextShortcuts);
      return { browserShortcuts: nextShortcuts };
    }),

  browserDeleteShortcut: (id) =>
    set((state) => {
      const nextShortcuts = state.browserShortcuts.filter((s) => s.id !== id);
      writeShortcuts(nextShortcuts);
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
      writeShortcuts(nextShortcuts);
      return { browserShortcuts: nextShortcuts };
    }),

  browserSetLocalPorts: (ports) =>
    set(() => {
      const withSort = ports.map((p, idx) => ({ ...p, sortOrder: p.sortOrder ?? idx }));
      writeLocalPorts(withSort);
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
        lastAliveAt: Date.now(),
        sortOrder: maxSortOrder + 1,
      };
      const nextPorts = [...state.browserLocalPorts, newPort];
      writeLocalPorts(nextPorts);
      return { browserLocalPorts: nextPorts };
    });
    return id;
  },

  browserDeleteLocalPort: (id) =>
    set((state) => {
      const nextPorts = state.browserLocalPorts.filter((p) => p.id !== id);
      writeLocalPorts(nextPorts);
      return { browserLocalPorts: nextPorts };
    }),

  browserUpdateLocalPort: (id, patch) =>
    set((state) => {
      const nextPorts = state.browserLocalPorts.map((p) => (p.id === id ? { ...p, ...patch } : p));
      writeLocalPorts(nextPorts);
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
      writeLocalPorts(nextPorts);
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
        console.warn('[browserScanPorts] IPC error:', result.error);
        return;
      }
      const openPorts = result.data.filter((p) => p.isOpen);
      const current = _get().browserLocalPorts;
      const existingKeys = new Set(current.map((p) => `${p.host}:${p.port}`));
      const maxSortOrder = current.length > 0 ? Math.max(...current.map((p) => p.sortOrder)) : 0;

      const newPorts: LocalPort[] = openPorts
        .filter((p) => !existingKeys.has(`localhost:${p.port}`))
        .map((p, idx) => ({
          id: createUiId('localport'),
          host: 'localhost',
          port: p.port,
          isAutoDiscovered: true,
          lastAliveAt: Date.now(),
          sortOrder: maxSortOrder + idx + 1,
        }));

      if (newPorts.length > 0) {
        const next = [...current, ...newPorts];
        writeLocalPorts(next);
        set({ browserLocalPorts: next });
      }
    } catch (e) {
      console.warn('[browserScanPorts] failed:', e);
    } finally {
      set({ browserPortScanning: false });
    }
  },

  browserSetBgConfig: (config) => {
    writeBgConfig(config);
    set({ browserBgConfig: config });
  },

  browserResetBgConfig: () => {
    const defaultConfig: BackgroundConfig = { mode: 'default', fit: 'cover' };
    writeBgConfig(defaultConfig);
    set({ browserBgConfig: defaultConfig });
  },

  browserSetConfiguredPorts: (ports) => {
    const unique = [...new Set(ports.filter((p) => Number.isFinite(p) && p > 0 && p <= 65535))];
    writeConfiguredPorts(unique);
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
      writeConfiguredPorts(next);
      return { browserConfiguredPorts: next };
    });
  },

  browserRemoveConfiguredPort: (port) => {
    set((state) => {
      const next = state.browserConfiguredPorts.filter((p) => p !== port);
      writeConfiguredPorts(next);
      return { browserConfiguredPorts: next };
    });
  },
});
