# Notification System + Conflict Card + Hover Effects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement notification system (Zustand slice + NotificationCard + dropdown), conflict modal on stash pop failure, and hover effects/tooltips on IconPendingCommit and CopyButton.

**Architecture:** New `notificationSlice` (Zustand) stores `NotificationData[]` with read/unread tracking. `NotificationCard` is a reusable component shared between `ConflictModal` (popup) and `NotificationDropdown` (title bar). Title bar settings button is replaced with a notification button with green unread badge. IconPendingCommit and CopyButton get hover effects and tooltips.

**Tech Stack:** Zustand, IntersectionObserver, `createPortal`, `TooltipSimple`, `CustomScrollArea`

## Global Constraints

- New i18n keys must be added to both `en-US/notification.ts` and `zh-CN/notification.ts`, registered in both locale `index.ts` files
- Use project's custom `CustomScrollArea` component for the notification dropdown scrollable list
- Unread badge uses green background (`--success`), not red
- Modal overlay click does NOT close (must use X button)
- Notification cards must render identically in popup and dropdown
- Settings remains accessible via right panel settings panel only

---

### Task 1: Notification Slice + Types

**Files:**
- Create: `frontend/src/app/stores/slices/notificationSlice.ts`
- Create: `frontend/src/app/stores/slices/notificationSlice.test.ts`
- Modify: `frontend/src/app/stores/slices.ts` (register export)
- Modify: `frontend/src/app/stores/StoreState.ts` (extend interface)
- Modify: `frontend/src/app/stores/slicedStore.ts` (merge slice)

**Interfaces:**
- Consumes: nothing
- Produces: `NotificationSlice` interface with `notifications`, `activePopupId`, `addNotification`, `markAsRead`, `markAllAsRead`, `removeNotification`, `clearAll`, `setReadByVisibility`, `dismissPopup`

- [ ] **Step 1: Create `notificationSlice.ts`**

```ts
import type { StoreState } from '../StoreState';

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
  set: (partial: Partial<NotificationSlice> | ((state: NotificationSlice) => Partial<NotificationSlice>)) => void,
  get: () => NotificationSlice,
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
      activePopupId: state.activePopupId ?? id, // set popup only if none active
    }));
    return id;
  },

  markAsRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
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
    if (visibleIds.length === 0) return;
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
```

- [ ] **Step 2: Create `notificationSlice.test.ts`**

```ts
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
    const id = get().addNotification({ type: 'conflict', title: 'T', summary: 'S', fullInfo: 'F' });
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
    const id1 = get().addNotification({ type: 'conflict', title: 'T1', summary: 'S', fullInfo: 'F' });
    const id2 = get().addNotification({ type: 'conflict', title: 'T2', summary: 'S', fullInfo: 'F' });
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/app/stores/slices/notificationSlice.test.ts`
Expected: FAIL with module not found

- [ ] **Step 4: Register in `frontend/src/app/stores/slices.ts`**

Add after Toast slice export (line 149):
```ts
export { type NotificationSlice, type NotificationData, createNotificationSlice } from './slices/notificationSlice';
```

- [ ] **Step 5: Register in `frontend/src/app/stores/StoreState.ts`**

Add import after line 73:
```ts
import type { NotificationSlice } from './slices/notificationSlice';
```

Add `NotificationSlice` to the interface extends list (after `ToastSlice` on line 129):
```ts
    ToastSlice,
    NotificationSlice {
```

- [ ] **Step 6: Register in `frontend/src/app/stores/slicedStore.ts`**

Add `createNotificationSlice` to the import at line 42:
```ts
  createToastSlice,
  createNotificationSlice,
```

