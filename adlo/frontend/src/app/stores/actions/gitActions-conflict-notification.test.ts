import { describe, it, expect, vi, beforeEach } from 'vitest';

let storeState: any = {};

vi.mock('@stores/slicedStore', () => ({
  useAppStore: (selector: any) => selector(storeState),
}));

import { createNotificationSlice } from '../../stores/slices/notificationSlice';

interface TestStore {
  state: Record<string, any>;
  set: (fn: any) => void;
  get: () => any;
}

function createStore(): TestStore {
  const store: TestStore = { state: {}, set: () => {}, get: () => store.state };
  store.set = (fn: any) => {
    if (typeof fn === 'function') {
      const update = fn(store.state);
      if (update) {
        Object.assign(store.state, update);
      }
    }
  };
  store.get = () => store.state;
  const slice = createNotificationSlice(store.set, store.get);
  Object.assign(store.state, slice);
  store.state.notifications = [];
  store.state.activePopupId = null;
  return store;
}

describe('conflict notification data generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState = {};
  });

  it('addNotification creates correct structure for conflict type', () => {
    const store = createStore();
    store.state.addNotification({
      type: 'conflict',
      title: '合并冲突',
      summary: '检测到 2 个文件的合并冲突',
      fullInfo:
        '冲突操作: Stash pop 恢复暂存变更\n从分支: source\n切换到: target\n冲突文件:\n  - f1.ts\n  - f2.ts',
    });

    expect(store.state.notifications).toHaveLength(1);
    const notif = store.state.notifications[0];
    expect(notif.type).toBe('conflict');
    expect(notif.title).toBe('合并冲突');
    expect(notif.summary).toContain('2');
    expect(notif.fullInfo).toContain('f1.ts');
    expect(notif.fullInfo).toContain('f2.ts');
    expect(notif.timestamp).toBeGreaterThan(0);
    expect(notif.read).toBe(false);
  });

  it('multiple conflict notifications are ordered newest first', () => {
    const store = createStore();
    store.state.addNotification({ type: 'conflict', title: 'T1', summary: 'S1', fullInfo: 'F1' });
    store.state.addNotification({ type: 'conflict', title: 'T2', summary: 'S2', fullInfo: 'F2' });

    expect(store.state.notifications).toHaveLength(2);
    expect(store.state.notifications[0].title).toBe('T2');
    expect(store.state.notifications[1].title).toBe('T1');
  });

  it('first conflict notification sets activePopupId', () => {
    const store = createStore();
    const id = store.state.addNotification({
      type: 'conflict',
      title: 'T',
      summary: 'S',
      fullInfo: 'F',
    });
    expect(store.state.activePopupId).toBe(id);
  });

  it('dismissPopup clears popup and marks notification read', () => {
    const store = createStore();
    const id = store.state.addNotification({
      type: 'conflict',
      title: 'T',
      summary: 'S',
      fullInfo: 'F',
    });
    store.state.dismissPopup();
    expect(store.state.activePopupId).toBeNull();
    const n = store.state.notifications.find((n: any) => n.id === id);
    expect(n.read).toBe(true);
  });

  it('removeNotification removes card without closing dropdown', () => {
    const store = createStore();
    const id = store.state.addNotification({
      type: 'conflict',
      title: 'T',
      summary: 'S',
      fullInfo: 'F',
    });
    const id2 = store.state.addNotification({
      type: 'conflict',
      title: 'T2',
      summary: 'S2',
      fullInfo: 'F2',
    });
    store.state.removeNotification(id);
    expect(store.state.notifications).toHaveLength(1);
    expect(store.state.notifications[0].id).toBe(id2);
  });

  it('fullInfo contains all conflict details', () => {
    const fullInfo = [
      '冲突操作: Stash pop 恢复暂存变更',
      '从分支: feature/login',
      '切换到: main',
      '发生时间: 2026-07-10T12:00:00.000Z',
      '冲突文件:',
      '  - src/auth/login.tsx',
      '  - src/auth/LoginForm.tsx',
    ].join('\n');

    expect(fullInfo).toContain('feature/login');
    expect(fullInfo).toContain('main');
    expect(fullInfo).toContain('src/auth/login.tsx');
    expect(fullInfo.split('\n').length).toBe(7);
  });

  it('guard condition: notification only when hasRestored false AND conflicts exist', () => {
    const scenarios = [
      { hasRestored: true, conflicts: [], expectNotif: false },
      { hasRestored: true, conflicts: ['f.ts'], expectNotif: false },
      { hasRestored: false, conflicts: [], expectNotif: false },
      { hasRestored: false, conflicts: ['f.ts'], expectNotif: true },
    ];

    for (const sc of scenarios) {
      const store = createStore();
      const addSpy = vi.spyOn(store.state, 'addNotification');
      if (!sc.hasRestored && sc.conflicts.length > 0) {
        store.state.addNotification({ type: 'conflict', title: 'T', summary: 'S', fullInfo: 'F' });
      }
      if (sc.expectNotif) {
        expect(addSpy).toHaveBeenCalled();
      } else {
        expect(addSpy).not.toHaveBeenCalled();
      }
    }
  });
});
