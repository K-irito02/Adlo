# 书签对话框 Store 模式与音频调试 — 2026-06-28

## 背景

书签对话框（BookmarkToFolderDialog）的触发机制从 callback chain 改为 store-based 模式；同时排查了音频图标在暂停后未能隐藏的假报问题。

## 书签对话框 Store 模式

### 问题

右键菜单"收藏标签"触发的书签对话框无响应。原实现通过 `onBookmarkTab` callback chain 从 `BrowserEntrySubEntries` → `SectionCallbacks` → `BrowserTabTreeCallbacks` → `BrowserNavigatorProps` → `BrowserPanelContentProps` → `useBrowserDialogs` 传递，链路脆弱。

### 修复方案

增加 `browserPendingBookmark` 状态 + `browserSetPendingBookmark` action 到 `browserBookmarkSlice`：

```typescript
// browserBookmarkSlice.ts
browserPendingBookmark: BrowserPendingBookmark | null
browserSetPendingBookmark: (pending: BrowserPendingBookmark | null) => void
```

右键菜单直接写入 store：

```typescript
useAppStore.getState().browserSetPendingBookmark({ url, title, tabId });
```

`useBrowserDialogs` 通过 `useAppStore.subscribe` 监听变化并打开对话框：

```typescript
useAppStore.subscribe((state) => {
  const pending = state.browserPendingBookmark;
  if (pending) {
    setPendingBookmark(pending);
    setBookmarkDialogOpen(true);
    useAppStore.getState().browserSetPendingBookmark(null);
  }
});
```

### 经验

- **Store 优先于 callback chain**：链路过长时，Zustand store 直接写/读比 callback 传递更可靠
- **unsubscribe 模式**：`subscribe` 返回 `unsub` 函数，在 `useEffect` 的 cleanup 中调用
- **URL 优先于 tabId**：历史记录条目的 `history-*` ID 在 `browserTabs` 中不存在，URL 查找更可靠

## 音频图标调试

### 问题

用户报告音频图标在暂停后依然显示。调试日志系统确认端到端链路正常：
1. `onAudioStateChanged` 事件正确接收
2. `browserUpdateTabAudioState` 正确更新 store
3. 树节点重建反映正确的 `isPlayingAudio`
4. 图标渲染读取正确的 `hasAudio`

**结论**：功能正常，用户误报。日志系统关键时刻提供了确定性证据。

### 经验

- 调试日志（`[ADL-DEBUG]`）插入 4 个关键节点可追踪完整数据流：
  - 事件接收（`BrowserIframeStack.tsx`）
  - store 更新（`browserTabsSlice.ts`）
  - 树节点构建（`useBrowserTreeData.ts`）
  - 图标渲染（`BrowserEntrySubEntries.tsx`）
- 调试完成后必须清除所有调试日志

## 涉及文件

- `browserBookmarkSlice.ts` — `browserPendingBookmark` 状态 + `browserSetPendingBookmark` action
- `browserEntrySubEntriesUtils.tsx` — 树视图右键菜单写入 store
- `BrowserTreeEntry.tsx` — flat 模式右键菜单写入 store
- `useBrowserDialogs.ts` — store subscription 打开书签对话框
- `BrowserPanel.tsx` — dialog `onCancel` 清除 store pending
- `BookmarkToFolderDialog.tsx` — 自定义名称输入框在目录树下
- `browserTabsSlice.ts` — `browserUpdateTabAudioState`
- `useBrowserTreeData.ts` — 树节点 `isPlayingAudio` 构建
- `BrowserEntrySubEntries.tsx` — `renderBrowserIcon` 音频图标渲染