Add the slice merge after line 121:
```ts
  ...createNotificationSlice(set, get), // 通知系统
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/stores/slices/notificationSlice.test.ts`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/stores/slices/notificationSlice.ts frontend/src/app/stores/slices/notificationSlice.test.ts frontend/src/app/stores/slices.ts frontend/src/app/stores/StoreState.ts frontend/src/app/stores/slicedStore.ts
git commit -m "feat: add notification slice with read tracking and popup management"
```

---

### Task 2: i18n Keys + NotificationCard Component + CSS

**Files:**
- Create: `frontend/src/app/i18n/en-US/notification.ts`
- Create: `frontend/src/app/i18n/zh-CN/notification.ts`
- Create: `frontend/src/app/components/NotificationCard.tsx`
- Create: `frontend/src/app/components/NotificationCard.test.tsx`
- Create: `frontend/src/styles/components/notification-card.css`
- Modify: `frontend/src/app/i18n/en-US/index.ts` (register)
- Modify: `frontend/src/app/i18n/zh-CN/index.ts` (register)
- Modify: `frontend/src/app/i18n/en-US/changes.ts` (add `changesPendingCommit`)
- Modify: `frontend/src/app/i18n/zh-CN/changes.ts` (add `changesPendingCommit`)

**Interfaces:**
- Consumes: `NotificationData` (from Task 1)
- Produces: `NotificationCard` component with `NotificationCardProps`

- [ ] **Step 1: Create `frontend/src/app/i18n/en-US/notification.ts`**

```ts
export const notificationEn = {
  notifTitle: 'Notifications',
  notifMarkAllRead: 'Mark all read',
  notifClearAll: 'Clear all',
  notifEmpty: 'No notifications',
} as const;
```

- [ ] **Step 2: Create `frontend/src/app/i18n/zh-CN/notification.ts`**

```ts
export const notificationZh = {
  notifTitle: '通知',
  notifMarkAllRead: '全部已读',
  notifClearAll: '清空',
  notifEmpty: '暂无通知',
} as const;
```

- [ ] **Step 3: Register in both `index.ts`**

In `frontend/src/app/i18n/en-US/index.ts`:
```ts
import { notificationEn } from './notification';
// ...in the object:
  ...notificationEn,
```

In `frontend/src/app/i18n/zh-CN/index.ts`:
```ts
import { notificationZh } from './notification';
// ...in the object:
  ...notificationZh,
```

- [ ] **Step 4: Add `changesPendingCommit` to changes.ts**

In `frontend/src/app/i18n/en-US/changes.ts` (add before `gitModified`):
```ts
  changesPendingCommit: 'Pending changes',
```

In `frontend/src/app/i18n/zh-CN/changes.ts`:
```ts
  changesPendingCommit: '有未提交的更改',
```

- [ ] **Step 5: Create `frontend/src/styles/components/notification-card.css`**

```css
.adl-notif-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  transition: background var(--duration-150) var(--ease-default);
}

.adl-notif-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.adl-notif-card__icon {
  flex-shrink: 0;
  color: var(--warning);
}

.adl-notif-card__title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}

.adl-notif-card__close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: var(--transition-colors);
}

.adl-notif-card__close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.adl-notif-card__body {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.adl-notif-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.adl-notif-card__copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--duration-150) var(--ease-default);
}

.adl-notif-card__copy-btn:hover {
  color: var(--text-primary);
}

.adl-notif-card__time {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}
```

- [ ] **Step 6: Create `frontend/src/app/components/NotificationCard.tsx`**

```tsx
import { useTCopy } from '@i18n/useTCopy';
import { IconAlertTriangle, IconClose } from '@icons';
import { CopyButton } from './CopyButton';
import type { NotificationData } from '@stores/slices/notificationSlice';

interface NotificationCardProps {
  notification: NotificationData;
  onClose: (id: string) => void;
  showCopy?: boolean;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 个月前`;
}

export function NotificationCard({ notification, onClose, showCopy = true }: NotificationCardProps) {
  const { t } = useTCopy();

  return (
    <div className="adl-notif-card" role="alert">
      <div className="adl-notif-card__header">
        <IconAlertTriangle className="adl-notif-card__icon" size={16} />
        <span className="adl-notif-card__title">{notification.title}</span>
        <button
          type="button"
          className="adl-notif-card__close"
          onClick={() => onClose(notification.id)}
          aria-label="Close"
        >
          <IconClose size={14} />
        </button>
      </div>
      <div className="adl-notif-card__body">{notification.summary}</div>
      <div className="adl-notif-card__footer">
        {showCopy && (
          <span className="adl-notif-card__copy-btn">
            <CopyButton text={notification.fullInfo} size={12} tooltip="复制完整冲突信息" tooltipCopied="已复制" />
          </span>
        )}
        <span className="adl-notif-card__time">{formatRelativeTime(notification.timestamp)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `frontend/src/app/components/NotificationCard.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationCard } from './NotificationCard';
import type { NotificationData } from '@stores/slices/notificationSlice';

