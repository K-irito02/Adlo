import { describe, it, expect } from 'vitest';
import { createNotificationSlice } from './notificationSlice';
import type { NotificationSlice, NotificationData } from './notificationSlice';

function createStore() {
  let state: NotificationSlice = {} as NotificationSlice;
  const get = () => state;
  const set = (partial: any) => {
    if (typeof partial === 'function') {
      state = { ...state, ...partial(state) };
    } else {
      state = { ...state, ...partial };
    }
  };
  state = createNotificationSlice(set as any, get as any);
  return { get, set };
}

describe('notificationSlice', () => {
  it('addNotification adds to front with read=false and timestamp', () => {
    const { get } = createStore();
    const id = get().addNotification({ type: 'conflict', title: 'T', summary: 'S', fullInfo: 'F' });
    expect(get().notifications).toHaveLength(1);
    expect(get().notifications[0].id).toBe(id);
    expect(get().notifications[0].read).toBe(false);
    expect(get().notifications[0].timestamp).toBeGreaterThan(0);
  });

  it('addNotification sets activePopupId when none active', () => {
    const { get } = createStore();
    get().addNotification({ type: 'conflict', title: 'T', summary: 'S', fullInfo: 'F' });
    expect(get().activePopupId).toBe(get().notifications[0].id);
  });

  it('addNotification does not overwrite existing activePopupId', () => {
    const { get } = createStore();
    get().addNotification({ type: 'conflict', title: 'T', summary: 'S', fullInfo: 'F' });
    const firstId = get().activePopupId;
    get().addNotification({ type: 'conflict', title: 'T2', summary: 'S2', fullInfo: 'F2' });
    expect(get().activePopupId).toBe(firstId);
  });

  it('markAsRead sets read=true', () => {
    const { get } = createStore();
    const id = get().addNotification({ type: 'conflict', title: 'T', summary: 'S', fullInfo: 'F' });
    get().markAsRead(id);
    expect(get().notifications[0].read).toBe(true);
  });

  it('markAllAsRead sets all read=true', () => {
    const { get } = createStore();
    get().addNotification({ type: 'conflict', title: 'T1', summary: 'S', fullInfo: 'F' });
    get().addNotification({ type: 'conflict', title: 'T2', summary: 'S', fullInfo: 'F' });
    get().markAllAsRead();
    expect(get().notifications.every((n: NotificationData) => n.read)).toBe(true);
  });

  it('removeNotification removes by id', () => {
    const { get } = createStore();
    const id = get().addNotification({ type: 'conflict', title: 'S', summary: 'S', fullInfo: 'F' });
    get().removeNotification(id);
    expect(get().notifications).toHaveLength(0);
  });

  it('clearAll empties everything', () => {
    const { get } = createStore();
    get().addNotification({ type: 'conflict', title: 'T', summary: 'S', fullInfo: 'F' });
    get().addNotification({ type: 'conflict', title: 'T2', summary: 'S2', fullInfo: 'F2' });
    get().clearAll();
    expect(get().notifications).toHaveLength(0);
    expect(get().activePopupId).toBeNull();
  });

  it('setReadByVisibility marks visible unread notifications', () => {
    const { get } = createStore();
    const id1 = get().addNotification({
      type: 'conflict',
      title: 'T1',
      summary: 'S',
      fullInfo: 'F',
    });
    const id2 = get().addNotification({
      type: 'conflict',
      title: 'T2',
      summary: 'S',
      fullInfo: 'F',
    });
    get().setReadByVisibility([id1]);
    const n1 = get().notifications.find((n: NotificationData) => n.id === id1);
    const n2 = get().notifications.find((n: NotificationData) => n.id === id2);
    expect(n1?.read).toBe(true);
    expect(n2?.read).toBe(false);
  });

  it('dismissPopup clears activePopupId and marks read', () => {
    const { get } = createStore();
    get().addNotification({ type: 'conflict', title: 'T', summary: 'S', fullInfo: 'F' });
    get().dismissPopup();
    expect(get().activePopupId).toBeNull();
    expect(get().notifications[0].read).toBe(true);
  });
});
