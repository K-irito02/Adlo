# 剪贴板历史调整 — rev4 归档 Gate 复审报告（Agent 2 / 独立复审）

- 复审对象：剪贴板历史面板「解决/优化/调整」类改动（清空语义单点化、clearing 守卫、确认框焦点契约、失效筛选回退、行布局/竖排按钮、CustomScrollArea、共享层收敛、样式修复、测试补强）
- 输入：`.review-diffs/*-rev4.diff`（清单 `changed-files-rev4.txt`，43 项）
- 方法：① 全量重读 rev4 diff + 交叉读仓库当前源码（源码只读）；② **真实 Chromium（Playwright + chrome 1223）实测**关键交互；③ 复跑仓库质量门禁（vitest / tsc / eslint / i18n / cargo）
- 约束遵守：只写本报告文件；Playwright 脚本与产物全部落在系统临时目录 `C:\Users\31432\AppData\Local\Temp\opencode\adl-rev4-focus\`，**未写入仓库**；未在终端执行任何 git 命令

---

## 0. 结论

| 项目 | 结果 |
|---|---|
| critical | **0** |
| high | **0** |
| medium | **0** |
| low | **11**（含 3 条信息性 / 2 条文档同步） |
| 本轮 M-01 修复（清空期间焦点逃出 `aria-modal`） | **实测通过（真实 Chromium，63 条断言全绿）** |
| 新增 i18n key `clipboardFilterWithValue` 硬编码消除 | **通过**（zh/en 双份齐备，Chromium 实测可访问名 = `筛选类型：图片`） |
| CSS 新规则对既有 `.adl-prompt-modal` 使用方的外溢 | **无外溢**（静态 + 动态双路核实） |

**归档判定：可归档（PASS）。** 无 critical/high/medium 遗留；下列 11 条 low 均为改进项/文档同步项，可在后续独立清理轮处理，不阻塞归档。

---

## 1. M-01 实测（真实 Chromium，**本报告核心证据**）

### 1.1 测试装置（与生产同源，避免 jsdom 假信心）

- 使用 **esbuild** 打包真实组件与真实样式表，Chromium 1223（`chrome-win64/chrome.exe`，Playwright 1.59.1，`file://` 直载 IIFE bundle）：
  - 真实组件：`ClipboardHistoryList` → `ClipboardHistoryHeader` / `ClipboardItemRow` / `ClipboardItemViewer`
  - 真实样式：`src/styles/index.css`（含 `tokens/themes/base/layout/components` + 全部 `regions/*`，进而经 `leftbar.css` 载入 `context-menu.css`）
  - 唯一替身：`@stores/slicedStore` 换为同接口的 zustand stub（避免拉起 35 切片全图；组件逻辑、CSS、DOM 结构 100% 真实）
  - 窗口可控：stub 的 `removeClipboardItem` 支持 `__removeDelayMs`（默认 900ms，测试用 1200ms），`clearAllClipboard` 支持 `__clearDelayMs` —— 以拉出"串行 await 的秒级窗口"

> 说明：第一版装置漏载 `context-menu.css`（`.adl-sidebar-menu` 的 `z-index: calc(var(--z-popover)+10)=80` 未生效），一度观察到"筛选菜单被列表遮挡、鼠标点不到"。补载全量 `index.css` 后实测 `menuZ=80`、`elementFromPoint` 命中菜单项、点击成功 —— **该现象确认为装置假阳性，生产无此问题**（见 §3 与 §5-L02）。

### 1.2 实测原始输出（节选，`result.json` / `result2.json` / `result3.json`）

清空进行中（收窄清空：kind=text，2 条 × 1200ms 串行窗口，t=250ms）：