const mockNotif: NotificationData = {
  id: 'n1',
  type: 'conflict',
  title: 'Merge conflict',
  summary: '2 files with conflicts',
  fullInfo: 'Full details here',
  timestamp: Date.now() - 120000,
  read: false,
};

describe('NotificationCard', () => {
  it('renders title and summary', () => {
    render(<NotificationCard notification={mockNotif} onClose={vi.fn()} />);
    expect(screen.getByText('Merge conflict')).toBeTruthy();
    expect(screen.getByText('2 files with conflicts')).toBeTruthy();
  });

  it('calls onClose when X is clicked', () => {
    const onClose = vi.fn();
    render(<NotificationCard notification={mockNotif} onClose={onClose} />);
    screen.getByRole('button', { name: /close/i }).click();
    expect(onClose).toHaveBeenCalledWith('n1');
  });

  it('renders relative time', () => {
    render(<NotificationCard notification={mockNotif} onClose={vi.fn()} />);
    expect(screen.getByText(/2 分钟前/)).toBeTruthy();
  });
});
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/components/NotificationCard.test.tsx src/app/stores/slices/notificationSlice.test.ts`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/i18n/en-US/notification.ts frontend/src/app/i18n/zh-CN/notification.ts frontend/src/app/i18n/en-US/index.ts frontend/src/app/i18n/zh-CN/index.ts frontend/src/app/i18n/en-US/changes.ts frontend/src/app/i18n/zh-CN/changes.ts frontend/src/app/components/NotificationCard.tsx frontend/src/app/components/NotificationCard.test.tsx frontend/src/styles/components/notification-card.css
git commit -m "feat: add i18n keys and NotificationCard component"
```

---

### Task 3: Conflict Detection in gitActions + ConflictModal + App.tsx Wiring

**Files:**
- Create: `frontend/src/app/components/ConflictModal.tsx`
- Create: `frontend/src/app/components/ConflictModal.test.tsx`
- Create: `frontend/src/styles/components/conflict-modal.css`
- Modify: `frontend/src/app/stores/actions/gitActions.ts` (add notification on conflict)
- Modify: `frontend/src/app/App.tsx` (add ConflictModal)

**Interfaces:**
- Consumes: `notificationSlice.addNotification`, `notificationSlice.activePopupId`, `notificationSlice.notifications`, `notificationSlice.dismissPopup`, `NotificationCard`
- Produces: ConflictModal wired into App.tsx

- [ ] **Step 1: Create `frontend/src/styles/components/conflict-modal.css`**

```css
.adl-conflict-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 1000);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.adl-conflict-modal {
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl, 0 8px 32px rgba(0, 0, 0, 0.24));
  overflow-y: auto;
  padding: 4px;
}
```

- [ ] **Step 2: Create `frontend/src/app/components/ConflictModal.tsx`**

```tsx
import { createPortal } from 'react-dom';
import { NotificationCard } from './NotificationCard';
import type { NotificationData } from '@stores/slices/notificationSlice';

interface ConflictModalProps {
  notification: NotificationData;
  onDismiss: (id: string) => void;
}

export function ConflictModal({ notification, onDismiss }: ConflictModalProps) {
  return createPortal(
    <div className="adl-conflict-modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="adl-conflict-modal" role="dialog" aria-modal="true">
        <NotificationCard notification={notification} onClose={onDismiss} />
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 3: Create `frontend/src/app/components/ConflictModal.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConflictModal } from './ConflictModal';
import type { NotificationData } from '@stores/slices/notificationSlice';

const mockNotif: NotificationData = {
  id: 'n1', type: 'conflict', title: 'Conflict', summary: 'Summary',
  fullInfo: 'Details', timestamp: Date.now(), read: false,
};

