import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { StoreState } from '../StoreState';
import type {
  DownloadRecord,
  DownloadFileState,
  DownloadSettings,
  DownloadProgress,
  DownloadProgressPayload,
  DownloadErrorPayload,
  DownloadFinishedPayload,
  DownloadIdPayload,
  DownloadPauseResult,
  DownloadFileStatesInput,
  DownloadRedownloadInput,
  DownloadPrepareRedownloadInput,
} from '@shared/ipc/download';
import type { IpcResult } from '@adlo/kernel';
import { buildTabsById } from './browserFoldersUtils';
import { DEFAULT_DOWNLOAD_MODE } from '@shared/defaultPreferences';
import { browserZh } from '../../i18n/zh-CN/browser';
import { browserEn } from '../../i18n/en-US/browser';
import { resolveAppLanguage } from '../../i18n/resolveLanguage';

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

/**
 * 写成功但回读失败的哨兵 message（M9）：调用方据此映射专用 toast，
 * 区别于真正的写入失败。集中定义避免三处字面量重复。
 */
export const DOWNLOAD_REFRESH_FAILED = 'REFRESH_FAILED';

/** Fallback timers for the transient redownloading spinner; keyed by download id. */
const redownloadTimers = new Map<string, ReturnType<typeof setTimeout>>();

export interface BrowserDownloadsSlice {
  downloads: DownloadRecord[];
  downloadSettings: DownloadSettings;
  /** 系统默认下载目录（`download_get_default_path` 解析值）：`default_path` 为空
   *（= 系统默认）时展示用，避免恢复默认后输入框空显示。 best-effort，取不到即 ''。 */
  systemDefaultDownloadPath: string;
  activeDownloads: Record<string, DownloadProgress>;
  isLoadingDownloads: boolean;
  isLoadingSettings: boolean;
  /**
   * 下载设置是否已成功加载过（transient，不持久化）：初始 store 默认形恰为"默认形"，
   * 无此标记则无法区分"未知"与"默认"，恢复按钮 fail-open 依赖它。
   */
  downloadSettingsLoaded: boolean;
  /** 文件系统状态缓存（id → DownloadFileState），由事件/删除动作失效。 */
  downloadFileStates: Record<string, DownloadFileState>;
  /** 当前正在“重新下载”流程中的下载 id 集合；15s 超时或动作完成时清理。 */
  redownloadingIds: ReadonlySet<string>;

  fetchDownloads: () => Promise<void>;
  refreshDownloadFileStates: (ids?: string[]) => Promise<void>;
  redownloadDownload: (id: string, tabId?: string) => Promise<IpcResult<void>>;
  fetchDownloadSettings: () => Promise<boolean>;
  fetchSystemDefaultDownloadPath: () => Promise<void>;
  updateDownloadSettings: (
    mode?: string,
    defaultPath?: string,
    autoMigrate?: boolean,
  ) => Promise<IpcResult<void>>;
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
  downloadSettings: {
    mode: DEFAULT_DOWNLOAD_MODE,
    default_path: '',
    auto_migrate_on_path_change: false,
  },
  systemDefaultDownloadPath: '',
  activeDownloads: {},
  isLoadingDownloads: false,
  isLoadingSettings: false,
  downloadSettingsLoaded: false,
  downloadFileStates: {},
  redownloadingIds: new Set<string>(),

  fetchDownloads: async () => {
    set({ isLoadingDownloads: true });
    try {
      const result = await invoke<IpcResult<DownloadRecord[]>>('download_list');
      if (result.ok) {
        set({ downloads: result.data });
      }
    } catch {
      // 非 Tauri 环境无该通道：保持空列表（与 fetchSystemDefaultDownloadPath 同口径）。
    } finally {
      set({ isLoadingDownloads: false });
    }
  },

  refreshDownloadFileStates: async (ids?: string[]) => {
    if (!ids || ids.length === 0) {
      return;
    }
    try {
      const result = await invoke<IpcResult<DownloadFileState[]>>('download_file_states', {
        ids,
      } satisfies DownloadFileStatesInput);
      if (result.ok) {
        set((state) => {
          const next = { ...state.downloadFileStates };
          for (const fs of result.data) {
            next[fs.id] = fs;
          }
          return { downloadFileStates: next };
        });
      }
    } catch {
      // 非 Tauri 环境无该通道：保持当前缓存。
    }
  },

