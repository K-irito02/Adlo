# R2 复审（B：测试清理）— rev9

## 范围

- 快照：`.review-diffs/manifest-rev9.md`（base `4484cf75c`，67 文件，比 rev8 多 `docs/adr/0017-…`）；只用 rev9 快照，未使用 git 命令。
- 上轮报告：`.review-diffs/r2-cleanup-tests-report.md`（rev8）。
- 以 diff 文件哈希比对 rev8↔rev9，本轮实际改动落在 8 个测试文件：`BrowserFavicon.test.tsx`、`BrowserBookmarkRowActions.test.tsx`、`BrowserTreeEntryFlatList.window.test.tsx`、`browserTreeFavicon.test.ts`、`BrowserNavSearchMode.test.tsx`、`useBrowserTagActions.test.ts`、`useBrowserFolderCrud.test.ts`、`stores/slices/__tests__/browserBookmarkSlice.test.ts`；其余 8 组（`faviconDisplayCache.test.ts`、`useBookmarkToFolderDialog.test.tsx`、`useBrowserTabs.test.ts`、`browserTabsSlice.test.ts`、`icons/*.test.tsx`、`centerCopyParity.test.ts`、`useClampedMenuPosition.test.tsx`、`BrowserTreeEntryMenu.list.test.tsx`）哈希与 rev8 完全一致。
- 实跑（两项，均为判定必需）：
  - `pnpm run test:one -- src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts` → 48 passed（F1 改写后仍可执行）。
  - `pnpm run test:one -- src/app/features/browser-tree/__tests__/BrowserTreeEntryFlatList.window.test.tsx` → 5 passed，tests 3.61s（rev8 同文件 7.13s）。
- 其余改动为标题/注释/数量级，逐条对照实现判定，未跑。
- 回归扫描：rev9 新增行中 `.only`/`.skip`/`.todo`/`console.*`/`debugger` 零命中；`adlo/frontend/src/app/stores` 下新增 `as any`/`as unknown as` 零命中（`check-no-new-any` 由主代理实跑验证，本报告只做只读判断）。

## 上轮问题关闭情况（逐条）

- **F1 [medium] store 测试新增 22 处 `as any`/`as unknown as`（阻断 pre-commit `check-no-new-any`）→ 已关闭。**
  - rev9 diff 中 `^\+.*\bas (any|unknown as)\b` 命中 0（rev8 为 22）；同期改动的 `browserTabsSlice.test.ts` 也是 0。
  - 改为 `seedBookmarks(get, { bookmarks, folders?, workspace? })` + `removeForUrl(get, url)`，播种用 `Record<string, unknown>`，读取用 `as UrlBookmark[]` / `as { entries: … }[]` / `as (target: string) => void`，均不在棘轮正则内。
  - 语义未弱化：仍断言①全局索引只剩 `keep`（`:1017-1019`）、②目录 entries 只剩 `bm2`（`:1020-1021`）、③workspace 清空为 `{}`（`:1022`）、④不同端口/协议互不删除（`:1036-1038`、`:1052-1054`）、⑤尾斜杠/www 归一化后清空（`:1065`）。
  - 非自指验证：`browserRemoveBookmarksForUrl` 用 `baseBookmarks.filter(...)` 产生新数组（`browserBookmarkSlice.ts:836-845`），mock 的 `set` 每次 `{...state, ...next}` 生成新对象，`toEqual` 不是「断言自己刚写入的同一对象」。
- **F2 [medium] 重复的「shows spinner」用例（标题承诺 spinner 但无断言）→ 已关闭。**
  - `it('shows spinner when no cached favicon (loading state)')` 整条删除；`shows empty placeholder (not letter/favicon) while meta fetch has not settled`（`:85-89`）保留其「未结算显示空占位」语义。
  - spinner 存在断言仍在：`spinner (default) mode still keeps the spinner while meta has not settled`（`:242-245`，`expect(container.querySelector('.adl-spinner')).not.toBeNull()`）。
- **F3 [low] 4 处 `}, 15000)` 超时通胀 → 已关闭。**
  - rev9 文件中已无 `}, \d{4,})`；fixture 200/120 → 100/90，断言同步：追加页后 100 行（`:91`）、90 行（`:105`、`:128`、`:146`）、选中 `flat:85` 时行数 > `FLAT_LIST_PAGE_SIZE` 且 `aria-setsize=90` / `aria-posinset=86`（`:150-158`），与 `Math.min(count + FLAT_LIST_PAGE_SIZE, length)`、`max(80, 85+1)` 完全一致。
  - 实跑 5 passed / tests 3.61s（原 7.13s），默认 5000 ms 余量 > 3×。
