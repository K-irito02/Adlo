export interface NotificationData {
  id: string;
  type: 'conflict';
  title: string;
  summary: string;
  fullInfo: string;
  timestamp: number;
  read: boolean;
}

export interface NotificationSlice {
  notifications: NotificationData[];
  activePopupId: string | null;

  addNotification: (data: Omit<NotificationData, 'id' | 'timestamp' | 'read'>) => string;
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
    partial: Partial<NotificationSlice> | ((state: NotificationSlice) => Partial<NotificationSlice>)
  ) => void,
  get: () => NotificationSlice
): NotificationSlice => ({
  notifications: [],
  activePopupId: null,

  addNotification: (data) => {
    const id = notifId();
    const notification: NotificationData = {
      ...data,
      id,
      timestamp: Date.now(),
      read: false,
    };
    set((state) => ({
      notifications: [notification, ...state.notifications],
      activePopupId: state.activePopupId ?? id,
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
        n.read || !idSet.has(n.id) ? n : { ...n, read: true }
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
            n.id === state.activePopupId ? { ...n, read: true } : n
          ),
        }));
      } else {
        set({ activePopupId: null });
      }
    }
  },
});