  redownloadDownload: async (id: string, tabId?: string) => {
    set((state) => {
      const next = new Set(state.redownloadingIds);
      next.add(id);
      return { redownloadingIds: next };
    });

    const existing = redownloadTimers.get(id);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    redownloadTimers.set(
      id,
      setTimeout(() => {
        redownloadTimers.delete(id);
        set((state) => {
          const next = new Set(state.redownloadingIds);
          next.delete(id);
          return { redownloadingIds: next };
        });
      }, 15000),
    );

    const clearRedownloading = () => {
      const timer = redownloadTimers.get(id);
      if (timer !== undefined) {
        clearTimeout(timer);
        redownloadTimers.delete(id);
      }
      set((state) => {
        const next = new Set(state.redownloadingIds);
        next.delete(id);
        return { redownloadingIds: next };
      });
    };

    try {
      let result: IpcResult<void>;
      if (tabId) {
        result = await invoke<IpcResult<void>>('download_redownload', {
          id,
          tabId,
        } satisfies DownloadRedownloadInput);
      } else {
        result = await invoke<IpcResult<void>>('download_prepare_redownload', {
          id,
        } satisfies DownloadPrepareRedownloadInput);
        if (result.ok) {
          const record = get().downloads.find((d) => d.id === id);
          if (record) {
            get().browserOpenTab(record.url);
          }
        }
      }
      if (!result.ok) {
        clearRedownloading();
      }
      return result;
    } catch (e) {
      clearRedownloading();
      return {
        ok: false as const,
        error: { code: 'Internal' as const, message: e instanceof Error ? e.message : String(e) },
      };
    }
  },

