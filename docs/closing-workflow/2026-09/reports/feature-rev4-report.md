# Code Review Report — rev4 归档 gate（Agent 1 / 需求相关类型）

- 轮次：round 4（rev4，归档 gate，全量重看最新完整 diff）
- 范围：需求相关类型（新功能）— 原图路由 + `getImageUrl` 三端桥接；查看器 `ClipboardItemViewer.tsx`；共享 `utils/searchPattern.ts`、`utils/relativeTime.ts`、`i18n/formatT.ts`；图标 `IconExpandCorners`；`overlayManager` 注册。同时核实 rev4 前的 M-R1（round3 medium）修复与筛选按钮可访问名 i18n 修复。
- 输入：`.review-diffs/` 下 rev4 diff 快照（清单 `changed-files-rev4.txt`），关键快照见下；另用 Read 读取实际源码交叉验证（只读）。
  - `..._ClipboardItemViewer.tsx-rev4.diff`
  - `..._ClipboardItemViewer.test.tsx-rev4.diff`
  - `..._ClipboardHistoryHeader.tsx-rev4.diff`（M-R1 修复所在）
  - `..._ClipboardHistoryHeader.test.tsx-rev4.diff`
  - `..._crates_server_src_handlers_clipboard.rs-rev4.diff`
  - `..._shared_ipc_clipboard.ts-rev4.diff`、`..._httpBridge.ts-rev4.diff`
  - `..._app_utils_searchPattern.ts-rev4.diff`、`..._app_utils_relativeTime.ts-rev4.diff`、`..._app_i18n_formatT.ts-rev4.diff`、`..._i18n___tests___formatT.test.ts-rev4.diff`
  - `..._app_icons_core.tsx-rev4.diff`、`..._shared_overlayManager.ts-rev4.diff`
  - 辅助：`clipboardFilter.ts`、`clipboardClearScope.ts`、`clipboardKind.ts`、`ClipboardItemRow.tsx`、`ClipboardHistoryList.tsx`、`mock-clipboard.ts`、`preview-bridge/index.ts`、`clipboardHistorySlice.ts`、`router.rs`、`leftbar-clipboard.css`、`composer-core.css`、`browser-webview.css`、各 `__tests__`。
- 审查维度：1 Design / 2 Correctness / 3 Security & Performance / 4 Standards（i18n 双份键、无硬编码文案）/ 5 Optimization & Improvement（含既有代码）。
- 终端约束：本报告为**唯一允许写入**的文件；未修改任何源码/配置/文档。**未在终端执行任何 git 命令**。

---

## 1. 结论摘要

| 项 | 结果 |
|----|------|
| critical | **0** |
| high | **0** |
| medium | **0**（M-R1 已确认修复，见 §3） |
| low | **6**（见 §4，均为打磨项；其中 1 项为既有代码随迁移带入） |
| 本轮修复核实 | ✅ M-R1 通过；✅ `clipboardFilterWithValue` i18n 通过 |
| Chromium 实测 | ✅ 17/17 + 9/9 全通过（见 §5） |
| 归档 gate | **通过**（无 critical/high/medium 遗留） |

---

## 2. 逐维度审查（无问题项也说明依据）

### 2.1 Design
- 共享 `utils/searchPattern.ts` 抽取：`useSearchPanel` 与原内联实现等价（唯一差异见 §6 观察项），单点维护，职责合理。
- 原图路由复用 `serve_png(dir, filename)` 同时服务 thumb/image，消除重复的 basename 归一化；`router.rs` 新增 `/clipboard/image/:filename` 与既有 `/clipboard/thumb/:filename` 对称。
- `getImageUrl` 与 `getThumbUrl` 共用 `clipboardAssetUrl`，三端接口一致：`httpBridge` 实现、`mock-clipboard.ts` 返回 `''`、`preview-bridge` 恒走 http 实现；Tauri 端由 `tauri-bridge/index.ts` 的 `...http` 继承（接口注释已同步说明）。`ClipboardBridge` 已声明 `getImageUrl`，三端无漏实现（已 grep 验证 17 处引用覆盖三端 + 测试）。
- `ClipboardHistoryHeader` 将「清空范围」收敛到 `buildClipboardClearScope` 单点，说明文案/确认框/执行动作同源，避免“文案说筛选、实际清全部”。
- `overlayManager` 注册 `.adl-clipboard-viewer`，查看器覆盖 WebView 时正确隐藏浏览器原生表面。

