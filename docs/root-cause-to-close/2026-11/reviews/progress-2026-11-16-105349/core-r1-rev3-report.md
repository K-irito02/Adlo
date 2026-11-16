# 审查报告 — core / rev3

## 范围

- 快照：`.review-diffs/*-rev3.diff`（base `4850ebafaf38`，102 个文件），只看 rev3。
- 本 scope diff（17 个）：`browserBookmarkOrder.ts`、`browserFoldersSlice.ts`、`persisted/registry.ts`、`browserBookmarkOrder.test.ts`、`browserPanelPersistence.test.ts`、`useBrowserTreeData.ts`、`useBrowserTreeCache.ts`、`useBrowserTreeDnd.ts`、`BrowserTreeDndOverlay.tsx`、`BrowserTabTree.tsx`、`BrowserCategorySection.tsx`、`BrowserTreeEntry.tsx`、`browserTreeCounts.test.ts`、`__tests__/useBrowserTreeDnd.test.tsx`、`MultiTreeEntryShell.tsx`、`i18n/{zh-CN,en-US}/browser.ts`。
- rev3 相对 rev2 实际变动仅 4 个 blob（`useBrowserTreeData.ts`=6829fd232、`useBrowserTreeCache.ts`=bc5e8fc84、`BrowserTabTree`=0e0a9f2f6、`BrowserCategorySection`=89fdf4407、`BrowserTreeEntry`=faf9119e6、`MultiTreeEntryShell`=e248d6f07、`registry`=c29f3083a、`browserPanelPersistence.test`=6e070a792、i18n、`useBrowserTreeDnd.test`=5d5bd7cc9 的 blob 与本轮前一致，属未改动文件）；变更为 `browserBookmarkOrder.ts`（35990b6e9）、`browserBookmarkOrder.test.ts`（c4ee468d9）、`useBrowserTreeDnd.ts`（61b5402f3）、两处测试注释。全量 scope 已按 rev3 源码重读，不只核对增量。
- 辅助读取（非本 scope）：`useBrowserPanelState.ts`、`BrowserTreeEntryChildren.tsx`、`BrowserTreeEntryFlatList.tsx`、`workspaceSlice.ts`、`browserBookmarkSlice.ts`（`browserCreateBookmarkEntry` / `browserSaveTabAsBookmark` 的 id 来源）、`useBookmarkToFolderDialog.ts` / `useBrowserDialogs.ts`（目标参数是否互斥）、`claims-rev3.md` / `claims-ack-rev3.md`、进度文件 P4/P5 段。
- 已接受的前置决策：Pointer Events 替代 HTML5 DnD；落点反馈中性反转色；overlay/ghost portal 到 `document.body`；非法态只由光标表达（无 toast）。

**测试有效性（删除性推演，未实跑）**

- `browserBookmarkOrder.test.ts`：删 `containerExists` 的 folder 分支 → `rejects a folder target that no longer exists` 红；删 bookmark 分支 → `rejects a bookmark target that no longer exists…` 红；删 workspaceIds 分支 → `rejects an unknown workspace…` 红；改为「`browserWorkspaceBookmarks` 有 key 即存在」→ `allows a known but empty workspace target` 红；`containerExists` 恒 false → `moves a folder into a workspace…` 红。
- rev3 新增两态用例：把 `state.workspaceIds ? … : true` 改成 `?? false` → `treats omitted workspaceIds as lenient…` 首段 `ok` 变 false 红；把空数组当「未提供」（`length > 0` 判空）→ 同用例第二段由 `target-missing` 变 `ok:true` 红。`carries workspaceIds into the returned state…` 删掉 `workspaceIds: state.workspaceIds`（insert 返回点）→ 断言 `undefined ≠ ['ws-1']` 红。
- `browserPanelPersistence.test.ts`：删任一 `persist(...)` → `persists bookmark child order across restart` 对应断言红。
- `useBrowserTreeDnd.test.tsx`：overlay 改回内联 → portal 断言红；删 `pointerdown` 委托 → 6 条全红；删历史/后代校验 → `not-allowed` / 「move 未被调用」断言红。
- 结论：本次修复的每个分支都有能变红的断言；仅剩「workspace 目标行」这条 UI 适配层无用例（见「记录不修」）。