```
--- A1 clearing in flight t=250ms ---
{"activeLabel":"确认","activeTag":"BUTTON","activeInDialog":true,"dialogOpen":true,
 "btns":[
   {"label":"关闭","ariaDisabled":"true","disabled":false,"pe":"none","op":"0.45"},
   {"label":"取消","ariaDisabled":"true","disabled":false,"pe":"none","op":"0.45"},
   {"label":"确认","ariaDisabled":"true","disabled":false,"pe":"none","op":"0.45"}],
 "busy":["true"],"removeStartCount":1,"historyLen":3}
PASS :: A1 dialog still open during clearing
PASS :: A1 focus STILL on confirm button inside dialog :: active=确认
PASS :: A1 no button has disabled attr
PASS :: A1 all buttons aria-disabled=true
PASS :: A1 all buttons pointer-events:none
PASS :: A1 all buttons opacity 0.45
PASS :: A1 aria-busy=true on confirm
PASS :: A1 only 1 removal started
```

Tab / Shift+Tab / Escape / 指针点击（清空窗口内）：

```
--- A2 after Tab ---        activeLabel=关闭  activeInDialog=true
--- A3 after Shift+Tab ---  activeLabel=确认  activeInDialog=true
--- A4 after 3x Tab ---     activeLabel=确认  activeInDialog=true
PASS :: A2-A4 Tab/Shift+Tab never left the dialog
PASS :: A2-A4 focus never fell to <body>
--- A5 after Escape during clearing ---
{"dialogOpen":true,...,"removeStartCount":1}
PASS :: A5 Escape guarded: dialog still open
PASS :: A5 Escape did not trigger extra removal
A6 elementFromPoint at confirm center: {"tag":"DIV","cls":"adl-prompt-modal__actions adl-prompt-modal__action"}
PASS :: A6 confirm centre is NOT the confirm button (pointer-events pass-through)
--- A7 after raw mouse click on the confirm centre ---
{"activeTag":"BODY","activeInDialog":false,"dialogOpen":true,"removeStartCount":1}
PASS :: A7 raw click did not re-enter the clear loop
```

收尾与清空范围正确性（单点语义）：

```
PASS :: A8 dialog closed after finish
PASS :: A8 exactly 2 removals (only the 2 text items)
PASS :: A8 image item survived the scoped clear      <- 范围外条目未被误删

--- B3 after full clear finished ---
B3 focus after full clear: {"activeIsClearBtn":false,"activeIsFilterBtn":true,"clearDisabled":true}
PASS :: B3 all history cleared
PASS :: B3 focus fell back (clear btn disabled -> filter btn)

--- C1 after synthetic re-submits (guard) ---
PASS :: C1 re-entrancy guard: only 1 removal started :: count=1   <- 合成 click+Enter 重入被忽略
```

键盘/指针恢复能力（`result2.json`，14/14 通过）：

```
### S1 keyboard-only clearing
PASS :: S1 Tab#1..#4 stays inside aria-modal :: active=BUTTON/关闭|取消|确认|关闭
### S2 pointer click on aria-disabled confirm area
S2a after raw click: {"tag":"BODY",...,"dialogOpen":true,"removeStartCount":1}
PASS :: S2a click did NOT start a 2nd clear (guard)
PASS :: S2b Tab recovers focus into the aria-modal :: active=BUTTON/关闭
PASS :: S2c Shift+Tab stays inside aria-modal
PASS :: S2d Escape still guarded after pointer click
### S3 pointer click on aria-disabled cancel / ### S4 backdrop click
PASS :: S3 click on cancel did not close dialog (guard)
PASS :: S4 backdrop click did not close dialog (guard)
### S5 recovery from body focus
PASS :: S5 from body, first Tab re-enters the dialog :: before=BODY after=BUTTON/关闭
```

功能面实测（`result3.json`，19/19 通过）：

