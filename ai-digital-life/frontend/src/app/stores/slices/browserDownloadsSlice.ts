import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { StoreState } from '../StoreState';
import type {
  DownloadRecord,
  DownloadSettings,
  DownloadProgress,
  DownloadProgressPayload,
  DownloadErrorPayload,
  DownloadFinishedPayload,
  DownloadIdPayload,
  DownloadPauseResult,
} from '@shared/ipc/download';
import type { IpcResult } from '@ai-digital-life/kernel';
import { buildTabsById } from './browserFoldersUtils';

/**
 * Whether a tab still has at least one active (in_progress) download after a
 * given download leaves the active set. `isDownloading` is a single boolean, so
 * clearing it unconditionally when one download finishes would prematurely
 * unprotect a tab that is concurrently downloading other files. This helper
 * checks the remaining downloads for the same source tab.
 */
export function tabStillDownloading(
  downloads: DownloadRecord[],
  sourceTabId: string | null | undefined,
): boolean {
  if (!sourceTabId) {
    return false;
  }
  return downloads.some((d) => d.source_tab_id === sourceTabId && d.status === 'in_progress');
}

/** Recompute the tab's isDownloading from the (already-updated) downloads list. */
export function updateTabsForDownloadState(
  tabs: StoreState['browserTabs'],
  downloads: DownloadRecord[],
  sourceTabId: string | null | undefined,
): StoreState['browserTabs'] {
  if (!sourceTabId) {
    return tabs;
  }
  const stillActive = tabStillDownloading(downloads, sourceTabId);
  return tabs.map((t) => (t.id === sourceTabId ? { ...t, isDownloading: stillActive } : t));
}

export interface BrowserDownloadsSlice {
  downloads: DownloadRecord[];
  downloadSettings: DownloadSettings;
  /** 系统默认下载目录（`download_get_default_path` 解析值）：`default_path` 为空
   *（= 系统默认）时展示用，避免恢复默认后输入框空显示。 best-effort，取不到即 ''。 */
  systemDefaultDownloadPath: string;
  activeDownloads: Record<string, DownloadProgress>;
  isLoadingDownloads: boolean;
  isLoadingSettings: boolean;

  fetchDownloads: () => Promise<void>;
  fetchDownloadSettings: () => Promise<void>;
  fetchSystemDefaultDownloadPath: () => Promise<void>;
  updateDownloadSettings: (
    mode?: string,
    defaultPath?: string,
    autoMigrate?: boolean,
  ) => Promise<void>;
  /** 改默认下载路径；`migrate` 时后端先搬旧路径全部文件，成功后才删旧目录并落盘。 */
  changeDownloadPath: (newPath: string, migrate: boolean) => Promise<IpcResult<void>>;
  clearDownloadHistory: () => Promise<void>;
  deleteDownloadFile: (id: string) => Promise<void>;
  removeDownloadRecord: (id: string) => Promise<void>;
  pauseDownload: (id: string) => Promise<void>;
  resumeDownload: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  subscribeDownloadEvents: () => () => void;
}