## 上轮问题关闭情况

- **rev2 F1（low，列表模式注释）→ 已关闭**。`useBrowserTreeDnd.ts:373-375` 现为「书签列表模式的嵌套文件夹分隔符没有 `data-path`（只渲染标题文本），因此这里会回落到分类分支。列表模式只支持书签行排序与顶层文件夹/工作区行；嵌套文件夹既不能拖也不能作为放入目标。」与代码一致：顶层节点仍走 `BrowserTreeEntry` → `MultiTreeEntryShell dataPath`（可拖、可作为 into/insert 目标），只有子层被 `BrowserTreeEntryChildren` 换成扁平列表、`BrowserTreeEntryFlatList` 的 `separator` 无 `data-path`。限制范围已收回到「嵌套」。
- **rev2 F2（low，`workspaceIds` 三态无覆盖）→ 已关闭**。`browserBookmarkOrder.test.ts:239-259` 同一用例断言 `undefined` 宽松（`ok === true`）与 `[]` 严格（`target-missing`），两态都可删除性变红；`browserBookmarkOrder.ts:501,570` 两个返回点都带 `workspaceIds`，`browserBookmarkOrder.test.ts:261-272` 覆盖 insert 返回点。
- **rev2 F3（low，测试注释「历史」）→ 已关闭**。`browserTreeFavicon.test.ts:42-43`、`BrowserTreeEntryFlatList.test.tsx:61-62` 现为「测试夹具/外部构造的节点仍可能带 `nodeType:'tab'` + `isSavedBookmark`」，与「生产只产 `'bookmark'`、`'tab'` 仅剩防御分支与夹具」一致。
- **rev2「记录不修」两项顺带修复 → 已确认**：
  - `applyBookmarkMove` 返回值保留 `workspaceIds`（`browserBookmarkOrder.ts:501,570`），串联/批处理不再退化为宽松校验；`browserFoldersSlice.ts:57-61` 仍只 `set` 三个持久字段，未把该字段写进 store，未污染持久化形状。
  - DnD 5 处 `validateBookmarkMove`（`useBrowserTreeDnd.ts:238,275,313,356,395`）全部传 `workspaceIds: state.recentWorkspaces?.map(id)`，与 action（`browserFoldersSlice.ts:50`）同源；`visibleWorkspaces ⊆ recentWorkspaces`（`useBrowserPanelState.ts:36-38`）保证「指示器合法 → action 也合法」，不存在松手静默无效。
  - 进度文件 `P4 审查 / R1 rev2` 逐条记录，`P5 文档同步` 已把 `workspaceIds` 列入 spec 待修项。
- **rev1 遗留项状态未变**（F1 目标容器存在性已闭合于 rev2；F2 转 P5 台账；死代码与优化项见下）。

全量重审无回归：顺序表纯函数（`resolveContainerChildren` / `applyBookmarkMove` / `validateMove`）、slice 三键落盘、registry `readStringArrayRecord`、树构建（混合排序 + 活标签解耦 + 历史音频保留）、Pointer 状态机（4px 阈值 / `elementFromPoint` / `setPointerCapture` / click 抑制 / blur 清理）、overlay portal 与 z-index 分层，均与 rev2 结论一致；`BookmarkMoveState.workspaceIds` 的 `Pick<>` 未波及 `resolveContainerChildren`；失败路径仍先 validate 后 mutate，`target-missing` / `bookmark-duplicate` 不会摘掉条目。

## 新增发现

无。本轮未发现 critical / high / medium / low 级缺陷，也未发现新的注释—代码不符。

## 记录不修

