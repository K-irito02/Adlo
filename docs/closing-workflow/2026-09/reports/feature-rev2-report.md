# 「放大查看」能力 — rev2 全量复审报告（子代理 A / round 2）

- 审查对象：rev2 diff 快照（`.review-diffs/changed-files-rev2.txt`，43 份）+ 仓库当前源码交叉验证
- 审查方式：**只读**。读取全部 rev2 diff，并用 Read 交叉核对仓库实际源码；未执行任何 git 命令，未修改任何源码/配置/文档
- 基线：`faffded3..HEAD`（3 提交）快照；本报告为对**最新完整 diff** 的全量重看（非增量）
- 结论：**0 critical / 0 high / 0 medium**；low 11 条（其中 3 条为上一轮已声明事项的复核，8 条为新增低风险/信息项）
- 上轮修复核实：**M1 通过、M3 通过、M3b 通过（无异义）、M2 通过**（详见 §2）

---

## 1. 结论摘要

| 维度 | 结论 |
|------|------|
| Design | 通过。原图路由 / 桥接 / 查看器 / 共享工具职责清晰，`image → thumb → icon` 三级回退闭环；清空范围单一权威（`clearScope`）驱动动作+文案 |
| Correctness | 通过。端到端链路（Rust 路由 ↔ httpBridge ↔ 3 桥实现 ↔ 查看器）、穿越防护、错误路径、非法正则、竞态均有核实；无阻断级缺陷 |
| Security & Performance | 无新增风险。basename 归一化前后端双侧 + 回归测试；静态资产无鉴权/CORS/缓存属既有整体取舍（已声明）。原图整读入内存（无流式/无 size cap）为既有取舍 |
| Standards | 通过。i18n 全部走 key（zh/en 镜像一致，无残留旧 key 引用）；bridge 三实现 + Tauri `...http` 继承齐备；Promise 处理无未捕获 rejection 路径 |
| Optimization | 通过。共享工具已抽取（`searchPattern`/`relativeTime`/`clipboardKind`/`clipboardFilter`）；已声明"不修"的 9 项逐项复核后**维持原判定**，仅 1 项给出可选改进 |

**Severity 统计：critical 0 / high 0 / medium 0 / low 11 / info 若干。**

---

## 2. 上轮（round 1）发现逐项核实

### M1 【已修】遮罩点击未判 target — **确认通过**
- 代码：`frontend/src/app/features/clipboard-history/ClipboardItemViewer.tsx:56-70`
  - 遮罩 `onClick` 内 `if (event.target === event.currentTarget) onClose()`；面板 `onClick={(e) => e.stopPropagation()}`。
- 回归验证（读测试）：`__tests__/ClipboardItemViewer.test.tsx:56-62`
  - `fireEvent.click(screen.getByRole('dialog'))` → `onClose` **未**调用（面板内点击不关闭）✓
  - `fireEvent.click(document.querySelector('.adl-clipboard-viewer'))` → `onClose` 调用 1 次（遮罩点击仍关闭）✓
- 无回归。附带观察见 §3-L3（拖选松手落在遮罩上的路径未被该守卫覆盖，需实测确认）。

### M3 【已修】`formatT` 单次替换语义无测试守护 — **确认通过**
- 实现：`frontend/src/app/i18n/formatT.ts:9-11`（`str.replace(/\{(\w+)\}/g, (match,name)=>…)`，单次遍历 + `Object.hasOwn` 白名单）。
- 测试：`frontend/src/app/i18n/__tests__/formatT.test.ts`，7 用例，逐项对照要求：

