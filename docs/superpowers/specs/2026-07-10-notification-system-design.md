# Notification System + Conflict Card + Hover Effects

**Date:** 2026-07-10
**Status:** Draft

## Overview

Three related sub-requirements:

1. **Hover effects & tooltips** on IconPendingCommit (待提交) and CopyButton (复制)
2. **Conflict notification card** — a modal-style popup replacing toast when stash pop conflict occurs
3. **Notification system** — global notification center replacing the settings button in the title bar, with unread tracking, "mark all read" / "clear all" controls, and a dropdown menu listing all notification cards

## Architecture

```
notificationSlice (Zustand)
  ├─ notifications: NotificationData[]
  ├─ activePopupId: string | null
  └─ methods: add, markAsRead, markAllAsRead, remove, clearAll, setReadByVisibility

NotificationCard (reusable)
  ├─ used in: ConflictModal (popup)
  └─ used in: NotificationDropdown (notification center)

TitleBar
  └─ [NotificationButton] (replaces [SettingsButton])
      └─ NotificationDropdown (large menu card with scrollable list)

App.tsx
  └─ ConflictModal (conditional, driven by activePopupId)
```

### Data Flow (stash pop conflict path)

```
git switch → stash pop conflict
  → pop_auto_stash returns Ok(false)
  → switch_git_branch returns { hasRestored: false, gitSnapshot.conflicts: [...] }
  → gitActions.ts switchGitBranch:
       detect hasRestored === false && conflicts.length > 0
       → set({ ...gitSnapshot, ... }) + addNotification({ type: 'conflict', ... })
  → notificationSlice.addNotification → unreadCount++
  → App.tsx watch: new unread conflict → set activePopupId
  → ConflictModal renders NotificationCard
```

## Data Model

### NotificationData

```ts
interface NotificationData {
  id: string;
  type: 'conflict';                   // union type, extensible
  title: string;                      // e.g. "合并冲突"
  summary: string;                    // shown on card, e.g. "检测到 3 个文件的合并冲突"
  fullInfo: string;                   // complete detail, copied via CopyButton
  timestamp: number;                  // Date.now()
  read: boolean;
}
```

### NotificationSlice (Zustand)

```ts
interface NotificationSlice {
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

// Derived:
// unreadCount = notifications.filter(n => !n.read).length
```

### Read / Unread Rules

- **Unread**: newly created notification (`read: false`)
- **Read** (two paths):
  1. User clicks X on the notification card (popup modal or dropdown)
  2. Notification enters visible area in the dropdown (detected via IntersectionObserver)
- Marking read never deletes the notification; it persists in the list until explicitly cleared

## NotificationCard Component

### Props

```ts
interface NotificationCardProps {
  notification: NotificationData;
  onClose: (id: string) => void;
  showCopy?: boolean;       // default true
}
```

### Layout

```
┌────────────────────────────────────────────┐
│ [type icon]  title                [X btn]  │
│                                            │
│  summary text (1-2 lines)                  │
│                                            │
│  [CopyButton "复制完整冲突信息"]   relative time │
└────────────────────────────────────────────┘
```

- **Type icon**: `IconAlertTriangle` for `conflict` type
- **Title**: bold, left-aligned
- **Summary**: secondary text color
- **CopyButton**: reuses existing `CopyButton` component, copies `fullInfo` to clipboard; tooltip text says "复制完整冲突信息"
- **Relative time**: shown in bottom-right, format like "1 分钟前", "2 小时前" — consistent with project's existing relative time pattern
- **X close button**: top-right, calls `onClose(id)` → marks as read + removes popup

### States

- **Normal**: as above
- **Long summary**: CSS `line-clamp` to limit to 2 lines; full content available via CopyButton

## Conflict Notification Flow

### Detection in gitActions.ts

Inside `switchGitBranch`, after successful IPC call:

```ts
const result = await window.digitalLife.workspace.switchGitBranch(input);
if (result.ok) {
  const { hasRestored, gitSnapshot, previousBranch, currentBranch } = result.data;
  // ... existing store updates ...

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
}
```

### Modal Popup

- `App.tsx` watches `notifications` array. When a new unread `conflict` notification appears and no popup is active, sets `activePopupId`.
- `ConflictModal` renders a centered modal with semi-transparent overlay:
  - Contains a `NotificationCard`
  - Clicking overlay backdrop does NOT dismiss (must click X)
  - X button calls `dismissPopup()` → clears `activePopupId` + `markAsRead(id)`
- The same notification remains in the notification center dropdown.

### ConflictModal Component

- Uses `createPortal` to `document.body`
- Full-screen fixed overlay (`position: fixed; inset: 0`)
- Centered card with max-width, drop shadow
- Z-index above all other UI (`--z-modal` or similar)

## Notification Center

### Title Bar Button

Replace the existing settings button in `.adl-titlebar__action-group`:

```tsx
<button type="button" className="..." onClick={toggleDropdown} aria-label="通知">
  <IconBell size={16} decorative />
  {unreadCount > 0 && (
    <span className="adl-notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
  )}
</button>
```

- Tooltip: `"通知"`
- Badge: green background (`--success` or custom green), white text, absolutely positioned at top-right corner of the button
- Badge hidden when `unreadCount === 0`

### Notification Dropdown

