# 「放大查看」能力 — rev3 全量复审报告（Agent 1 / round 3 · 归档门禁）

> 自包含报告。审阅对象：`.review-diffs/changed-files-rev3.txt` 所列 **43 份文件的 rev3 全量 diff**（逐份完整重读，非增量）。
> 方式：Read 全部 rev3 diff + Read 仓库实际源码交叉验证（源码**只读**；未执行任何 git 命令；未修改任何源码/配置/文档）。
> 唯一写入：本报告。
> 范围重点：原图路由与本轮修复（`GET /clipboard/image/:filename`、`getImageUrl` 三端 + Tauri 继承、`ClipboardItemViewer.tsx`、`utils/searchPattern.ts`、`utils/relativeTime.ts`、`i18n/formatT.ts`、`IconExpandCorners`、`.adl-clipboard-viewer` 注册 `overlayManager`）。

---

## 0. 结论摘要（归档门禁判定）

| 维度 | 结论 |
|------|------|
| critical | **0** |
| high | **0** |
| medium | **1**（M-R1：清空期间 `aria-modal` 内无任何可聚焦元素 → Chromium `blur-on-disable` 使焦点逃出模态框；L-02 修复引入的联动回归，L-03 未同步处理） |
| low | **16**（L-R1 ~ L-R16；含既有/已声明项复核） |
| 上轮修复核实 | **M1 ✓ / M3 ✓ / L2·L3（清空焦点）部分通过 / L-01 ✓ / L-02 ✓**，新增测试全部落地；无 critical/high 回归 |

**归档判定：不通过（1 medium）。** M-R1 为一行级修复（或在联动项上做等价处理），修完可归档。

---

## 1. 上两轮修复逐项核实

### M1（round1）查看器遮罩 `target === currentTarget` 守卫 — **确认通过**
- 实现：`frontend/src/app/features/clipboard-history/ClipboardItemViewer.tsx:56-64`
  - 遮罩 `onClick` 内 `if (event.target === event.currentTarget) onClose()`（:60-62）；面板 `onClick={(event) => event.stopPropagation()}`（:70）。
- 回归测试：`__tests__/ClipboardItemViewer.test.tsx:56-62`
  - `click(dialog)` → `onClose` **未**调用 ✓；`click('.adl-clipboard-viewer')` → 调用 1 次 ✓。
- 与 rev2 快照一致，无回归。

### M3（round1）`formatT` 单次替换语义测试 — **确认通过**
- 实现：`frontend/src/app/i18n/formatT.ts:8-21`，`str.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(vars, name) ? String(vars[name]) : match)`。
- 测试：`i18n/__tests__/formatT.test.ts`，7 用例真实覆盖（无 vars / 字符串+数字 / 单次替换 / 注入值不二次扫描（含 `$&` 回退） / 未知占位符保留 / 缺 key 回退）。旧实现会在"注入含 `{other}`"与"`$&`"两处串扰，属真回归守护 ✓。

### L2·L3（round2）`clearing` 期间焦点逃出 — **主体已修，但残留 1 medium（见 §2 M-R1）**
- 已落地：`ClipboardHistoryHeader.tsx:45` `clearingRef`；`:157-161` `closeConfirm` deps `[]` 且以 `clearingRef.current` 守卫；`:205` 焦点陷阱 effect deps 收敛为 `[confirmOpen, closeConfirm]`（`closeConfirm` 稳定 → 不再因 `clearing` 重建）。
- 回归测试：`ClipboardHistoryHeader.test.tsx:179-201`「keeps the confirmation dialog open while clearing is in flight」断言 Escape 不关闭 + 三按钮禁用 + `dialog.contains(document.activeElement)`。
- **残留**：断言只在 jsdom 下成立（见 §2 M-R1）。

