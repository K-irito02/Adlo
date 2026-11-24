# clipboard-ui — R1 rev3 审查报告（rev2 定向复核）

## 范围

- 工作树：`E:\AI-DIGITAL-LIFE\SourceWorkspace-worktrees\slot-1`；base `595216f1f`；快照 `.review-diffs/*-rev3.diff`（只审 manifest-rev3「Scope ownership」中 `clipboard-ui` 的 15 个文件）。
- 只读核对：`CustomScrollArea.tsx`、`CopyButton.tsx`、`ZoomReadout.tsx`、`styles/testing/cssRules.ts`、`rightpanel/markdown-preview.css`、`crates/clipboard/src/{lib,store}.rs`、`crates/server/src/handlers/clipboard.rs`、`docs/.../progress-2026-11-24-214722.md` P4 段。
- 约束遵守：未运行 `git diff/log/show`；未改源码；未跑测试、未起 dev server / 浏览器（无端口占用）；判断用「读实现/用例 + 删除性推演」。

## 上轮问题关闭情况

- **F1（low，英文恒定 `aria-label` 含状态词）→ 已关闭。** 新增中性键 `clipboardWrap`（en `Word wrap` / zh `自动换行`），`aria-label={t.clipboardWrap}`（`ClipboardItemViewer.tsx:666`），状态文案移到 `title`（`:667`）；`aria-pressed` 与恒定名配对成立。删除性推演：改回 `t.clipboardWrapOn` 后 zh 两值相同、无测试变红 → 英文侧无回归保护，见「记录不修」1（可选加固，不改变行为）。
- **F2（low，docblock 对图片工具栏的绝对否定）→ 已关闭。** `:112-113` 改为「图片工具栏的步进/适应窗口按钮只设 `aria-label`（缩放读数由 `ZoomReadout` 自带 `title`）」。核对 `:853-894`：`−`/`+`/适应窗口 三按钮确无 `title`；`ZoomReadout` 读数按钮 `title={resetLabel}`（`ZoomReadout.tsx:123`）。逐句与实现相符。
- **F3（low，注释首句与实现相反）→ 已关闭。** `:665` 现为「aria-label 恒定（状态由 aria-pressed 表达），状态文案放 title。」与 `:666-667` 一致，旧的首句残留已删除。

## 新增发现

（rev3 其余改动为事项 4/5：短标题 + `IconClipboardClock`、短 tooltip 三键、触底自动加载、`list(500)`、三按钮统一圆角 + focus 灰底、底色改挂 `__body--active`、Markdown `nowrap` + padding 对齐。逐项核对：`500` 与 `MAX_HISTORY_ITEMS`（`store.rs:9`）及 handler `min(MAX_HISTORY_ITEMS)` 一致；`--radius-sm` 确为 2px、`--bg-hover` 亮色 `rgba(34,34,34,0.06)` 与证据同值；`@media (max-width:760px)` 两侧同值且为文件内唯一该断点；`nowrap`/透明底与样式测试断言一致；新增/改写注释的绝对表述均可由代码或测试证伪。无新增需修复项。）

## 记录不修

1. **英文侧 F1 修复无回归保护**：`ClipboardItemViewer.test.tsx:73-89` 用中文 mock，`clipboardWrap` 与 `clipboardWrapOn` 同值，改回旧写法不会变红。可选加固：用 en 词典断言关闭态下可访问名为 `Word wrap`（或断言 `en.clipboardWrap !== en.clipboardWrapOn`）。代码本身正确，本轮不计需修复。
2. §5.7 证据（`progress-2026-11-24-214722.md:192-197`）已覆盖亮/暗两套 `__body--active` 背景、Markdown 透明底与 padding、不换行态 `white-space: nowrap`；仍缺两项计算值：暗色主题下三按钮 `:focus-visible` 背景（现仅亮色清空按钮）、≤760px 视口下 `.adl-clipboard-viewer__scroll .adl-markdown-preview` 的 padding。三条按钮共用同一 `:focus-visible` 声明且无覆盖规则，样式文本已由测试绑定，风险低；建议主代理按需补测或记入 P5。
3. rev2 已记录项本轮未复现、未复发：搜索按钮 `aria-expanded` + 名称随状态变化（预存）；`startEditing` 置 `previewing=false` 但不写回偏好（「打开时默认态」语义）；`DEFAULT_WRAP/PREVIEW` 与 registry `fallback` 双份默认；`.adl-icon-btn.adl-clipboard__*` 圆角规则为 no-op 且相邻注释略过时（纯清理）；`clipboardClearFilteredTooltip: 'Clear filtered'` 文案风格。
4. `ClipboardHistoryList.tsx:245-255` 的自动加载无「距底 >48px 不追加」的负向用例（现有用例只覆盖触底追加）；属可选加固。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题。
- rev2 的 3 条 low 全部关闭；rev3 新增改动未见回归或契约错误。