```
PASS :: F1 menu opens and focuses a menuitemradio / ArrowDown moves / Escape closes+returns focus
PASS :: F2 menu closed after Tab         focus is NOT lost to <body> (落在下一行 role=button)
PASS :: F3 menu closed after Shift+Tab   focus is NOT lost to <body>
PASS :: F4 kind filter applied
PASS :: F4 filter button label reflects value (i18n key, not hardcoded " : ") :: 筛选类型：图片
PASS :: F4 visible count dropped to the image count :: 1
PASS :: F4 focus returned to the filter trigger
PASS :: R1 row click opens the zoom viewer / copy button does not / delete removes one
PASS :: R1 zoom button opens the viewer / backdrop click closes the viewer
PASS :: S1 search filters the list (rows=2, status=2)
PASS :: S1 shows the no-match message (not the empty-history one)
```

### 1.3 断言总计

| 套件 | 断言 | 通过 | 失败 |
|---|---|---|---|
| `run.mjs`（清空焦点契约 / 范围正确性 / 重入守卫 / 全清回退） | 30 | 30 | 0 |
| `run2.mjs`（纯键盘、指针点击、遮罩、body 恢复） | 14 | 14 | 0 |
| `run3.mjs`（筛选菜单、行内三按钮、查看器、搜索） | 19 | 19 | 0 |
| **合计** | **63** | **63** | **0** |

### 1.4 M-01 结论细节

1. **`aria-disabled` 替代 `disabled` 确实解决了焦点被 Chromium 焦点修正抛到 `<body>` 的问题**：清空窗口内（1.2s / 2.4s 两档实测）`document.activeElement` 始终是确认按钮，`disabled` 属性不存在，Tab/Shift+Tab 仅在 3 个对话框按钮内循环，从未落到 `<body>`。这正是 round3 两个代理独立命中的缺陷，已闭环。
2. **`clearingRef` 守卫有效**：Escape / ✕ / 取消 / 遮罩点击 / 合成 click+Enter 重入 全部被忽略（`removeStartCount` 恒为 1），`finally` 仍正常收尾关闭对话框。
3. **指针不可点击**：`pointer-events: none` 生效（`elementFromPoint` 命中 `.adl-prompt-modal__actions` 而非按钮），且该穿透目标不是遮罩，因此不会误关闭。
4. **残留（已判 low，非回归）**：清空窗口内"真实鼠标点击"会把焦点落到 `<body>` —— 这是 Chromium 对"点击非可聚焦容器"的标准行为（与原生 `disabled` 按钮被点击时一致），且**下一次 Tab 立即恢复到对话框内**（S2b/S5 实测），`aria-modal` 契约对键盘用户完整保留。故不构成 medium。

---

## 2. 本轮其它修复的核实

| 修复项 | 核实方式 | 结果 |
|---|---|---|
| 筛选按钮可访问名硬编码 `': '` → i18n key `clipboardFilterWithValue` | 读源码 + zh/en 两端 key 存在性扫描 + Chromium 实测 | **通过**。`ClipboardHistoryHeader.tsx:283` 走 `formatT(t,'clipboardFilterWithValue',{value})`；zh/en 均有该 key；Chromium 实测 `aria-label="筛选类型：图片"`；`check:i18n-coverage` = 1468/1468 |
| 清空语义单点化（动作/文案同源） | 读 `buildClipboardClearScope` + `handleClear`；Chromium 实测范围 | **通过**。`clearScope===null` → 后端全清；否则逐条删 `visibleItems`；实测 kind=text 只删 2 条文本、图片存活；确认文案与实际动作同源 |
| 失效筛选回退（kind 失效 → `all`） | 读 effect + vitest `resets a stale kind filter back to all` | **通过**（但有 L04 的时序细节，见 §5） |
| 行布局 / 竖排三按钮（固定 72px 行高） | 读 CSS（`3×22 + 2×2 + 2 = 72`）+ Chromium 实测行点击/复制/删除/放大互不串扰 | **通过** |
| `CustomScrollArea` 复用（与文件树一致） | 依赖扫描 | **通过**，且符合既有惯例（browser/browser-tree/github-tree/outline/changes 等 11 处已同样跨 feature 复用 `@features/file-tree/CustomScrollArea`） |
| 共享层收敛（`relativeTime`/`searchPattern` 抽出；`NotificationCard` 改 import） | 读 diff + vitest `relativeTime`/`searchPattern` | **通过**。`NotificationCard` 本地 36 行逐字重复已删，改 `@utils/relativeTime`；`useSearchPanel` 私有 `buildSearchPattern` 已删改 `@utils/searchPattern` |
| `formatT` 单次遍历替换（防注入串扰） | 读实现 + vitest（含 `{b}` 串扰、`$&`、未知占位符） | **通过**。该修复对清空文案把用户查询注入 `{scope}` 是必要的（查询含 `{...}`/`$&` 不再被二次解释） |
| 样式修复（prettier/格式由 rev2 记录） | 见 §4 | **通过** |
| 测试补强 | vitest 定向复跑（§4） | **通过** |