describe('ConflictModal', () => {
  it('renders NotificationCard', () => {
    render(<ConflictModal notification={mockNotif} onDismiss={vi.fn()} />);
    expect(screen.getByText('Conflict')).toBeTruthy();
  });

  it('calls onDismiss when X is clicked', () => {
    const onDismiss = vi.fn();
    render(<ConflictModal notification={mockNotif} onDismiss={onDismiss} />);
    screen.getByRole('button', { name: /close/i }).click();
    expect(onDismiss).toHaveBeenCalledWith('n1');
  });
});
```

- [ ] **Step 4: Modify `gitActions.ts` to add notification on conflict**

Replace the `switchGitBranch` function body (lines 167-186):

```ts
    switchGitBranch: async (input: WorkspaceGitBranchSwitchInput) => {
      clearError(get);
      const result = await window.digitalLife.workspace.switchGitBranch(input);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      const { hasRestored, gitSnapshot, previousBranch, currentBranch } = result.data;
      set((state: StoreState) => ({
        appInfo: state.appInfo
          ? {
              ...state.appInfo,
              currentWorkspace: result.data.workspace,
            }
          : state.appInfo,
        gitSnapshot: gitSnapshot,
        gitStashRestored: hasRestored,
        workspaceContextMode: 'workspace' as const,
      }));
      if (!hasRestored && gitSnapshot.conflicts.length > 0) {
        const summary = `检测到 ${gitSnapshot.conflicts.length} 个文件的合并冲突`;
        const fullInfo = [
          `冲突操作: Stash pop 恢复暂存变更`,
          `从分支: ${previousBranch ?? 'unknown'}`,
          `切换到: ${currentBranch}`,
          `发生时间: ${new Date().toISOString()}`,
          `冲突文件:`,
          ...gitSnapshot.conflicts.map(f => `  - ${f}`),
        ].join('\n');
        get().addNotification({
          type: 'conflict',
          title: '合并冲突',
          summary,
          fullInfo,
        });
      }
      await refreshAfterBranchChange(get);
    },
```

- [ ] **Step 5: Wire ConflictModal into `App.tsx`**

Add imports at top of `App.tsx`:
```tsx
import { ConflictModal } from './components/ConflictModal';
import { useAppStore } from '@stores/slicedStore';
```

After the `toasts` and `removeToast` lines, add:
```tsx
  const notifications = useAppStore((s) => s.notifications);
  const activePopupId = useAppStore((s) => s.activePopupId);
  const dismissPopup = useAppStore((s) => s.dismissPopup);

  const activeNotification = useMemo(
    () => notifications.find((n) => n.id === activePopupId),
    [notifications, activePopupId]
  );
```

Before `</TCopyProvider>`, add:
```tsx
      {activeNotification && (
        <ConflictModal
          notification={activeNotification}
          onDismiss={dismissPopup}
        />
      )}
```

Note: The `useMemo` import might need to be added if not already present.

- [ ] **Step 6: Run tests**

Run: `cd frontend && npx vitest run src/app/components/ConflictModal.test.tsx src/app/stores/slices/notificationSlice.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Verify tsc**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 new errors (pre-existing errors allowed)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/components/ConflictModal.tsx frontend/src/app/components/ConflictModal.test.tsx frontend/src/styles/components/conflict-modal.css frontend/src/app/stores/actions/gitActions.ts frontend/src/app/App.tsx
git commit -m "feat: add conflict detection in gitActions and ConflictModal popup"
```

---

### Task 4: TitleBar Notification Button + Dropdown

**Files:**
- Create: `frontend/src/styles/components/notification-badge.css`
- Create: `frontend/src/styles/components/notification-dropdown.css`
- Modify: `frontend/src/app/regions/TitleBar.tsx`

**Interfaces:**
- Consumes: `notificationSlice.notifications`, `notificationSlice.markAsRead`, `notificationSlice.markAllAsRead`, `notificationSlice.clearAll`, `notificationSlice.setReadByVisibility`, `NotificationCard`
- Produces: Notification button in title bar, dropdown with scrollable card list, IntersectionObserver read tracking

- [ ] **Step 1: Create `frontend/src/styles/components/notification-badge.css`**

```css
.adl-notif-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--success);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
}
```

- [ ] **Step 2: Create `frontend/src/styles/components/notification-dropdown.css`**

```css
.adl-notif-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: var(--z-dropdown, 500);
  width: 420px;
  max-height: 480px;
  background: var(--bg-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl, 0 8px 32px rgba(0, 0, 0, 0.24));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.adl-notif-dropdown::before {
  content: '';
  position: absolute;
  top: -6px;
  right: 18px;
  width: 12px;
  height: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-default);
  border-right: none;
  border-bottom: none;
  transform: rotate(45deg);
}

.adl-notif-dropdown__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.adl-notif-dropdown__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.adl-notif-dropdown__actions {
  display: flex;
  gap: 6px;
}

.adl-notif-dropdown__action-btn {
  font-size: 11px;
  padding: 3px 8px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: var(--transition-colors);
}

