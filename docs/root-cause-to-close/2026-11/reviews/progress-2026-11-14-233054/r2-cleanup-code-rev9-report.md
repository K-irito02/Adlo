# R2 复审报告（A：代码清理）— rev9

## 范围

- 快照：`.review-diffs/manifest-rev9.md`（base `4484cf75c`，67 文件；新增 `docs/adr/0017-bookmark-transfer-and-identity.md`）；只读工作区源码 + rev9 快照，未跑测试、未用 git。
- 复核对象：上一轮 `.review-diffs/r2-cleanup-code-report.md`（rev8）的 F1–F6 与「记录不修」；核对文件为 `useBrowserTabs.ts`、`faviconDisplayCache.ts`、`browserEntrySubEntriesUtils.tsx`、`BrowserTreeEntryMenu.tsx`、`useBookmarkToFolderDialog.ts`、`BrowserFavicon.tsx`、`browserTreeFavicon.ts`、`useBrowserTreeData.ts`、`useBrowserFolderCrud.ts`。
- 文档组（ADR 0017 / ui-manual / 知识库 / 进度）与测试组改动不在本 scope，未审。

## 上轮问题关闭情况

### F1（未使用返回值/导出）— 已关闭

- `useBrowserTabs.ts`：`handleToggleBookmark` / `handleToggleBookmarkForTab` 已删除（原 `:163-172`），`return` 中对应两项也已移除（现 `:172-192`），`useShallow` 选择器里不再订阅 `browserToggleBookmark`（现 `:51-73`）。
- 全仓检索 `handleToggleBookmark`：0 命中；`browserToggleBookmark` 仅剩 `useBookmarkToFolderDialog.ts:171`（收藏到目录流程）与 store/测试，说明**只清理了 hook 侧接线，store 动作未误删**——与上轮建议一致。
- `faviconDisplayCache.ts:25` `isInlineFaviconSource` 已改为非导出，仅 `:37` 内部调用；`browserEntrySubEntriesUtils.tsx:168` `handleBookmarkToggle` 已改为非导出，仅 `:264` 内部调用。全仓检索两者均无外部引用（含测试）。
- 残留检查：`useBrowserTabs.ts:1-8` 导入全部仍被使用，无悬空 import；`useBrowserTabs.test.ts` 只断言 `isBookmarked`，无需同步改动。

### F2（菜单渲染双份）— 已关闭

- `BrowserTreeEntryMenu.tsx:157-182` 新增 `renderMenuButtons(items, wrapClick)`，两处 portal 分别以 `handleMenuItemClick`（`:266`）与 `handleTabMenuAction`（`:290`）调用，按钮 DOM 结构与 `icon / badge / hint / danger` 顺序保持原样。
- 同文件 `entryMenuItems: TreeMenuViewItem[]`（`:33`），重复的内联同形类型已删；`TreeMenuViewItem` 单一定义（`:13-21`）。
- `useCallback` 依赖为 `[handleShowHint, scheduleHide]`，两者均为 `useCallback` 产出，`handleShowHint` 内部只用 `showHintCard`（`:90-104`），无 stale closure。

### F3（冲突处理三份）— 已关闭，行为保持

- 新增 `showDuplicateToast(pathLabel)`（`:111-119`，`[showToast, t]`）与 `closeDialogAfterCollision()`（`:121-124`）：
  - `addTabToDirectory`：`:137-141` = toast + `return false`（**不关窗**，与旧实现相同）。
  - 预检：`:164-168` = toast + 关窗 + 清 pending + return（与旧实现相同）。
  - `browserCreateBookmarkEntry` 失败：`:202-206` = toast + 关窗 + 清 pending + return（与旧实现相同）。
- `handleBookmarkAddToFolder` 依赖数组已补 `showDuplicateToast` / `closeDialogAfterCollision`（`:239-248`），未遗漏。

### F4（冗余条件 / 条件展开 4 处）— 已关闭

1. `browserEntrySubEntriesUtils.tsx:255-258`：合并为 `(node.isSavedBookmark && node.bookmarkId) || isBookmarked ? t.browserUnbookmark : t.browserBookmark`，语义等价（原两个分支同值）。
2. `BrowserFavicon.tsx:123-125`、`:187`：`&& !initialMeta` / `&& !meta` 已删除，`!preferred` 已足够。
3. `browserTreeFavicon.ts:26`：改为直接可选属性 `snapshot: node.iconUri`（`tsconfig` 无 `exactOptionalPropertyTypes`，等价）。
4. `useBrowserTreeData.ts:145-147`、`:159-161`、`:254-256`：三处统一为 `if (entry.iconUri) node.iconUri = …`，条件展开已移除。

### F5（递归收集器双份）— 已关闭