---

## 3. CSS 外溢复核（`.adl-prompt-modal [aria-disabled='true']`）

**结论：当前无外溢风险。**

1. 全仓 `aria-disabled` 使用点扫描（`Get-ChildItem -Recurse | Select-String`）：仅 `ClipboardHistoryHeader.tsx:356/370/379`（在 `.adl-prompt-modal` 内）与 `BrowserToolbar.tsx:112/124`（不在任何 `.adl-prompt-modal` 内）。其余 `.adl-prompt-modal` 使用方（`CreateWorkspaceModal`、`RenameDialog`、`BookmarkToFolderDialog`、`AddManualPortDialog`、`AddShortcutDialog`、`BackgroundSettingsDialog`、`CreateTabDialog`、`PortConfigDialog`、`FileCreationDialog`、`GitHubSettingsDialog`）**均未设置 `aria-disabled`**，故新规则对其无命中。
2. Chromium 动态核实：对话框打开态（未清空）3 个按钮 `ariaDisabled=false / pe=auto / op=1`；清空态 `ariaDisabled=true / pe=none / op=0.45`。属性驱动的条件命中正确。
3. 同族既有约定对照：`styles/components/button.css:38-43` 早有 `.btn[disabled], .btn[aria-disabled='true']{opacity:.55;cursor:not-allowed;pointer-events:none}`。本项目 dialog 用的是 `.adl-btn`（`titlebar.css:248` 只有 `.adl-btn:disabled`），因此确需补规则；但落点为通用 `.adl-prompt-modal` 后代选择器（见 L02/L03）。

---

## 4. 质量门禁实测（本快照实跑，非引用实现者声称）

| 门禁 | 命令 | 实测输出 |
|---|---|---|
| 定向单测 | `vitest run src/app/features/clipboard-history src/app/components/__tests__/CopyButton.test.tsx src/app/i18n/__tests__/formatT.test.ts src/app/utils/__tests__/{relativeTime,searchPattern}.test.ts src/shared/__tests__/overlayManager.test.ts src/httpBridge/__tests__/httpBridge.test.ts src/app/icons/core.test.tsx` | **13 files / 114 tests passed** |
| 类型 | `tsc --noEmit` | **exit 0**（新增 `ClipboardBridge.getImageUrl` 必需方法未破坏任何实现方：`tauri-bridge` 经 `...http` 继承、`mock-bridge`→`mockClipboard`、`preview-bridge` 显式补） |
| Lint | `eslint <全部改动前端文件>` | **0 errors**，1 warning（`mock/mock-clipboard.ts` 被 ignore 规则忽略，属既有约定；实现者记录亦提及） |
| i18n 覆盖 | `tsx scripts/check-i18n-coverage.ts` | `zh-CN (1468 keys) == en-US (1468 keys) 完全一致` |
| Rust | `cargo test -p adl-server --lib clipboard` | **8 passed; 0 failed**（含新增 `image_serves_stored_original_and_404s_unknown`、`asset_routes_reject_traversal_and_degenerate_names`） |
| 调试残留 | 改动文件 `console.*`/`ADL-DEBUG` 扫描 | 剪贴板/组件/工具改动文件 **无残留**（旧的 `console.warn('[clipboard-history] copy back failed')` 已随复制逻辑迁移删除） |

