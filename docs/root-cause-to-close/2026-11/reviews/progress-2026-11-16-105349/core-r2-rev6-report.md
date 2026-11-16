# 审查报告 — core / R2 rev6 定向复核

## 范围

- 只核 rev5 R2 的 3 个 low（F1 `filterTabIds` 死链、F2 树 DnD 无消费 API/测试桩、F3 `containerExists` 过度防御与重复解析），并确认清理本身没有引入新死代码或编译问题。
- 依据 rev6 源码（`useBrowserTreeDnd.ts`、`browserBookmarkOrder.ts`、`browserTreeEntryUtils.tsx`、`browserTreeEntryUtils.test.tsx`、`BrowserTreeEntryChildren.tsx`、`BrowserTreeEntry.tsx`、`BrowserCategorySection.tsx`、`BrowserEntrySubEntries.tsx`、`browserEntrySubEntriesUtils.tsx`、`__tests__/useBrowserTreeDnd.test.tsx`）与全仓引用检索（`filterTabIds` / `isDragging` / `DropError` / `containerExists` / `BrowserTreeDndHandlers` / `BrowserTreeDndResult` / `[DBG-` / `console.`）。
- 不复审 R1 正确性、不计 P5 文档台账项。

## 上轮问题关闭情况

- **F1（`filterTabIds` 死链）→ 已关闭**。
  - 全仓 `filterTabIds` 命中数为 **0**（生产 + 测试）；`browserTreeEntryUtils.tsx:11,37` 两个函数签名收敛为 `(node, showSeparators)` / `(dir, pathSoFar, showSeparators)`，6 处过滤分支与 `filterTabIds` 相关的 `hasDirectTabs` 计算已去掉（保留的 `dir.children.some(c => c.kind === 'file')` 是 separator 的既有语义，非过滤残留）。
  - props 声明链全部清空：`BrowserCategorySection.tsx:35-46`、`BrowserTreeEntry.tsx:19-30`、`BrowserTreeEntryChildren.tsx:8-23`、`browserEntrySubEntriesUtils.tsx:18-29` 均无该字段；透传点（原 `BrowserCategorySection:92`、`BrowserTreeEntry:196`、`BrowserTreeEntryChildren:95`）一并删除。
  - `BrowserEntrySubEntries.tsx` 的 `filteredNodes` memo 已删，直接 `node.children`（`:305-309`），`useMemo` 仍被 `:65,:93` 使用，无悬空 import。
  - `browserTreeEntryUtils.test.tsx` 只剩 `describe('buildFlatTabItems')` 1 条（`:32-41`），5 条过滤用例已删；`makeTabNode`/`makeDirNode` 仍被使用。
- **F2（无消费 API + 测试桩）→ 已关闭**。
  - `DropError`/`DropComputation.error` 全删；`handleMove` 改用 `computation?.indicator.kind === 'invalid'`（`useBrowserTreeDnd.ts:469-472`），语义与原先 `Boolean(error)` 等价（每个返回点同时用同一条件决定 `indicator.kind`）；`BookmarkMoveError` 的 import 已移除（`:10` 只剩 `BookmarkMove`）。
  - `isDragging` 全删（state / return / 两处 set 全无残留）。
  - `BrowserTreeDndHandlers`、`BrowserTreeDndResult` 已去 `export`（`:52-60`），仅本文件使用；`BrowserTreeDndIndicator` 仍导出并被 `BrowserTreeDndOverlay` 消费。`tsconfig.json` 为 `noEmit: true` 且未开 `declaration`，非导出接口出现在导出函数签名上不会触发 TS4023/4058。
  - `useBrowserTreeDnd.test.tsx:1-7` 已去掉 `TCopyProvider`/`CopyDict`/`t` 三件套，直接渲染 `Harness`；`screen`/`fireEvent`/`vi`/`beforeEach` 仍在用，无 unused import。