| 要求 | 用例 | 真实覆盖 |
|------|------|----------|
| 无 vars | `formatT(t,'greet')` → `Hello {name}` | ✓ |
| 字符串/数字参数 | `{name:'Ada'}`→`Hello Ada`；`{n:5}`→`5 min ago` | ✓ |
| 单次替换 | `'{a} and {b}'` → `x and y` | ✓ |
| 注入值不被二次扫描 | `{a:'literal {b}', b:'y'}` → `literal {b} and y`；`{scope:'search "{options}"'}` | ✓（旧实现此处会串扰，属真回归守护） |
| 未知占位符保留 | `'value {unknown}'` + `{other:1}` | ✓ |
| `$&` 不被解释 | `{name:'$&'}` → `Hello $&` | ✓（旧实现会插入匹配串，属真回归守护） |
| 缺 key 回退 | `formatT(t,'nope')` → `'nope'` | ✓ |

- 结论：**真实覆盖全部 7 项**。仅缺"同一占位符多次出现全部替换"用例（low，见 §3-L4）。

### M3b 【不修·已声明】共享 `searchPattern` 空白 query 口径 — **确认判定合理**
- `utils/searchPattern.ts:26` 由 `if (!query)` 改为 `if (!query.trim())`；`useSearchPanel.ts:50` 的 `filteredResults` 本就 `!input.searchQuery.trim()` 短路。
- 净效果：仅"纯空白查询"下 `handleReplace` 由「替换空白」变为「无操作」（`useSearchPanel.ts:62-67`，`searchPattern` 为 `undefined`）。**非空白查询路径语义不变**。
- 属口径统一后的正确行为，同意"不修"。

### M2 【不修】行 `role="button"` 内嵌子按钮 — **确认判定合理**
- `ClipboardItemRow.tsx:106-176`：行 `onClick={handleZoom}`；删除按钮 `stopPropagation`（:71-73）、放大按钮 `stopPropagation`（:110）、`CopyButton.handleClick` 首行 `stopPropagation`（`CopyButton.tsx:61`）；行 `handleKeyDown` 有 `e.target !== e.currentTarget` 守卫（:60-65）。
- 测试守护：`__tests__/ClipboardItemRow.test.tsx:93-118`（复制/删除均不触发放大）；用户明确要求整行点击放大，`role=button` 为键盘可达所必需。

### 其余 round 1 低/信息项与 9 项「不修复」判定
- 与 root-cause-resolution Phase 4 记录一致（`docs/root-cause-resolution/2026-09/progress-2026-09-16-205905.md` 第 201-216 行、244-247 行）。逐项改进空间复核见 §5。

---

## 3. Low / 信息项（新增）

### L1 — `formatT` 占位符字符集收窄（Correctness / robustness, low）
- 位置：`frontend/src/app/i18n/formatT.ts:9`
- 描述：新正则 `\{(\w+)\}` 仅匹配 `[A-Za-z0-9_]`，而旧实现按 key 精确替换可支持 `-`/`.` 等字符的占位符名。当前 i18n 全量 grep 确认**不存在**非 `\w` 占位符（`{[a-zA-Z0-9_]+[-.][^}]*}` 在 `app/i18n` 下 0 命中），故为**潜在**收窄而非现网缺陷。
- 建议：`/\{([^{}]+)\}/g`，或在 `formatT` JSDoc 明确"占位符名限定 `\w+`"。

### L2 — 清空确认框在 `clearing` 期间焦点逃出 aria-modal（A11y, low）
- 位置：`ClipboardHistoryHeader.tsx:160-170`（`closeConfirm` 依赖 `clearing`）+ `:196`（effect deps `[confirmOpen, closeConfirm]`）
- 描述：点击「确定」→ `clearing=true` → `closeConfirm` 换新引用 → effect 先执行 cleanup `trigger?.focus()`（把焦点移到遮罩后的工具栏清空按钮），随后 effect 体 `confirmBtnRef.current?.focus()` 因两按钮已 `disabled` 而成为 no-op，焦点在清空期间停留在模态外。结束后 `confirmOpen=false` 会再次归还焦点，故终态正确，仅中途焦点抖动（鼠标场景可见焦点环闪烁）。
- 建议：把 `clearing` 改存 `clearingRef`（`closeConfirm` 依赖数组不含它），或 cleanup 时若 `clearingRef.current` 为真则跳过 `trigger?.focus()`。**不阻断**。