- Positioned absolutely below the title bar right section
- Arrow pointer connecting to the notification button
- Top bar: title "通知" + "全部已读" button + "清空" button
- Body: scrollable list of `NotificationCard` items using the project's custom `CustomScrollArea` component
- Each card has its own X close button and timestamp
- Empty state: centered text "暂无通知"
- Close on: clicking outside, Escape key, selecting a card action

### IntersectionObserver for Read Tracking

- `NotificationDropdown` uses `IntersectionObserver` on each card element
- When a card enters the visible viewport within the dropdown, call `markAsRead(id)`
- Observed only when dropdown is open; disconnect on close

### Layout

```
  [Bell icon + badge]  ← title bar button
       ▼
┌──────────────────────────────────┐
│  ▼                               │
│ 通知           [全部已读] [清空]   │
├──────────────────────────────────┤
│ ┌──────────────────────────────┐ │
│ │ NotificationCard      [X]   │ │
│ │                       时间戳  │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ NotificationCard      [X]   │ │
│ │                       时间戳  │ │
│ └──────────────────────────────┘ │
│         (暂无通知)                │
└──────────────────────────────────┘
```

## Conflict Info Generation

When generating `fullInfo` for conflict notifications, include:

- Operation description ("Stash pop 恢复暂存变更")
- Source branch and target branch
- Timestamp (ISO 8601)
- Full conflict file list (one per line, prefixed with `-`)
- (Future) git status raw output if available

## Hover Effects & Tooltips

### IconPendingCommit

- Add CSS class `.adl-icon-pending-commit` (or extend `adl-icon-btn` pattern)
- Hover effect: `background: var(--bg-hover); color: var(--text-primary)` (matching `adl-icon-btn` pattern)
- Wrap in `TooltipSimple` with tooltip text key `changesPendingCommit`, value "有未提交的更改" / "Pending changes"

### CopyButton Enhancement

- Enhance existing hover: add `background: var(--bg-hover)` (currently only changes text color)
- Existing `TooltipSimple` already present — no change needed

## Files to Create/Modify

### New Files
- `frontend/src/app/stores/slices/notificationSlice.ts` — Zustand slice
- `frontend/src/app/stores/slices/notificationSlice.test.ts` — unit tests
- `frontend/src/app/components/NotificationCard.tsx` — reusable card
- `frontend/src/app/components/NotificationCard.test.tsx` — unit tests
- `frontend/src/app/components/ConflictModal.tsx` — modal popup
- `frontend/src/app/components/ConflictModal.test.tsx` — unit tests
- `frontend/src/styles/components/notification-card.css` — card styles
- `frontend/src/styles/components/notification-dropdown.css` — dropdown styles
- `frontend/src/styles/components/notification-badge.css` — badge styles
- `frontend/src/styles/components/conflict-modal.css` — modal overlay styles

### Modified Files
- `frontend/src/app/stores/slices.ts` — register notificationSlice
- `frontend/src/app/stores/StoreState.ts` — add NotificationSlice type
- `frontend/src/app/regions/TitleBar.tsx` — replace Settings btn with Notification btn
- `frontend/src/app/App.tsx` — add ConflictModal
- `frontend/src/app/stores/actions/gitActions.ts` — add notification on conflict
- `frontend/src/app/icons/status.tsx` — (maybe no change, IconPendingCommit exists)
- `frontend/src/styles/components/copy-button.css` — add background on hover
- `frontend/src/app/i18n/en-US/changes.ts` — new i18n keys
- `frontend/src/app/i18n/zh-CN/changes.ts` — new i18n keys

### New i18n Keys

| Key | en-US | zh-CN |
|-----|-------|-------|
| `changesPendingCommit` | "Pending changes" | "有未提交的更改" |
| `notifTitle` | "Notifications" | "通知" |
| `notifMarkAllRead` | "Mark all read" | "全部已读" |
| `notifClearAll` | "Clear all" | "清空" |
| `notifEmpty` | "No notifications" | "暂无通知" |
| `notifConflictTitle` | "Merge conflict" | "合并冲突" |
| `notifConflictSummary` | "Detected {count} file(s) with merge conflicts" | "检测到 {count} 个文件的合并冲突" |
| `notifCopyFullInfo` | "Copy full conflict details" | "复制完整冲突信息" |

## Edge Cases & Error Handling

| Scenario | Behavior |
|----------|----------|
| Stash pop succeeds (no conflict) | No notification generated |
| Stash pop conflict with 0 conflict files (shouldn't happen) | Guard: only generate if `conflicts.length > 0` |
| Multiple conflicts in quick succession | Each generates a separate notification; only the latest one shows as popup modal; all appear in dropdown |
| User closes modal but doesn't view dropdown | Notification is marked read (by modal close action) |
| User opens dropdown, sees cards, closes | Cards visible in viewport are marked read; off-screen remain unread until scrolled into view |
| `clearAll()` removes all notifications | Badge disappears |
| `markAllAsRead()` marks all as read | Badge disappears |
| 100+ notifications | Scrollable list, no limit |
| Settings still accessible | Via right panel settings panel |

## Testing

- **notificationSlice.test.ts**: add, markAsRead, markAllAsRead, remove, clearAll, setReadByVisibility, unreadCount derived
- **NotificationCard.test.tsx**: renders title/summary/time, CopyButton click copies fullInfo, X close fires callback
- **ConflictModal.test.tsx**: renders card, X closes, overlay click does not close
- **gitActions test update**: verify `addNotification` is called when `hasRestored === false && conflicts.length > 0`
