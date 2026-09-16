# Adjustment rev3 — 终审复审报告（归档门 / 子代理 A rev3）

- 日期：2026-09-17
- 范围：剪贴板历史面板调整与缺陷修复（清空语义单点化 + `clearing` 态 + 确认框焦点契约 + 失效筛选回退 + 空态区分 + 行布局/竖排按钮 + `CustomScrollArea` + 共享层收敛 + 样式 token 化 + 测试补强）
- 输入：`.review-diffs/changed-files-rev3.txt`（43 份）+ `*-rev3.diff` 全量重读；仓库实际源码只读交叉验证
- 方法：diff 全文重读 + 源码逐点核对 + **Chromium 实测**（Playwright chromium-1223，与 Tauri WebView2 同引擎）验证焦点行为
- 本次允许写入：仅本报告文件

## 结论（TL;DR）

| 级别 | 数量 | 说明 |
|------|------|------|
| critical | 0 | — |
| high | 0 | — |
| **medium** | **1** | M-01：清空进行中禁用「确定」按钮导致焦点逃出 `aria-modal`（上轮 M-01 **未完全兑现**，且新测试为假信心） |
| low | 13 | 见下（含 4 项已声明的「不修」项、3 项信息性） |

**归档门判定：仍有 1 项 medium 未闭环**。其余上轮修复（L-01 / L-02 / 测试补强）已核实通过；F1 / F2 / M3b / M2 / F4b 的「不修」判定经复核成立（F2 有低成本改进路径，见 L-C）。

---

## 1. 上轮（round2）发现核实

### M-01【未完全解决 → 本轮 M-01】

上轮修法：`closeConfirm` 改 `useCallback(..., [])` + `clearingRef` 守卫，焦点陷阱 effect deps 收敛为 `[confirmOpen, closeConfirm]`（确实不再因 `clearing` 变化重建——这部分**有效**）。

**但焦点在清空期间仍会逃出对话框**，机制从「effect 重建」换成了「被聚焦按钮被禁用」：

- `ClipboardHistoryHeader.tsx:207-209` `handleClear` 同步置 `clearingRef.current = true` 后 `setClearing(true)`。
- `ClipboardHistoryHeader.tsx:348-379`：`✕` / 取消 / 确定三个按钮全部 `disabled={clearing}`，而打开对话框时焦点被显式放在确定按钮上（`ClipboardHistoryHeader.tsx:169`）。
- 浏览器在「当前聚焦元素被置为 disabled」时会把焦点移交给 `<body>`。**Chromium 实测（同 WebView2 引擎）**：

```
RESULT1 {"before":"confirm","afterDisabled":"BODY","insideAfter":false}
RESULT2 {"before":"confirm","after":"BODY","inside":false}   // 三个按钮同时 disabled
```

- 焦点陷阱 effect 因 deps 未变而不会重建/拉回焦点；且当三个按钮都 disabled 时 `ClipboardHistoryHeader.tsx:176-182` 的 Tab 循环取到 `focusables.length === 0` 后直接 `return`（未 `preventDefault`），Tab 会自然离开对话框 → `aria-modal` 契约在清空窗口内被破坏。
- 触发条件正是本次新增的「收窄清空」路径：`ClipboardHistoryHeader.tsx:214-216` 对 `visibleItems` 串行 await（最多 200 次往返），窗口期可达秒级；未收窄路径（单次 `clearAllClipboard`）窗口极短，用户基本无感。

严重级别：**medium**（a11y 契约破坏 + 键盘可达性，且为上一轮同名问题的残留）。分类：Correctness / Accessibility。

建议修复（任选其一，推荐 ①）：
1. 清空开始时把焦点移到面板容器：给 `ClipboardHistoryHeader.tsx:339-345` 的 `adl-prompt-modal__panel` 加 `tabIndex={-1}`，在 `handleClear` 置 `clearing` 前 `confirmPanelRef.current?.focus()`；或
2. 不禁用「确定」按钮，改用 `clearingRef` 做重入守卫 + `aria-disabled`/`aria-busy` + `pointer-events: none`，保持其可聚焦；或
3. Tab 处理器在 `focusables.length === 0` 时 `event.preventDefault()` 并把焦点落在面板容器上。

**测试真实性**：`ClipboardHistoryHeader.test.tsx:185-192`（尤其 189-190 行 `expect(dialog.contains(document.activeElement)).toBe(true)`）在 jsdom 下通过，但 jsdom 不会在元素被 disabled 时主动失焦，因此该断言在真实浏览器中为**假信心**。修复时请改为断言「所选修复的可观测结果」（如面板容器获得焦点 / `aria-disabled` 且仍可聚焦），或直接以真实浏览器验证。