### L-01（round2）关闭时触发按钮可能已禁用 → 回退聚焦 — **确认通过**
- 实现：`ClipboardHistoryHeader.tsx:196-204`，cleanup 内 `if (trigger && !trigger.disabled) trigger.focus(); else filterFallback?.focus();`（实时读 `disabled`）。
- 测试：`ClipboardHistoryHeader.test.tsx:213-222`「falls back to the filter button when the trigger is disabled on close」✓。

### L-02（round2）`✕` 在清空期间未禁用 — **确认通过（但引入联动回归，见 M-R1）**
- 实现：`ClipboardHistoryHeader.tsx:352` `disabled={clearing}`；测试 `:191-194` 断言 ✕/取消/确定 均禁用 ✓。

### 新增测试 — **全部落地**
- 打开聚焦确认按钮 + 关闭归还触发按钮：`ClipboardHistoryHeader.test.tsx:203-211` ✓
- 清空期间三按钮禁用 + Escape 不关闭：`:179-201` ✓
- 触发按钮禁用时的回退聚焦：`:213-222` ✓
- 筛选菜单键盘模型（打开聚焦选中项 / Arrow/Home/End / Escape 归还 / Tab 移出 / 焦点逃出重入）：`:234-273` ✓
- 查看器 Tab 陷阱 + 焦点还原：`ClipboardItemViewer.test.tsx:64-76` ✓

---

## 2. 新发现问题

### M-R1【medium / Accessibility-Correctness】**清空期间对话框内没有任何可聚焦元素 → Chromium 焦点修正规则把焦点移到 `<body>`（模态框外）；L-02 修复使该路径真正可达，L-03 未同步处理**

- 位置：
  - `frontend/src/app/features/clipboard-history/ClipboardHistoryHeader.tsx:352,366,375`（`✕` / 取消 / 确定 在 `clearing` 期间**全部** `disabled`）
  - `:177-182`：`const focusables = Array.from(confirmPanelRef.current?.querySelectorAll('button:not([disabled])') ?? []); if (focusables.length === 0) { return; }` —— 该分支**直接 `return`，未 `preventDefault()`**
  - `:169` 打开时聚焦确认按钮（被聚焦元素随 `clearing` 变为 disabled）
- 机理（两段，均指向同一结果）：
  1. **焦点修正（主路径，无需用户操作）**：被聚焦的确认按钮在 `clearing` 提交阶段变为 `disabled`。按 HTML 规范「当被聚焦元素不再可聚焦时，UA 应同步对 `body` 执行聚焦步骤」，Chromium/Blink（= 本项目 WebView2 + 浏览器预览内核）把 `document.activeElement` 变为 `<body>`。参考：ally.js 兼容表 "Chrome: active after disabling = body"，及 WHATWG focus fixup rule。
  2. **Tab 逃逸（次路径）**：`focusables.length === 0` 分支不再 `preventDefault()`，用户按 Tab 时原生顺序导航把焦点移出对话框（`✕` 禁用前它曾是清空期间唯一的在框内落点，正是上一轮 L-03 明确标注的"修复 L-02 时必须同步处理"的联动项）。
- 为什么是回归：`adjustment-rev2-report.md` 第 95-96 行把 L-03 标为「当前因 `✕` 永不禁用而不可达；一旦按 L-02 修复即变为可达缺陷（需改为 `event.preventDefault()`）」。rev3 修了 L-02，**未**同步处理 L-03；同时 L-02 的 `disabled` 让原本"Tab 可落回框内 `✕`"的兜底消失。
- 为什么测试没发现：`ClipboardHistoryHeader.test.tsx:196` 断言 `dialog.contains(document.activeElement)`，但 **jsdom 不实现 disabled 的焦点修正**（不会把 focus 移给 `body`），因此该断言在 jsdom 恒真、在 Chromium 恒假 —— 属**假信心**。
- 影响：`handleClear` 的收窄分支为 **≤200 次串行 await**（HTTP 往返 × N），窗口可持续数百毫秒到数秒；期间 `aria-modal="true"` 的对话框外持有焦点，违约；用户按 Tab 也无法回到框内（无落点）。终态（`setConfirmOpen(false)` 后 cleanup 归还焦点）正确，故影响集中在清空窗口。
- 建议修复（任一即可闭环 M-R1 + L-03 + 测试缺口）：
  - **方案 A（推荐，改动最小）**：清空期间不要用原生 `disabled`，改用 `aria-disabled="true"` + `onClick` 逻辑拦截（`clearingRef.current` 守卫），保留确认按钮（或 `✕`）可聚焦 → 焦点不触发修正，Tab 也仍有框内落点。
  - **方案 B**：给面板 `tabIndex={-1}`，在 `handleClear` 内 `setClearing(true)` 前同步 `confirmPanelRef.current?.focus()`；并把 `:180-182` 改为 `event.preventDefault(); confirmPanelRef.current?.focus();`。
  - **方案 C**：`✕` 恢复常驻可聚焦（撤销 L-02 的 disable），仅在 clearing 时以 CSS/`aria-disabled` 表达"进行中"，点击走 `closeConfirm` 守卫；同时补 `preventDefault()`。
