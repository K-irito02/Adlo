# clipboard-ui — R2 rev3 审查报告（死代码 / 冗余守卫 / 残留防御 / 诊断日志）

## 范围

- 工作树：`E:\AI-DIGITAL-LIFE\SourceWorkspace-worktrees\slot-1`；base `595216f1f`；快照 `.review-diffs/*-rev3.diff`（只审 manifest-rev3「Scope ownership」中 `clipboard-ui` 的 15 个文件）。
- 本轮视角（R2）：死代码、冗余守卫、根因修复后多余的防御、应删/降级的诊断日志；不重审 R1 已判定的正确性与设计项。
- 只读核对（绝对路径）：`adlo/frontend/src/app/features/clipboard-history/{ClipboardItemViewer,ClipboardHistoryHeader,ClipboardHistoryList}.tsx`、`clipboardViewerPrefs.ts`、`styles/regions/leftbar-clipboard.css`、`styles/regions/titlebar.css`、`styles/testing/cssRules.ts`、`features/file-tree/CustomScrollArea.tsx`、`components/CopyButton.tsx`、`crates/clipboard/src/store.rs`（核对注释中的 500/裁剪断言）。
- 引用面核对：对新增 15 个导出/键名逐一做全仓引用检索（`apply*/read*/set*ClipboardViewer*`、`resetClipboardViewerPrefsForTest`、`IconClipboardClock`、`clipboardTitle`、`clipboardSearchTooltip`、`clipboardClearAllTooltip`、`clipboardClearFilteredTooltip`、`clipboardPreviewTooltip`、`clipboardExportTooltip`），均为 0 孤儿。
- 约束遵守：未运行 `git diff/log/show`；未改源码；未跑测试、未起 dev server / 浏览器（无端口占用）；判断用「读实现/用例 + 删除性推演」。

## 上轮问题关闭情况

- R1 rev3 主表为 0 条；本轮无上轮主表 finding 需逐条复核。
- 复查 rev2 三条 low 的修复载体仍在位（R1 rev3 已关闭）：`aria-label` 恒定 + 状态文案进 `title`（`ClipboardItemViewer.tsx:666-667`）；docblock 对图片工具栏的限定表述（`:112-113`）；`aria-label` 注释首句与实现一致（`:665`）。均未出现回退。

## 新增发现

（本轮零问题。逐项核对结论：）

- **死代码**：被移除的 `TooltipSimple` 在本文件已无残留引用，`@icons` 导入全部在用；`adl-clipboard-viewer__scroll-shell--active` 在 TSX / CSS / 测试三处均已消失（全仓 0 命中），旧 `.adl-clipboard-viewer__scroll-shell{transition}` 已随底色迁移删除，`--radius-md` 亦不再在本文件出现；`.adl-clipboard__toolbar .adl-clipboard__clear` 被 (0,2,0) 的 `.adl-icon-btn.adl-clipboard__clear` 完整取代（同一条 `border-radius` 声明，非双写）；`IconClipboardList` 换下后仍有消费方（`useFileContextMenuItems.tsx:186`），未成孤儿；`clipboardHistory` / `clipboardSearchPlaceholder` 等旧键在切换新 tooltip 键后仍被 aria-label／placeholder／section 名使用。
- **冗余守卫**：`ClipboardHistoryList.tsx:248` 的提前返回与 `Math.min(..., filtered.length)` 不是双保险失效对——前者省掉触底时每次 scroll 的无变化 setState，后者约束单次步进，移除任一侧都仍有行为差异；`enterPreview` 的空白草稿守卫（`:491`）不是冗余——`commitIfEditing` 对空白返回 `undefined`（`:341-343`），删掉该守卫会让空白草稿进入预览态，属载荷路径。
- **残留防御**：`previewActive = canPreview && previewing`（`:622`）的引入使 RTF/图片不再切换内容面；三处 `hidden` 与底色 class 均改由它派生，没有旧 `previewing` 直判残留在内容面分支（仅按钮三处仍用 `previewing`，且按钮处于 `canPreview &&` 内，两者等价，非死分支）。
- **诊断日志**：`clipboard-history/`、`stores/actions/utilitiesActions.ts`、`stores/persisted/registry.ts` 本轮无新增 `console.*` / `debugLog`；`ClipboardHistoryList` 新 `onScroll` 已在 `CustomScrollArea.tsx:10,186` 真实挂到滚动 div（测试的 `fireEvent.scroll` 同样打在该节点），非空接线。
- **注释/事实**：`list(500)` 的「500 与 `MAX_HISTORY_ITEMS` 对齐、存储层按最旧优先裁剪」与 `crates/clipboard/src/store.rs:9,32,102`（`prune_to(MAX_HISTORY_ITEMS)`、保留最新 500 行）一致；CSS 注释称 padding「由样式测试守护」与 `clipboard-viewer-markdown.test.ts` 两条断言对应。

## 记录不修

1. **样式测试自建 at-rule 提取器**：`styles/clipboard-viewer-markdown.test.ts:39-67` 的 `ruleBodyInMedia` 自行实现了花括号深度扫描 + 正则取体，而 `styles/testing/cssRules.ts:1-3` 明文写「单一真源，测试文件禁止再复制本实现」。现状无实际误判（该 `@media` 块内无注释包裹的同名规则），但口径可能与 `findRuleGroups` 单边演化。建议：给 `cssRules.ts` 增加媒体块作用域提取（如 `ruleBodyInAtRule`）后改用它；属测试层可选加固，不改生产行为，本轮不计需修复。
2. **换行按钮 title 的状态切换无断言**：`ClipboardItemViewer.tsx:667` 的 `title={wrap ? on : off}` 只在开启态被断言，且 zh 词典 `clipboardWrap` 与 `clipboardWrapOn` 同值，改回恒定 title 不会变红（与 R1 rev3「记录不修 1」的英文侧缺口同源）。可选加固：断言关闭态 `title === '不自动换行'`，或断言 en 词典 `clipboardWrap !== clipboardWrapOn`。
3. **默认值双份**：`clipboardViewerPrefs.ts:10-11` 的 `DEFAULT_WRAP/DEFAULT_PREVIEW` 与 `registry.ts:1132,1140` 的 `fallback` 各存一套（水合前首帧读前者、水合器读后者）。语义当前一致，改一处漏一处会静默分叉；沿用 rev2 记录，不改。
4. **测试重置助手的命名**：`resetClipboardViewerPrefsForTest` 与仓内惯例 `__resetFaviconDisplayCacheForTest`（`components/faviconDisplayCache.ts:95`）前缀不一致；仅命名风格，不影响行为。
5. 预存项本轮未复现、未复发：头部搜索按钮 `aria-expanded` + 名称随状态变化（`ClipboardHistoryHeader.tsx:266-267`，仍属 §4 a11y 规则违例，rev2/rev3 已记录）；`startEditing` 置 `previewing=false` 但不写持久值（「打开时默认态」语义，rev2 已记录）；`ClipboardHistoryList.tsx:245-255` 无「距底 >48px 不追加」的负向用例。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题。
- 本轮为死代码/冗余守卫/残留防御/诊断日志视角，未发现回归或契约错误；4 条可选加固/已记录项归入「记录不修」。