Rust 路由/安全复核：
- `router.rs` 新增 `/clipboard/image/:filename` 与 `/clipboard/thumb/:filename` 并列；`handlers/clipboard.rs` 抽 `serve_png(dir, filename)`，`Path::new(filename).file_name()` 做 basename 归一化 —— 穿越（`..`、`%2e%2e%2f`、`a%2F..%2F..%2F`）与退化名（空/`.`/`..`）实测 404；读错误统一 404 但区分 `NotFound` 记 `tracing::warn`（不泄露内情）。**安全面无问题。**

---

## 5. 发现清单

> 严重度定义：critical = 阻塞归档；high = 明显缺陷；medium = 应修；low = 改进/信息性。**本轮 critical/high/medium 均为 0。**

### L01 — 剪贴板搜索词不再 trim（相对旧实现的行为回退）
- 文件：`ai-digital-life/frontend/src/app/features/clipboard-history/clipboardFilter.ts:56,59`
- 严重度：low　类别：Correctness
- 描述：`filterClipboardItems` 用 `input.query.trim()` 判空，但把**未 trim** 的 `input.query` 交给 `buildSearchPattern`。被删除的旧实现是 `clipboardSearch.trim().toLowerCase()`。结果：查询 `" hello "` 现在要求字面空格，旧行为能命中 `hello`。`useSearchPanel` 亦为不 trim（该处与旧行为一致，无回退），故此处是本轮引入的**单点差异**。
- 建议：`filterClipboardItems` 内 `buildSearchPattern(input.query.trim(), …)`（清空范围描述仍可用原串，保持 `search"{query}"` 与原输入一致），或在 `buildClipboardFilterInput` 统一 trim。二者取一，保持"判空口径 == 匹配口径"。

### L02 — 清空态样式落在通用 `.adl-prompt-modal` 作用域，且与既有 `.btn[aria-disabled]` 约定分叉
- 文件：`ai-digital-life/frontend/src/styles/regions/leftbar-clipboard.css:100-107`（对照 `styles/components/button.css:38-43`）
- 严重度：low　类别：Standards / Design
- 描述：`.adl-prompt-modal [aria-disabled='true']` 是"剪贴板特性"却写在共享模态类下；同一语义在 `button.css` 已有 `.btn[disabled], .btn[aria-disabled='true']`（opacity `.55`），此处另立 `opacity .45`，两套约定并存。日后任何 modal 若用 `aria-disabled` 表达"软禁用但仍需交互"，会被静默变为不可点（当前无此使用方，故无外溢）。
- 建议：改为与本项目按钮族一致的 `.adl-btn[aria-disabled='true']`（并统一 opacity 值），或给面板加 `.adl-prompt-modal--busy` 修饰类后作后代选择器，把规则从 clipboard 样式表移回 `composer-core.css`。

### L03 — `cursor: not-allowed` 与 `pointer-events: none` 同置（死声明）
- 文件：`ai-digital-life/frontend/src/styles/regions/leftbar-clipboard.css:105-106`
- 严重度：low　类别：Styles（信息性）
- 描述：`pointer-events: none` 后元素不再参与命中测试，`cursor: not-allowed` 永不生效（鼠标指针由穿透目标决定）。
- 建议：删除 `cursor` 行，或改用 `aria-disabled` + `cursor` 而不设 `pointer-events`（但那会重新引入点击命中，需配合 `onClick` 守卫 —— 当前实现选择更稳妥，故仅建议删冗余行）。与 `.btn` 既有规则同源，可一并清理。

