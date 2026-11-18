import type { AppUpdateProgress } from '../../../shared/ipc/update';
import type { StoreState } from '../StoreState';
import { persistField } from '../persisted/apply';

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

/**
 * 跨重启需要记住的更新偏好（persisted registry `adl:update.state`）。
 *
 * - `skippedVersion`：用户点过「跳过此版本」的版本号，只对该版本静默。
 * - `lastPromptedVersion/At`：同日最多提示一次「有新版本」的依据。
 * - `lastCheckedAt`：关于页展示「刚刚检查 / 昨天检查」。
 */
export interface AppUpdatePersistedState {
  skippedVersion: string | null;
  lastPromptedVersion: string | null;
  lastPromptedAt: number | null;
  lastCheckedAt: number | null;
}

export const DEFAULT_APP_UPDATE_PERSISTED: AppUpdatePersistedState = {
  skippedVersion: null,
  lastPromptedVersion: null,
  lastPromptedAt: null,
  lastCheckedAt: null,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AppUpdateSlice {
  appUpdateStatus: AppUpdateStatus;
  appUpdateVersion: string | null;
  appUpdateNotes: string | null;
  appUpdatePublishedAt: string | null;
  appUpdateSource: string | null;
  appUpdateError: string | null;
  appUpdateProgress: AppUpdateProgress | null;
  appUpdatePersisted: AppUpdatePersistedState;
  /**
   * 最近一次检查的结果是「已是最新」。仅会话内有效：`idle` 同时表示「从未检查」
   * 和「检查完没更新」，缺这个标记时关于页只能显示「上次检查：刚刚」，
   * 用户会以为点击没反应。
   */
  appUpdateUpToDate: boolean;

  /** 检查更新。`manual` 只影响「失败是否可被用户看到」以外的节流无关行为。 */
  checkAppUpdate: (options?: { manual?: boolean }) => Promise<void>;
  /** 下载当前可用更新（不安装）。 */
  downloadAppUpdate: () => Promise<void>;
  /** 安装已下载更新；成功时进程会退出，因此不要在此之后再更新 UI。 */
  installAppUpdate: () => Promise<void>;
  /** 由 `digital-life://app-update-progress` 事件驱动。 */
  setAppUpdateProgress: (progress: AppUpdateProgress) => void;
  /** 跳过当前版本：清掉该版本的通知，之后不再提示它。 */
  skipAppUpdateVersion: () => void;
}

const bridge = () => {
  const candidate = typeof window === 'undefined' ? undefined : window.digitalLife?.update;
  return candidate?.supported ? candidate : null;
};

const updateNotificationTitle = (version: string) => `v${version}`;

export const createAppUpdateSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): AppUpdateSlice => ({
  appUpdateStatus: 'idle',
  appUpdateVersion: null,
  appUpdateNotes: null,
  appUpdatePublishedAt: null,
  appUpdateSource: null,
  appUpdateError: null,
  appUpdateProgress: null,
  appUpdatePersisted: DEFAULT_APP_UPDATE_PERSISTED,
  appUpdateUpToDate: false,

  checkAppUpdate: async (options = {}) => {
    const update = bridge();
    if (!update) {
      return;
    }
    const manual = options.manual === true;
    const status = get().appUpdateStatus;
    if (status === 'checking' || status === 'downloading' || status === 'installing') {
      return;
    }
    // 进入 checking 之前先记住「已下载待安装」的状态：后台检查不能把它打回可下载。
    const downloadedVersion = status === 'downloaded' ? get().appUpdateVersion : null;

    set({ appUpdateStatus: 'checking', appUpdateError: null });
    const result = await update.check();
    const checkedAt = Date.now();
    const persisted = { ...get().appUpdatePersisted, lastCheckedAt: checkedAt };

    if (!result.ok) {
      set({
        ...persistField('adl:update.state', persisted),
        appUpdateStatus: 'error',
        appUpdateError: result.error.message,
        appUpdateProgress: null,
        appUpdateUpToDate: false,
      });
      return;
    }

    const data = result.data;
    // 后端只在「所有来源都不可用」时给 error；必须显示失败，不能当成已是最新。
    if (data.error) {
      set({
        ...persistField('adl:update.state', persisted),
        appUpdateStatus: 'error',
        appUpdateError: data.error,
        appUpdateProgress: null,
        appUpdateUpToDate: false,
      });
      return;
    }
    if (!data.available || !data.version) {
      set({
        ...persistField('adl:update.state', persisted),
        appUpdateStatus: 'idle',
        appUpdateVersion: null,
        appUpdateNotes: null,
        appUpdatePublishedAt: null,
        appUpdateSource: null,
        appUpdateError: null,
        appUpdateProgress: null,
        appUpdateUpToDate: true,
      });
      // 已是最新时清掉旧的更新卡片，避免留下指向旧版本的僵尸卡。
      const stale = get().notifications.filter((n) => n.type === 'update');
      for (const notification of stale) {
        get().removeNotification(notification.id);
      }
      return;
    }

    const version = data.version;
    // 后台检查不能把「已下载待安装」打回「可下载」：用户准备安装的状态优先。
    if (downloadedVersion !== null && downloadedVersion === version) {
      set({
        ...persistField('adl:update.state', persisted),
        appUpdateStatus: 'downloaded',
        appUpdateError: null,
      });
      return;
    }
    const skipped = persisted.skippedVersion === version;
    const promptedToday =
      persisted.lastPromptedVersion === version &&
      persisted.lastPromptedAt !== null &&
      checkedAt - persisted.lastPromptedAt < DAY_MS;
    // 手动检查必须能补回卡片：用户可能点了「跳过此版本」、删了通知，或提示已过 24h。
    // 自动检查仍遵守「跳过」与 24h 节流，避免反复打扰。
    const shouldPrompt = manual || (!skipped && !promptedToday);
    const nextPersisted: AppUpdatePersistedState = shouldPrompt
      ? { ...persisted, lastPromptedVersion: version, lastPromptedAt: checkedAt }
      : persisted;

    set({
      ...persistField('adl:update.state', nextPersisted),
      appUpdateStatus: 'available',
      appUpdateVersion: version,
      appUpdateNotes: data.notes,
      appUpdatePublishedAt: data.publishedAt,
      appUpdateSource: data.source,
      appUpdateError: null,
      appUpdateProgress: null,
      appUpdateUpToDate: false,
      appUpdatePersisted: nextPersisted,
    });
    if (!shouldPrompt) {
      return;
    }

    // 一个版本只留一条卡片：旧版本卡片在发现新版本时被移除，避免堆积。
    const title = updateNotificationTitle(version);
    const state = get();
    for (const notification of state.notifications) {
      if (notification.type === 'update' && notification.title !== title) {
        state.removeNotification(notification.id);
      }
    }
    if (state.notifications.some((n) => n.type === 'update' && n.title === title)) {
      return;
    }
    state.addNotification({
      type: 'update',
      title,
      summary: data.notes ?? '',
      fullInfo: data.notes ?? '',
      silent: true,
    });
  },

  downloadAppUpdate: async () => {
    const update = bridge();
    const version = get().appUpdateVersion;
    if (!update || !version) {
      return;
    }
    if (get().appUpdateStatus === 'downloading' || get().appUpdateStatus === 'installing') {
      return;
    }

    set({
      appUpdateStatus: 'downloading',
      appUpdateProgress: { downloaded: 0, total: null },
      appUpdateError: null,
    });
    const result = await update.download();
    if (!result.ok) {
      set({
        appUpdateStatus: 'error',
        appUpdateError: result.error.message,
        appUpdateProgress: null,
      });
      return;
    }
    set({ appUpdateStatus: 'downloaded', appUpdateProgress: null });

    // 用户可能先把通知卡片删掉了：下载完成后没有卡片，绿点就成了「点了什么也没有」。
    // 这里按当前版本补一张（静默，不弹浮层），保证绿点一定对应一张可操作的卡片。
    const currentVersion = get().appUpdateVersion;
    if (!currentVersion) {
      return;
    }
    const title = updateNotificationTitle(currentVersion);
    const state = get();
    if (!state.notifications.some((n) => n.type === 'update' && n.title === title)) {
      state.addNotification({
        type: 'update',
        title,
        summary: state.appUpdateNotes ?? '',
        fullInfo: state.appUpdateNotes ?? '',
        silent: true,
      });
    }
  },

  installAppUpdate: async () => {
    const update = bridge();
    if (!update) {
      return;
    }
    set({ appUpdateStatus: 'installing', appUpdateError: null });
    const result = await update.install();
    if (!result.ok) {
      set({ appUpdateStatus: 'error', appUpdateError: result.error.message });
    }
  },

  setAppUpdateProgress: (progress) => {
    if (get().appUpdateStatus !== 'downloading') {
      return;
    }
    set({ appUpdateProgress: progress });
  },

  skipAppUpdateVersion: () => {
    const version = get().appUpdateVersion;
    if (!version) {
      return;
    }
    const persisted: AppUpdatePersistedState = {
      ...get().appUpdatePersisted,
      skippedVersion: version,
    };
    set({
      ...persistField('adl:update.state', persisted),
      appUpdateStatus: 'idle',
      appUpdateVersion: null,
      appUpdateNotes: null,
      appUpdatePublishedAt: null,
      appUpdateSource: null,
      appUpdateError: null,
      appUpdateProgress: null,
      appUpdateUpToDate: false,
    });

    const title = updateNotificationTitle(version);
    const state = get();
    for (const notification of state.notifications) {
      if (notification.type === 'update' && notification.title === title) {
        state.removeNotification(notification.id);
      }
    }
  },
});