### 2.2 Correctness
- `formatT` 改为单次正则遍历替换：不会重扫注入值（`{b}` 字面量不被后续命中）、保留未知占位符、不解释 `$&`；有专门测试覆盖。`Object.hasOwn` 在 `target/lib = ES2022` 下可用（tsconfig 已确认）。
- `ClipboardItemViewer` 图片回退链 原图 → 缩略图 → 图标，`onError` 状态机单调递减，无死循环；原图 URL 为空时直接从缩略图起步。
- `filterClipboardItems` 对带 `g` 标志的 RegExp 在 `test` 前重置 `lastIndex`；非法正则为空查询返回 `[]`，与清空按钮 `disabled` 联动一致。
- `buildClipboardClearScope` 与 `filterClipboardItems` 对「空白查询」判定一致（均 `trim()`），关闭搜索面板时搜索词不参与过滤/清空范围；`ClipboardHistoryHeader` 对失效 kind 回退 `all`。
- 清空路径：未收窄 → `clearAllClipboard()`；收窄 → 串行 `removeClipboardItem(visibleItems)`（闭包捕获点击时可见集，正确）；`clearingRef` 重入守卫 + `finally` 关闭。

### 2.3 Security & Performance
- 路径穿越：后端 `Path::file_name()` basename 归一化 + 空名 404；新增测试 `asset_routes_reject_traversal_and_degenerate_names` 覆盖 `..`、`.`、`%2e%2e%2f`、`..%2F`、`a%2F..%2F..%2F`、thumb 穿越，全部 404。前端 `clipboardAssetUrl` 同样只取 basename 并 `encodeURIComponent`，双端一致。
- `image` 路由只服务 `images_dir`，测试用同名文件断言响应字节来自 images_dir（不会跨目录取缩略图），并断言 thumbs-only 文件 404。
- 只读接口、无 unwrap/any 新增；无 N+1。
- 性能项见 §4 L6（低）。

### 2.4 Standards（含 i18n 双份键、无硬编码文案）
- `clipboardFilterWithValue` 已加入 zh-CN / en-US（`i18n/zh-CN/utilities.ts:16`、`i18n/en-US/utilities.ts:17`），筛选按钮可访问名由 `formatT(t,'clipboardFilterWithValue',{value})` 生成，**硬编码 `': '` 已消除**。
- 新增/替换键在 zh/en 双份齐备；已删除的 `clipboardClearConfirm`/`clipboardLocalNote` 在源码中**无残留引用**（grep 确认）。
- 新增 UI 文本（查看器标题/关闭/放大查看/复制/清空/筛选/空态）全部走 `t.*`；`Aa`/`ab`/`.*` 为沿用既有搜索面板的符号化按钮，可访问名走 i18n，非展示文本硬编码。
- `IconExpandCorners` 用 `makeFilled`，`fill="currentColor"` 继承主题色，无硬编码 `#ffffff`；`core.test.tsx` 断言 viewBox 与 4 条 path、fill 继承。
- CSS 新增 token 全部存在（`--danger-soft`/`--danger`/`--bg-overlay`/`--z-modal-backdrop`/`--shadow-xl`/`--radius-full`/`--transition-*`/`--space-0-5` 已逐一 grep 确认）。
- `leftbar-clipboard.css` 的 `.adl-prompt-modal [aria-disabled='true']` 作用域仅限 prompt-modal；全库 `aria-disabled` 另有 `BrowserToolbar`（不在该容器内），**无意外连带影响**（grep 确认）。

### 2.5 Optimization & Improvement（含既有代码）
- 判定「无需改」但仍逐项检查了改进空间的项目见 §6。可改进项见 §4。

---

## 3. 本轮（rev4 前）修复核实

### M-R1（round3 medium）：清空期间 `disabled` 导致焦点移到 `<body>`
实现核实（`ClipboardHistoryHeader.tsx`）：
- 确认/取消/头部关闭按钮改为 `aria-disabled={clearing ? 'true':'false'}`，**不再使用 `disabled`**（`ClipboardHistoryHeader.tsx:356/370/379`）。
- CSS `.adl-prompt-modal [aria-disabled='true'] { opacity:.45; cursor:not-allowed; pointer-events:none }`（`leftbar-clipboard.css:110-117`）。
- `handleClear` 增加 `clearingRef` 重入守卫（`:209-227`），`closeConfirm` 在清空期间提前返回（`:169-173`）。
- 焦点陷阱 effect 依赖 `[confirmOpen, closeConfirm]`，清空状态变化不会重建 effect（注释说明避免短暂还给模态框背后）。