### L-01【已修 · 确认通过】
`ClipboardHistoryHeader.tsx:167-168` 在 effect 起始捕获 `trigger`/`filterFallback`，cleanup（196-204 行）读取 `trigger.disabled` 实时属性并回退到筛选按钮；无 stale-ref 依赖告警。测试 `ClipboardHistoryHeader.test.tsx:207-216` 覆盖通过。

### L-02【已修 · 确认通过】
`ClipboardHistoryHeader.tsx:348-357` 的 `✕` 在 `clearing` 期间 `disabled`，且 `onClick` 走 `closeConfirm()`（受 `clearingRef` 守卫）。测试 187-188 行断言三个按钮禁用。

### 新增测试【确认存在】
打开聚焦 / 关闭归还（197-205）、触发禁用回退（207-216）、清空期间留在 dialog（174-195）、筛选菜单完整键盘模型（241-273）。其中「清空期间留在 dialog」为假信心（见 M-01）。

### F1【不修 · 复核成立】
未收窄时 `clearAllClipboard()` 会清掉 `list(200)` 窗口外条目（`utilitiesActions.ts:19-35` limit=200）。按钮/文案为「清空全部剪贴板历史」，`clearScope === null` 即未收窄，行为与文案一致；收窄时逐条删除严格匹配。判定成立。

### F2【不修 · 判定成立，但存在低成本改进】
`ClipboardHistoryHeader.tsx:214-216` 串行 await + 每次 store 更新触发重渲染。正确性优先于性能的选择成立；改进建议见 **L-C**（分片并行 / 进度反馈），属独立需求。

### M3b【已声明 · 复核确认真实存在】
`searchPattern.ts:25-28` 新增 `if (!query.trim()) return undefined;`，使文件面板 `useSearchPanel.ts:62-67` 的 `handleReplace` 对纯空白查询由「`/\s+/g` 全量替换」变为 no-op（`filteredResults` 因 `useSearchPanel.ts:50-52` 先行短路不受影响）。影响面极小、已声明不修，登记为 **L-E**。

### M2 / F4b【已声明 · 复核成立】
`ClipboardItemRow.tsx:65-71` 的 `role="button"` 行内含子 `<button>` 与 `CopyButton` 的 `role="button"` span（`CopyButton.tsx:111-123`）——ARIA 交互控件嵌套不合法。用户明确要求「整行点击放大查看」，子控件均 `stopPropagation` 且有测试覆盖。判定成立，登记为 **L-K**。

---

## 2. 本轮发现（逐条）

### M-01（medium）清空进行中焦点逃出 `aria-modal`
见上「上轮 M-01」小节（文件/行号、Chromium 证据、修复建议、假信心测试均已列出）。

### 低级别 / 改进项

- **L-A（low，a11y / 键盘）** `ClipboardHistoryHeader.tsx:129-132`：筛选菜单按 Tab 直接 `setFilterOpen(false)` 关闭，但不管理焦点；被聚焦的 `menuitemradio` 随即被卸载 → 焦点落到 `<body>`，后续 Tab 从文档起点开始而非触发按钮之后。建议与 Escape 同路径归还触发按钮（或把焦点移到触发按钮后的下一个可聚焦元素）。
- **L-B（low，正确性 / 健壮性）** `ClipboardHistoryHeader.tsx:207-209`：`clearingRef.current = true` 只写不读；`handleClear` 入口无重入守卫。极端情况下（同 tick 内重复 Enter/双击、或自动化连点）可能在首帧重渲染禁用前启动第二个删除循环 → 重复 delete + 冗余错误捕获。建议入口加 `if (clearingRef.current) return;`。
- **L-C（low，性能 / UX 改进）** `ClipboardHistoryHeader.tsx:214-216` + `348-379`：收窄清空最多 200 次串行往返，期间仅 `aria-busy` 与禁用态，无可视进度。建议分片并行（如 `Promise.allSettled` 每批 5-10 条，仍按 id 严格删除，不改变语义）或加最小进度提示。这是 F2「不修」之外最低成本的优化路径。
- **L-D（low，Design）** `clipboardClearScope.ts:27-61`：返回值（展示文案）同时充当「是否收窄」的布尔信号（`ClipboardHistoryHeader.tsx:62-75` 的 `?? null` + `88-91` 的 `clearScope ? ... : ...`）。建议改为判别式结果（如 `{ narrowed: boolean; description: string }`），把展示与流程解耦。
- **L-E（low，回归/已声明）** 同 M3b：`searchPattern.ts:25-28` → `useSearchPanel.ts:63-67` 纯空白查询的 replace 变 no-op。真实但影响极小；若后续要恢复一致性，可在 `handleReplace` 侧自行判空 trim。
- **L-F（low，信息性）** `formatT.ts:19-21`：单遍替换仅识别 `\{(\w+)\}`。现有 key 全部满足；未来若出现含 `-`/`.` 的占位符名会静默不替换。建议在模板校验处补一条 key 占位符命名约束。
- **L-G（low，性能 / 预存）** `ClipboardHistoryList.tsx:81-103` 的 `filtered` 每 2s 轮询因 `setClipboardHistory(result.data)` 产生全新对象而重算，`memo(ClipboardItemRow)`（`ClipboardItemRow.tsx:24`）因此永不命中，全列表每 2s 重渲染。预存行为，登记不改。
- **L-H（low，信息性 / 预存）** `ClipboardHistoryHeader.tsx:234-236` `role="status" aria-live="polite"`：计数在轮询/输入时高频变化会持续播报。上轮已判定为预期语义，保留记录。
- **L-I（low，性能 / 预存）** `crates/server/src/handlers/clipboard.rs` `serve_png`：`tokio::fs::read` 整文件读入内存。缩略图预存即如此；新增的**原图**路由（`/clipboard/image/:filename`）在超大截图场景下内存峰值更高。建议后续改用流式响应。
- **L-J（low，UX）** `ClipboardHistoryHeader.tsx:237-248`：`TooltipSimple` 包裹的按钮在 `disabled`（无可见条目）时不触发指针事件，tooltip 不显示。可接受；若需提示需外层包裹元素。
- **L-K（low，已声明）** 行 `role="button"` 嵌套交互控件（同 M2/F4b）。
- **L-M（low，已声明）** `leftbar-clipboard.css`：`.adl-clipboard { overflow: hidden }` 会在极窄侧栏裁切筛选下拉（L-03）。已声明不修。