- 测试补充：`fireEvent.keyDown(document, { key: 'Tab' })` 后断言 `dialog.contains(document.activeElement)`，并（在真实浏览器/WebView2 手测）确认清空期间 `document.activeElement !== document.body`。

---

### Low / 信息项

| 编号 | 严重度 | 类别 | 位置 | 描述 | 建议 |
|------|--------|------|------|------|------|
| L-R1 | low | A11y（既有 L-04） | `ClipboardHistoryHeader.tsx:129-132` | 筛选菜单按 Tab 仅 `setFilterOpen(false); return;`，未 `preventDefault`/未显式归焦；被聚焦菜单项卸载后默认 Tab 从 `body` 起算，落点不保证 | `event.preventDefault(); closeFilterMenu(true)` |
| L-R2 | low | 健壮性（既有 L-05） | `ClipboardHistoryHeader.tsx:112-114,133-147` | 键盘导航使用"打开瞬间"捕获的 `items` 快照；2s 轮询可能改变 `kindCounts`，旧节点脱离 DOM → 方向键 no-op | 每次 keydown 现查 `querySelectorAll` |
| L-R3 | low | Standards-i18n | `ClipboardHistoryHeader.tsx:279` `` aria-label={`${t.clipboardFilter}: ${activeFilterLabel}`} `` | aria-label 内硬编码 `": "` 分隔符（项目规则要求展示文本走 i18n） | 新增含占位符 key，用 `formatT` |
| L-R4 | low | 可读性（既有 L-07） | `ClipboardHistoryList.tsx:122` `formatT(t, 'searchOptions')` | 无变量的 key 走 `formatT`，可直接 `t.searchOptions` | 直接取 `t` |
| L-R5 | low | 健壮性（新） | `ClipboardHistoryHeader.tsx:218-219` + `stores/actions/utilitiesActions.ts:45-52` | `handleClear` 的 `catch {}` 静默吞掉**传输层 reject**；store 的 `captureError` 只在 `ok:false` 时触发，故网络级失败既无提示、也不继续删剩余项。注释"已由 store 层 captureError 呈现"对此不成立 | `catch (e) { captureError(...) }` 或让 store 在 reject 时也 captureError |
| L-R6 | low | 健壮性（既有 L-16） | `ClipboardItemRow.tsx:34` `void removeClipboardItem(item.id)` | 传输层 reject 时 unhandled rejection；`clearAllClipboard` 同理 | `.catch(() => {})` 或 store 内兜底 |
| L-R7 | low | 性能 | `ClipboardHistoryList.tsx:41,182` + `ClipboardItemViewer.tsx` | 查看器持有条目快照，条目被轮询/清空删除后仍展示陈旧内容（遮罩挡住列表，切换不可达） | 条目消失时自动关闭，或 `key={item.id}` |
| L-R8 | low | 健壮性 | `ClipboardItemViewer.tsx:28-30` | `imageStage` 初始值仅挂载时求值，`item` 变更不重置（当前无切换路径，不可达） | 未来复用时 `key`/effect 重置 |
| L-R9 | low | A11y | `ClipboardItemViewer.tsx:44-48` | Tab 陷阱对 Shift+Tab 同样强制聚焦关闭按钮（形状上可接受，但非标准首尾循环） | 保持或改为标准 wrap |
| L-R10 | low | 观察项 | `ClipboardItemViewer.tsx:58-63` | "面板内拖选、遮罩上松手"时 `click` 的 target 可能仍是遮罩 → 仍会关闭；jsdom 无法复现 | 需真实浏览器手测；必要时加 `window.getSelection()` 判空 |
| L-R11 | low | 文档 nit | `shared/ipc/clipboard.ts:60,72`（`@see mock-bridge.ts`） | 指向的 `mock-bridge.ts` 仅转发 `mock/mock-clipboard.ts`，无 `getImageUrl` 实现行，`@see` 语义误导（既有写法沿用） | 改为 `mock/mock-clipboard.ts` |
| L-R12 | low | 性能（已声明 L-19） | `crates/server/src/handlers/clipboard.rs:140-141` | `serve_png` 固定 `image/png`、无 `Cache-Control`/`ETag`、整文件读入内存、无尺寸上限 | 后续架构决策；可选 `Cache-Control: private, max-age` |
| L-R13 | low | 样式（已声明 L-13/L-14） | `styles/regions/leftbar-clipboard.css:274,224,296` 等 | `justify-self:end`、`__preview max-width:100%`、`--bg-overlay` 死 fallback；裸字号 `10px/11px` 未 token 化 | 零风险清理项 |
| L-R14 | low | ARIA（已裁定接受 L-15） | `ClipboardItemRow.tsx:67`（行 `role="button"` 内嵌按钮/CopyButton） | 无效 ARIA 嵌套 + 每行 4 个 tab stop；用户已裁定整行点击放大 | 仅留痕 |
| L-R15 | low | 性能（既有） | `ClipboardHistoryList.tsx:51-72`（2s 轮询）、`ClipboardItemRow.tsx:24`（`memo`）、`clipboardHistorySlice` | 轮询换新数组/对象引用 → `memo` 基本不命中、`formatRelativeTime` 每 2s 重算、`kindCounts` useMemo 每 2s 重算、失效回退 effect 空跑 | 结构共享（按 id 复用对象）为可选独立优化 |
| L-R16 | low | 文档一致性（既有 L-18） | `docs/root-cause-resolution/2026-09/progress-2026-09-16-205905.md` | 进度日志中"删除 `clipboardClearAll`"等陈述与最终代码不符（实际保留 `clipboardClearAll`、新增 `clipboardClearConfirmAll`）；"21 项/22 项"口径不一；rev4-rev6 段落称某些文件"不在本轮 diff"而 rev3 快照实际包含 | 归档 doc 顶部加"以 `changed-files-*` 清单为准"或校正 |