**Chromium 实测结论：通过**（17/17，见 §5.1）：
- 清空中 `document.activeElement` 仍在「确认」按钮，**未落到 `<body>`**；
- 确认按钮 `aria-disabled="true"` 且 `hasAttribute('disabled') === false`；取消/关闭同样 `aria-disabled=true`；
- Tab / Shift+Tab 均被圈在对话框内（不逃出、不落 body）；
- 第 2 次串行 remove 触发后（按钮重渲染）焦点仍保留在「确认」；
- 真实指针点击确认被 `pointer-events:none` 拦截（无重入 remove）；点击取消不关闭；Escape 被守卫忽略；
- 结束后焦点回到清空触发按钮。
- 同时用对照实验复现旧行为：对已聚焦按钮设置 `disabled` → `document.activeElement` 变为 `<body>`（证明 M-R1 根因真实，修复有效）。

### 另修：筛选按钮可访问名硬编码 `': '`
`clipboardFilterWithValue` zh+en 双份键 + `formatT` 使用；实测筛选按钮可访问名为「筛选类型：全部」，无硬编码。**通过**。

---

## 4. 问题清单（仅 low，无 critical/high/medium）

> 以下 low 项均为打磨/改进建议，不阻塞归档；其中 L1 为既有代码（随 `NotificationCard` → 共享 `relativeTime.ts` 迁移原样带入），按规定同样记录改进空间。

### L1 — `formatRelativeTime` 对 ≥30 天时间戳做 30 天量化，且与文档注释不一致
- 文件：`ai-digital-life/frontend/src/app/utils/relativeTime.ts:33-36`
- severity：**low** ｜ category：Correctness（既有代码，verbatim 迁移自 `NotificationCard.tsx`）
- 描述：`if (days < 30) return n=days;`，否则 `n = Math.floor(days/30)*30`。即 45 天显示「30 天前」、59 天仍显示「30 天前」、75 天显示「60 天前」。函数头部注释写「其余 → N 天前」，与实现不符。仅影响 ≥30 天的条目，剪贴板历史通常为近期条目，实际影响低。
- 建议修复：`return formatT(t, 'relativeTimeDaysAgo', { n: days })`；若想避免大数字，另加月级 key（如 `relativeTimeMonthsAgo`）而非量化天数。

### L2 — 查看器遮罩点击判定无法完全覆盖「面板内拖选、松手到面板外」
- 文件：`ai-digital-life/frontend/src/app/features/clipboard-history/ClipboardItemViewer.tsx:64-69`
- severity：**low** ｜ category：Correctness / UX
- 描述：`if (event.target === event.currentTarget) onClose()` 只能挡住“在遮罩上按下并松手”。若在面板内按下、拖到遮罩上松手，Chromium 会把 `click` 派发到 mousedown/mouseup 的最近公共祖先（即遮罩），`target === currentTarget` 成立 → 仍会关闭，与注释「文本中拖选后松手到卡片外不应关闭」不符。注：`.adl-prompt-modal` 既有实现同此模式，属项目既有约定。
- 建议修复：记录 `pointerdown` 起点（`mousedown` 时若 `target !== currentTarget` 则标记，`click` 时跳过），或改为仅在 `mousedown` 落在遮罩上时用 `mouseup` 校验。

### L3 — 查看器打开期间未锁定背景滚动
- 文件：`ai-digital-life/frontend/src/app/features/clipboard-history/ClipboardItemViewer.tsx:61-123`
- severity：**low** ｜ category：UX
- 描述：`.adl-clipboard-viewer` 为 `position:fixed; inset:0`，但未禁止 `body` 滚动；查看长文本时滚轮在卡片外仍可能滚动背景内容。
- 建议修复：挂载时给 `document.body` 加 `overflow:hidden`（或对背景容器加 `inert`），卸载时恢复。

### L4 — `aria-modal="true"` 但背景未 `inert`/`aria-hidden`
- 文件：`ClipboardItemViewer.tsx:74`（及 `ClipboardHistoryHeader.tsx` 确认框 `:373`）
- severity：**low** ｜ category：Accessibility
- 描述：已声明 `aria-modal="true"` 且 Tab 被陷阱圈住，但背景 `#app` 未设为 `inert`/`aria-hidden`，屏幕阅读器的虚拟光标仍可浏览背景内容。
- 建议修复：模态打开期间给背景根节点设置 `inert`（现代 Chromium/WebView2 支持），关闭时移除；可复用同一 hook。