### L3 — 遮罩守卫对"拖选松手落在遮罩"路径不必然生效（Correctness, low / 需实测）
- 位置：`ClipboardItemViewer.tsx:58-63`
- 描述：M1 要求的 `target === currentTarget` 守卫已存在且面板点击/遮罩点击行为已由测试锁定。但按 DOM `click` 的"最近公共祖先"派发规则，从面板内 `<pre>` 起拖选、在遮罩上松手时，`click` 的 target 可能仍是遮罩自身，从而仍会关闭。该场景无法用 jsdom 有效复现（需真实浏览器）。
- 建议：若在应用内复现，追加 `if (window.getSelection()?.toString()) return;` 或记录为已知边界。属**观察项**，不判定当前为缺陷。

### L4 — `formatT` 缺"同一占位符多次出现"用例（Test, low）
- 位置：`frontend/src/app/i18n/__tests__/formatT.test.ts`
- 描述：新语义为全局替换，但无 `'{n} {n}'` 类用例。当前字典无同键重复占位符，风险极低。
- 建议：补一条 `expect(formatT(t,'dup',{n:2})).toBe('2 2')`。

### L5 — `relativeTime` ≥30 天整桶分支无单测（Test, low）
- 位置：`frontend/src/app/utils/relativeTime.ts:32-36`；测试 `__tests__/relativeTime.test.ts` 仅覆盖 <1min / min / hr / day / future
- 描述：`days>=30` 走 `Math.floor(days/30)*30`（30/60/90…），该分支未被断言。语义与 `NotificationCard` 原实现一致（有意），故仅覆盖缺口。
- 建议：补 `days=45 → "30 days ago"`、`days=75 → "60 days ago"`。

### L6 — 原图静态资产：无缓存头 / 无流式 / 无大小上限（Performance, low；已声明）
- 位置：`crates/server/src/handlers/clipboard.rs:132-156`（`serve_png`）
- 描述：`tokio::fs::read` 整文件入内存后返回，无 `Cache-Control`/`ETag`/`Content-Length`（axum 自动补齐部分），无尺寸上限。原图（全分辨率截图）可能较大。仅查看器打开时单次请求，实际影响有限。对应 rev1 P8，维持"后续架构决策"。
- 建议（可选）：加 `Cache-Control: private, max-age=…`（文件名 UUID 不可变）与 `Content-Length`。

### L7 — 列表行每 2s 轮询全量重渲染（Performance, low；已声明）
- 位置：`ClipboardHistoryList.tsx:44-72`（轮询）+ `ClipboardItemRow.tsx:40-44`（`memo`）
- 描述：`setClipboardHistory` 每次轮询写入新数组/新对象引用，`memo` 与稳定的 `onZoom` 无法阻止行重渲染，`formatRelativeTime` 随之每 2s 重算。属既有行为（对应 rev1 P2/P4）。
- 建议（可选）：`fetchClipboardHistory` 内做按 id 去重/结构共享（仅在内容变化时替换对象引用）。

### L8 — 筛选菜单数量为"库存"口径，与工具栏可见计数口径不同（UX, low；已声明）
- 位置：`ClipboardHistoryHeader.tsx:324-341`（`kindCounts` 来自全量 `clipboardHistory`）、`:223-225`（工具栏计数来自 `visibleItems`）
- 描述：搜索激活时菜单项数量不随查询变化。用户仅要求"每项显示数量"，维持 O7 判定。
- 建议（可选）：菜单数量改按 `buildClipboardFilterInput` 的 query 过滤后计数（若用户后续反馈歧义）。

### L9 — `CopyButton` 文本分支未处理 `onCopy` 返回值（Robustness, low）
- 位置：`frontend/src/app/components/CopyButton.tsx:96-102`
- 描述：有 `text` 时 `onCopy?.()` 的返回值（含 `Promise`）被忽略且无 `.catch`；当前全部调用点要么只传 `text`、要么只传 `onCopy`，无实际触发路径。
- 建议：`void Promise.resolve(onCopy?.()).catch(() => {});` 或 JSDoc 明确"有 text 时 onCopy 返回值被忽略且失败自负"。