> 说明：L-R5/R6 为"传输层 reject 未呈现"的同一类；L-R1/L-R2 为既有低风险项复核；L-R12~L-R16 维持上一轮"不修"判定（改进空间已逐项检查，均非阻断）。

---

## 3. 端到端链路 / 安全性 / 一致性核查（通过项）

1. **原图路由（Rust）** — `router.rs:83` 注册 `GET /clipboard/image/:filename` → `handlers/clipboard.rs:171-176` → `serve_png(state.clipboard_store.images_dir(), …)`；`serve_png`（:132-156）以 `Path::new(filename).file_name()` 归一化为 basename，空名 404；非 `NotFound` 读错误记 `tracing::warn!`（仅记归一化 `safe`，不外泄）。测试 `image_serves_stored_original_and_404s_unknown` 用**同名文件跨目录 + 字节级判别**证明原图路由不取缩略图；`asset_routes_reject_traversal_and_degenerate_names` 覆盖 6 种穿越/退化变体，断言 404。断言有效，非假信心。
2. **桥接三端 + Tauri 继承真实成立** — `shared/ipc/clipboard.ts:75` 新增 `getImageUrl` 契约；`httpBridge.ts:663-673` 抽出 `clipboardAssetUrl(baseUrl, segment, filePath)`（`getThumbUrl`/`getImageUrl` 复用，basename + `encodeURIComponent`，`satisfies ClipboardBridge`）；`mock/mock-clipboard.ts:13` `getImageUrl: () => ''`；`preview-bridge/index.ts:244-256`（`...preferHttpWhenReachable` 后显式覆盖 `getImageUrl` 恒走 http）；Tauri `tauri-bridge/index.ts:38,44` `...http` 继承且 `clipboard` 域无覆写（:49-89 仅覆盖 workspace/pty/dsh/window/app/browser/reserved/storage）。四实现齐备，编译期由 `DigitalLifeBridge.clipboard: ClipboardBridge`（`digital-life.ts:163`）约束。
3. **查看器** — `createPortal(..., document.body)` 规避 `overflow:hidden`/层叠上下文；`.adl-clipboard-viewer` 已入 `overlayManager.ts:12`，选择器计数 18 与 `overlayManager.test.ts` 一致；`image → thumb → icon` 三级回退状态机正确（`imageUrl ? 'original' : 'thumb'` 起步；`onError` 函数式 `original→thumb→none`）；遮罩守卫、Escape、打开聚焦关闭按钮、卸载归还 `previouslyFocused`、Tab 圈定均有测试。
4. **i18n 完整性** — 新增 `clipboardClearFiltered/ConfirmAll/ConfirmScoped/Scope*/ListSeparator/NoMatch/Filter/FilterAll/Copy/ZoomView` 在 zh/en 双份齐备且镜像；被删除/改义的 `clipboardLocalNote`、`clipboardClearConfirm`（非 `*All/*Scoped`）在 `src/` 内 grep 0 命中（仅归档 doc 历史记录），无悬挂引用。
5. **过滤/清空单一权威** — `buildClipboardFilterInput` 与 `filterClipboardItems` 对"搜索面板关闭时忽略查询"口径一致；`buildClipboardClearScope` 单点派生 `clearLabel`/tooltip/aria/对话框标题/正文与执行分支，无"文案说筛选、实际清全部"；失效 `kindFilter` 自动回退 `all`（`Header.tsx:94-98`）。
6. **图标** — `IconExpandCorners`（`icons/core.tsx:97-110`）经 `makeFilled('0 0 25 24', …)` 输出 `fill="currentColor"`，源 SVG 的 `fill="#ffffff"` 已移除；`icons/index.ts:16` 导出；`core.test.tsx` 断言 viewBox/4 path/currentColor/子 path 无 fill。
7. **Token 合规/主题** — `.adl-icon-btn--danger-hover`（`browser-webview.css:509-513`）提权到 `(0,4,0)` 并改用 `--danger`/`--danger-soft`，暗色对比度达标；查看器/滚动条样式全部走 `var(--…)`，无新增硬编码色值。