---

## 3. 分级维度逐项结论

1. **Design**：清空语义单点化（`clipboardClearScope.ts` 驱动动作 + tooltip/aria + 标题 + 正文）、过滤入参单点化（`clipboardFilter.ts` + List 单点派生 `visibleItems` 下传 Header）、类型标签单点化（`clipboardKind.ts`）、时间格式化收敛（`relativeTime.ts` 被 NotificationCard 复用）——结构清晰，无重复权威。唯一设计瑕疵为 L-D。
2. **Correctness**：范围与文案严格同源（`clearScope === null` ⇔ 未收窄 ⇔ 全清；非空 ⇔ 逐条删可见项，`visibleItems` 与 scope 同条件派生）；边界（空白查询、面板关闭忽略查询、非法正则 → 空结果且按钮禁用、失效筛选回退 `all`）均已核对正确；`try/finally` + `clearingRef` + `closeConfirm` 守卫闭合了并发关闭路径。**扣分点为 M-01 焦点契约**。测试真实性：新增断言基本真实，唯一假信心项见 M-01。
3. **Security & Performance**：Rust 静态资产 basename 归一化 + 遍历/退化名测试（含同名跨目录判别）充分；`encodeURIComponent` 正确；读错误统一 404 且非 NotFound 记 warn。性能见 L-C / L-G / L-I。
4. **Standards**：i18n 全覆盖（zh/en 同步新增 14 key，`clipboardLocalNote` 与死样式已彻底移除，grep 无悬挂引用）；无调试日志遗留；promise 处理规范（`void` + `.catch`）；`Object.hasOwn`/单遍替换符合当前 TS 目标（既有 tsc 0 错误背书）。
5. **Optimization & Improvement**：F1/F2/M3b/M2/F4b 四项「不修」逐项复核——判定成立；其中 F2 给出 L-C 的低成本改进路径，其余登记为独立清理项（L-E ~ L-M）。

---

## 4. 覆盖清单核对（43/43）

已逐份重读：Rust（clipboard.rs / router.rs）、桥接（httpBridge.ts / mock-clipboard.ts / preview-bridge / shared/ipc/clipboard.ts）、共享（overlayManager.ts、formatT.ts、relativeTime.ts、searchPattern.ts、CopyButton.tsx、NotificationCard.tsx）、功能（Header / List / Row / Viewer / clipboardClearScope / clipboardFilter / clipboardKind / slice / useSearchPanel）、i18n（zh-CN / en-US / formatT 测试）、样式（leftbar-clipboard / composer-core / browser-webview）、图标（core.tsx / index.ts / core.test.tsx）、测试（CopyButton / clipboardClearScope / clipboardFilter / Header / List / Row / Viewer / relativeTime / searchPattern / httpBridge / overlayManager）、docs（progress / README）。

## 5. 最终裁定

- **子代理 A（rev3）**：**不通过**——存在 1 项 medium（M-01 焦点契约残留）。修复 M-01 并同步修正其假信心测试后即可闭环。
- 0 critical / 0 high；13 项 low（4 项已声明不修、3 项信息性、6 项建议性）。
