export interface NotificationData {
  id: string;
  type: 'conflict' | 'update';
  title: string;
  summary: string;
  fullInfo: string;
  timestamp: number;
  read: boolean;
}

export interface NotificationInput extends Omit<NotificationData, 'id' | 'timestamp' | 'read'> {
  /**
   * 静默通知：只进列表、不弹浮层（`activePopupId` 不指向它）。
   * 更新提醒用它——检查更新的结果由「关于」页或通知面板承载，
   * 不需要冲突弹窗那种强打断。
   */
  silent?: boolean;
}

export interface NotificationSlice {
  notifications: NotificationData[];
  activePopupId: string | null;

  addNotification: (data: NotificationInput) => string;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  setReadByVisibility: (visibleIds: string[]) => void;
  dismissPopup: () => void;
}

let notifCounter = 0;
function notifId() {
  notifCounter += 1;
  return `notif-${notifCounter}-${Date.now()}`;
}

export const createNotificationSlice = (
  set: (
    partial:
      | Partial<NotificationSlice>
      | ((state: NotificationSlice) => Partial<NotificationSlice>),
  ) => void,
  get: () => NotificationSlice,
): NotificationSlice => ({
  notifications: [],
  activePopupId: null,

  addNotification: (data) => {
    const id = notifId();
    const { silent, ...rest } = data;
    const notification: NotificationData = {
      ...rest,
      id,
      timestamp: Date.now(),
      read: false,
    };
    set((state) => ({
      notifications: [notification, ...state.notifications],
      activePopupId: silent ? state.activePopupId : (state.activePopupId ?? id),
    }));
    return id;
  },

  markAsRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    }));
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearAll: () => {
    set({ notifications: [], activePopupId: null });
  },

  setReadByVisibility: (visibleIds) => {
    if (visibleIds.length === 0) {
      return;
    }
    const idSet = new Set(visibleIds);
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.read || !idSet.has(n.id) ? n : { ...n, read: true },
      ),
    }));
  },

  dismissPopup: () => {
    const state = get();
    if (state.activePopupId) {
      const notif = state.notifications.find((n) => n.id === state.activePopupId);
      if (notif && !notif.read) {
        set((s) => ({
          activePopupId: null,
          notifications: s.notifications.map((n) =>
            n.id === state.activePopupId ? { ...n, read: true } : n,
          ),
        }));
      } else {
        set({ activePopupId: null });
      }
    }
  },
});