.adl-notif-dropdown__action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.adl-notif-dropdown__body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.adl-notif-dropdown__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  font-size: 13px;
  color: var(--text-muted);
}
```

- [ ] **Step 3: Create `IconBell` in `frontend/src/app/icons/status.tsx`**

Add alongside other status icons (before `IconPendingCommit`):
```tsx
export const IconBell = make(
  <>
    <path d="M18 8a6 6 0 0 0 -12 0c0 7 -3 9 -3 9h18s-3 -2 -3 -9" />
    <path d="M13.73 21a2 2 0 0 1 -3.46 0" />
  </>
);
```

Register in `frontend/src/app/icons/index.ts` (in the status export block):
```ts
  IconBell,
```

- [ ] **Step 4: Modify `frontend/src/app/regions/TitleBar.tsx`**

Add imports at top:
```tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { IconBell, IconX } from '@icons';
import { useAppStore } from '@stores/slicedStore';
import { NotificationCard } from '@components/NotificationCard';
```

Replace the settings button (lines 320-329) with the notification button and dropdown:

```tsx
{/* Notification button */}
<TooltipSimple content="通知" placement="bottom">
  <button
    type="button"
    className="adl-icon-btn adl-iconstrip__button"
    onClick={toggleNotifDropdown}
    aria-label="通知"
    style={{ position: 'relative' }}
  >
    <IconBell size={16} decorative />
    {unreadCount > 0 && (
      <span className="adl-notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
    )}
  </button>