### L5 — 行 `role="button"` 内嵌真实 `<button>`（复制/放大/删除）
- 文件：`ai-digital-life/frontend/src/app/features/clipboard-history/ClipboardItemRow.tsx:107-176`
- severity：**low** ｜ category：Accessibility（既有模式：原先行内即内嵌删除按钮）
- 描述：`role="button"` 的可交互容器包含子级交互控件，属无效嵌套 ARIA；部分读屏可能不暴露子按钮。键盘行为已用 `e.target !== e.currentTarget` 规避（不误触发放大）。
- 建议修复：将整行改为 `role="group"`/普通 `li`，把“放大查看”作为独立可聚焦控件（或 `role="listitem"` + 显式“放大”按钮），保留整行鼠标点击作为便捷路径。

### L6 — `serve_png` 整文件读入内存、无缓存头
- 文件：`ai-digital-life/crates/server/src/handlers/clipboard.rs:36-63`（新增 `image` 路由复用）
- severity：**low** ｜ category：Performance
- 描述：`tokio::fs::read` 一次性把整张原图读入内存后作为响应体；未设置 `Cache-Control`（文件名 UUID 化、内容不可变，可长期缓存），大图（数 MB）反复打开查看器会重复读取。
- 建议修复：`tokio::fs::File` + `ReaderStream`（或 `ServeFile`）流式返回并显式 `Content-Length`；追加 `Cache-Control: private, max-age=31536000, immutable`。

> 另记录一项低风险说明（非缺陷、不改）：`/clipboard/image` 与既有 `/clipboard/thumb` 采用同一鉴权模型（仅 loopback + UUID 文件名）。新增原图路由后完整分辨率图片也走该模型；威胁模型与既有 thumb 路由同级，如后续收紧可加短期 token。

---

## 5. Chromium 实测（与 WebView2 同引擎 / Playwright）

### 5.1 测试环境与方法
- 引擎：Playwright 1.59.1 驱动 **Chromium**（`C:\Users\31432\AppData\Local\ms-playwright\chromium-1223\chrome-win64\chrome.exe`，headless）。
- 应用：Vite dev server `http://127.0.0.1:5199/`（`pnpm --dir frontend dev`，实际源码，非复刻）。
- 脚本目录（系统临时目录）：`C:\Users\31432\AppData\Local\Temp\opencode\rev4-focus-test\`
  - `clearing-focus.test.mjs`（M-R1 焦点/指针实测）
  - `viewer.test.mjs`（查看器实测）
  - `probe.mjs`、`filter-tab.probe.mjs`、`explore.mjs`（探针）
- 测试夹具说明（透明披露）：浏览器模式下 `app.getInfo` 指向 `http.app.getInfo`，无 ad-server 时为 `NOT_SUPPORTED`，应用无法 bootstrap（**与本次 diff 无关的既有环境条件**）。因此脚本通过 `page.addInitScript` 在 `window.digitalLife` 赋值时注入：`app.getInfo` 取自 `/src/mock-bridge.ts` 的 mock，并提供确定性剪贴板数据与可控延迟的 `clipboard.remove`（挂起 Promise 以便观察“清空进行中”）。**被测组件、CSS、i18n 均为真实源码**（UI 文本实测为真实中文「筛选类型：全部」「清空当前搜索和筛选后的剪贴板历史」「放大查看」等）。
- 实测场景对应任务要求：收窄清空（类型筛选=文本 → 串行 `await removeClipboardItem`）期间，观测焦点是否保持、Tab 是否不逃出、指针是否被阻止。

### 5.2 输出 — `clearing-focus.test.mjs`（17/17）
```
PASS | CONTROL: setting disabled on a focused button moves focus to <body> (the M-R1 root cause) | {"before":true,"after":true}
PASS | filter narrowed list to 2 text items | count=2
PASS | confirm action focused when dialog opens | activeElement=确认
PASS | focus stays on confirm button while clearing | activeText=确认
PASS | focus does NOT fall to <body> | activeIsBody=false
PASS | confirm button uses aria-disabled (no disabled attr) | aria-disabled=true, hasDisabled=false
PASS | cancel + close marked aria-disabled during clearing | cancel=true, close=true
PASS | Tab does not escape the modal (focus remains in dialog) | {"inDialog":true,"isBody":false,"text":"✕"}
PASS | Shift+Tab stays inside the modal | {"inDialog":true,"isBody":false,"text":"确认"}
PASS | focus retained across the 2nd serial remove (re-render of aria-disabled buttons) | {"activeText":"确认","activeIsBody":false,"inDialog":true,"calls":["t1","t2"],"dialogOpen":true}
PASS | pointer click on confirm is blocked (no re-entrant remove) | removeCalls=["t1","t2"]
PASS | pointer click on cancel is blocked while clearing (dialog stays open) | dialogOpen=true
PASS | Escape during clearing is ignored by the re-entrancy guard | dialogOpen=true
PASS | Tab recovers focus into the dialog even after a click on inert overlay | blurredToBody=true, recovered=true
PASS | only visible (text) items were removed; image kept | {"items":["i1"],"removeCalls":["t1","t2"],"rows":1,"activeLabel":"清空全部剪贴板历史"}
PASS | focus restored to the clear trigger after close | activeLabel=清空全部剪贴板历史
PASS | cancel works normally when not clearing (pointer-events restored) | closed=true