- `applyBookmarkMove` 的 new-root 返回点（`browserBookmarkOrder.ts:501`）的 `workspaceIds` 透传无对应用例（`browserBookmarkOrder.test.ts:261-272` 只走 insert 返回点）。对称两处只测一处，属覆盖不对称；删掉该行不会有测试变红，建议下次触碰时补一条 `new-root` 后串联 move 的断言。
- 「投放到工作区行」这条 UI 适配层零用例：`useBrowserTreeDnd.test.tsx` 6 条用例的 `workspaceCategory` 都是空数组，5 处 validate 里的 workspace 分支（`useBrowserTreeDnd.ts:219-252`）未被任何测试命中。逻辑本身由纯函数用例覆盖，且现在 hook 与 action 传同源 `workspaceIds`，但「指示器/动作参数失配」正是最容易回归的地方，建议补一条「拖到工作区行 → `browserMoveBookmarkNode` 收到 `workspace:<id>`」的用例。
- 每个 `pointermove` 会执行 5 次 `state.recentWorkspaces?.map(...)` 并重建整棵树 `Map`：`useBrowserTreeDnd.ts:172` 的 `useMemo(..., [categories])` 因 `useBrowserTreeData` 每次渲染返回新包裹对象而失效。属热路径分配，可选优化（把三个 category 引用拆成依赖，或在回调里缓存 id 列表）。
- `useBrowserTreeDnd.test.tsx:192` 的 `expect(screen.queryByText('Folder into descendant')).toBeNull()` 在 i18n 桩裁到只剩 1 个 key 后已恒真（空断言）；同文件 `showToast` 的「未被调用」断言是「不做 toast」的设计表达，可保留。
- `filterTabIds` 死链（`browserTreeEntryUtils.tsx:11-79`、`BrowserTreeEntry.tsx:30,44,196`、`BrowserTreeEntryChildren.tsx:14,32,44`、`BrowserCategorySection.tsx:46,60,92`、`BrowserEntrySubEntries.tsx:36,308`）与 `browserTreeEntryUtils.test.tsx` 对死分支的测试仍在；`useBrowserTreeDnd` 返回的 `isDragging` 无消费方。自 rev1 记录，未处理。
- 书签 id 跨容器唯一性只是事实而非约束：`browserCreateBookmarkEntry`（`browserBookmarkSlice.ts:531,551,563`）与 `browserSaveTabAsBookmark`（`:301,326`）在同时传 `folderId` + `workspaceId` 时会让同一 `bookmarkId` 落进两个容器；DnD 的 `sourceContainerOf` / `detachEntry` 按 id 首个匹配，届时会移动另一份副本。当前所有调用点都刻意互斥（`useBookmarkToFolderDialog.ts:129-137`、`useBrowserDialogs.ts:78-81,175-176`），不可达；若要防未来调用方，可在两个写入入口加「二者只能取一」的断言。
- 顺序表不在删除路径清理（`browserDeleteBookmarkFolder` / `browserDeleteAllBookmarksInNode` / `browserClearAllFolderBookmarks`）；UUID 不复用 + 未知 key 忽略，无行为影响，仅体积。三键落盘非原子与既有「删除节点 4 键」同源模式；顺序表失配只降级为默认顺序。
- `buildBookmarkEntryNode` 丢弃空 `id`/`url` 条目（`useBrowserTreeData.ts:103-105`）而 `resolveContainerChildren` 仍计入容器索引 → 脏数据下插入 index 偏 N；`browserCreateBookmarkEntry` 已拒绝空 URL，仅损坏持久化数据可达。
- 落点插入分区（before/after → index 映射）与「折叠目录放入后保持折叠」仍无 UI 用例；`browserTreeCounts.test.ts:486` 的 `bmNode?.isPlayingAudio ?? false` 在节点缺失时可空过。自 rev1 记录，未处理。
- P5 台账已含 spec §5.2 `workspaceIds` 与列表模式措辞；`GLOSSARY.md` / plan / 设计模式条目仍待 P5，按 P4 边界不计入本轮代码问题。
- 双端一致：纯前端状态与交互，无 IPC/Rust 改动；`test-setup.ts` 的 PointerEvent polyfill 只影响测试环境，`claims-ack-rev3.md` 唯一绝对断言（`test-setup.ts:77`）已勾选且与实现相符。
- 异步专项（简报 §4.1）：`browserMoveBookmarkNode` 与 DnD 全同步；validate 先于 mutate，落点用 `getState()` 现读现算；无 await 前快照写回、无并发代际问题。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——**本轮零问题**。
- rev2 的 3 条 low 与 2 条记录项全部闭合，且闭合方式可删除性验证；剩余事项均为已记录的可选优化/覆盖补强（见「记录不修」），不阻塞收尾。