export const createBrowserDownloadsSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): BrowserDownloadsSlice => ({
  downloads: [],
  downloadSettings: { mode: 'auto', default_path: '', auto_migrate_on_path_change: false },
  systemDefaultDownloadPath: '',
  activeDownloads: {},
  isLoadingDownloads: false,
  isLoadingSettings: false,

  fetchDownloads: async () => {
    set({ isLoadingDownloads: true });
    try {
      const result = await invoke<IpcResult<DownloadRecord[]>>('download_list');
      if (result.ok) {
        set({ downloads: result.data });
      }
    } finally {
      set({ isLoadingDownloads: false });
    }
  },

  fetchDownloadSettings: async () => {
    set({ isLoadingSettings: true });
    try {
      const result = await invoke<IpcResult<DownloadSettings>>('download_get_settings');
      if (result.ok) {
        set({ downloadSettings: result.data });
      }
    } finally {
      set({ isLoadingSettings: false });
    }
  },

  fetchSystemDefaultDownloadPath: async () => {
    try {
      const result = await invoke<IpcResult<string>>('download_get_default_path');
      if (result.ok && typeof result.data === 'string') {
        set({ systemDefaultDownloadPath: result.data });
      }
    } catch {
      // 非 Tauri 环境无该通道：保持 ''，调用方回退占位文案。
    }
  },

  updateDownloadSettings: async (mode?: string, defaultPath?: string, autoMigrate?: boolean) => {
    const result = await invoke<IpcResult<void>>('download_update_settings', {
      mode: mode ?? null,
      defaultPath: defaultPath ?? null,
      autoMigrate: autoMigrate ?? null,
    });
    if (result.ok) {
      await get().fetchDownloadSettings();
    }
  },

  changeDownloadPath: async (newPath: string, migrate: boolean) => {
    try {
      const result = await invoke<IpcResult<void>>('download_change_default_path', {
        newPath,
        migrate,
      });
      if (result.ok) {
        await get().fetchDownloadSettings();
      }
      return result;
    } catch (e) {
      return {
        ok: false,
        error: { code: 'Internal', message: e instanceof Error ? e.message : String(e) },
      };
    }
  },

  clearDownloadHistory: async () => {
    const result = await invoke<IpcResult<void>>('download_clear_history');
    if (result.ok) {
      set({ downloads: [] });
    }
  },

  deleteDownloadFile: async (id: string) => {
    const result = await invoke<IpcResult<void>>('download_delete_file_and_record', { id });
    if (result.ok) {
      set((state) => ({
        downloads: state.downloads.filter((d) => d.id !== id),
      }));
    }
  },

  removeDownloadRecord: async (id: string) => {
    const result = await invoke<IpcResult<void>>('download_remove_record', { id });
    if (result.ok) {
      set((state) => ({
        downloads: state.downloads.filter((d) => d.id !== id),
      }));
    }
  },

  pauseDownload: async (id: string) => {
    try {
      const result = await invoke<IpcResult<DownloadPauseResult>>('download_pause', { id });
      if (result.ok) {
        const newStatus = result.data.status;
        if (newStatus === 'completed') {
          // The transfer had already finished when pause was clicked (matches
          // Chrome/Edge). Reflect the true state instead of a misleading pause.
          console.info(
            '[ADL-DL] pauseDownload: backend reports download already completed; showing completed',
          );
          set((state) => {
            const { [id]: _removed, ...rest } = state.activeDownloads;
            return {
              activeDownloads: rest,
              downloads: state.downloads.map((d) =>
                d.id === id
                  ? {
                      ...d,
                      status: 'completed' as const,
                      completed_at: d.completed_at ?? Math.floor(Date.now() / 1000),
                    }
                  : d,
              ),
            };
          });
        } else {
          console.info('[ADL-DL] pauseDownload: backend reports download paused');
          set((state) => ({
            downloads: state.downloads.map((d) =>
              d.id === id
                ? {
                    ...d,
                    status: 'paused' as const,
                    // Preserve the backend's interrupt_reason if the record already
                    // carries it (the paused event will arrive with the true
                    // backend reason and overwrite this shortly); the backend DB
                    // is the source of truth.
                    interrupt_reason: d.interrupt_reason ?? 'UserPaused',
                  }
                : d,
            ),
          }));
        }
      } else {
        console.warn('[ADL-DL] pauseDownload: invoke failed', result.error);
      }
    } catch (e) {
      console.error('[ADL-DL] pauseDownload: invoke rejected', e);
    }
  },

  resumeDownload: async (id: string) => {
    try {
      const result = await invoke<IpcResult<void>>('download_resume', { id });
      if (result.ok) {
        set((state) => {
          // Restore the source tab's isDownloading flag: the paused download is
          // actively transferring again, so its tab must stay protected from
          // suspension (the paused handler cleared the flag).
          const sourceTabId = state.downloads.find((d) => d.id === id)?.source_tab_id;
          const nextTabs = sourceTabId
            ? state.browserTabs.map((t) =>
                t.id === sourceTabId ? { ...t, isDownloading: true } : t,
              )
            : state.browserTabs;
          return {
            downloads: state.downloads.map((d) =>
              d.id === id ? { ...d, status: 'in_progress' as const, interrupt_reason: null } : d,
            ),
            browserTabs: nextTabs,
            browserTabsById: buildTabsById(nextTabs),
          };
        });
      } else {
        console.warn('[ADL-DL] resumeDownload: invoke failed', result.error);
      }
    } catch (e) {
      console.error('[ADL-DL] resumeDownload: invoke rejected', e);
    }
  },

  cancelDownload: async (id: string) => {
    try {
      const result = await invoke<IpcResult<void>>('download_cancel', { id });
      if (result.ok) {
        set((state) => {
          const { [id]: _removed, ...rest } = state.activeDownloads;
          return {
            activeDownloads: rest,
            downloads: state.downloads.map((d) =>
              d.id === id
                ? { ...d, status: 'canceled' as const, interrupt_reason: 'UserCanceled' }
                : d,
            ),
          };
        });
      } else {
        console.warn('[ADL-DL] cancelDownload: invoke failed', result.error);
      }
    } catch (e) {
      console.error('[ADL-DL] cancelDownload: invoke rejected', e);
    }
  },

  subscribeDownloadEvents: () => {
    if (!get().isTauri) {
      return () => {};
    }

    const unsubs: UnlistenFn[] = [];
    let active = true;

    void listen<DownloadRecord>('browser-download-started', (event) => {
      if (!active) {
        return;
      }
      const record = event.payload;
      set((state) => {
        // Update the source tab's isDownloading flag
        const nextTabs = record.source_tab_id
          ? state.browserTabs.map((t) =>
              t.id === record.source_tab_id ? { ...t, isDownloading: true } : t,
            )
          : state.browserTabs;
        return {
          downloads: [record, ...state.downloads],
          activeDownloads: {
            ...state.activeDownloads,
            [record.id]: {
              id: record.id,
              bytes_received: 0,
              speed: 0,
              estimated_end_time: null,
            },
          },
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
        };
      });
    }).then((unsub) => {
      if (active) {
        unsubs.push(unsub);
      } else {
        void Promise.resolve(unsub()).catch(() => {});
      }
    });

    void listen<DownloadFinishedPayload>('browser-download-finished', (event) => {
      if (!active) {
        return;
      }
      const payload = event.payload;
      set((state) => {
        const { [payload.id]: _removed, ...rest } = state.activeDownloads;
        const newStatus = payload.success ? 'completed' : 'failed';
        // Find the download record to get source_tab_id
        const downloadRecord = state.downloads.find((d) => d.id === payload.id);
        const sourceTabId = downloadRecord?.source_tab_id;
        // Update the downloads list first, then recompute the tab's isDownloading
        // from the remaining downloads (keeps the flag true if the same tab is
        // concurrently downloading another file).
        const nextDownloads = state.downloads.map((d) =>
          d.id === payload.id
            ? {
                ...d,
                status: newStatus as DownloadRecord['status'],
                file_path: payload.filePath,
                completed_at: Math.floor(Date.now() / 1000),
              }
            : d,
        );
        const nextTabs = updateTabsForDownloadState(state.browserTabs, nextDownloads, sourceTabId);
        return {
          activeDownloads: rest,
          downloads: nextDownloads,
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
        };
      });
    }).then((unsub) => {
      if (active) {
        unsubs.push(unsub);
      } else {
        void Promise.resolve(unsub()).catch(() => {});
      }
    });

    void listen<DownloadErrorPayload>('browser-download-error', (event) => {
      if (!active) {
        return;
      }
      const payload = event.payload;
      set((state) => {
        const { [payload.id]: _removed, ...rest } = state.activeDownloads;
        // Find the download record to get source_tab_id
        const downloadRecord = state.downloads.find((d) => d.id === payload.id);
        const sourceTabId = downloadRecord?.source_tab_id;
        // Update the downloads list first, then recompute the tab's isDownloading.
        const nextDownloads = state.downloads.map((d) =>
          d.id === payload.id
            ? {
                ...d,
                status: 'failed' as const,
                interrupt_reason: payload.reason,
              }
            : d,
        );
        const nextTabs = updateTabsForDownloadState(state.browserTabs, nextDownloads, sourceTabId);
        return {
          activeDownloads: rest,
          downloads: nextDownloads,
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
        };
      });
    }).then((unsub) => {
      if (active) {
        unsubs.push(unsub);
      } else {
        void Promise.resolve(unsub()).catch(() => {});
      }
    });

    void listen<DownloadProgressPayload>('browser-download-progress', (event) => {
      if (!active) {
        return;
      }
      const payload = event.payload;
      set((state) => ({
        activeDownloads: {
          ...state.activeDownloads,
          [payload.id]: {
            id: payload.id,
            bytes_received: payload.bytes_received,
            speed: payload.speed,
            estimated_end_time: null,
          },
        },
        downloads: state.downloads.map((d) =>
          d.id === payload.id
            ? {
                ...d,
                bytes_received: payload.bytes_received,
                total_bytes: payload.total_bytes,
              }
            : d,
        ),
      }));
    }).then((unsub) => {
      if (active) {
        unsubs.push(unsub);
      } else {
        void Promise.resolve(unsub()).catch(() => {});
      }
    });

    void listen<DownloadIdPayload>('browser-download-paused', (event) => {
      if (!active) {
        return;
      }
      const payload = event.payload;
      set((state) => {
        // Find source_tab_id from the download record if not in payload
        const sourceTabId =
          payload.source_tab_id ?? state.downloads.find((d) => d.id === payload.id)?.source_tab_id;
        // Update the downloads list first, then recompute the tab's isDownloading
        // (keeps the flag true if the same tab has other downloads still running).
        const nextDownloads = state.downloads.map((d) =>
          d.id === payload.id
            ? {
                ...d,
                status: 'paused' as const,
                // Prefer the backend's interrupt_reason (UserPaused /
                // NonResumablePaused / CosmeticPaused) carried in the event;
                // fall back to the record's existing value, then UserPaused.
                interrupt_reason: payload.interrupt_reason ?? d.interrupt_reason ?? 'UserPaused',
              }
            : d,
        );
        const nextTabs = updateTabsForDownloadState(state.browserTabs, nextDownloads, sourceTabId);
        return {
          downloads: nextDownloads,
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
        };
      });
    }).then((unsub) => {
      if (active) {
        unsubs.push(unsub);
      } else {
        void Promise.resolve(unsub()).catch(() => {});
      }
    });

    void listen<DownloadIdPayload>('browser-download-resumed', (event) => {
      if (!active) {
        return;
      }
      const payload = event.payload;
      set((state) => {
        // Restore the source tab's isDownloading flag (the paused handler
        // cleared it); the download is transferring again so its tab must stay
        // protected from suspension.
        const sourceTabId =
          payload.source_tab_id ?? state.downloads.find((d) => d.id === payload.id)?.source_tab_id;
        const nextTabs = sourceTabId
          ? state.browserTabs.map((t) => (t.id === sourceTabId ? { ...t, isDownloading: true } : t))
          : state.browserTabs;
        return {
          downloads: state.downloads.map((d) =>
            d.id === payload.id
              ? { ...d, status: 'in_progress' as const, interrupt_reason: null }
              : d,
          ),
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
        };
      });
    }).then((unsub) => {
      if (active) {
        unsubs.push(unsub);
      } else {
        void Promise.resolve(unsub()).catch(() => {});
      }
    });

    void listen<DownloadIdPayload>('browser-download-canceled', (event) => {
      if (!active) {
        return;
      }
      const payload = event.payload;
      set((state) => {
        const { [payload.id]: _removed, ...rest } = state.activeDownloads;
        // Find the download record to get source_tab_id
        const downloadRecord = state.downloads.find((d) => d.id === payload.id);
        const sourceTabId = downloadRecord?.source_tab_id;
        // Update the downloads list first, then recompute the tab's isDownloading.
        const nextDownloads = state.downloads.map((d) =>
          d.id === payload.id
            ? { ...d, status: 'canceled' as const, interrupt_reason: 'UserCanceled' }
            : d,
        );
        const nextTabs = updateTabsForDownloadState(state.browserTabs, nextDownloads, sourceTabId);
        return {
          activeDownloads: rest,
          downloads: nextDownloads,
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
        };
      });
    }).then((unsub) => {
      if (active) {
        unsubs.push(unsub);
      } else {
        void Promise.resolve(unsub()).catch(() => {});
      }
    });

    return () => {
      active = false;
      for (const unsub of unsubs) {
        void Promise.resolve(unsub()).catch(() => {});
      }
    };
  },
});