==== SUMMARY: 17/17 passed ====
```

### 5.3 输出 — `viewer.test.mjs`（9/9，查看器实测）
```
PASS | viewer opens as an aria-modal dialog portaled to body | {"hasViewer":true,"isPortalToBody":true,"panelAriaModal":"true","panelAriaLabel":"放大查看","text":"line1\nline2\nline3 full text body","activeLabel":"关闭","inViewer":true}
PASS | viewer shows the full text content | text="line1\nline2\nline3 full text body"
PASS | focus lands on the close button inside the viewer | {"activeLabel":"关闭","inViewer":true}
PASS | Escape closes the viewer | {"closed":true,"activeClass":"adl-clipboard-row"}
PASS | focus restored to the row that opened it | activeClass=adl-clipboard-row
PASS | image viewer renders the original image URL | {"src":"data:image/png;base64,...","alt":"图片","naturalWidth":1}
PASS | click inside the panel keeps the viewer open | open=true
PASS | backdrop click closes the viewer | open=false
PASS | Tab stays trapped on the close button | {"inViewer":true,"isBody":false,"label":"关闭"}

==== SUMMARY: 9/9 passed ====
```

### 5.4 附加探针 — 筛选菜单 Tab 关闭后的焦点去向（排除焦点丢失）
```
before Tab: {"tag":"BUTTON","role":"menuitemradio","text":"全部2","isBody":false,"inMenu":true}
after  Tab: {"tag":"DIV","cls":"adl-clipboard-row","role":"button","text":"a文本刚刚","isBody":false,"inMenu":false}
menu still open: false
```
结论：Tab 关闭筛选菜单后焦点落到菜单外的下一个可聚焦元素（行），**未落到 `<body>`**，无焦点丢失问题。

---

## 6. 已检查、判定「无需修改」的项（含优化检查结论）

| 项 | 判定与理由 |
|----|-----------|
| `formatT` 单次遍历替换 | 正确：不重扫注入值、保留未知占位符、不解释 `$&`；`Object.hasOwn` 在 ES2022 lib 下可用；有测试覆盖。无进一步改进。 |
| `buildSearchPattern` 增加 `trim()` | 与 `useSearchPanel.ts:50` 既有 `trim()` 守卫一致，属行为统一（空白查询不再构造正则/替换），语义更安全。无回归。 |
| `getImageUrl` 三端一致性 | httpBridge 实现 + mock 返回 `''` + preview 恒走 http + tauri `...http` 继承，接口注释同步；无漏实现。 |
| `clipboardFilterWithValue` i18n | zh/en 双份齐备，无硬编码可访问名。 |
| 删除键无残留引用 | `clipboardClearConfirm`/`clipboardLocalNote` 已无引用（grep）。 |
| `aria-disabled` 全局 CSS 影响面 | 仅 `.adl-prompt-modal` 内生效；`BrowserToolbar` 的 `aria-disabled` 不受影响。 |
| CSS token | 新增样式引用的 token 全部已定义。 |
| 清空范围单点化 | 文案/动作同源，`clearScope===null` 才全清，收窄时串行删可见项，逻辑自洽。 |
| `ClipboardItemRow` 复制按钮事件冒泡 | `CopyButton.handleClick` 首行 `e.stopPropagation()`，点击复制不会触发行放大；单测 + 实测均通过。 |
| 清空触发按钮 `disabled`（非清空态） | 属于“无可见条目”时的正确禁用；焦点恢复 effect 已对“触发按钮被禁用”回退到筛选按钮（单测覆盖）。 |

---

## 7. Severity 分布

| severity | 数量 | 条目 |
|----------|------|------|
| critical | 0 | — |
| high | 0 | — |
| medium | 0 | — |
| low | 6 | L1 `relativeTime` 30 天量化（既有）；L2 遮罩拖选关闭；L3 未锁背景滚动；L4 背景未 inert；L5 行内嵌交互控件；L6 `serve_png` 性能/缓存 |

---

## 8. 归档 gate 判定

**通过**：无 critical / high / medium 遗留；M-R1（round3 medium）已通过真实 Chromium 实测确认修复；筛选按钮硬编码可访问名已由 i18n key 修复。6 项 low 为打磨建议，不阻塞归档，建议列入后续优化。
