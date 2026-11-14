# Review manifest — rev5

- base: `4484cf75cf2e50ef852bffac341fcfd503ca152e`
- commits: 0
- files: 66

## 快照命名

仓库相对路径中的 `/` 和 `.` 换成 `_`，后缀 `-rev5.diff`。只看本轮 rev，不要复用旧快照。

## 子代理共享简报

`.agents/skills/root-cause-to-close/references/review-brief.md`（规约、气味基线、强制检查项、报告契约）。

## 文件分组

### frontend (61)
- adlo/frontend/src/app/components/BrowserFavicon.tsx
- adlo/frontend/src/app/components/ContextMenu.tsx
- adlo/frontend/src/app/components/__tests__/BrowserFavicon.test.tsx
- adlo/frontend/src/app/components/__tests__/faviconDisplayCache.test.ts
- adlo/frontend/src/app/components/faviconDisplayCache.ts
- adlo/frontend/src/app/features/browser-tree/BrowserCategorySection.tsx
- adlo/frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx
- adlo/frontend/src/app/features/browser-tree/BrowserTabTree.tsx
- adlo/frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx
- adlo/frontend/src/app/features/browser-tree/BrowserTreeEntryMenu.tsx
- adlo/frontend/src/app/features/browser-tree/__tests__/BrowserBookmarkRowActions.test.tsx
- adlo/frontend/src/app/features/browser-tree/__tests__/BrowserTreeEntryFlatList.test.tsx
- adlo/frontend/src/app/features/browser-tree/__tests__/BrowserTreeEntryFlatList.window.test.tsx
- adlo/frontend/src/app/features/browser-tree/__tests__/BrowserTreeEntryMenu.list.test.tsx
- adlo/frontend/src/app/features/browser-tree/__tests__/browserTreeFavicon.test.ts
- adlo/frontend/src/app/features/browser-tree/browserEntrySubEntriesUtils.tsx
- adlo/frontend/src/app/features/browser-tree/browserTreeEntryUtils.tsx
- adlo/frontend/src/app/features/browser-tree/browserTreeFavicon.ts
- adlo/frontend/src/app/features/browser-tree/types.ts
- adlo/frontend/src/app/features/browser-tree/useBrowserTreeData.ts
- adlo/frontend/src/app/features/browser/BrowserNavListMode.tsx
- adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx
- adlo/frontend/src/app/features/browser/BrowserNavTabsMode.tsx
- adlo/frontend/src/app/features/browser/BrowserNavigator.test.tsx
- adlo/frontend/src/app/features/browser/BrowserNavigator.tsx
- adlo/frontend/src/app/features/browser/BrowserOpenTabFlatListItem.tsx
- adlo/frontend/src/app/features/browser/BrowserPanel.tsx
- adlo/frontend/src/app/features/browser/BrowserPanelActionsContext.ts
- adlo/frontend/src/app/features/browser/BrowserTabBar.tsx
- adlo/frontend/src/app/features/browser/__tests__/BrowserNavSearchMode.test.tsx
- adlo/frontend/src/app/features/browser/__tests__/useBookmarkToFolderDialog.test.tsx
- adlo/frontend/src/app/features/browser/__tests__/useBrowserTagActions.test.ts
- adlo/frontend/src/app/features/browser/useBookmarkToFolderDialog.ts
- adlo/frontend/src/app/features/browser/useBrowserFolderCrud.test.ts
- adlo/frontend/src/app/features/browser/useBrowserFolderCrud.ts
- adlo/frontend/src/app/features/browser/useBrowserTabs.test.ts
- adlo/frontend/src/app/features/browser/useBrowserTabs.ts
- adlo/frontend/src/app/features/browser/useBrowserTagActions.ts
- adlo/frontend/src/app/features/center/CenterBrowserView.tsx
- adlo/frontend/src/app/features/center/__tests__/CenterBrowserView.test.tsx
- adlo/frontend/src/app/features/terminal/TerminalContextMenu.tsx
- adlo/frontend/src/app/features/tree/__tests__/useClampedMenuPosition.test.tsx
- adlo/frontend/src/app/features/tree/treeEntryMenus.ts
- adlo/frontend/src/app/i18n/__tests__/centerCopyParity.test.ts
- adlo/frontend/src/app/i18n/en-US/browser.ts
- adlo/frontend/src/app/i18n/en-US/common.ts
- adlo/frontend/src/app/i18n/zh-CN/browser.ts
- adlo/frontend/src/app/i18n/zh-CN/common.ts
- adlo/frontend/src/app/icons/actions.test.tsx
- adlo/frontend/src/app/icons/actions.tsx
- adlo/frontend/src/app/icons/core.test.tsx
- adlo/frontend/src/app/icons/core.tsx
- adlo/frontend/src/app/icons/index.ts
- adlo/frontend/src/app/regions/CenterTabStrip.tsx
- adlo/frontend/src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts
- adlo/frontend/src/app/stores/slices/__tests__/browserTabsSlice.test.ts
- adlo/frontend/src/app/stores/slices/browserBookmarkSlice.ts
- adlo/frontend/src/app/stores/slices/browserTabsSlice.ts
- adlo/frontend/src/app/utils/browserDisplayUtils.ts
- adlo/frontend/src/app/utils/favicon.ts
- adlo/frontend/src/styles/regions/rightpanel/files-navigator.css

### docs (5)
- docs/knowledge-base/browser/bookmark/browser-bookmark-dialog-and-flat-view-2026-06-15.md
- docs/knowledge-base/browser/bookmark/browser-bookmark-tuple-dedup-and-title-isolation-2026-08-15.md
- docs/knowledge-base/browser/webview-embed/divider-strip-dual-host-2026-10-02.md
- docs/operations/ui-manual/rightpanel/tools/browser.md
- docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md