### L04 — 失效筛选回退可在"清空进行中"触发，导致对话框文案瞬变
- 文件：`ai-digital-life/frontend/src/app/features/clipboard-history/ClipboardHistoryHeader.tsx:94-98`（配合 `handleClear` 218-221）
- 严重度：low　类别：Correctness / UX
- 描述：kind 筛选清空时，最后一条该类型被删除后 `kindCounts` 不再含该 kind → effect 立即 `setClipboardKindFilter('all')`；此时对话框仍开（`finally` 尚未执行），`clearScope` 由非空变 `null` ⇒ 标题/正文从 `清空当前搜索和筛选后的剪贴板历史` / `…筛选类型为"X"…` 瞬时变回 `清空全部…`，随后对话框关闭（约 1 帧）。动作本身正确（循环已捕获旧 `visibleItems` 闭包），仅文案闪变。
- 建议：effect 加 `if (clearingRef.current) return;`（清空结束后由列表状态自然回落），或把回退判定放到"非清空态"派生。

### L05 — `aria-busy="true"` 在 `.adl-btn` 上无对应视觉/交互样式
- 文件：`ai-digital-life/frontend/src/app/features/clipboard-history/ClipboardHistoryHeader.tsx:380`（对照 `styles/components/button.css:45-60` 仅覆盖 `.btn[aria-busy]`）
- 严重度：low　类别：A11y / Standards（信息性）
- 描述：确认按钮清空期间同时带 `aria-disabled` 与 `aria-busy`，但 `.adl-btn` 族无 `[aria-busy]` 规则（无 spinner、不改 `cursor: progress`），`aria-busy` 仅对 AT 生效；当前靠 opacity/pointer 变化传达状态，可用但语义未兑现。
- 建议：为 `.adl-btn[aria-busy='true']` 补一条与 `.btn` 同形的 busy 样式，或明确只保留 `aria-disabled` 并删掉 `aria-busy`（保持属性与可见状态一一对应）。

### L06 — `role="button"` 行内嵌 3 个可交互控件（ARIA 嵌套不合规）
- 文件：`ai-digital-life/frontend/src/app/features/clipboard-history/ClipboardItemRow.tsx:107-117`（行 `role="button"`）+ 行尾 `删除/放大/复制` 三控件（`CopyButton` 为 `<span role="button">`）
- 严重度：low　类别：A11y（信息性）
- 描述：ARIA 规范禁止 `button` 角色含可交互后代；键盘串扰已由 `e.target !== e.currentTarget` 早退 + 子控件 `stopPropagation` 覆盖，Chromium 实测三按钮互不触发整行、整行点击不触发复制。
- 建议：可接受（用户明确要求"整行点击放大查看"、`role=button` 保证键盘可达）。若要合规可改行为 `role="group"` + 行内独立"放大"触发区；文档已登记为"不修"，本轮复核维持该判定。

### L07 — 查看器 `<img>` 缺 `loading`/`decoding` 提示
- 文件：`ai-digital-life/frontend/src/app/features/clipboard-history/ClipboardItemViewer.tsx:103-110`
- 严重度：low　类别：Performance（信息性）
- 描述：原图按需加载且已具备 `original → thumb → none` 三级回退，但未声明 `loading="lazy"` / `decoding="async"`；大图解码在主线程。
- 建议：加 `decoding="async"`（首次即需显示，`loading="lazy"` 收益有限）。

### L08 — 查看器"拖选不关闭"注释与实现不完全一致
- 文件：`ai-digital-life/frontend/src/app/features/clipboard-history/ClipboardItemViewer.tsx:64-69`
- 严重度：low　类别：Docs（注释准确性）
- 描述：注释称"文本中拖选后松手到卡片外不应关闭"；但 mousedown 在卡片内、mouseup 在遮罩时，`click` 的目标为两者最近公共祖先（即遮罩，`target === currentTarget`）→ **仍会关闭**并丢失选区。
- 建议：若确实要保留选区，需用 `mousedown` 目标记录（如 `pointerDownTargetRef`）+ 判定位移；否则修正注释措辞。

