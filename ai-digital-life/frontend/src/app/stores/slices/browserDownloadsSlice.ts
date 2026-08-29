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

export interface BrowserDownloadsSlice {
  downloads: DownloadRecord[];
  downloadSettings: DownloadSettings;
  activeDownloads: Record<string, DownloadProgress>;
  isLoadingDownloads: boolean;
  isLoadingSettings: boolean;

  fetchDownloads: () => Promise<void>;
  fetchDownloadSettings: () => Promise<void>;
  updateDownloadSettings: (mode?: string, defaultPath?: string) => Promise<void>;
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
  downloadSettings: { mode: 'auto', default_path: '' },
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

  updateDownloadSettings: async (mode?: string, defaultPath?: string) => {
    const result = await invoke<IpcResult<void>>('download_update_settings', {
      mode: mode ?? null,
      defaultPath: defaultPath ?? null,
    });
    if (result.ok) {
      await get().fetchDownloadSettings();
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
              d.id === id ? { ...d, status: 'paused' as const, interrupt_reason: 'UserPaused' } : d,
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
        set((state) => ({
          downloads: state.downloads.map((d) =>
            d.id === id ? { ...d, status: 'in_progress' as const, interrupt_reason: null } : d,
          ),
        }));
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
      set((state) => ({
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
      }));
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
        return {
          activeDownloads: rest,
          downloads: state.downloads.map((d) =>
            d.id === payload.id
              ? {
                  ...d,
                  status: newStatus as DownloadRecord['status'],
                  file_path: payload.filePath,
                  completed_at: Math.floor(Date.now() / 1000),
                }
              : d,
          ),
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
        return {
          activeDownloads: rest,
          downloads: state.downloads.map((d) =>
            d.id === payload.id
              ? {
                  ...d,
                  status: 'failed' as const,
                  interrupt_reason: payload.reason,
                }
              : d,
          ),
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
      set((state) => ({
        downloads: state.downloads.map((d) =>
          d.id === payload.id
            ? { ...d, status: 'paused' as const, interrupt_reason: 'UserPaused' }
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

    void listen<DownloadIdPayload>('browser-download-resumed', (event) => {
      if (!active) {
        return;
      }
      const payload = event.payload;
      set((state) => ({
        downloads: state.downloads.map((d) =>
          d.id === payload.id
            ? { ...d, status: 'in_progress' as const, interrupt_reason: null }
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

    void listen<DownloadIdPayload>('browser-download-canceled', (event) => {
      if (!active) {
        return;
      }
      const payload = event.payload;
      set((state) => {
        const { [payload.id]: _removed, ...rest } = state.activeDownloads;
        return {
          activeDownloads: rest,
          downloads: state.downloads.map((d) =>
            d.id === payload.id
              ? { ...d, status: 'canceled' as const, interrupt_reason: 'UserCanceled' }
              : d,
          ),
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
