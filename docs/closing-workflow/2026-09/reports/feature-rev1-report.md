# Feature rev1 代码审查报告（Agent 1 / closing-workflow）

- 审查对象：左侧边栏「剪贴板历史」新增「放大查看」能力（含搜索/筛选/计数/清空范围重构、固定行高、时间戳、复制按钮、自定义滚动条、后端原图静态路由）
- 审查基线：`.review-diffs/*-rev1.diff` 快照（基目录 `E:\AI-DIGITAL-LIFE\SourceWorkspace\.review-diffs\`，快照清单见同目录 `changed-files-rev1.txt`，共 42 个文件）
- 审查方式：逐 diff 静态审查 + 读仓库实际源码交叉验证；**未执行任何 git 命令**；唯一写入为本报告
- 结论：**无 critical / high 问题**；3 项 medium、13 项 low。整体实现质量高，桥接三端一致性、路径穿越防护、i18n 完整性、CSS token 合规、测试补充均达标。

---

## 1. 输入快照清单（本次实际读取的 diff）

| 域 | 快照文件 |
|----|----------|
| Rust | `ai-digital-life_crates_server_src_handlers_clipboard.rs-rev1.diff`、`..._crates_server_src_router.rs-rev1.diff` |
| 桥接 | `..._frontend_src_shared_ipc_clipboard.ts-rev1.diff`、`..._frontend_src_httpBridge.ts-rev1.diff`、`..._httpBridge___tests___httpBridge.test.ts-rev1.diff`、`..._frontend_src_mock_mock-clipboard.ts-rev1.diff`、`..._frontend_src_preview-bridge_index.ts-rev1.diff` |
| 查看器 | `..._clipboard-history_ClipboardItemViewer.tsx-rev1.diff`、`...___tests___ClipboardItemViewer.test.tsx-rev1.diff` |
| 行/头/列表 | `..._clipboard-history_ClipboardItemRow.tsx-rev1.diff`、`..._ClipboardHistoryList.tsx-rev1.diff`、`..._ClipboardHistoryHeader.tsx-rev1.diff`、对应 3 个 `__tests__` diff |
| 纯逻辑 | `..._clipboard-history_clipboardFilter.ts`、`clipboardKind.ts`、`clipboardClearScope.ts` + 2 个测试 diff |
| 共享工具 | `..._app_utils_searchPattern.ts`、`..._app_utils_relativeTime.ts` + 2 个测试 diff、`..._right-panel_hooks_useSearchPanel.ts` |
| 图标/Store | `..._app_icons_core.tsx`、`..._app_icons_index.ts`、`..._app_icons_core.test.tsx`、`..._stores_slices_clipboardHistorySlice.ts` |
| 其他 | `..._app_components_CopyButton.tsx` + 测试、`..._app_components_NotificationCard.tsx`、`..._i18n_formatT.ts`、`..._i18n_{zh-CN,en-US}_utilities.ts`、`..._shared_overlayManager.ts` + 测试、`..._styles_regions_{leftbar-clipboard,composer-core}.css`、`..._rightpanel_browser-webview.css`、`docs_root-cause-resolution_2026-09_{progress-2026-09-16-205905,README}.md` |

---

## 2. 本次执行的验证证据（非猜测）

| 验证 | 命令 | 结果 |
|------|------|------|
| 前端测试（触碰模块） | `vitest run src/app/features/clipboard-history src/app/utils src/shared/__tests__/overlayManager.test.ts src/httpBridge/__tests__/httpBridge.test.ts src/app/components/__tests__/CopyButton.test.tsx src/app/icons` | **26 files / 320 tests 全通过**（含全部新增测试文件：Viewer 6、Header 12、List 4、Row 5、Filter 12、ClearScope 8、searchPattern 6、relativeTime 3、CopyButton 6、overlayManager 14、icons 12） |
| 类型检查 | `tsc --noEmit`（frontend） | **0 错误** |
| Lint | `eslint <变更路径>` | **0 errors**，1 warning（`mock/mock-clipboard.ts` 被 ignore 规则命中 — 已判定「不修复」的既有设计） |
| Rust 测试 | `cargo test -p adl-server --lib clipboard` | **8 passed; 0 failed**（含新增 `image_serves_stored_original_and_404s_unknown`、`asset_routes_reject_traversal_and_degenerate_names`） |
| Rust 格式 | `cargo fmt -p adl-server --check` | 干净（0 差异） |

未执行：`cargo clippy --all-targets -- -D warnings`（全量依赖重编译成本高），因此「clippy 0 告警」这一说法**本次未独立复核**；Rust 新增代码仅 2 个 handler + 1 个仅测试用模块，未见显然 clippy 项（无 `unwrap`/`unsafe`/无谓 clone）。

---

## 3. 交叉验证通过的关键事实（判据）

1. **桥接三端 + Tauri 继承真实成立**：`tauri-bridge/index.ts:44` 为 `...http`（clipboard 域整体继承 `createHttpBridge`），`httpBridge.ts:1040`、`preview-bridge/index.ts:255`、`mock/mock-clipboard.ts:19` 均实现 `getImageUrl`；`mock-bridge.ts:134` 直接挂载 `mockClipboard`，无第四处遗漏。符合「新增 IPC 方法必须同步实现」规则。
2. **资产 URL 命名安全**：后端落盘名称为 `{uuid}.png` / `thumb-{uuid}.png`（`crates/clipboard/src/read.rs:105-107`），因此「按 filename 而非 id 取图」不会串图；`images_dir = clipboard_dir/images`（`store.rs:16-18`），与 `thumbs_dir` 物理隔离，新增测试已断言不跨目录取缩略图。
3. **路径穿越**：`serve_png` 取 `file_name()` 后 join（`clipboard.rs:132-140`），参数中不可能携带分隔符；`%2e%2e%2fsecret.png` 等 6 种变体测试实测 404（我本地跑通，排除「axum 直接 400」导致假通过）。
4. **i18n 完整性**：新增 13 个 key 在 zh-CN/en-US 双端齐备；被删除/改义的 `clipboardClearConfirm`、`clipboardLocalNote` 在 `src/` 内已无任何引用（grep 验证）；`searchOptions`、`relativeTime*` 均存在于既有 key 集合（`i18n/{zh-CN,en-US}/file.ts`、`utilities.ts`）。
5. **CSS token 合规**：`--z-modal-backdrop`、`--danger-soft`、`--bg-overlay`、`--space-0-5`、`--transition-colors/-opacity`、`--shadow-xl` 等全部存在于 `tokens.css`/`themes.css`；新 CSS 无硬编码色值（仅 `var(--bg-overlay, rgba(...))` 形式的既有 fallback 惯例）。
6. **WebView2 让位**：`.adl-clipboard-viewer` 已加入 `OVERLAY_SELECTORS`，`overlayManager.test.ts` 分隔符计数同步 17→18；查看器经 `createPortal` 挂到 `document.body`，`position: fixed` 不受左栏 `overflow: hidden` 影响（这一点是正确设计）。
7. **shared/ipc 契约文档**明确标注「Tauri 经 `...http` 继承」，与实现一致，消除了原先「@see tauri-bridge」的误导。
8. **无回归**：`ClipboardHistoryList` 轮询使用 `fetchClipboardHistory(true)`（background），不会每 2s 触发 loading 闪烁；`buildClipboardFilterInput` / `buildClipboardClearScope` / `filterClipboardItems` 对「搜索面板关闭时忽略搜索词」的口径完全一致（含 kindFilter-only 场景），不存在「文案说筛选、实际清全部」的漂移。

---

## 4. 问题清单

### 4.1 severity 分布

| severity | 数量 | 编号 |
|----------|------|------|
| critical | 0 | — |
| high | 0 | — |
| medium | 3 | M1、M2、M3 |
| low | 13 | L1–L13 |
| **合计** | **16** | |

---

### M1（medium / correctness + 一致性）查看器遮罩点击判定过宽：文本选区拖拽松手即关闭

- 位置：`ai-digital-life/frontend/src/app/features/clipboard-history/ClipboardItemViewer.tsx:56`
- 描述：外层遮罩 `<div className="adl-clipboard-viewer" onClick={onClose}>` 直接把任意 click 当关闭。浏览器 click 事件的 target 是 mousedown/mouseup 的**最近公共祖先**，因此在 `<pre>` 里选中全文后把鼠标拖到卡片外（遮罩上）松手，会在遮罩上派发一次 click → 查看器被关闭，用户刚选的文本与查看上下文一起丢失。**同一个变更集内的兄弟实现**（清空确认框）用的是 `e.target === e.currentTarget` 判定（`ClipboardHistoryHeader.tsx:227`），查看器与之不一致。
- 建议修复：改为 `onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}`，或在遮罩上记录 `onPointerDown` 的 target 并与 `onClick` 的 target 比对后再关闭。（面板已有 `stopPropagation`，改法不破坏现有行为。）

### M2（medium / a11y 结构）行容器 `role="button"` 内含 3 个交互控件，可访问名被污染

- 位置：`.../ClipboardItemRow.tsx:65-128`（行 `div role="button"` 在 65-71；删除 `button` 97、放大 `button` 107、`CopyButton`（`span role="button"`）120）
- 描述：行是 `role="button"` + `tabIndex=0`，内部又嵌了 3 个可交互控件。按 accname 的 name-from-content 规则，行的可访问名会拼接所有后代（含后代的 `aria-label`），实际读作「hello clipboard 文本 2 分钟前 删除本条 放大查看 复制」——测试里用 `{ name: /hello clipboard|文本/ }` 的**正则**才匹配到，正是这一现象的旁证（`__tests__/ClipboardItemRow.test.tsx:95`）。同时嵌套 button 是已知反模式（读屏/键盘语义混乱）。旧实现已有「行内含删除按钮」的雏形，但本次从 1 个增至 3 个，问题被放大。
- 建议修复：给行加显式 `aria-label`（如内容预览或 `formatT(t,'clipboardRowLabel',…)`），使行名不再由后代拼接；更彻底的做法是把行改为纯布局 + 一个显式的「放大查看」主按钮（或把 actions 提到行 `role=button` 之外），行上的 Enter/Space 语义交给该主按钮。

### M3（medium / 共享工具回归风险）`formatT` 语义被改写且全仓零单测；`buildSearchPattern` 的 trim 口径顺带改变了搜索替换行为

- 位置：`.../i18n/formatT.ts:8-21`；`.../app/utils/searchPattern.ts:26`；受影响方 `.../right-panel/hooks/useSearchPanel.ts:62-67`
- 描述：`formatT` 从「逐 key 首次替换」改为「单次正则全局替换」，语义变化有三处：①同一占位符多次出现现在**全部**替换（修复）；②注入值内的 `{other}` 不再被二次扫描（修复）；③注入值内的 `$&`/`$1` 不再被解释为替换模式（修复）。方向都对，但它是支撑 13 个领域 / 936 个 key 的共享函数，**仓库内不存在 `formatT` 单测**（`Glob **/*formatT*` 仅命中实现文件），本次也没补，属于「高影响面 + 零覆盖」的组合。
  另一处：共享 `buildSearchPattern` 的判空由 `!query` 改为 `!query.trim()`。对 `useSearchPanel.filteredResults` 无影响（那里本就有 `!searchQuery.trim()` 早返回），但 `useSearchPanel.handleReplace` 只判 `!searchPattern`（`useSearchPanel.ts:63`），于是「查询词只含空白」时替换从「替换空白串」变为**静默无操作**。这是右栏搜索面板的可观测行为变化，属于本任务附带、未申报、无测试的改动。
- 建议修复：补 `app/i18n/__tests__/formatT.test.ts`（多处占位符、值内含 `{k}`、值内含 `$&`、缺 key 回退、`vars` 缺项保持原样）；对 `buildSearchPattern` 的 trim 语义在 `useSearchPanel` 侧显式确认/补测（或在 `handleReplace` 同步加 `!input.searchQuery.trim()` 早返回，使两处口径显式一致）。

---

### L1（low / design·DRY）搜索面板 JSX 与文件面板近乎逐行重复

- 位置：`.../ClipboardHistoryList.tsx:115-166` vs `.../right-panel/FileNavigatorShell.tsx:386-439`
- 描述：`input(type=search)` + `label.adl-search-panel__field--with-actions` + `div.adl-search-panel__toggles[role=toolbar]` + 3 个 `Aa/ab/.*` 按钮（含 `TooltipSimple`、`aria-pressed`、同一批 i18n key）约 50 行逐字重复；两处仅「状态来源（Zustand slice vs useSearchPanel）」与「是否 Enter 触发（剪贴板为实时过滤，无 onKeyDown）」不同。搜索**逻辑**已通过 `@utils/searchPattern` 共享，但**标记**仍双份，后续任何一处样式/语义修复都会漂移。
- 建议修复：抽出 `app/components/SearchPanelField.tsx`（props：`value/onChange/placeholder/ariaLabel/toggles:{matchCase,wholeWord,useRegex}`），两处复用。

### L2（low / standards）`aria-label` 内硬编码 `": "` 分隔符

- 位置：`.../ClipboardHistoryHeader.tsx:239` — `aria-label={`${t.clipboardFilter}: ${activeFilterLabel}`}`
- 描述：仓库禁止项明确包含「任何 UI 展示文本硬编码（…/aria-label/…）」。此处把两个 i18n 值与硬编码 `": "` 拼接；zh-CN 语境下应用全角「：」，且翻译无从覆盖。
- 建议修复：新增 key（如 `clipboardFilterWithValue: '筛选类型：{kind}'` / `'Filter by type: {kind}'`）后用 `formatT`。

### L3（low / a11y）计数 `role="status"` 只播报裸数字，无上下文

- 位置：`.../ClipboardHistoryHeader.tsx:195-197`
- 描述：`<span role="status" aria-live="polite">{visibleItems.length}</span>` 会播报「3」，读屏用户无法得知这是「可见条目数」。同容器另有筛选菜单的计数，语义更易混淆。
- 建议修复：加 `aria-label`（如 `formatT(t,'clipboardVisibleCount',{n})`）或用视觉隐藏文本。

### L4（low / performance）筛选态清空为「逐条串行 IPC 删除」

- 位置：`.../ClipboardHistoryHeader.tsx:176-178`；后端上限见 `crates/server/src/handlers/clipboard.rs:43`（`limit.unwrap_or(100).min(500)`）
- 描述：scoped clear 对 `visibleItems` 串行 `await removeClipboardItem(item.id)`，最坏约 100 次串行 HTTP 往返（每次还需后端删库+删两个文件），期间确认框按钮禁用、用户只能等待；若其中若干条已失效，会连续弹多个错误提示。语义正确（与确认文案同源），仅效率与体感问题。
- 建议修复：改为受控并发（如 `Promise.all` 分批 8–16）或新增后端 `POST /clipboard/remove-many`（body `{ids}`）一次事务删除（后者还顺带减少 `captureError` 噪声）。

### L5（low / correctness·边界）筛选菜单方向键使用打开瞬间的 `items` 快照

- 位置：`.../ClipboardHistoryHeader.tsx:107-149`（`items` 在 effect 体内一次性查询，依赖数组仅 `[filterOpen, closeFilterMenu]`）
- 描述：菜单打开期间若有 2s 轮询带来新的 kind（或某 kind 归零触发 `setClipboardKindFilter('all')` 引起重渲），DOM 中菜单项集合会变，而按键处理仍操作旧节点：`focus()` 落在已脱离文档的节点上静默失败，方向键看起来「不动」。
- 建议修复：在 keydown 内实时查询（`filterMenuRef.current?.querySelectorAll('[role="menuitemradio"]')`），或把 `kindCounts` 纳入依赖。

### L6（low / correctness·边界）快速双击时 CopyButton 的复位定时器可能并存，"已复制" 提前结束

- 位置：`.../components/CopyButton.tsx:62-94`
- 描述：`handleClick` 开头 `clearTimeout` 是同步的，而自定义路径的 `markCopied()` 要等 promise 落定后才设置 `resetTimerRef`。两次快速点击（尤其图片写回路径）可能出现：click2 的 clear 先于 click1 的 set 执行 → 两个定时器并存 → 早的那个 600ms 后把 `copied` 置 false 并 `stopAnimation()`，视觉反馈被截断。
- 建议修复：把 `clearTimeout` 也放进 `markCopied()` 内（设置前先清理），或在 promise 链上记录「本次点击序号」，只允许最新一次生效。

### L7（low / i18n 语义漂移）输入框 placeholder 由 `clipboardSearchPlaceholder` 改为通用 `searchPanelSearch`，而前者被降级为按钮标签

- 位置：`.../ClipboardHistoryList.tsx:116-117`（`placeholder/aria-label = t.searchPanelSearch`＝"搜索"）；`.../ClipboardHistoryHeader.tsx:217-220`（开关按钮 tooltip/aria 复用 `t.clipboardSearchPlaceholder`＝"搜索剪贴板"）
- 描述：剪贴板搜索框原本的专用提示「搜索剪贴板」被通用「搜索」取代（信息量下降），而 key 名 `clipboardSearchPlaceholder` 现在挂在按钮上，名实不符；后续维护者按名字找输入框会找错。
- 建议修复：输入框保留 `clipboardSearchPlaceholder`，开关按钮新增 `clipboardSearchToggle`（含 open/close 两态文案）。

### L8（low / i18n 耦合）剪贴板搜索关闭按钮复用 `t.browserBack`

- 位置：`.../ClipboardHistoryHeader.tsx:217-221`（`clipboardSearchOpen ? t.browserBack : …`）
- 描述：跨领域复用浏览器 domain 的 key（"后退"）作为剪贴板搜索的关闭标签。符合「必须用 i18n key」的硬规则，但语义错配：浏览器侧文案一旦调整，剪贴板 UI 会被动改变，译者也拿不到上下文。
- 建议修复：新增 `clipboardSearchClose`（与 L7 的 `clipboardSearchToggle` 合并为一个方案：open→"搜索剪贴板"，close→"关闭搜索"）。

### L9（low / 规范可机械化）ClipboardBridge 缺少四端 parity 测试

- 位置：`src/shared/ipc/__tests__/`（存在 `storage-parity.test.ts`，无 clipboard 对应物）
- 描述：仓库规则要求「新增 IPC 方法必须同步实现 tauri/preview/mock」，StorageBridge 有 parity 测试兜底，ClipboardBridge 没有。本次四端都补齐了（已交叉验证），但**该保证目前只靠人工审查**；下次新增方法仍可能漏一端，且 TypeScript 只能保证「类型上存在」（`extends`/spread 得到的实现里漏一个方法会报错，但 mock 若用 `as` 或 `satisfies` 组合则不报）。
- 建议修复：仿 `storage-parity.test.ts` 加 `clipboard-parity.test.ts`，断言四端 `Object.keys`/方法集合一致。

### L10（low / 测试卫生）测试直接改写全局 `window.digitalLife` 且不还原

- 位置：`.../__tests__/ClipboardItemViewer.test.tsx:79-95`、`.../__tests__/ClipboardItemRow.test.tsx:65-70`、`.../__tests__/ClipboardHistoryList.test.tsx:78-80`
- 描述：文件内 `Object.assign`/直接赋值后无 `afterEach` 还原。Vitest 默认按文件隔离，跨文件风险低，但同文件内后续新增用例会继承上一个用例注入的桥接实现（尤其 Viewer 用例里 `getImageUrl` 一旦被前一个用例覆盖，后来者可能在不自知的前提下通过）。
- 建议修复：在 `beforeEach` 设默认桩 + `afterEach` 删除/还原 `window.digitalLife`。

### L11（low / 影响面）`danger-hover` 规则改动波及浏览器侧三个按钮

- 位置：`src/styles/regions/rightpanel/browser-webview.css:509-514`（新选择器 `.adl-icon-btn.adl-icon-btn--danger-hover:hover:not(:disabled)` → `var(--danger)` / `var(--danger-soft)`）
- 描述：改动本身**方向正确**（原 Tailwind 调色板 `--color-red-500/100` 不符合「颜色必须用 `var(--…)`」，且提高特异性到 (0,4,0) 解决 titlebar.css 后加载覆盖的说明成立）。但 `.adl-icon-btn--danger-hover` 还用于标签树/扁平列表的关闭按钮（`BrowserEntrySubEntries.tsx:124`、`BrowserOpenTabFlatListItem.tsx:57`、`BrowserTreeEntryFlatList.tsx:160`），这些非本次需求表面的 hover 配色（亮/暗主题对比度）**需要一次视觉回归确认**。
- 建议修复：无需改代码；在双端 + 亮/暗两套主题下核对上述三处 hover 观感（或把规则收敛为 `.adl-clipboard__clear` 专用，保持改动最小）。

### L12（low / 可访问性·信息）查看器 Tab 焦点陷阱同时吞掉 Shift+Tab

- 位置：`.../ClipboardItemViewer.tsx:45-48`
- 描述：`event.key === 'Tab'` 时无条件 `preventDefault()` 并聚焦关闭按钮，Shift+Tab 同样被吞。当前面板内**只有**关闭按钮可聚焦，故行为正确并兑现了 `aria-modal`；但它同时意味着键盘用户无法用 Tab 离开对话框（只能用 Escape/×/遮罩），且未来若面板内新增可聚焦元素（如复制按钮），陷阱会变成「所有 Tab 都跳回关闭按钮」的限制。
- 建议修复：仅当焦点会越出面板时才 `preventDefault`（首/末元素处 Wrap），或在面板内加入复制按钮后一并实现标准首尾循环。

### L13（low / 文档准确性）progress 日志与最终代码存在命名/结论漂移

- 位置：`docs/root-cause-resolution/2026-09/progress-2026-09-16-205905.md`（任务 17 写 `buildClipboardClearScope.ts`；任务 7 写「删除不再使用的 `clipboardClearAll`」）
- 描述：实际文件名为 `clipboardClearScope.ts`（无 `build` 前缀）；`clipboardClearAll` 最终**保留**（值改为「清空全部剪贴板历史」，用于清空全部时的 tooltip/aria/标题）。考虑到该文档是 22 轮追加式日志、非最终态快照，任务 7 的表述在其时点可能成立，但归档时容易被误读为最终结论。
- 建议修复：无需改历史条目；在文档末尾补一段「最终 key 清单 / 文件清单」小结（或由 Phase 4 归档章节统一声明最终态）。

---

## 5. 对「已判定不修复」项的复核结论

| 判定项 | 复核结论 | 依据 |
|--------|----------|------|
| 路由命名 `image` | **同意** | 与既有 `thumb`、前端 `imagePath` 命名体系一致；REST 语义上 `/clipboard/image/:filename` 与 `/clipboard/thumb/:filename` 对称 |
| `serve_png` 不做 canonicalize 二次校验 | **同意** | `file_name()` 结果不含分隔符，`dir.join(safe)` 无法逃逸；唯一的残余面是「images_dir 内被同用户植入的符号链接会被跟随」，不跨权限边界。穿越回归由 4 组编码变体测试承担（我本地实测 404，非假通过） |
| 读错误对外统一 404 + warn | **同意** | 不泄露服务端内情，且 `e.kind() != NotFound` 才 warn，避免刷日志；有助排查「图不显示」根因 |
| 资产路由按 filename 而非 id | **同意** | 落盘名为 `{uuid}.png`/`thumb-{uuid}.png`（`read.rs:105-107`），全局唯一，无串图风险；按 filename 也避免了「路由要查库」的耦合 |
| `getImageUrl` 保持同步方法 | **同意** | 与 `getThumbUrl` 同形，纯字符串构造；文件存在性客户端本就无从判断，交给 `<img onError>` 逐级回退是正确分层 |
| 无鉴权 + CORS `*` | **同意（附条件）** | 属既有安全模型，且新增路由未扩大能力面（filename 为 UUID，`list`、`thumb` 本就未鉴权）。**条件**：未来引入鉴权时，`/clipboard/image/:filename` 必须与 `thumb` 一并纳入受保护范围 |
| 缓存头/流式响应为性能优化 | **同意** | `tokio::fs::read` 全量入内存（`clipboard.rs:140`），大截图原图（数十 MB）× 无 `Cache-Control` 会被反复读取，列为后续优化项即可 |
| `githubPanelUtils.formatRelativeTime` 保留 | **同意** | 与 `@utils/relativeTime` 服务不同领域，合并属独立任务，不应夹带在本次变更中 |
| `relativeTime` >30 天按 30 天整桶 | **同意（记录取舍）** | 用户可见表述上 59 天会显示「30 天前」，属已知取舍；若要改需引入月/年桶并同步 i18n，超出本次范围 |
| mock 目录被 eslint/prettier 忽略 | **同意** | 既有设计；本次 `mock-clipboard.ts` 仅新增一行 `getImageUrl: () => ''` 并补齐行尾换行，风险可忽略 |

---

## 6. 亮点（建议保留的实现决策）

1. **单点派生避免口径漂移**：`buildClipboardFilterInput`（列表/计数/清空范围共用一件入参）与 `buildClipboardClearScope`（文案与执行动作同源）解决了「文案说筛选、实际清全部」这类经典缺陷，且每个纯函数都有测试（8 + 12 用例）。
2. **查看器焦点治理完整**：`createPortal` + `aria-modal` + 打开即聚焦关闭按钮 + 卸载还原先前焦点（`ClipboardItemViewer.tsx:32-36`），并有专门测试覆盖（Tab 陷阱 + 焦点还原）。
3. **图片三级回退缩略图 → 图标**：`imageStage` 状态机 + `<img onError>`，测试覆盖两级回退；同时把「不做文件存在性校验」写进 `ClipboardBridge` JSDoc，契约清晰。
4. **`getThumbUrl`/`getImageUrl` 抽出 `clipboardAssetUrl`** 消除了新增方法的复制粘贴，且 Windows/POSIX 路径与退化路径（`a/b/` → `''`）均有测试。
5. **Rust 侧测试质量高**：`image_serves_stored_original_and_404s_unknown` 特意在 `thumbs_dir` 放同名文件，以「响应字节等于 images_dir 内容」证明未跨目录取图；穿越测试区分「上级目录真实存在机密文件」以避免假通过。
6. **`overlayManager` 与 `formatT` 的改动都带注释说明根因**（WebView2 让位；占位符串扰），符合仓库「先定位根因」的规范。

---

## 7. 修复优先级建议

1. **M1**（一行改动，直接消除「选好文本却把窗口关掉」的体感缺陷，且与兄弟实现对齐）
2. **M3**（补 `formatT` 测试；确认/显式化空白查询在替换路径的语义）
3. **M2**（行可访问名，影响读屏可用性；可与行内按钮结构一并调整）
4. L2 / L3 / L7 / L8（同一处 header 的 i18n 与 a11y 小修，建议合并一次提交）
5. L4 / L5 / L6 / L9 / L10（独立小改进，可择期）
6. L1（DRY 抽取，建议单独立项，避免与本次功能混提）
7. L11 / L12 / L13（无需代码改动或仅需视觉/文档确认）

---

## 8. 说明与局限

- 本报告的「严重度」基于：是否造成用户可见的数据/交互损失（M1）、是否影响可访问性基本契约（M2）、是否引入共享层行为变化且无覆盖（M3）；其余归为 low。
- 未独立复核项：`cargo clippy -D warnings`（成本）、Tauri 桌面模式下的实际 WebView2 让位观感、大图（>20MB 原图）在查看器中的滚动条联动表现（`CustomScrollArea` 依赖 ResizeObserver 观察 `scroll.firstElementChild`，图片异步加载后的尺寸变化理论上有 observer 兜底，但未实测）。
- 未执行任何 git 命令；未修改任何源码/配置/文档；本报告为唯一写入文件。