- **F3（`containerExists` 过度防御 / 重复解析）→ 已关闭**。
  - `containerExists` 已删除（全仓无该符号），存在性判断内联进 `validateMove`：folder 目标 `:383-386`（`:384` 检查搬进 `parsed.kind === 'folder'` 分支内），workspace 目标 `:394-400`；书签分支同样内联 `:421-433`。每个分支只 `parseContainer` 一次，不再有「外层解析 + `containerExists` 内部再解析」的重复；`!parseContainer(...)` 与 `containerExists` 的重复判定问题一并消失。
  - `setFolderParent`（`:254-263`）改用 `parseContainer` 并从 `parsed.kind` 派生 `parentType`；`attachEntry`（`:304-333`）同样改用 `parsed`，手写 `startsWith`/`slice` 已全部移除。
  - **对保留分支的判断：可接受，建议保留。**
    1. `validateMove:380` / `:418` 的 `parsed.kind === 'custom'`：当前不可达（`:376` / `:414` 已对 `CUSTOM_ROOT` 提前返回），但它把「custom 不是可移动目标」这条不变量钉在存在性判定处。后续若有人把 `CUSTOM_ROOT` 的提前返回移到别处、或新增一条调用路径，删掉这两行会让 `into: custom:root` 的书签移动静默通过校验——代价远大于两行判断。作为类型完备兜底保留合理。
    2. `attachEntry:311-313`（`!parsed` 早退）与 `:333`（custom 落到静默 no-op）：`attachEntry` 没有错误通道，唯一替代是抛异常或引入 Result，对「会被 MCP 用外部数据调用」的纯函数来说静默 no-op + 上游 `${ok:false}` 由 `validateMove` 负责更稳；保留可接受。
    3. 提醒（避免后续清理误删）：`setFolderParent` 里保留的 `parsed.kind === 'custom'` **是活代码**——`into`/`insert` 到 `custom:root` 的文件夹移动会走到它并按「清空 parentId/parentType」处理，与 `new-root` 同义，不能当死分支删除。
- 清理未引入新死代码：`parseContainer`、`containerEntries`、`findEntryById`、`collectSubDirItems`、`useMemo` 等仍各自有调用方；本 scope 仍无 `[DBG-` / `console.*` / `debugger` / `TODO`。
- 未发现编译风险：窄化链（`!parsed || kind==='custom'` 之后 `parsed.kind`/`parsed.id`、`folder.parentType = parsed.kind`）类型自洽；测试侧无残留导入。

## 新增发现

无。三项清理都已闭环，未发现新死代码、悬空引用或编译层问题。

## 记录不修

- **删过滤用例时顺带失去了 `showSeparators` 的覆盖**：`buildFlatTabItems` 现在唯一的用例是 `buildFlatTabItems(root, false)`（`browserTreeEntryUtils.test.tsx:38`），分隔符/嵌套（`showSeparators && hasDirectTabs`、`childPath` 缩进标签、`collectSubDirItems` 递归）在列表模式下是活代码但没有测试。原 5 条过滤用例里有 3 条同时压了这条路径。建议补 2 条不带过滤参数的用例：目录含文件时产出 separator 且 label 为目录名；嵌套目录的 separator label 为 `父/子` 路径。属可选补强，不影响本次闭环。
- 进度文件 R1 台账 `第 127 行` 仍写「修 `containerExists()`」，内联后已无同名符号；历史条目不必回改，建议在 R2 段落记录「已内联」即可。
- R2 rev5 其余「记录不修」项状态未变，本轮不重复展开：`applyBookmarkMove` 三处校验后不可达的失败返回（兼类型收窄）、`validateBookmarkMove` 一行转发包装、`BookmarkChildRef`/`BookmarkMoveResult` 的 export 与 `name/url` 字段、`folderItemKey` 与 `folderContainerKey` 同实现、`nodeType:'tab'` 防御分支、DnD 测试里 `data-testid="root"`/`row-c`、`vi.restoreAllMocks()`、恒真的 `queryByText` 断言、`browserTreeCounts.test.ts:486` 的 `?? false`。

## 结论

- 需修复项：0（定向复核通过）
- rev5 R2 的 3 个 low 全部关闭，且关闭方式无行为变化；保留的 `custom`/`!parsed` 兜底与 `setFolderParent` 的 custom 分支均有明确理由（后者是活代码，勿删）。