- **F4 [low] 6 处标题/注释与断言或事实不符 → 6/6 已关闭。**
  1. `BrowserFavicon.test.tsx:147` 标题改为 `retries a transiently failing favicon without a URL change`（删去 `recovers when the server comes up`），旧「服务就绪后恢复」注释同步删除——不再承诺未断言的行为。
  2. `useBrowserTagActions.test.ts:40` 标题改为「新建中心标签且不产生面板活动标签」，并补 `expect(state.browserActiveTabId).toBe('')`（`:54`）。该断言成立且非恒真：`openUrlInCenter` → `browserOpenTab` 先把活动标签设为新标签（`browserTabsSlice.ts:117`），`centerShowBrowserTab` → `clampPanelActiveTab` 在唯一标签移入中心后把面板活动夹回 `''`（`centerActions.ts:5-15/20-27`）；若漏调 `centerShowBrowserTab`，`location` 与活动标签两条断言同时红。
  3. `BrowserNavSearchMode.test.tsx:235` 改为 `makeTab('tab-live', url, 'HistoryLive')`，「同名活标签」成立。
  4. `BrowserBookmarkRowActions.test.tsx:115` 标题改为「…并包含打开等条目」（删除继续由 `:156` 的独立用例覆盖）。
  5. `useBrowserFolderCrud.test.ts:17` describe 改为「useBrowserFolderCrud 目录批量与删除动作」（新用例 `:43/:78/:123` 为「全部在中心打开」，与名称相符）。
  6. `browserTreeFavicon.test.ts:41-43` 标题去掉「(search results)」，注释改为「收藏目录/工作区书签中仍有活标签的条目会产出 `nodeType:'tab' + isSavedBookmark`（`useBrowserTreeData.buildFolderNode` 等）」——与实现一致。
- 未见本轮修复引入的行为/断言回归；F1 改写后的文件与 F3 改动的文件均实跑通过。

## 新增发现

### F1 [severity: low] [category: 文档]

- 位置：`adlo/frontend/src/app/features/browser-tree/__tests__/BrowserTreeEntryFlatList.test.tsx:60-62`
- 描述：同一夹具（`nodeType:'tab' + isSavedBookmark`）的说明在兄弟文件里仍停在 rev8 的旧口径——标题写「(search results)」，注释断言该变体是「向后兼容的构造」。而本轮已把 `browserTreeFavicon.test.ts:41-43` 改成「生产可达」；两处对同一事实自相矛盾，且旧说法不成立。
- 证据：`BrowserTreeEntryFlatList` 由 `BrowserTreeEntryChildren.tsx:43-46` + `:60-74` 在列表模式渲染，`buildFlatTabItems`（`browserTreeEntryUtils.tsx:11-24`）**原样复用目录子节点**；收藏目录中仍有活标签的条目正是 `nodeType:'tab'` + `isSavedBookmark:true`（`useBrowserTreeData.ts:148-155`），工作区书签快照同理（`:219-250`）。故该变体在列表模式是生产可达路径，而不仅是「向后兼容构造」。
- 建议修复：标题去掉 `(search results)`，注释改为与本轮 `browserTreeFavicon.test.ts:41-43` 同一措辞（收藏目录/工作区书签中仍有活标签的条目 → 必须 `isSavedBookmark` 优先）；一行文案改动，不改断言。

## 记录不修

- `browserBookmarkSlice.test.ts:975-987` 的 `seedBookmarks` 用 `folders?: unknown[]` / `workspace?: Record<string, unknown[]>`，`removeForUrl`（`:984-986`）用 `as (target: string) => void`：这是 `check-no-new-any` 约束下的合理取舍（`createMockStore` 的 `get()` 本就返回 `Record<string, unknown>`，要换成 `BookmarkFolder`/`BookmarkEntry` 需重写 mock store）。运行期仍被断言兜住（目录 `entries.id`、workspace `{}`），不影响回归保护；若日后重写 mock，可顺带补类型。
- 上轮「记录不修」各项（`getBy*().toBeDefined()` 恒真形式、`MockIntersectionObserver.observed` 未读、`useClampedMenuPosition` 的 `data-testid`/style、`useBrowserTabs` 反向守护、`useBookmarkToFolderDialog` 未 stub `browserToggleBookmark`、`BrowserNavSearchMode` 同模块两条 type import、icons path 字面量、两文件 `callbacks` 重复、snapshot 双用例非重复）：涉及文件本轮哈希与 rev8 一致，结论沿用。
- `BrowserFavicon.test.tsx:385` 注释「真正锁住折算分支的是…」应为「降级分支」笔误（`setExhaustedSrc` + probe 清理）；纯笔误、不影响断言，未计入需修复。

## 结论

- 需修复项：1（critical 0 / high 0 / medium 0 / low 1）