### L09 — 清空按钮禁用后 Tooltip 不再可达
- 文件：`ai-digital-life/frontend/src/app/features/clipboard-history/ClipboardHistoryHeader.tsx:241-252`
- 严重度：low　类别：UX（信息性）
- 描述：`disabled` 按钮不派发指针事件，`TooltipSimple` 无法展示，禁用态下用户无从获知按钮语义（`aria-label` 仍在，AT 可读）。
- 建议：改用 `aria-disabled` 保留 tooltip（但需同步 onClick 守卫），或接受现状；不影响可访问名。

### L10 — 归档文档未同步本轮修复，且含已被替换的历史描述
- 文件：`docs/root-cause-resolution/2026-09/progress-2026-09-16-205905.md:256-261,271`
- 严重度：low　类别：Docs
- 描述：① 第 257 行记"新增「clearing 期间 Escape 不关闭 + 确认/取消**禁用**」测试"，而现行实现是 `aria-disabled` + `pointer-events`（**故意不用 `disabled`**），文档描述与实现相反；② 第 259 行记筛选按钮可访问名为 `筛选类型: 全部`（硬编码分隔符），现已被 `clipboardFilterWithValue` 取代；③ 全文（grep）无 `aria-disabled` / `clearingRef` / `clipboardFilterWithValue` / `pointer-events` 任何记录；④ 第 271 行称 rev4–6 快照不含 `router.rs` / `composer-core.css` / `icons/*`，但本 rev4 清单**同含这三处**。考虑到该文档第 3 行声明"全部调整完成，进入归档"，上述漂移会误导后续读者。
- 建议：追加一节"rev4 归档 Gate 收口"，记录：清空态由 `disabled` 改为 `aria-disabled`（原因：Chromium 焦点修正把焦点移出 `aria-modal`）+ CSS `.adl-prompt-modal [aria-disabled]` + `clearingRef` 重入守卫 + `clipboardFilterWithValue` i18n key + 本轮 Chromium 实测结论；并修正第 257 行的"禁用"措辞。

### L11 — （既有代码，非本轮引入）2s 轮询无条件 `setClipboardHistory`
- 文件：`ai-digital-life/frontend/src/app/features/clipboard-history/ClipboardHistoryList.tsx:41-72`（轮询）+ `stores/actions/utilitiesActions.ts:19-35`
- 严重度：low　类别：Optimization（既有，文档已登记 P 系列"不修"）
- 描述：`fetchClipboardHistory` 每次都 `setClipboardHistory(result.data)`，新数组身份使 `ClipboardItemRow` 的 `memo` 每 2s 全量失效；条数不大时无感。
- 建议：后续如需优化，可在 set 前做 id+digest 浅比较（保持行为一致），或对 `item` 传入稳定引用。**本轮维持"不修"判定**（改动风险 > 收益，且属既有实现）。

---

## 6. 五维度逐项走查