### L10 — 查看器大图无加载态提示（UX, low / info）
- 位置：`ClipboardItemViewer.tsx:96-107`
- 描述：`<img>` 加载期间无 spinner/占位；加载失败即时被 `onError` 替换，不会显示破图。信息项，无功能影响。

### L11 — 双覆盖层 z-index 同为 `--z-modal-backdrop`（Design, info）
- 位置：`styles/regions/leftbar-clipboard.css:297` 与 `composer-core.css:134`
- 描述：查看器与确认框均为 `position:fixed` + `z-index: var(--z-modal-backdrop)`(50)，同时出现时按 DOM 顺序取胜。当前交互上二者不会同时打开（互相遮挡），无实际冲突。仅记录。

---

## 4. 端到端链路 / 安全性 / 一致性核查（通过项）

### 4.1 原图路由（Rust）
- `router.rs:83` 注册 `GET /clipboard/image/:filename` → `handlers/clipboard.rs:171-176` → `serve_png(images_dir, …)`。
- 穿越防护：`serve_png` 以 `Path::new(filename).file_name()` 归一化为 basename，空名 404（`clipboard.rs:132-139`）；`..`/`.` 的 `file_name()` 为 `None` → 空 → 404；`%2e%2e%2fsecret.png` 解码后 basename=`secret.png`，落在 `images_dir` 而非父目录 → 404。
- 测试真实性：`asset_routes_reject_traversal_and_degenerate_names`（6 条 URI）与 `image_serves_stored_original_and_404s_unknown`（**同名文件跨目录判别**：thumbs_dir 写同名文件、断言响应字节等于 images_dir 内容；thumbs-only 文件请求原图路由须 404）——断言有效，非假信心。
- 读错误：非 `NotFound` 记 `tracing::warn!`（记归一化 `safe`），对外统一 404，不泄露内情。
- 既有 `images_dir()`（`crates/clipboard/src/store.rs:102`）存在，编译面无缺口。

### 4.2 桥接三实现 + Tauri 继承（前端）
- `shared/ipc/clipboard.ts:70-81` 新增 `getImageUrl` 契约 + `@see` 指向到位。
- http：`httpBridge.ts:668-673` 抽出 `clipboardAssetUrl(baseUrl, segment, filePath)`，`getThumbUrl`/`getImageUrl` 复用（:1039-1040），basename + `encodeURIComponent`。
- mock：`mock/mock-clipboard.ts:13` `getImageUrl: () => ''`（并修复了文件末尾无换行 + 引号风格）。
- preview：`preview-bridge/index.ts:253-255` 两种 URL 构造器恒走 http 实现（避免 mock 恒空串导致预览模式占位）。
- Tauri：`tauri-bridge/index.ts:44` `...http` 继承且后续无 `clipboard` 覆写（:49-75），故 `getImageUrl` 随 `clipboard` 域继承。
- 编译期一致性：httpBridge 用 `satisfies ClipboardBridge`，mock/preview/tauri 均由类型约束，三实现无遗漏。
- 消费端唯一入口 `ClipboardItemViewer.tsx:25`，测试提供 `window.digitalLife.clipboard.getImageUrl`。

### 4.3 查看器
- `createPortal(..., document.body)` 规避层叠上下文；`.adl-clipboard-viewer` 已注册进 `shared/overlayManager.ts:12`（`OVERLAY_SELECTORS`），Tauri WebView2 原生表面在遮罩出现时会被移出画面；测试断言计数 17→18（`overlayManager.test.ts:52`）。
- 三级回退状态机正确：初始 `imageUrl ? 'original' : 'thumb'`（原图路径空时直接从缩略图起步）；`onError` 函数式更新 `original→thumb→none`；`displayUrl===''` 时渲染 `IconFileImage` 占位。测试覆盖两级回退（`ClipboardItemViewer.test.tsx:89-109`）。
- 焦点：打开聚焦关闭按钮、卸载归还 `previouslyFocused`；Tab 圈定面板内（`aria-modal` 契约）；Escape 关闭。均有测试（:64-76）。
- 图标 `IconExpandCorners`（`core.tsx:97-110`）用 `makeFilled('0 0 25 24', …)`，源 SVG `fill="#ffffff"` 已移除，`fill="currentColor"` 继承主题；测试断言 viewBox/4 path/currentColor/子 path 无 fill（`core.test.tsx:85-99`）。