- `useBrowserFolderCrud.ts:302-316` 单一 `collectFolderTargets(folderId, workspaceId?)`；工作区分支 `:329-331`、目录分支 `:333` 各调一次，不再有两份同形递归。
- 合并时去掉了工作区分支子目录过滤条件 `(!f.parentType || f.parentType === 'folder')`：目录分支原本就不带该过滤，两分支实际等价（`parentType==='workspace'` 且 `parentId` 为某个目录 id 属自相矛盾数据，且根目录另行按 `parentType==='workspace'` 选取），未改变可收集集合；`seen` 去重仍在 `:347-356`。
- 旧实现里的 `if (folder)` 存在性判断也被移除：`find` 返回 `undefined` 时 `entries` 为空、子目录 filter 无命中，结果等价。

### F6（重试注释与实现相反）— 已关闭

- `BrowserFavicon.tsx:57-64` 已改为「耗尽后本次挂载内不再探测该来源，换源/重挂后重新获得预算」，与 `:134-136`（`exhaustedSrc` 语义）、`:156`/`:189`（元数据变化/URL 变化清空）、`:128`（预算重置）一致；「永久降级」措辞已不存在。

### 记录不修项状态（未变更，不构成回归）

- `BrowserFavicon.tsx:206` 孤悬注释仍在（上轮明确「不单独开修复项、下次触碰时顺手删」）。本轮该文件因 F4-2 被触碰但未顺手删；仍按记录处理，建议收尾时一并删除（不强求）。
- `faviconUrl` + `faviconUrlRef` 双份状态、`degraded`、`probeSrc !== displaySrc` 守卫、`currentSrc` 记账口径、无生产者的 menu `icon` 管道：均未改动，状态与上轮一致。

## 新增发现

### F1 [severity: low] [category: 文档]

- 位置：`adlo/frontend/src/app/features/browser/useBookmarkToFolderDialog.ts:107-111`
- 描述：F3 抽出 `showDuplicateToast` 时，原属 `addTabToDirectory` 的 JSDoc 被留在了新函数上方，现在指向错误的对象且断言相反：注释写「落盘『标签 → 目录』关联…**返回 false** 表示目录冲突已 toast」，而 `showDuplicateToast` 返回 `void`、职责只是弹 toast；真正返回 `false` 的 `addTabToDirectory`（`:126-144`）反而没有注释。
- 证据：`:111` `const showDuplicateToast = useCallback((pathLabel: string | undefined) => {` —— 函数体 `:112-118` 无任何 `return false`；`addTabToDirectory` 的 `return false` 在 `:139`。属本轮清理引入的注释/实现错位（非上轮遗留）。
- 建议修复：把该 JSDoc 移到 `addTabToDirectory` 上方（`:126`）；`showDuplicateToast` 用一行注释说明「冲突文案 toast，调用方自决是否关窗」，避免读者以为它同时负责关窗。

## 记录不修

- `useBrowserFolderCrud.ts:309` 新引入的条件展开 `...(workspaceId ? { workspaceId } : {})`：与 F4-3/F4-4 同类写法，此处仅用于省略 key（无 `exactOptionalPropertyTypes` 时可写成 `workspaceId`）；单点、零行为差异，随下次触碰统一即可。
- `browserEntrySubEntriesUtils.tsx:253-254` 注释「书签行…文案**恒为**『取消收藏』」：可达状态（`isSavedBookmark` 且 `bookmarkId` 存在，或 URL 已在全局索引）都成立；仅在「目录条目存在但全局索引缺失 + 条目 id 已被前序搜索行消耗」这种自相矛盾/瞬态组合下不成立。属 R1 已讨论过的语义边界，不因本轮清理新增，记录备查。
- `BrowserTreeEntryMenu.tsx:227-249` `tabMenuViewItems` 在未打开右键菜单时也返回 `[]` 的 IIFE 结构：可读性一般但无重复、无死分支，保留。
- 本轮未触碰、上轮已记录的其余项（`isUrlBookmarked` 每次重算、`computeNavigatorCount` 无生产消费方等）状态不变。

## 结论

- 需修复项：**1**（critical 0 / high 0 / medium 0 / low 1）
- 上一轮 6 项全部关闭（F1–F6），无回退；清理未引入功能/依赖数组/类型层面的新问题（依赖数组、导入、导出引用、递归合并等价性均已逐点核对）。
- 唯一新发现 F1 是 `useBookmarkToFolderDialog.ts` 的 JSDoc 归属错位 + 错误返回约定描述，改注释即可，不涉及行为。
- 说明：本轮仍以静态阅读 + 全仓检索判定（未跑测试套件）；删除性推演见各条证据，最终门禁由主代理执行。