1. **Design**：清空语义单点（`buildClipboardClearScope` 派生动作/tooltip/标题/正文）、过滤入参单点（`buildClipboardFilterInput` 由 List 派生并下传 Header）、kind 标签单点（`clipboardKind`）—— 三处"单一权威"成立，未发现第二套判定。`visibleItems` 由容器单点派生（N1）后 Header 不再自算，消除漂移。L02 指出清空态样式作用域偏宽（设计耦合，非缺陷）。
2. **Correctness**：Chromium 实测覆盖 清空范围正确性（范围外条目存活）、重入守卫、Escape/遮罩/取消守卫、筛选回退、行内三控件隔离、搜索无结果态区分。`formatT` 单次替换避免了"查询注入占位符"串扰。残留仅 L01（trim 口径不一致）与 L04（瞬变文案）。
3. **Security & Performance**：`clipboardAssetUrl` 仅取 basename + `encodeURIComponent`；Rust `serve_png` basename 归一化 + 穿越/退化名测试通过；读错误统一 404 且区分 `NotFound`（不泄露内情）。性能上 `serve_png` 全量读入内存、无 `Cache-Control`（既有取舍，文档已登记为不修）；L07/L11 为可选优化。
4. **Standards**：i18n 全覆盖（新 key 双端齐备、无硬编码 UI 文本，含 `clipboardFilterWithValue`）；无 `console.*`/`[ADL-DEBUG]` 残留；`overlayManager` 注册 `.adl-clipboard-viewer`（兑现 AGENTS.md 的 WebView2 原生表面约束，测试 17→18）；`CustomScrollArea` 跨 feature 复用与既有 11 处惯例一致；图标 `IconExpandCorners` 继承 `currentColor`（去 `fill="#ffffff"`）并有几何/着色测试。L02 为唯一"约定分叉"。
5. **Optimization & Improvement（含既有代码）**：逐项检查了文档登记的"不修"项并复核维持判定 —— ① 全量命中退化为 N 次逐条删除（`list(200)` 窗口 > 用户所见范围，逐条删除才与文案严格一致：**同意**）；② 搜索面板 JSX 与 `FileNavigatorShell` 第三份重复（状态归属不同：slice vs 局部 state，强行统一需改文件面板：**同意**）；③ 极窄侧栏下筛选菜单被 `.adl-clipboard{overflow:hidden}` 裁切（需 portal+计量+resize 同步，边缘场景：**同意**，且实测常规宽度下 `z-index=80` 正常）；④ `role="button"` 内含按钮（用户明确要求整行放大：**同意**，见 L06）；⑤ memo/轮询/缓存头/读入内存等性能项（**同意**，见 L07/L11）。未发现"文档判定不修但实际应修"的项。

---

## 7. 复现方式与产物

- 装置目录（系统临时目录，**不在仓库**）：`C:\Users\31432\AppData\Local\Temp\opencode\adl-rev4-focus\`
  - `build.mjs`（esbuild 打包，别名映射到仓库 `src`，`@stores/slicedStore` → `src/store-stub.ts`）
  - `src/main.tsx`（挂载真实 `ClipboardHistoryList`；`import '@root/styles/index.css'` 全量样式）
  - `src/store-stub.ts`（zustand 同接口替身；`__removeDelayMs` / `__clearDelayMs` 控制清空窗口）
  - `index.html` + `bundle.js` + `bundle.css`
  - `run.mjs` / `run2.mjs` / `run3.mjs` / `run4.mjs` / `run5.mjs`（Playwright，`executablePath` = `chromium-1223\chrome-win64\chrome.exe`）
  - 结果：`result.json`（30/30）、`result2.json`（14/14）、`result3.json`（19/19）
- 复现命令：
  ```
  cd C:\Users\31432\AppData\Local\Temp\opencode\adl-rev4-focus
  node build.mjs && node run.mjs && node run2.mjs && node run3.mjs
  ```
- 仓库侧（只读）：`vitest run <13 文件>`、`tsc --noEmit`、`eslint <改动文件>`、`tsx scripts/check-i18n-coverage.ts`、`cargo test -p adl-server --lib clipboard`

---

## 8. 归档判定

- **critical / high / medium：0 / 0 / 0 —— 无阻塞项。**
- **M-01（round3 medium，两代理独立命中）：真实 Chromium 实测通过**（63 条断言 0 失败），`aria-disabled + pointer-events + clearingRef` 方案确认有效：清空窗口内焦点留在 `aria-modal`、Tab 不逃逸、指针不可触发、Escape 被守卫、重入被忽略；唯一残留是"真实鼠标点击非可聚焦区"导致的临时 body 焦点（标准浏览器行为 + Tab 立即恢复），已判 low。
- **CSS 新规则外溢：无**（静态扫描 + Chromium 动态核实）。
- **low：11 条**（L01 搜索 trim 口径、L02 样式作用域分叉、L03 死声明、L04 文案瞬变、L05 `aria-busy` 未兑现、L06 ARIA 嵌套、L07 img 解码提示、L08 注释不准、L09 禁用态 tooltip、L10 文档漂移、L11 既有轮询），均可延后独立清理；建议至少处理 **L10（文档同步）与 L01（口径一致）**。
- **建议：通过归档 Gate。**