---

## 4. 测试真实性总评

| 测试文件 | 真实性 | 备注 |
|---------|-------|------|
| `ClipboardItemViewer.test.tsx` | 真实（1 处假信心） | 遮罩/面板点击、Escape、Tab 陷阱+焦点还原、原图 src、两级回退。**假信心点**：jsdom 不模拟 disabled 焦点修正，`Header` 测试的 `dialog.contains(activeElement)` 在真实 Chromium 不成立（见 M-R1） |
| `ClipboardHistoryHeader.test.tsx` | 真实（同上） | 全清 vs 逐条、动态范围文案（含选项拼接）、Escape、clearing 期间不关闭+三按钮禁用、**焦点仍在 dialog 内（jsdom 限定）**、失效筛选回退、菜单计数、完整键盘模型、**打开聚焦/关闭归还/触发按钮禁用回退** |
| `ClipboardItemRow.test.tsx` | 真实 | 行点击不复制、子按钮 stopPropagation、图片写回、徽章+相对时间 |
| `ClipboardHistoryList.test.tsx` | 真实 | 空历史 vs 无匹配、行数=可见数、loading 排除、计数 role=status |
| `clipboardFilter.test.ts` / `clipboardClearScope.test.ts` | 真实 | 8 分支 + 类型/查询/组合/非法正则/大小写/全字/计数序/未知 kind |
| `searchPattern.test.ts` / `relativeTime.test.ts` | 真实（覆盖缺口同 rev2） | ≥30 天整桶分支仍无断言（既有 L5） |
| `formatT.test.ts` | 真实 | 7 项全覆盖（见 M3） |
| `CopyButton.test.tsx` | 真实 | 文本写剪贴板/execCommand 兜底/自定义 onCopy true/false/reject/双缺省 |
| `httpBridge.test.ts` | 真实 | 两 segment × Windows/POSIX + 空/退化路径 |
| `overlayManager.test.ts` | 真实 | 选择器包含 + 逗号格式 + 计数 18 |
| `icons/core.test.tsx` | 真实 | 见 §3.6 |