### 4.4 搜索/筛选/清空（共用面）
- 共享正则：`utils/searchPattern.ts`（escapeRegExp + buildSearchPattern），`useSearchPanel.ts:2` 改为导入，语义统一；`g` 标志在下游 `matchesClipboardQuery` 使用前 `lastIndex=0`，`filteredResults` 每结果 `new RegExp(pattern)`，无 `lastIndex` 残留竞态。
- 过滤单一权威：`buildClipboardFilterInput`（`clipboardFilter.ts:30-45`）在 List 组装；Header 不再重复组装（rev4 误报核实结论一致）。
- 清空范围单一权威：`buildClipboardClearScope`（`clipboardClearScope.ts`）同时派生 `clearLabel`/tooltip/aria/对话框标题/正文与执行分支（`ClipboardHistoryHeader.tsx:71-100, 198-214`），`clearScope===null ⟺ visibleItems===clipboardHistory`（searchOpen 门控一致），无"文案说筛选、实际清全部"。
- 竞态：`clearing` 态禁用确认/取消、Escape 经 `closeConfirm()` 受 `clearing` 守卫、`try/finally` 保证对话框不卡死；逐条删除使用点击时的 `visibleItems` 快照，轮询期间不会越界删除。
- i18n：新增/重命名 key 在 zh/en 同步（`zh-CN/utilities.ts`、`en-US/utilities.ts`），无 `clipboardLocalNote`/`clipboardClearConfirm` 悬挂引用（全仓 grep 0 命中）；`clipboardSearchPlaceholder` 仍被 Header 按钮 tooltip/aria 引用，无新增未使用 key。

---

## 5. 已声明"不修复"项逐项复核（含改进空间）

| 项 | 我的判定 | 说明 / 改进空间 |
|----|---------|----------------|
| J1 路由命名 `image` | 同意不修 | 与 `thumb`/`imagePath`/`getImageUrl` 贯穿一致；改名无收益 |
| J2 `serve_png` 未二次 canonicalize | 同意不修 | basename 足以；canonicalize 会引入"文件不存在即失败"的语义混淆。可选：`dir.join(safe)` 后再 `starts_with(dir)` 防御性断言（零成本），但非必要 |
| J3 读错误统一 404 | 同意 | 已补 `tracing::warn!`，排查通道具备 |
| J4/J5 mock 目录被 lint 忽略、按 filename 而非 id | 同意 | 与 `thumb` 既有设计一致 |
| J6 `getImageUrl` 同步 | 同意 | 纯 URL 构造器，与 `getThumbUrl` 契约一致；preview 覆盖点也据此恒走 http |
| C6 关闭搜索保留 query | 同意 | 重开恢复，有测试锁定 |
| C9 计数 `aria-live="polite"` | 同意 | 状态计数播报为预期语义（但见 L7：轮询抖动会放大播报频率，可选 `aria-live="off"` 或去抖） |
| E3 行内嵌按钮 | 同意 | 用户明确要求 + 子控件 stopPropagation + 测试 |
| O7 菜单数量全量口径 | 同意（可选改进 L8） | 用户仅要求"显示数量" |
| P1–P4 既有共享组件性能项 | 同意 | 轮询 2s + O(1) 测量，改动风险大于收益（见 L7 可选优化） |
| I-10 >30 天整桶 | 同意 | 与 NotificationCard 既定目标一致 |
| P-01 文本复制乐观标记 | 同意 | 既有乐观 UI，改则给 5 个使用方增加延迟 |
| I-09 工具栏内距 4px | 同意 | 用户明确要求 |
| 图标 viewBox `0 0 25 24` | 同意 | 用户提供 SVG 原样保留，helper 约定保留原始 viewBox |
| P8/P11/P13/P15（缓存头、preview override 维护性、无鉴权+CORS、baseUrl 未 strip） | 同意不修 | 属工程整体取舍；其中 P8 的缓存头为**低风险可选改进**（见 L6） |
| R5 全量命中退化为 N 次删除 | 同意 | `clipboard.list(200)` 窗口限制下，逐条删除才与确认文案严格一致（正确性优先） |
| R6 搜索面板 JSX 第三份重复 | 同意 | 状态归属不同（slice vs 局部 state），抽共享需改文件面板 |
| L-03 极窄侧栏菜单被裁切 | 同意 | 边缘场景，固定定位/portal + resize 同步风险大于收益 |