</TooltipSimple>
```

Add state and handlers in the component body (after `const { t } = useTCopy();`):
```tsx
  const notifications = useAppStore((s) => s.notifications);
  const markAsRead = useAppStore((s) => s.markAsRead);
  const markAllAsRead = useAppStore((s) => s.markAllAsRead);
  const clearAll = useAppStore((s) => s.clearAll);
  const setReadByVisibility = useAppStore((s) => s.setReadByVisibility);
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const notifListRef = useRef<HTMLDivElement>(null);

  const toggleNotifDropdown = useCallback(() => {
    setNotifOpen((v) => !v);
  }, []);

  // close on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [notifOpen]);

  // close on Escape
  useEffect(() => {
    if (!notifOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [notifOpen]);

  // IntersectionObserver for read tracking
  useEffect(() => {
    if (!notifOpen || !notifListRef.current) return;
    const container = notifListRef.current;
    const unreadCards = container.querySelectorAll('[data-notif-id]');
    if (unreadCards.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleIds = entries
          .filter((e) => e.isIntersecting)
          .map((e) => (e.target as HTMLElement).getAttribute('data-notif-id')!)
          .filter(Boolean);
        if (visibleIds.length > 0) {
          setReadByVisibility(visibleIds);
        }
      },
      { root: container, threshold: 0.5 }
    );
    unreadCards.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [notifOpen, setReadByVisibility]);
```

Note: The `notifListRef` requires adding `data-notif-id` attribute to each card wrapper in the dropdown rendering section. But since `NotificationCard` doesn't have this attribute, we need to wrap it in a div with `data-notif-id`.

Replace the settings button block and add the dropdown (near where settings button was):

```tsx
{/* Action group — 3 buttons: theme, lang, notifications */}
<div className="adl-titlebar__action-group" ref={notifRef}>
  {/* Theme toggle */}
  <TooltipSimple content={t.themeToggle} placement="bottom">
    <button
      type="button"
      className="adl-icon-btn adl-iconstrip__button"
      onClick={toggleTheme}
      aria-label={t.themeToggle}
    >
      <ThemeIcon theme={theme} size={16} />
    </button>
  </TooltipSimple>
  {/* Language toggle */}
  <TooltipSimple content={t.langToggle} placement="bottom">
    <button
      type="button"
      className="adl-icon-btn adl-iconstrip__button"
      onClick={toggleLang}
      aria-label={t.langToggle}
    >
      <LanguageIcon lang={lang} size={16} />
    </button>
  </TooltipSimple>
  {/* Notifications */}
  <TooltipSimple content="通知" placement="bottom">
    <button
      type="button"
      className="adl-icon-btn adl-iconstrip__button"
      onClick={toggleNotifDropdown}
      aria-label="通知"
      style={{ position: 'relative' }}
    >
      <IconBell size={16} decorative />
      {unreadCount > 0 && (
        <span className="adl-notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
      )}
    </button>
  </TooltipSimple>
  {notifOpen && (
    <div className="adl-notif-dropdown">
      <div className="adl-notif-dropdown__header">
        <span className="adl-notif-dropdown__title">{t.notifTitle}</span>
        <div className="adl-notif-dropdown__actions">
          <button type="button" className="adl-notif-dropdown__action-btn" onClick={markAllAsRead}>
            {t.notifMarkAllRead}
          </button>
          <button type="button" className="adl-notif-dropdown__action-btn" onClick={clearAll}>
            {t.notifClearAll}
          </button>
        </div>
      </div>
      <div className="adl-notif-dropdown__body" ref={notifListRef}>
        {notifications.length === 0 ? (
          <div className="adl-notif-dropdown__empty">{t.notifEmpty}</div>
        ) : (
          notifications.map((n) => (
            <div key={n.id} data-notif-id={n.id}>
              <NotificationCard
                notification={n}
                onClose={(id) => {
                  markAsRead(id);
                }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )}
</div>
```

Note: You'll need to check what the existing action group looks like in the current TitleBar.tsx. The settings button was the 3rd button in `.adl-titlebar__action-group`. We replace it with the notification button. The theme and lang buttons stay as-is.

- [ ] **Step 4: Verify tsc**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 new errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/components/notification-badge.css frontend/src/styles/components/notification-dropdown.css frontend/src/app/regions/TitleBar.tsx
git commit -m "feat: replace settings button with notification button and dropdown in title bar"
```

---

### Task 5: Hover Effects + Tooltips

**Files:**
- Modify: `frontend/src/styles/components/copy-button.css` (enhance hover)
- Modify: `frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx` (wrap IconPendingCommit in TooltipSimple + add hover CSS class)

**Interfaces:**
- Consumes: `TooltipSimple`, `changesPendingCommit` i18n key
- Produces: visual hover effects and tooltip on IconPendingCommit and CopyButton

- [ ] **Step 1: Enhance `copy-button.css` hover**

Replace the existing `.adl-copy-btn:hover` rule (add `background: var(--bg-hover)`):

```css
.adl-copy-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
```

- [ ] **Step 2: Add IconPendingCommit hover + tooltip in `BranchSubCard.tsx`**

Add import for `TooltipSimple`:
```tsx
import { TooltipSimple } from '@components/Tooltip';
```

Add a CSS class for the pending commit icon hover (in `branch-sub-card.css` or inline - check if a CSS file exists for BranchSubCard). Let me check...

Actually, looking at the project structure, there's `frontend/src/styles/regions/rightpanel/changes-panel.css` which was used for BranchSubCard. I need to add hover CSS there.

Check the existing changes-panel.css to see if there's already styles for IconPendingCommit in BranchSubCard.

Actually, let me keep it simple - I can add the styles directly in the CSS file. Let me check what CSS file is associated with BranchSubCard.

Looking at the exploration results, I see `changes-panel.css` is the relevant CSS file. Let me add the hover style there.

Alternatively, I can add a generic `.adl-icon-pending-commit` class directly in the component or in a CSS module.

Actually, looking at the BranchSubCard rendering, the `IconPendingCommit` is rendered as an SVG directly. I should wrap it in a `span` with a CSS class for hover effects, and also wrap in `TooltipSimple`.

Current code (line 196):
```tsx
{(branch.hasStash || (branch.name === currentBranch && hasDirtyChanges)) ? <IconPendingCommit size={14} decorative /> : null}
```

New code:
```tsx
{(branch.hasStash || (branch.name === currentBranch && hasDirtyChanges)) ? (
  <TooltipSimple content={t.changesPendingCommit as string} placement="top">
    <span className="adl-icon-pending-commit"><IconPendingCommit size={14} decorative /></span>
  </TooltipSimple>
) : null}
```

And add CSS to `changes-panel.css`:
```css
.adl-icon-pending-commit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  transition: var(--transition-colors);
  cursor: default;
}

.adl-icon-pending-commit:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
```

- [ ] **Step 3: Verify tsc and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint .`
Expected: 0 new errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/components/copy-button.css frontend/src/styles/regions/rightpanel/changes-panel.css frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx
git commit -m "feat: add hover effects and tooltips for IconPendingCommit and CopyButton"
```

---

## Execution

Plan complete and saved to `docs/plans/2026-07-10-notification-system-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
