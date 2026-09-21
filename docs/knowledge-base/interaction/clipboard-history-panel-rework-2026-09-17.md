# 剪贴板历史面板重构与收尾教训（2026-09-17）

> 来源：左侧边栏「剪切看板」22 项调整 + root-cause-resolution Phase 4 六轮审查 + closing-workflow 四轮审查。相关实现：`frontend/src/app/features/clipboard-history/`、`crates/server/src/handlers/clipboard.rs`。

## 1. 破坏性操作的"范围权威"必须单点化

**问题**：初版用长度启发式判定「后端全清 vs 逐条删除」（`visibleItems.length === clipboardHistory.length`），而对话框文案用另一套 `buildClipboardClearScope` 判定 —— 同一破坏性决策存在两个权威，一旦不等价，对话框就会**对用户撒谎**（说"清空筛选结果"却清掉范围外数据）。

**结论**：范围描述（`clearScope: string | undefined`）同时驱动 ①动作选择 ②按钮 Tooltip/`aria-label` ③对话框标题 ④对话框正文。`clearScope === null ⇔ visibleItems === 全量` 在纯函数层可证等价，任何一处将来漂移都会立即暴露为"文案与行为不一致"。

**注意**：`clipboard.list(200)` 存在 **200 条窗口** —— 即使可见集等于历史集，也不能用「后端全清」替代逐条删除（后端可能多于 200 条，全清会删掉用户不可见的数据）。性能与"文案严格一致"冲突时，选正确性。

## 2. 进行中对话框：`disabled` 会把焦点踢出 `aria-modal`

**问题**：清空期间把 `✕`/取消/确定三按钮全部 `disabled`。Chromium/WebView2 会把**已聚焦的禁用元素**失焦到 `<body>`；由于 `✕` 是当时唯一框内落点，禁用后 `focusables.length === 0`，Tab 处理器早退 → 整个秒级清空窗口内焦点在模态框之外。

**修法**：`aria-disabled="true"` + CSS `pointer-events: none`（视觉与 disabled 一致）+ 动作层重入守卫（ref）；守卫用 ref 而非 state，使焦点陷阱 effect 只依赖「对话框开合」，不因 `clearing` 变化重建（重建瞬间的 cleanup 会把焦点归还到模态框背后）。

**教训**：`jsdom` 不会因 `disabled` 失焦 —— `dialog.contains(activeElement)` 断言在 jsdom 恒真、在 Chromium 恒假。此类断言必须用真实 Chromium（`channel: msedge`）实测，并附计算值输出。规则见 `.agents/rules/mandatory-testing.md`、`.agents/rules/ui-patterns.md` §26。

## 3. 共享类覆盖的选择器特异性

`.adl-icon-btn` 的 hover 基类是 `.adl-icon-btn:hover:not(:disabled)`（0,3,0），且 `regions/titlebar.css` 在 `styles/index.css` 中后加载 → `.adl-icon-btn--danger-hover:hover`（0,2,0）是**死规则**（浏览器关闭按钮 3 处预存同源，一并修复）。修饰类需提权到 ≥(0,4,0)（`.adl-icon-btn.adl-icon-btn--danger-hover:hover:not(:disabled)`），并改用主题 token `--danger` / `--danger-soft`（Tailwind `--color-red-*` 在暗色主题下近白底）。规则见 `.agents/rules/ui-patterns.md` §27。

## 4. 新增全屏/浮层必须注册 `overlayManager`

Tauri 模式的 WebView2 是 **OS 级渲染表面**，会盖住 DOM。任何新增模态/浮层都要把根类名加入 `shared/overlayManager.ts` 的 `OVERLAY_SELECTORS`（本次 `.adl-clipboard-viewer` 遗漏，由收尾审查发现；`.adl-prompt-modal`、`.adl-sidebar-menu` 已在册）。

## 5. 纯函数抽取的收益（本次实际消除的重复）

| 抽取 | 消除的重复 |
|------|-----------|
| `utils/searchPattern.ts`（`escapeRegExp` + `buildSearchPattern`） | 文件面板 `useSearchPanel` 与剪贴板搜索各一份正则构造（含转义/全字/大小写/非法正则语义） |
| `utils/relativeTime.ts` | `NotificationCard` 私有实现（逐字重复） |
| `clipboardKind.ts`（`getClipboardKindLabel`） | 行/头部/查看器三处类型名映射 |
| `clipboardFilter.buildClipboardFilterInput` | header 与 list 各一份过滤入参组装（"搜索面板关闭则忽略搜索词"条件漂移风险） |
| `httpBridge.clipboardAssetUrl` | `getThumbUrl` / `getImageUrl` 的 basename 提取 |

`formatT` 同时改为**单次正则替换**（`Object.hasOwn` 守卫），消除「先注入的文本含 `{other}` 占位符被后续替换命中」的串扰；新增 `i18n/__tests__/formatT.test.ts` 锁定该语义（936 key 共享，此前零测试）。

## 6. 测试真实性

- 新增 Rust 测试的「不跨目录服务缩略图」断言曾**无效**（未在 `thumbs_dir` 写入同名文件 → 404 成因与声称不符，属假信心）→ 修正为「写入同名/独占文件 + 断言响应字节」
- 断言必须能区分"实现正确"与"实现错误"两种情形；不能只断言状态码而不断言数据来源

## 7. 开发期 HMR 瞬态错误与日志判读

`debug-logs.txt` 中出现 `<ClipboardItemRow> 渲染错误`（ErrorBoundary 捕获）：错误发生在 `[vite] hot updated: ClipboardItemRow.tsx` 之后 **24ms**，模块 URL 带 HMR 时间戳，下一次 HMR 后不再复现；`main.tsx` 保证桥接在 `createRoot().render()` 之前安装 → 判定为 **HMR 期间新增依赖模块瞬时未就绪**导致的一次性异常，非生产缺陷（当前组件树由测试挂载验证）。判读日志时需结合**时间戳与构建事件**，不要仅凭 ERROR 级别就认定代码缺陷。