**新增测试缺口**：未覆盖"清空期间按 Tab，焦点仍在 dialog 内"（M-R1 / 原 L-03）。

---

## 5. Review dimensions 小结

1. **Design**：职责清晰（原图路由 / 桥接构造器 / 查看器 / 共享工具 / 图标），三级回退闭环；清空范围单一权威。无设计缺陷。
2. **Correctness**：端到端链路（Rust 路由 ↔ httpBridge ↔ 三实现 ↔ 查看器）、穿越防护、错误路径、非法正则、竞态均核实通过。**唯一 medium 为清空期间的焦点契约（M-R1）**，且测试无法守护。
3. **Security & Performance**：无新增风险；basename 归一化双侧 + 字节级回归测试；URL 只取 basename + `encodeURIComponent`；原图整读/无缓存头/无鉴权属既有整体取舍（已声明）。
4. **Standards**：i18n 全走 key、zh/en 镜像；bridge 三实现 + Tauri 继承齐备；Promise 处理除 L-R5/R6 外无未捕获路径；CSS 全 token 化、无硬编码文本（除 L-R3 分隔符）。
5. **Optimization & Improvement**：共享工具已抽取；已声明"不修"项（F1/F2/M2/L-19 等）逐项复核后**维持原判定**，改进空间见 §2 表。

---

## 6. 最终判定

- **critical：0**
- **high：0**
- **medium：1 — M-R1**（清空期间对话框内无可聚焦元素 → Chromium 焦点修正 / Tab 使焦点逃出 `aria-modal`；L-02 修复引入的联动回归，原 L-03 未同步处理；现有 jsdom 断言会造成假信心）
- **low：16**（L-R1 ~ L-R16）
- **上轮修复核实**：M1 ✓、M3 ✓、L-01 ✓、L-02 ✓、L2·L3（清空焦点）**部分通过**（自动逃逸已修，可达路径残留 → M-R1）；新增测试全部落地，无 critical/high 回归。

**归档门禁：不通过。** 建议对 M-R1 采用方案 A（`aria-disabled` + 逻辑守卫，保留一个框内可聚焦元素）或在 `focusables.length === 0` 分支补 `event.preventDefault()` 并给面板设 `tabIndex={-1}` 同步归焦，并补一条"清空期间 Tab 焦点仍在 dialog 内"的断言（及真实 WebView2/浏览器手测）。

> 本报告基于静态源码审查与测试分析（含 Chromium 焦点修正规则的规范/兼容性依据）；未运行构建/测试命令（审查为只读）。合并前建议按项目门禁复跑：
> `pnpm --dir frontend run lint && npx tsc --noEmit && npx prettier --check "src/**/*.{ts,tsx,css}"` 与 `cargo test -p adl-server --lib clipboard && cargo clippy --workspace --all-targets -- -D warnings`。
