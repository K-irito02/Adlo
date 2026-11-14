# R2 最终确认（测试清理）— rev10

## 范围

- 快照：`.review-diffs/manifest-rev10.md`（base `4484cf75c`，67 文件，与 rev9 同集合）；只看 rev10，未使用 git 命令。
- 上轮报告：`.review-diffs/r2-cleanup-tests-rev9-report.md`（rev9，需修复 1 low）。
- 覆盖的测试文件（18 个 diff，含上轮 16 组 + `BrowserTreeEntryFlatList.test.tsx`）。以 diff 文件哈希比对 rev9↔rev10：**仅 `BrowserTreeEntryFlatList.test.tsx` 变化**（`4B47E2EDF654 → 7170D12D0224`），其余 17 个测试 diff 哈希与 rev9 完全一致，故 rev9 的 F1–F4 关闭结论继续成立，无需重审。
- 实跑（单文件，确认改写未破坏行为）：`pnpm run test:one -- src/app/features/browser-tree/__tests__/BrowserTreeEntryFlatList.test.tsx` → 3 passed。

## 上轮问题关闭情况（逐条）

- **rev9 F1 [low][文档]：`BrowserTreeEntryFlatList.test.tsx` 把 `nodeType:'tab' + isSavedBookmark` 夹具说成「向后兼容的构造（search results）」，与已修正的兄弟文件矛盾 → 已关闭。**
  - 标题：`treats saved-bookmark rows typed as tab (search results) as passive` → `treats saved-bookmark rows typed as tab as passive`（`:60`），去掉了不成立的「search results」限定。
  - 注释（`:61-63`）改为「收藏目录/工作区中仍有活标签的书签条目会产出 `nodeType:'tab' + isSavedBookmark`（`useBrowserTreeData.buildFolderNode`）；列表模式经 `buildFlatTabItems` 原样复用，因此被动判定必须以 `isSavedBookmark` 优先」。
  - 与 `browserTreeFavicon.test.ts:41-43` 逐句一致：同为「收藏目录/工作区书签中仍有活标签的条目 → `buildFolderNode` → `isSavedBookmark` 优先」，无措辞冲突；本文件额外补充的「列表模式经 `buildFlatTabItems` 原样复用」也属实（`browserTreeEntryUtils.tsx:11-24` 把目录子节点直接 `push` 成 `FlatItem`，`BrowserTreeEntryChildren.tsx:43-46/60-74` 在列表模式渲染该扁平列表）。
  - 断言未改动：`spinner === null`、兜底字母 `'S'`（`:68-71`）；生产可达性复核同前（`useBrowserTreeData.ts:148-155`、`:219-250`）。
  - `.only`/`.skip`/`console.*`/`debugger`：本轮新增行零命中。

## 新增发现

无。本轮唯一改动是 title + 2 行注释，未触及断言、fixture 形状或共享 helper；17 个未变文件沿用 rev9 的判定（含上轮记录不修项）。

## 记录不修

- 该用例的 fixture URL 仍叫 `https://saved-search-row.example/`（`:65`），是「search results」旧口径的命名残留；不参与任何断言，纯文案，可随下次顺手改。
- `docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md:259` 的 R2 状态行仍停在「R2 首轮修复完成，准备全量门禁 → rev9 快照 → R2 复审」，未登记 rev9 的 1 条 low 与 rev10 的对应修复。属收尾文档更新（主代理职责），不计入测试清理需修复项，建议在写入最终结论时补一轮 rev9→rev10 记录。

## 结论

- 需修复项：0（本轮零问题）