**结论：9 项（及后续 R5/R6/L-03）"不修复"判定全部维持；改进空间已逐项检查，仅 L6/L7/L8 给出可选优化，均非阻断。**

---

## 6. 测试真实性总评

| 测试文件 | 真实性 | 备注 |
|---------|-------|------|
| `ClipboardItemViewer.test.tsx` | 真实 | 遮罩/面板点击、Escape、Tab 陷阱 + 焦点还原、原图 src、两级回退；文本项不触达 getImageUrl |
| `ClipboardItemRow.test.tsx` | 真实 | 行点击不复制、子按钮 stopPropagation、图片写回、徽章+相对时间 |
| `ClipboardHistoryList.test.tsx` | 真实 | 空历史 vs 无匹配、行数=可见数、loading 排除、计数 role=status |
| `ClipboardHistoryHeader.test.tsx` | 真实 | 全清 vs 逐条、动态范围文案（含选项拼接）、Escape、clearing 期间不关闭+双按钮禁用、失效筛选回退、菜单计数、完整键盘模型 |
| `clipboardFilter.test.ts` | 真实 | 类型/查询/组合/非法正则/大小写/全字/计数序/未知 kind 排序 |
| `clipboardClearScope.test.ts` | 真实 | 8 分支（含 searchOpen 门控与选项括号） |
| `searchPattern.test.ts` | 真实 | 转义/大小写/全字/正则/非法/空白；`lastIndex` 手动复位 |
| `formatT.test.ts` | 真实 | 见 §2 M3；缺同键多占位用例（L4） |
| `relativeTime.test.ts` | 真实（覆盖缺口） | 缺 ≥30 天分支（L5） |
| `httpBridge.test.ts` | 真实 | 两 segment × Windows/POSIX 路径 + 空/退化路径；用例已移出 storage describe 嵌套 |
| `CopyButton.test.tsx` | 真实 | 文本写剪贴板/execCommand 兜底/自定义 onCopy true/false/reject/双缺省 |
| `icons/core.test.tsx` | 真实 | viewBox + 4 path + currentColor + 子 path 无 fill |
| `overlayManager.test.ts` | 真实 | 选择器包含 + 逗号格式 + 计数 18 |

无假断言、无空跑测试、无"标题与断言不符"痕迹（rev4 已修正项经复核一致）。

---

## 7. 最终判定

- **critical：0**
- **high：0**
- **medium：0**
- **low：11**（L1–L11；其中 L6/L7/L8 为已声明项的可选优化，L2 为可低成本收敛的 a11y 抖动，L3 为需实测确认的观察项）
- 上轮修复核实：**M1 ✓ / M3 ✓ / M3b ✓ / M2 ✓**，无回归。

本报告基于静态源码审查与测试分析；未运行构建/测试命令（审查为只读）。合并前建议按项目门禁复跑：
`pnpm --dir frontend run lint && npx tsc --noEmit && prettier --check "src/**/*.{ts,tsx,css}"` 与 `cargo test -p adl-server --lib clipboard && cargo clippy --workspace --all-targets -- -D warnings`。