  fetchDownloadSettings: async () => {
    set({ isLoadingSettings: true });
    try {
      const result = await invoke<IpcResult<DownloadSettings>>('download_get_settings');
      if (result.ok) {
        // 归一化：旧/第三方 provider 可能缺 auto_migrate 字段（undefined 会让
        // checkbox 失控 + downloadAtDefault 误判默认），缺席按 false（后端默认关）处理。
        set({
          downloadSettings: {
            ...result.data,
            auto_migrate_on_path_change: result.data.auto_migrate_on_path_change ?? false,
          },
          downloadSettingsLoaded: true,
        });
        return true;
      }
      return false;
    } catch {
      // 非 Tauri 环境无该通道：保持当前设置。
      return false;
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
    // 与 changeDownloadPath 同构：浏览器模式 invoke 抛错转业务失败，避免未处理拒绝（F5/J2）。
    try {
      const result = await invoke<IpcResult<void>>('download_update_settings', {
        mode: mode ?? null,
        defaultPath: defaultPath ?? null,
        autoMigrate: autoMigrate ?? null,
      });
      if (result.ok) {
        // 写成功但回读失败同样不可静默：调用方按 DOWNLOAD_REFRESH_FAILED 展示专用 toast（M9）。
        const fresh = await get().fetchDownloadSettings();
        if (!fresh) {
          return {
            ok: false as const,
            error: { code: 'Internal' as const, message: DOWNLOAD_REFRESH_FAILED },
          };
        }
      }
      return result;
    } catch (e) {
      return {
        ok: false as const,
        error: { code: 'Internal' as const, message: e instanceof Error ? e.message : String(e) },
      };
    }
  },

  changeDownloadPath: async (newPath: string, migrate: boolean) => {
    try {
      const result = await invoke<IpcResult<void>>('download_change_default_path', {
        newPath,
        migrate,
      });
      if (result.ok) {
        const fresh = await get().fetchDownloadSettings();
        if (!fresh) {
          return {
            ok: false as const,
            error: { code: 'Internal' as const, message: DOWNLOAD_REFRESH_FAILED },
          };
        }
        // 解析默认路径同步刷新，避免重置后输入框依赖挂载旧值（L3）。
        await get().fetchSystemDefaultDownloadPath();
      }
      return result;
    } catch (e) {
      return {
        ok: false as const,
        error: { code: 'Internal' as const, message: e instanceof Error ? e.message : String(e) },
      };
    }
  },

  clearDownloadHistory: async () => {
    const result = await invoke<IpcResult<void>>('download_clear_history', {});
    if (result.ok) {
      set({ downloads: [], downloadFileStates: {}, redownloadingIds: new Set<string>() });
    }
  },

  deleteDownloadFile: async (id: string) => {
    const result = await invoke<IpcResult<void>>('download_delete_file_and_record', { id });
    if (result.ok) {
      set((state) => {
        const { [id]: _removedFileState, ...nextFileStates } = state.downloadFileStates;
        const nextRedownloadingIds = new Set(state.redownloadingIds);
        nextRedownloadingIds.delete(id);
        return {
          downloads: state.downloads.filter((d) => d.id !== id),
          downloadFileStates: nextFileStates,
          redownloadingIds: nextRedownloadingIds,
        };
      });
    }
  },

  removeDownloadRecord: async (id: string) => {
    const result = await invoke<IpcResult<void>>('download_remove_record', { id });
    if (result.ok) {
      set((state) => {
        const { [id]: _removedFileState, ...nextFileStates } = state.downloadFileStates;
        const nextRedownloadingIds = new Set(state.redownloadingIds);
        nextRedownloadingIds.delete(id);
        return {
          downloads: state.downloads.filter((d) => d.id !== id),
          downloadFileStates: nextFileStates,
          redownloadingIds: nextRedownloadingIds,
        };
      });
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
      const timer = redownloadTimers.get(record.id);
      if (timer !== undefined) {
        clearTimeout(timer);
        redownloadTimers.delete(record.id);
      }
      set((state) => {
        // Update the source tab's isDownloading flag
        const nextTabs = record.source_tab_id
          ? state.browserTabs.map((t) =>
              t.id === record.source_tab_id ? { ...t, isDownloading: true } : t,
            )
          : state.browserTabs;
        const existingIndex = state.downloads.findIndex((d) => d.id === record.id);
        const nextDownloads =
          existingIndex >= 0
            ? state.downloads.map((d, i) => (i === existingIndex ? record : d))
            : [record, ...state.downloads];
        const { [record.id]: _removedFileState, ...nextFileStates } = state.downloadFileStates;
        const nextRedownloadingIds = new Set(state.redownloadingIds);
        nextRedownloadingIds.delete(record.id);
        return {
          downloads: nextDownloads,
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
          downloadFileStates: nextFileStates,
          redownloadingIds: nextRedownloadingIds,
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
        const { [payload.id]: _removedFileState, ...nextFileStates } = state.downloadFileStates;
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
          downloadFileStates: nextFileStates,
        };
      });
      if (payload.success) {
        queueMicrotask(() => {
          void get().refreshDownloadFileStates([payload.id]);
        });
      }
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
      // Blob-save failures have no download record (empty id): surface them as
      // a toast instead of silently matching nothing.
      const hasRecord = get().downloads.some((d) => d.id === payload.id);
      if (!hasRecord && payload.fileName) {
        const locale = resolveAppLanguage(get().appInfo?.config?.language);
        const template =
          locale === 'en-US'
            ? browserEn.browserDownloadBlobFailedToast
            : browserZh.browserDownloadBlobFailedToast;
        get().showToast(template.replace('{name}', payload.fileName), 'error');
      }
      set((state) => {
        const { [payload.id]: _removed, ...rest } = state.activeDownloads;
        const { [payload.id]: _removedFileState, ...nextFileStates } = state.downloadFileStates;
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
          downloadFileStates: nextFileStates,
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
        const { [payload.id]: _removedFileState, ...nextFileStates } = state.downloadFileStates;
        return {
          downloads: nextDownloads,
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
          downloadFileStates: nextFileStates,
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
        const { [payload.id]: _removedFileState, ...nextFileStates } = state.downloadFileStates;
        return {
          downloads: state.downloads.map((d) =>
            d.id === payload.id
              ? { ...d, status: 'in_progress' as const, interrupt_reason: null }
              : d,
          ),
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
          downloadFileStates: nextFileStates,
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
        const { [payload.id]: _removedFileState, ...nextFileStates } = state.downloadFileStates;
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
          downloadFileStates: nextFileStates,
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
