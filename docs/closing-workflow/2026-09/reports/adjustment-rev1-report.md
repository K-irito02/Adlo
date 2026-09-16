# 复审报告 — 剪贴板历史面板 rev1（调整 + 缺陷修复）

- 审查角色：closing-workflow code reviewer（Agent 2）
- 审查范围：rev1 diff（组件 / 纯函数 / slice / 共享层 / 样式 / 测试 / Rust 路由与 handler）
- 日期：2026-09-17
- 结论：**未发现 critical / high 问题**；medium 4 项、low 15 项、info 1 项。核心设计目标（清空范围与文案严格同源）经代码交叉验证成立。

---

## 1. 输入快照（只读）

基目录：`E:\AI-DIGITAL-LIFE\SourceWorkspace\.review-diffs\`

| 分类 | 快照文件 |
|---|---|
| 组件 | `ai-digital-life_frontend_src_app_features_clipboard-history_ClipboardHistoryHeader.tsx-rev1.diff`、`..._ClipboardHistoryList.tsx-rev1.diff`、`..._ClipboardItemRow.tsx-rev1.diff`、`..._ClipboardItemViewer.tsx-rev1.diff` |
| 纯函数 / slice | `..._clipboardFilter.ts-rev1.diff`、`..._clipboardClearScope.ts-rev1.diff`、`..._clipboardKind.ts-rev1.diff`、`..._stores_slices_clipboardHistorySlice.ts-rev1.diff` |
| 测试 | `...___tests___ClipboardHistoryHeader.test.tsx-rev1.diff`、`..._ClipboardHistoryList.test.tsx-rev1.diff`、`..._ClipboardItemRow.test.tsx-rev1.diff`、`..._ClipboardItemViewer.test.tsx-rev1.diff`、`..._clipboardFilter.test.ts-rev1.diff`、`..._clipboardClearScope.test.ts-rev1.diff`、`..._components___tests___CopyButton.test.tsx-rev1.diff`、`..._icons_core.test.tsx-rev1.diff`、`..._utils___tests___relativeTime.test.ts-rev1.diff`、`..._utils___tests___searchPattern.test.ts-rev1.diff`、`..._httpBridge___tests___httpBridge.test.ts-rev1.diff`、`..._shared___tests___overlayManager.test.ts-rev1.diff` |
| 共享层 | `..._components_CopyButton.tsx-rev1.diff`、`..._components_NotificationCard.tsx-rev1.diff`、`..._regions_right-panel_hooks_useSearchPanel.ts-rev1.diff`、`..._app_i18n_formatT.ts-rev1.diff`、`..._i18n_zh-CN_utilities.ts-rev1.diff`、`..._i18n_en-US_utilities.ts-rev1.diff`、`..._utils_relativeTime.ts-rev1.diff`、`..._utils_searchPattern.ts-rev1.diff`、`..._app_icons_core.tsx-rev1.diff`、`..._app_icons_index.ts-rev1.diff`、`..._shared_overlayManager.ts-rev1.diff`、`..._shared_ipc_clipboard.ts-rev1.diff`、`..._httpBridge.ts-rev1.diff`、`..._mock_mock-clipboard.ts-rev1.diff`、`..._preview-bridge_index.ts-rev1.diff` |
| 样式 | `..._styles_regions_leftbar-clipboard.css-rev1.diff`、`..._styles_regions_composer-core.css-rev1.diff`、`..._styles_regions_rightpanel_browser-webview.css-rev1.diff` |
| Rust | `ai-digital-life_crates_server_src_handlers_clipboard.rs-rev1.diff`、`..._crates_server_src_router.rs-rev1.diff` |
| 文档 | `docs_root-cause-resolution_2026-09_progress-2026-09-16-205905.md-rev1.diff`、`docs_root-cause-resolution_2026-09_README.md-rev1.diff` |

仓库源码仅读取交叉验证，未修改任何源码/配置/文档（本报告为唯一写入）。

## 2. 验证方法与证据

- 交叉阅读实际源码（非 diff 片段）：`ClipboardHistoryHeader.tsx`、`ClipboardHistoryList.tsx`、`ClipboardItemRow.tsx`、`ClipboardItemViewer.tsx`、`clipboardFilter.ts`、`clipboardClearScope.ts`、`clipboardKind.ts`、`clipboardHistorySlice.ts`、`stores/actions/utilitiesActions.ts`、`CopyButton.tsx`、`NotificationCard.tsx`、`formatT.ts`、`searchPattern.ts`、`relativeTime.ts`、`Tooltip.tsx`、`CustomScrollArea.tsx`、`icons/{core,helper,index}.tsx`、`overlayManager.ts`、`httpBridge.ts`、`preview-bridge/index.ts`、`mock/mock-clipboard.ts`、`tauri-bridge/index.ts`、`styles/{index.css,tokens.css,themes.css,leftbar.css,leftbar-clipboard.css,context-menu.css,search-panel.css,browser-webview.css}`、`crates/clipboard/src/store.rs`、`crates/server/src/{router.rs,handlers/clipboard.rs}`、`.agents/rules/*`。
- 本地执行验证（未改动源码）：
  - `npx vitest run src/app/features/clipboard-history src/app/components/__tests__/CopyButton.test.tsx src/app/utils/__tests__/searchPattern.test.ts src/app/utils/__tests__/relativeTime.test.ts` → **9 文件 / 62 用例全通过**。
  - `npx tsc --noEmit` → **0 错误**。
  - `npx eslint <改动文件>` → **0 error**（仅 1 条“mock 目录被 ignore”的 warning，与本次改动无关）。
- Rust 侧未执行 `cargo test`（避免构建产物占用磁盘），以静态阅读 + diff 内测试作为依据，标注为未实机验证。

## 3. 判定为「正确/已达标」的关键点

1. **清空范围与文案严格同源（已核实）**
   - 判定源唯一：`buildClipboardClearScope`（`clipboardClearScope.ts:27-61`）→ `clearScope: string | null`（`ClipboardHistoryHeader.tsx:56-80`）。
   - 派生链全部取自同一 `clearScope`：tooltip（:198）、`aria-label`（:203）、对话框 `aria-label`（:303）、标题（:306）、正文 `confirmMessage`（:83-85, :316-318）、动作分支（:173-178）。
   - 过滤器输入单点：`buildClipboardFilterInput`（`clipboardFilter.ts:30-45`）与 `buildClipboardClearScope` 使用**同一组** 6 个状态（searchOpen/query/matchCase/wholeWord/useRegex/kindFilter），且两者对 `searchOpen===false` 与空白 query 的判定一致（均视为“未收窄”）。
   - 逐项核对后不存在“文案说筛选、实际清全部”或反向的情形：`clearScope===null` ⟺（无生效搜索 且 kindFilter==='all'）⟺「过滤结果=全量」，动作亦为后端全清。
2. **失效类型筛选回退**：`ClipboardHistoryHeader.tsx:88-92`，且回退检查覆盖“未知 kind”（`getClipboardKindCounts` 统计真实 kind），无误伤。
3. **空态区分**：`ClipboardHistoryList.tsx:163-167`（`clipboardHistory.length===0` → 无历史；否则无匹配），正确。
4. **CopyButton 硬化**：`.catch()` 兜底（:96-100）、`clipboard` 缺失时 execCommand 回退（:96-100）、卸载清理定时器（:46-54）、`mountedRef` 防卸载后 setState（:66-68）、自定义路径以微任务包裹 `onCopy` 捕获同步抛错（:83-92）、`ok===false` 不标记已复制（:85-88）。符合 `error-handling.md` 的“禁止 Promise 链缺 .catch”。
5. **`formatT` 单次替换**（`formatT.ts:19-21`）：消除“先注入文本含 `{other}` 被后续命中”的串扰；`Object.hasOwn` 与 `tsconfig target/lib = ES2022` 匹配。`clearConfirmScoped` 注入 `scope`（内容含用户 query）不再被二次解析——这正是本轮修复目标。
6. **i18n**：22 个新增/变更 key 在 `zh-CN/utilities.ts` 与 `en-US/utilities.ts` 双向齐全；被删除的 `clipboardLocalNote` / `clipboardClearConfirm` 全仓库无残留引用；组件层无新增硬编码文案（`Aa`/`ab`/`.*` 为既有搜索面板同款符号）。
7. **双端一致性 / Bridge 三实现**：`getImageUrl` 已补齐 `shared/ipc/clipboard.ts`（接口+JSDoc）、`httpBridge.ts`（`clipboardAssetUrl` 复用）、`preview-bridge`（恒走 http，与 `getThumbUrl` 同策略）、`mock`（`''`）；Tauri 经 `tauri-bridge/index.ts:44 ...http` 继承，符合 `bridge-three-implementation-pattern.md`。
8. **Rust 静态资产**：`serve_png` 抽取后 `thumb`/`image` 分目录；`Path::new(filename).file_name()` 归一化对 `..`/`.`/`%2e%2e%2f` 等均返回 None 或 basename，跨目录不可读；`tracing::warn!` 区分真实读失败；`router.rs` 路由登记正确；新增“同名文件不得跨目录取图”与穿越用例，设计合理。
9. **overlayManager**：`.adl-clipboard-viewer` 已登记，Tauri WebView2 遮罩检测覆盖查看器；过滤菜单复用 `.adl-sidebar-menu`（本就在选择器表中），无遗漏。
10. **死样式/悬空类名清理**：`.adl-clipboard__row-item`、`.adl-clipboard__note`、`.adl-clipboard__search`、`.adl-clipboard-row__icon`、`.adl-clipboard__clear:hover` 全仓库无引用；`--danger` / `--danger-soft` token 存在（themes.css:179-180、425-426），`adl-icon-btn--danger-hover` 提权到 (0,4,0) 以压过 titlebar.css（index.css 中 titlebar.css 后加载）的 (0,3,0) 规则，结论正确。

---

## 4. 逐问题清单

### F1 —「全部」计数（≤200）与未收窄清空的实际范围（后端全清）不一致
- 文件/行：`ClipboardHistoryHeader.tsx:173-174`（动作）、`:195-197`（计数）、`:268`（菜单「全部」计数）；`stores/actions/utilitiesActions.ts:19-35`（`list(200)`）；`crates/server/src/handlers/clipboard.rs:43`（后端 `min(500)`）；`crates/clipboard/src/store.rs`（无保留上限）
- 严重度：**medium**｜类别：Correctness / UX
- 描述：前端只取最近 200 条（`clipboardHistory`），计数徽章与筛选菜单「全部 N」均基于该窗口；而 `clearScope===null` 走 `clearAllClipboard()` 清除**后端全部**条目。当历史 >200 条时，用户看到 `200` 却可能被删除 200 条以外条目——这是“可见集 vs 200 窗口”在**未收窄路径**上的反向不一致（已判定不修复项只覆盖了“收窄路径逐条删除”的另一种方向）。
- 建议：三选一——(a) 前端 `list(500)`（后端上限）并同步上限；(b) 未收窄时若 `clipboardHistory.length === 200`（可能被截断）改用逐条删除，使“所见即所删”；(c) 计数与菜单显示 `200+` 明确提示截断。

### F2 — 逐条删除串行 await，且每次 store 更新触发全量重渲染（O(n²)）
- 文件/行：`ClipboardHistoryHeader.tsx:170-186`；`ClipboardItemRow.tsx:24`（`memo` 因 `item` 每次轮询换引用而不命中）
- 严重度：**medium**｜类别：Performance / UX
- 描述：收窄清空最多 200 条，`for … await removeClipboardItem()` 串行 = 最多 200 次 IPC/HTTP 往返；每次成功删除都 `set({clipboardHistory})` → `filtered` 重算 → 全列表重渲染（行 memo 不命中），最坏 O(n²)。`clearing` 仅禁用按钮、无进度反馈，长历史下确认后界面可长时间“无反应”。
- 建议：`await Promise.all(visibleItems.map((i) => removeClipboardItem(i.id)))`（或后端新增按 id 批量删除命令），并为 `clearing` 增加进度（如 `n/total`）或至少 spinner。

### F3 — 清空确认弹窗缺少焦点管理（未入焦、无焦点圈禁）
- 文件/行：`ClipboardHistoryHeader.tsx:293-342`；对照 `components/ConfirmDialog.tsx:23-39`（打开即 focus 确认按钮）、`ClipboardItemViewer.tsx:38-58`（焦点圈禁 + 归还）
- 严重度：**medium**｜类别：A11y / Standards
- 描述：`role="dialog" aria-modal="true"` 声称模态，但打开时不移动焦点、Tab 可穿越到背后工具栏（含筛选/搜索按钮），因此弹窗打开期间用户能改变 `kindFilter`/`searchOpen`，使弹窗文案与动作在“同一弹窗生命周期内”被改写（虽因每次渲染重绑 `onClick` 而仍保持一致，但交互不可预期）。同一 PR 内的查看器已实现圈禁，弹窗未实现，标准不一致。
- 建议：打开时 `confirmBtnRef.current?.focus()`，Tab 圈禁在弹窗内，Escape 用 capture 阶段；或改造/复用 `ConfirmDialog`（需支持 `clearing` 禁用与自定义正文，可给该组件加 `busy`/`children` 选项）。

### F4 — 行 `role="button"` 内嵌交互子按钮（无效 ARIA）
- 文件/行：`ClipboardItemRow.tsx:63-128`（`div role="button" tabIndex={0}` 内含 3 个 `<button>`）
- 严重度：**medium**｜类别：A11y
- 描述：交互式元素嵌套交互式子元素违反 ARIA（button 角色不应有可聚焦后代），部分 AT 会吞掉子按钮，导致「删除本条 / 放大查看 / 复制」不可达。用户的诉求是“整行点击 = 放大查看”，该诉求**不需要**行具备 button 角色。
- 建议：行改为 `role="group"`（或 `<li>` 直接挂 `onClick`+键盘处理但去掉 button 角色），把可访问动作落在已存在的「放大查看」按钮上；或用覆盖整行的透明按钮置于内容之下、子按钮 `z-index` 之上。用户要求本身可保留。

### F5 — 筛选菜单键盘导航持有“打开时刻”的 DOM 快照
- 文件/行：`ClipboardHistoryHeader.tsx:102-149`（`items` 在 effect 内一次性 `querySelectorAll`）
- 严重度：low｜类别：Correctness
- 描述：菜单打开期间的 2s 轮询可能改变 `kindCounts` → 菜单项重建，`items` 仍指向旧（脱离 DOM 的）节点，方向键/Home/End 会 `focus()` 到游离节点，表现为焦点丢失。菜单项数量变化（新增 kind）亦同。
- 建议：按键时实时重新查询，或把 items 放 ref 并在菜单子树变更时刷新。

### F6 — `handleClear` 的 catch 为空（仅注释）
- 文件/行：`ClipboardHistoryHeader.tsx:180-181`
- 严重度：low｜类别：Standards / Error handling
- 描述：`.agents/rules/error-handling.md:94` 禁止 `try { … } catch {}` 空 catch。实际上 `clearAllClipboard` / `removeClipboardItem`（`utilitiesActions.ts:45-69`）**永不 reject**（内部 `captureError`），该 catch 是死分支。
- 建议：删除 `try/catch` 仅保留 `finally`；或改为 `catch (err) { console.warn('[clipboard-history] clear failed', err); }` 以便未来桥接层异常可追踪。

### F7 — 清空进行中与轮询并发，可能短暂“复活”已删行
- 文件/行：`ClipboardHistoryList.tsx:51-72`（2s 轮询 + 可见性恢复即刷）+ `ClipboardHistoryHeader.tsx:176-178`
- 严重度：low｜类别：Correctness / Race
- 描述：若一次 `fetchClipboardHistory(true)` 的响应在若干次删除完成前返回，`setClipboardHistory(result.data)` 会把已删行写回 store（行重现），需等下一轮轮询才消失。最终一致，属瞬态闪烁。
- 建议：`clearing` 期间暂停轮询（可由 store 暴露 `clearing` 或由 Header 传入回调），或删除成功后按 id 再对最新 store 做差集。

### F8 — 无效正则仅有「无匹配」空态，且清空按钮被禁用
- 文件/行：`clipboardFilter.ts:65-73`（pattern 为 undefined → 返回 `[]`）；`ClipboardHistoryList.tsx:163-167`；`ClipboardHistoryHeader.tsx:204`
- 严重度：low｜类别：UX / Correctness
- 描述：正则模式下输入非法表达式（如 `([`）时列表显示“没有符合搜索和筛选条件的剪贴板历史”，与“搜索无命中”无法区分；同时 `visibleItems.length===0` 使清空按钮禁用（行为正确，但用户不知原因）。搜索面板（`useSearchPanel`）同样按“无结果”处理，属既有约定。
- 建议：为非法的 `useRegex` 输入提供独立提示（如输入框 `aria-invalid` + 提示文案），或至少在空态中区分。

### F9 — 查看器遮罩 `onClick={onClose}` 对拖拽选择不友好
- 文件/行：`ClipboardItemViewer.tsx:62`（对照 `ClipboardHistoryHeader.tsx:297` 的 `e.target===e.currentTarget` 写法）
- 严重度：low｜类别：UX / Correctness
- 描述：两种写法在同一场景（面板内按下、遮罩上松开）表现相同——`click` 的 target 会是共同祖先（遮罩）→ 关闭。查看器文本区域 `user-select: text`，用户选中长文本拖出面板松手即被意外关闭。
- 建议：记录 `pointerdown` 的目标，仅当按下与松开都落在遮罩本身时才关闭（或改用 `pointerdown` 目标判定）。

### F10 — 过滤入参在两处独立派生，未完全“单点”
- 文件/行：`ClipboardHistoryList.tsx:81-103`（构造 `buildClipboardFilterInput`）vs `ClipboardHistoryHeader.tsx:56-80`（Header 自行拼 6 个原始状态给 `buildClipboardClearScope`）
- 严重度：low｜类别：Design / Coupling
- 描述：本轮把“可见集”单点化为 `visibleItems` prop，但**过滤条件**仍由 List 与 Header 分别从 store 组装；若未来新增筛选维度（如来源 App），两处必须同步修改，否则重现“清空范围 vs 可见集”漂移——正是本次重构要消灭的失败模式。
- 建议：由 List 派生一次 `ClipboardFilterInput`（外加 `kindLabel`），随 `visibleItems` 一起下传；Header 只消费该对象。

### F11 — `role="menu"` 各项默认可 Tab（应为 roving tabindex）
- 文件/行：`ClipboardHistoryHeader.tsx:257-287`
- 严重度：low｜类别：A11y
- 描述：`menuitemradio` 用 `<button>` 默认 `tabIndex=0`，菜单模式规范下只应有一项在 Tab 序列（当前靠“Tab 即关闭菜单”缓解）。
- 建议：非当前项 `tabIndex={-1}`，仅 `aria-checked="true"` 项 `tabIndex={0}`。

### F12 — 搜索面板 JSX 第三份重复（已判定不修复，保留改进空间）
- 文件/行：`ClipboardHistoryList.tsx:108-160`；同类：`FileNavigatorShell`（第三份）、`FilesPanel.ts` 工具栏（:237-253）
- 严重度：low｜类别：Design / Duplication
- 描述：状态归属确有差异（剪贴板用 store，文件面板用局部 state / hook），故不合并状态可接受；但**表现层**（input + Aa/ab/.* toggles 的 DOM 与 class）完全同构，样式与无障碍属性三处维护。
- 建议：抽取受控展示组件 `SearchPanelField({value,onChange,placeholder,flags,onToggleFlag})`，状态仍各自持有。

### F13 — `ClipboardItemViewer` 自建 modal 骨架，Escape/焦点逻辑与 Header 各写一份
- 文件/行：`ClipboardItemViewer.tsx:27-116`；`ClipboardHistoryHeader.tsx:157-168`
- 严重度：low｜类别：Design
- 描述：overlay+panel+header+Escape+焦点圈禁在项目内已有多个实现（`ConfirmDialog`、`adl-prompt-modal` 家族、本查看器），且 Escape 监听均为 document 级，理论上多弹窗并存时会一并关闭（如确认框与查看器同时打开，需极端 Tab 操作才可达）。
- 建议：抽出一个共享 `useModalA11y`（入焦/圈禁/归还/Escape 归属栈）供查看器与确认框复用。

### F14 — 图片复制失败路径零反馈（`ok && data!==true` 静默）
- 文件/行：`stores/actions/utilitiesActions.ts:80-89`；消费端 `ClipboardItemRow.tsx:57-60`
- 严重度：low｜类别：Error handling（pre-existing，本轮改为用户可见）
- 描述：`writeClipboardItem` 只在 `!result.ok` 时 `captureError`；后端返回 `ok:true,data:false` 时直接 `return false`，无错误记录、无 toast。旧实现在此路径也无 toast，但旧实现成功时**有**成功 toast，本轮改为纯动画反馈后，“未标记已复制”成为唯一（且非显式）的失败信号。
- 建议：`!result.ok ? captureError(...) : result.data !== true && captureError(get, {code:'CLIPBOARD_WRITE_FAILED',...})`，再由 CopyButton/Row 视情况提示。

### F15 — 筛选菜单用 `position: absolute` 置于 `overflow: hidden` 容器内（纵向裁切风险）
- 文件/行：`styles/regions/leftbar-clipboard.css:67-73`（`.adl-clipboard .adl-clipboard__filtermenu`）；`.adl-clipboard{overflow:hidden}`（:7）；`.adl-sidebar-menu{position:fixed;min-width:176px}`（context-menu.css:1-15）
- 严重度：low｜类别：CSS / UX
- 描述：其它 `.adl-sidebar-menu` 用法均为 `fixed`+portal，本次改为 `absolute` 且祖先 `.adl-clipboard` 为 `overflow:hidden`。水平方向在 180px 最小侧栏（`center.css:6-7`）下，菜单 `max-content` 宽度通常 <170px，不触发裁切（已判定不修复项的理由成立但归因不准）；真正的风险是**纵向**：矮窗口 + 会话区占用时，菜单可被 `.adl-clipboard` 裁掉。
- 建议：菜单改用 portal + `fixed` 定位（复用 `.adl-sidebar-menu` 原有定位），或为该下拉单独放开容器溢出。

### F16 — `formatT` 占位符名限定 `\w+`（信息级）
- 文件/行：`i18n/formatT.ts:19-21`
- 严重度：info｜类别：Correctness / Maintainability
- 描述：`/\{(\w+)\}/g` 只识别 ASCII 字母/数字/下划线。现有全部占位符（`{n}`/`{scope}`/`{query}`/`{kind}`/`{a}`/`{b}`/`{options}`）均满足；若未来引入含 `-`/`.`/非 ASCII 的占位符会静默不替换（旧实现是 `String.replace('{key}'…)`，同样只支持字面 key，属等价约束）。
- 建议：在 `formatT` 的 JSDoc 中显式声明占位符命名约束即可（或放宽为 `[^{}]+`）。

### F17 — 搜索命中包含英文 `kind` 原始值，与本地化类型名不一致
- 文件/行：`clipboardFilter.ts:47-51`（`${item.kind}\n${item.content ?? ''}`）
- 严重度：low｜类别：Correctness / i18n（pre-existing，随重构迁入新模块）
- 描述：输入 `image` 可命中图片条目，但输入本地化类型名 `图片`/`Image` 不会；筛选菜单展示的是本地化名，语义不统一。
- 建议：若要保留“按类型搜索”，命中文本改用 `getClipboardKindLabel(item.kind, t)`（需把 `t` 传入过滤函数）；否则从命中文本中移除 `kind`，只搜内容。

### F18 — 菜单/搜索面板 `aria-controls` 在折叠时指向不存在的节点
- 文件/行：`ClipboardHistoryHeader.tsx:222`（搜索面板）、`:242`（筛选菜单）
- 严重度：low｜类别：A11y
- 描述：对应元素仅在展开时渲染，折叠态下 `aria-controls` 为悬空引用（规范允许但会让校验工具告警）。
- 建议：折叠时不输出 `aria-controls`，或改为常驻容器（`hidden`）切换。

### F19 — 文档计数与任务描述不一致（22 vs 21）
- 文件/行：`docs/root-cause-resolution/2026-09/README.md`（新增行写“22 项调整”）；任务描述为“21 项调整”
- 严重度：low｜类别：Docs
- 建议：统一为同一数字，避免归档检索歧义。

### F20 — `clipboardListSeparator` 命名偏通用
- 文件/行：`i18n/zh-CN/utilities.ts:11`、`i18n/en-US/utilities.ts:12`；唯一消费点 `clipboardClearScope.ts:45`
- 严重度：low｜类别：Naming
- 描述：该 key 只用于“搜索选项”列表连接；若将来被其它领域复用为通用分隔符，`、`/`, ` 的语义差异可能不合适；放在 clipboard 命名空间下也暗示通用性。
- 建议：改名 `clipboardClearScopeOptionSeparator`（或提到公共域）。

---

## 5. 严重度分布

| 严重度 | 数量 | 编号 |
|---|---|---|
| critical | 0 | — |
| high | 0 | — |
| medium | 4 | F1、F2、F3、F4 |
| low | 15 | F5、F6、F7、F8、F9、F10、F11、F12、F13、F14、F15、F17、F18、F19、F20 |
| info | 1 | F16 |
| 合计 | 20 | |

**Top 3（建议本轮或紧随修复）**
1. **F2** 清空最多 200 条串行 await + O(n²) 重渲染且无进度反馈 → 改 `Promise.all`（或后端批量删除）。
2. **F1** 未收窄时「200」计数与实际“后端全清”范围不一致 → 提高窗口上限 / 按窗口逐条删除 / 标注 `200+`。
3. **F3 + F4** 无障碍：确认弹窗无焦点管理（`aria-modal` 名不副实）、行 `role="button"` 内嵌子按钮（无效 ARIA）。

---

## 6. 对「已判定不修复」项的复核

| # | 原判定 | 复核结论 |
|---|---|---|
| 1 | 关闭搜索面板保留 query | **接受**。`buildClipboardFilterInput` 在 `searchOpen===false` 时把 query 置空（`clipboardFilter.ts:40`），保留值同时被过滤与清空范围一致忽略，无“隐藏生效”风险。 |
| 2 | 计数 `aria-live="polite"` | **接受**（`role="status"` 已隐含 polite，属冗余无害）。仅提示：轮询下仅在数值变化时播报，可接受。 |
| 3 | 行 `role="button"` 内含子按钮（用户明确要求整行点击放大查看） | **部分异议**：用户诉求可保留，但“行必须具 button 角色”并非诉求的一部分。`button` 角色含可聚焦后代属无效 ARIA（见 F4），建议改为 `group`/覆盖式按钮以同时满足诉求与可访问性。 |
| 4 | 筛选菜单数量为全量计数 | **接受**（计数基于已加载历史，语义为“类型分布”）。 |
| 5 | 全量命中时逐条删除（`clipboard.list(200)` 窗口存在，后端全清会删掉窗口外条目） | **接受该方向，但需补反向**：收窄路径逐条删除是对的选择；未收窄路径（`clearAllClipboard`）仍会删窗口外条目而计数只显示 ≤200（见 F1），此反向未被覆盖。 |
| 6 | 搜索面板 JSX 与 `FileNavigatorShell` 第三份重复（状态归属不同） | **接受不合并状态**，但表现层仍可抽共享展示组件（见 F12）。 |
| 7 | 极窄侧栏菜单裁切（`--leftbar-width-min` 使宽度不可达） | **理由不成立/归因不准，但结论侥幸成立**：`--leftbar-width-min: 180px` 并未使宽度“不可达”，而是菜单 `max-content` 宽度通常小于可用宽度；纵向仍受 `.adl-clipboard{overflow:hidden}` 裁切（见 F15）。 |
| 8 | 4px 工具栏内距（用户要求） | **接受**。 |
| 9 | 图标 viewBox `0 0 25 24`（用户提供 SVG） | **接受**。`makeFilled` 统一 `fill="currentColor"`，测试断言 viewBox 与 4 条 path、无硬编码 fill，符合设计系统“图标继承 currentColor”。 |
| 10 | 10/11px 字号裸值（tokens 无档位） | **接受**（`tokens.css` 无该档位；属既有惯例，见 `search-panel.css:145` 等）。 |
| 11 | `CopyButton` 文本路径乐观标记 | **接受**（有 `writeTextFallback` 兜底，且 600ms 状态回退；失败无提示属既有行为，见 F14 讨论的是图片路径）。 |
| 12 | `githubPanelUtils.formatRelativeTime` 保留 | **接受**（不同语义/返回类型，未纳入共享 utils 合理）。 |
| 13 | mock 无图 / 折叠仍轮询 / `CustomScrollArea` 每次重测 / memo 不命中 | **接受**为既有工程折衷；memo 不命中与 F2 的 O(n²) 相关，清空/轮询规模大时建议一并优化。 |

---

## 7. 未覆盖 / 未验证

- **Rust 测试与 clippy 未实机运行**：`cargo test -p adl-server --lib clipboard` 的 8 项与 `cargo clippy -D warnings` 依赖 diff 内自述；静态阅读未发现编译级问题（`serve_png(&Path,&str)` 与 `images_dir()/thumbs_dir()` 返回 `&Path` 匹配，路由宏与既有 `:filename` 写法一致）。
- **桌面端（Tauri）实机**：`overlayManager` 对查看器的 WebView2 移出行为、自定义滚动条在 WebView2 下的手感未实机验证。
- **视觉/布局**：72px 固定行高、44×34 缩略图、2px 行距等以 CSS 阅读为准（`actions` 3×22+2×2=70 ≤ 72，`TooltipSimple` 包裹为 `display:inline-flex` 不额外增高，推断无溢出），未做像素级实机比对。
- **安全**：`serve_png` 的 basename 归一化已足够阻断穿越（含编码变体），但未做 `canonicalize` 复校验（原判定 J2 已接受）；`/clipboard/image/:filename` 与 `/clipboard/thumb/:filename` 无鉴权，依赖 ad-server 本机绑定（pre-existing）。
