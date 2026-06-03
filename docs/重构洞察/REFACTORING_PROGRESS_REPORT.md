# 重构进度报告

> 更新日期: 2026-06-03（第三十轮）

## 完成状态

| 轮次 | 日期 | 内容 | 状态 |
|------|------|------|------|
| 第一轮 | 2026-05-20 | Zustand 切片定义（10 个切片） | ✅ |
| 第二轮 | 2026-05-21 | 切片合并 + 性能优化（Rust DRY、搜索 debounce 等） | ✅ |
| 第三轮 | 2026-05-21 | CSS Token 迁移 + 模块化分层 + 错误码统一 | ✅ |
| 第四轮 | 2026-05-21 | 重构洞察验证与修复（消除 11 处 `as any`、LRU 优化、SSE 管理等） | ✅ |
| 第五轮 | 2026-05-22 | CodeMirror 双实例 Bug 修复 | ✅ |
| 第六轮 | 2026-05-22 | Store/桥接/接口/性能/Rust 全面重构 | ✅ |
| **第七轮** | **2026-05-23** | **25 项全面修复 + 大型组件拆分（17 文件）** | ✅ |
| **第八轮** | **2026-05-23** | **重构洞察第二轮 26 项（渲染性能 + 模块化 + 架构治理 + Rust 改进）** | ✅ |
| **第九轮** | **2026-05-24** | **重构洞察执行 22 项（Rust 长文件拆分 + 前端重构 + 性能优化）** | ✅ |
| **第十轮** | **2026-05-24** | **重构洞察修复 11 项（Regex OnceLock + 死 CSS 清理 + 文件拆分）** | ✅ |
| **第十一轮** | **2026-05-25** | **ChangesPanel 组件提取（3 组件 → patch-review 模块）** | ✅ |
| **第十二轮** | **2026-05-25** | **4 个大型模块 → 12 个独立文件（ChangesPanel/CenterPane/StatusBar 拆分）** | ✅ |
| **第十三轮** | **2026-05-25** | **God Function 拆分 + UI 复原修复** | ✅ |
| **第十四轮** | **2026-05-26** | **终端工作区默认终端类型功能修复** | ✅ |
| **第十五轮** | **2026-05-26** | **终端层级树状视觉优化** | ✅ |
| **第十六轮** | **2026-05-26** | **终端面板精细化修复（10+ 项）** | ✅ |
| **第十七轮** | **2026-05-28** | **架构深度重构（Rust crate 17→19、Store 增强、5 个新 Hook、DB 连接池）** | ✅ |
| **第十八轮** | **2026-05-29** | **重构洞察全面修复（虚拟滚动、CenterPane 简化、RightPanel 优化）** | ✅ |
| **第十九轮** | **2026-05-30** | **terminal/pty crate 职责边界重构** | ✅ |
| **第二十轮** | **2026-05-31** | **代码清理、工具函数统一、缓存添加、性能优化** | ✅ |
| **第二十一轮** | **2026-05-31** | **浏览器子目录 parentId 传递断链修复** | ✅ |
| **第二十二轮** | **2026-06-01** | **文档大纲连接竖线对齐修复** | ✅ |
| **第二十三轮** | **2026-06-01** | **全面重构执行 + 滚动条溢出修复（11 项：死代码删除、i18n 拆分、类型解耦、as any 消除、icons 拆分、Mutex 降级、audit 批量写入、browser 错误通道、React.memo、滚动条修复）** | ✅ |
| **第二十四轮** | **2026-06-01** | **浏览器标签树功能增强 + 全面板计数对齐 + CSS 清理（硬编码 i18n 修复、重复回调抽取、历史按级别删除实现、RenameDialog 替换、计数右偏移统一标准化为 --space-3、CSS 重复块清理）** | ✅ |
| **第二十五轮** | **2026-06-01** | **重构洞察执行：消除重复、TTL 缓存优化、代码质量提升** | ✅ |
| **第二十六轮** | **2026-06-01** | **重构洞察全量执行：31/32 项落地** | ✅ |
| **第二十七轮** | **2026-06-02** | **浏览器标签树计数优化（计数语义修正 + 子目录计数右对齐 + URL 标签隐藏计数 + 长名省略号截断 + 抽出 resolveChildCount 纯函数）** | ✅ |
| **第二十八轮** | **2026-06-02** | **四位一体治理（openTabCount 语义错位 + 工作区删除级联清理 + 死状态清理 + i18n P0 硬编码）** | ✅ |
| **第二十九轮** | **2026-06-02** | **浏览器面板计数重叠修复 + 溢出裁切体系统一（:focus-within 子目录计数消失修复 + 子目录计数回退 flex 流 4px 偏差消除 + 顶级目录名称 overflow:hidden + 基类 text-overflow:ellipsis→clip 统一）** | ✅ |
| **第三十轮** | **2026-06-03** | **浏览器面板 WebView 可见性治理（面板切换隐藏/显示 + 跨面板状态保持 + 离屏坐标从负值改为正值 + 可见性 prop 化替代 Zustand selector + ResizeObserver 守卫）** | ✅ |

## 第三十轮重构（2026-06-03）：浏览器面板 WebView 可见性治理

原生 Tauri WebView 在面板切换时的可见性问题是一个持续多轮反复的难点，最终通过**可见性 prop 化 + 正值离屏坐标 + ResizeObserver 守卫**三管齐下解决。

### 问题

浏览器面板的网页显示区域（Tauri 原生 WebView）在切换功能面板后不隐藏，且收起右侧面板后依然可见；反过来修复隐藏后又导致 WebView 内容不显示或不刷新。AB 问题来回切换三次。

### 根因分析

| 根因 | 说明 |
|------|------|
| `hidden` 属性对原生 WebView 无效 | CSS `display: none` 只控制 HTML 元素，Tauri 原生 WebView 是 OS 级子窗口，不受 CSS 影响 |
| 负坐标被 Windows 钳制 | `SetWindowPos` 对 `WS_CHILD` 窗口的负坐标做钳制到 `(0, 0)`，导致 `browser_set_bounds(-10000, -10000)` 失效 |
| Zustand selector 跨组件订阅不可靠 | `useAppStore` 在 `display: none` 子树中可能不被 React 触发重渲染 |
| ResizeObserver 无可见性守卫 | 面板隐藏时元素尺寸塌缩为 `0x0`，但 ResizeObserver 仍会触发并调用 `updateWebViewBounds` |

### 修复方案

核心从 **三个层面**确保 WebView 可见性可预测：

**1. 可见性 prop 化（修复 Zustand 不可靠问题）**

```
RightPanel(activeRightTool) 
  → useBrowserPanelProps(isVisible: activeRightTool==="browser" && !collapsed) 
  → ActiveToolPanel(browserProps.isVisible) 
  → BrowserPanel(isVisible prop)
  → useBrowserPanel(props.isVisible)
```

避免在 `display: none` 子组件中用 `useAppStore` 订阅 store，改为通过 React prop 链传递 `isVisible`。

**2. 正值离屏坐标（修复 Windows 坐标钳制）**

```ts
// 之前: 负坐标 → Windows 钳制到 (0,0) → WebView 始终可见
invoke("browser_set_bounds", { bounds: { x: -10000, y: -10000, width: 1, height: 1 } })

// 之后: 正坐标 32767 → 超出最大显示器物理范围 → 真正不可见
invoke("browser_set_bounds", { bounds: { x: 32767, y: 32767, width: 1, height: 1 } })
```

**3. ResizeObserver 守卫（防止面板隐藏时误定位）**

```ts
// ResizeObserver 回调
if (webViewActiveRef.current && isBrowserVisibleRef.current) {
  updateWebViewBounds();
}
```

### 关键决策

| 方案 | 问题 | 被否决原因 |
|------|------|-----------|
| browser_hide / browser_show | Tauri v2 子 WebView 不支持 hide/show | 子 WebView 是 embedded content，非独立窗口 |
| 条件渲染（挂载/卸载） | 每次切换都销毁 → 页面刷新 | 用户要求状态保持 |
| 负值离屏坐标 (-10000,-10000) | Windows SetWindowPos 钳制 | 钳制后 WebView 出现在窗口左上角 |
| Zustand selector 读可见性 | display:none 子树中不可靠 | React 可能跳过 display:none 子树的重渲染 |

### 经验教训

1. **跨平台 GUI 编程要区分 HTML 元素层和 OS 窗口层** — Tauri 原生 WebView 是 OS 子窗口，不受 CSS 控制，必须通过 IPC 命令管理。
2. **React prop 链比 Zustand selector 更可靠** — 在涉及 `display: none`、`React.memo`、`hidden` 属性的组件树中，保证子组件收到更新的最可靠方式是将关键状态作为 prop 传递。
3. **Windows 窗口管理的历史包袱** — `SetWindowPos` 对 `WS_CHILD` 窗口的负坐标钳制持续影响了 30 年的 Win32 应用开发，使用正值大偏移量可规避。
4. **AB 问题的典型诱因是方案选择不当** — 多次在两个方案（hide/show vs 离屏）间切换，本质是 Tauri 子 WebView 不支持 hide/show，需要选择能稳定工作的第三方案（正值离屏 + prop 化 + 守卫）。

### 改动清单

| 文件 | 行数 | 改动 |
|------|------|------|
| `frontend/src/app/regions/RightPanel.tsx:90-92` | 3 | 浏览器面板从条件渲染改为 `hidden` 属性（保持挂载） |
| `frontend/src/app/regions/right-panel/types.ts:211` | 1 | `BrowserPanelProps` 增加 `isVisible` 字段 |
| `frontend/src/app/regions/right-panel/hooks/useBrowserPanelProps.ts:5-12` | 8 | props hook 接受 `isVisible` 参数 |
| `frontend/src/app/features/browser/useBrowserPanel.ts:632-651` | 20 | 可见性 ref + visibility effect（离屏隐藏 + 定位显示） |
| `frontend/src/app/features/browser/useBrowserPanel.ts:707-711` | 5 | ResizeObserver 增加 `isBrowserVisibleRef.current` 守卫 |
| `frontend/src/app/features/browser/useBrowserPanel.ts:385` | 1 | `updateWebViewBounds` 移除多余守卫（各调用方自有守卫） |
| `frontend/src/styles/regions/rightpanel/files-panel.css:119-121` | 3 | 死规则 `.adl-rightpanel__tool[hidden]` → 全局 `[hidden]` 兜底 |
| `src-tauri/permissions/digital-life.toml:87-89` | 3 | 新增 `browser_hide`/`browser_show` 权限 |

### 最终门禁

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck | ✅ 0 error |
| Rust cargo check | ✅ 0 warning |



针对第二十七轮引入的子目录计数对齐方案中暴露的 3 个视觉问题，统一修复并消除基类 `text-overflow` 继承隐患。

### 问题 1：子目录计数点击后消失（`:focus-within`）

**根因**：基类 `.adl-filetree__row` 默认有 `:focus-within` 样式让计数 `opacity: 0`，子目录行没有自己的 `:hover` 恢复机制，导致点击计数按钮后计数永久隐藏（`:focus-within` 不因 `:hover` 退出）。

**修复**：移除子目录行上的 `:focus-within` 规则，计数仅通过 `:hover` 控制显隐。

### 问题 2：子目录计数与名称文本重叠

**根因**：子目录计数使用 `position: absolute; right: var(--space-3)` 脱离文档流，名称文本 `flex: 1` 且有 `white-space: nowrap` 可无限延伸，文本直接覆盖在计数之上。

**修复**：
- 子目录计数从 `position: absolute` 回退到 **flex 流内**（`display: flex; align-items: center; flex-shrink: 0`），宽度自然适应数字位数
- 子目录行 `padding-inline-end` 从 8px 改为 `var(--space-3)`(12px)，与顶级目录 `trailing` 的 `padding-right` 一致，确保右对齐
- 子目录计数 `padding-right: 0`，消除基类冗余内边距
- 最终视觉：计数右边缘与顶级目录计数在同一像素列（`getBoundingClientRect().right` 一致）

### 问题 3：顶级目录名称与计数重叠

**根因**：`.adl-browser-entry__name` 拥有 `flex: 1; min-width: 0; white-space: nowrap` 但缺少 `overflow: hidden`，文本可以溢出自身盒子覆盖到 `trailing` 区域的计数上。

**修复**：追加 `overflow: hidden; text-overflow: clip`，文字在名称框边界裁切，不再溢出。

### 基类统一：`text-overflow: ellipsis` → `clip`

`file-tree.css` 和 `files-panel.css` 中 `.adl-filetree__label` 及其子 `.adl-tree-node__label-text` 的 `text-overflow: ellipsis` 改为 `clip`：
- **理由**：文件树/标签树的名称区之后有计数/操作按钮等额外信息，"..."省略号在末尾会与 UI 元素产生视觉冲突；纯裁切更干净
- **层级树不受影响**：`OutlineTree` 使用独立的类名体系

### 改动清单

| 文件 | 行数 | 改动 |
|------|------|------|
| `browser-panel.css` | 24 | 移除 `:focus-within` + 子目录计数 flex 流 + 顶级 name `overflow:hidden` + `text-overflow:clip` |
| `file-tree.css` | 4 | `.adl-filetree__label` 和 `.adl-tree-node__label-text` 的 `text-overflow: ellipsis` → `clip` |
| `files-panel.css` | 4 | 同上 |

### 关键决策

1. **子目录计数回退 flex 流 vs 保持 absolute + `overflow:hidden`**：选 flex 流——absolute 方案在名称变长时虽不再重叠但计数始终在右边缘，flex 流让计数紧邻名称末尾更自然，且消除 4px 对齐偏差
2. **`text-overflow: clip` vs `ellipsis`**：选 `clip`——文件树/标签树不是阅读型列表，"..."会与计数/按钮产生语义冲突，纯裁切减少视觉噪音
3. **`overflow: hidden` 放在 name 上 vs namezone 上**：选 name——namezone 包含其他 UI 元素（expand-btn），`overflow: hidden` 在 namezone 上会意外裁剪展开按钮

### 经验教训

1. **CSS 的 `:focus-within` 副作用**：在可点击的子元素上使用 `:focus-within` 会引入永久性的状态锁定，用户点击后聚焦不主动退出，计数永久消失。交互态显隐应优先用 `:hover`。
2. **`absolute` 定位不参与 flex 布局**：脱离文档流的元素不响应 flex 容器的 `gap` 和 `align-items`，通过 `right` 定位需要精确计算环境变量（padding、border、margin），误差累积难以维护。flex 流 + `flex-shrink: 0` 更稳定。
3. **CSS 继承的隐性依赖**：`text-overflow` 在基类中定义为 `ellipsis`，子类覆盖非统一时出现碎片化。本次将三层 CSS（基类→顶级→子级）统一为 `clip`，消除未来出问题的断点。

### 最终门禁

- `npx tsc --noEmit` ✅
- 视觉验证 ✅（Playwright 实测子目录计数右边缘与顶级一致；名称溢出不覆盖计数；点击后计数不消失；`text-overflow: clip` 生效）

## 第二十八轮重构（2026-06-02）：四位一体治理

针对四个独立但相互关联的代码债，集中治理：浏览器头部计数语义、工作区删除孤儿数据、Zustand 死状态、Store 层 i18n 硬编码。

### ① openTabCount 语义错位（确认 + 修复）

**问题证据**：
- `browserpanel.tsx:165` 的 `openTabCount = browserTabs.length` 仅统计 `browserTabs` 数组（已打开 URL 标签），**不**包含 `browserTabFolders`、`browserHistory`、`browserBookmarks`
- `useBrowserPanel.ts:277` 默认 tabs 模式下 `navigatorTitle = "标签目录"`（硬编码），标题暗示"整个树目录"
- 用户保存 30 个目录标签 + 50 条历史，但 `browserTabs.length = 0` → 标题显示「标签目录 0」，误导

**修复**：
- 抽出 `computeNavigatorCount(mode, query, ...)` 纯函数（`useBrowserPanel.ts`）
- 模式感知计数：tabs→`browserTabs.length`、bookmarks→`bookmarks.length`、history→`history.length`、search→`searchResults.length`（带 query fallback 到 filtered）
- 默认 tabs 模式标题从硬编码 `"标签目录"` 改为 `t.browserOpenTabs`（新增 i18n 键）
- browserpanel 改为消费 `browserState.navigatorCount`（消除本地 `openTabCount`，激活原本的死字段 `navigatorCount`）

**测试**：`useBrowserPanel.test.ts` 新增 11 个用例（4 模式 × 2 + 边界 + 语义一致性）

### ② 工作区删除级联清理（严重 bug 修复）

**问题证据**：
- `workspace_remove_from_sidebar`（`src-tauri/src/commands/workspace_sidebar.rs:252`）**只设 `removed_from_sidebar=true` 标志位**，不删除任何数据
- 19 张含 `workspace_id` 列的子表（sessions/tasks/audit/...）全部成为孤儿
- 前端 `cleanupRemovedWorkspaceTree`（`workspaceActions.ts:256`）只清 4 个内存 map，`browserTabs`/`browserTabFolders`/`browserWorkspaceExpanded` 等 localStorage 残留
- `init_schema.sql` 175 行**零 FK 约束**，`PRAGMA foreign_keys=ON` 无效

**修复**（分 4 层）：

| 层 | 改动 | 文件 |
|---|------|------|
| ① Storage 原语 | 新增 `delete_entities_by_workspace(table, ws_id)`、`delete_entities_by_workspace_on_conn`、`delete_workspace_on_conn`、`delete_recent_workspace_on_conn` | `crates/storage/src/lib.rs` |
| ② 事务级联编排 | 新增 `purge_workspace(ws_id, root_path)` —— 单一事务内级联删 18 张子表 + workspaces + recent_workspaces，返回 `WorkspacePurgeReport` | `crates/storage/src/lib.rs` |
| ③ IPC 改造 | `workspace_remove_from_sidebar` 在事务内调用 `purge_workspace`（读 root_path → 删 → 标记 sidebar 软删） | `workspace_sidebar.rs` |
| ④ 前端清理 | 抽出 `stripWorkspaceFromBrowserState` 纯函数；`cleanupRemovedWorkspaceTree` 同时过滤 `browserTabs`/`browserTabFolders`/`browserWorkspaceExpanded` 并持久化到 localStorage | `workspaceActions.ts` |

**测试**：
- Rust 集成测试 4 个：级联删除所有 18 张子表（+1 workspaces + 1 recent = 20 行）、幂等性、缺 root_path 不删 recent、空数据清理
- Frontend 8 个：tabs/folders/expanded 三类数据过滤、activeTab 兜底、幂等性

### ③ browserCategoryExpanded 死状态清理

**问题证据**（来自 0 reader / 0 caller 全量 grep）：
- `browserslice.ts` 7 处：常量、hydration 读、类型字段、action 签名、默认值、action 实现、set 写入
- 配套 `browserWorkspaceExpanded` 的 `workspacesExpanded` 参数被 `buildWorkspaceCategoryTree` 接收但未使用

**修复**：
- `browserslice.ts`：7 处死代码机械删除
- `useBrowserTreeData.ts`：`buildWorkspaceCategoryTree` 移除 `workspacesExpanded` 参数 + 调用点清理
- `browserTreeCounts.test.ts`：测试签名同步

### ④ i18n P0 + P1 硬编码修复

**Store 层 P0**（6 处，影响全局）：

| 文件 | 硬编码 | 修复 |
|------|--------|------|
| `streamActions.ts:76` | `"当前没有可应用的补丁。"` | `getAppCopy(appInfo).patchesNoneApplyable` |
| `streamActions.ts:86` | `"当前没有可回滚的补丁。"` | `getAppCopy(appInfo).patchesNoneRollback` |
| `streamActions.ts:97` | `"「/clear」尚未实现清空历史..."` | `getAppCopy(appInfo).clearCommandNotImplemented` |
| `browserslice.ts:281` | `"新标签页"` | `getAppCopy(state.appInfo).browserDefaultTabTitle` |
| `browserslice.ts:532` | `` `新建目录${folderCount+1}` `` | `formatNewFolderNameByLocale(locale, n)` |
| `browserslice.ts:615` | 同上 | 同上 |
| `selectionPrompt.ts:7` | `"请基于以下选区继续工作："` | `t.selectionPromptZh` |
| `composerSend.ts:28` | `"[上下文附注]"` | `t.composerContextPrefix` |
| `composerSend.ts:57` | `"请根据当前工作区与附注，输出结构化计划..."` | `t.composerStructuredPlan` |

**新增 i18n 工具**：
- `frontend/src/app/i18n/format.ts`：`formatNewFolderName(t, n)` / `formatNewFolderNameByLocale(locale, n)`
- `frontend/src/app/i18n/getAppCopy.ts`：`getAppCopy(appInfo)`（已存在，重构到 i18n 模块）
- `frontend/src/app/i18n/index.ts` 重新导出

**设计系统违规 P1**（3+3 处）：
- `BrowserTabBar.tsx:116,122` 🌐 → `IconGlobe`（SVG）
- `ErrorBoundary.tsx:47` ⚠ → `IconAlertTriangle`（SVG）
- `browserpanel.tsx:71,74,631` `title={...}` → 删除（按钮文本已含相同内容；div 文本不需原生 tooltip）

**i18n 键增删**：
- 新增（zh-CN + en-US 各 1 份，共 10 个键 × 2 语言 = 20 个值）：
  `browserOpenTabs`、`patchesNoneApplyable`、`patchesNoneRollback`、`clearCommandNotImplemented`、`composerContextPrefix`、`composerStructuredPlan`、`selectionPromptZh`、`browserDefaultTabTitle`、`browserNewFolderName`

### 关键决策

1. **模式感知计数 vs 改标题**：选模式感知（激活死字段 `navigatorCount` + 4 模式全一致 + 测试覆盖完整）
2. **软删 vs 硬删**：选硬删——用户期望"删除"是破坏性，restore 改为软删标志（数据已无）——接受"恢复"语义弱化
3. **i18n 键 vs 工具函数**：参数化字符串用工具函数（`formatNewFolderName`）而非 `key(N)` 模式——保持 CopyDict 是纯字符串
4. **emoji 替换范围**：只替换 AGENTS.md 明确禁止的 3 处，span 上的 `title=` 路径溢出是常见模式不在本轮范围

### 最终门禁

- `npm run typecheck` ✅
- `npm test` ✅ 214 tests（+19 新增：11 navigatorCount + 8 cleanup）
- `npm run build` ✅
- `cargo test -p adl-storage` ✅ 5 tests（+4 新增：cascade/幂等/no-root/empty）
- `cargo build --workspace` ✅



## 第二十七轮重构（2026-06-02）：浏览器标签树计数优化

针对第二十四轮遗留的 3 个标签树计数问题，集中修复并固化语义。

### 计数语义统一（规则表）

| 层级 | 计数规则 | 实现位置 |
|------|---------|---------|
| 分类行 | `category.nodes.length`（顶级目录数） | `BrowserCategorySection.tsx:18` |
| 顶级目录 | `countDirectFileChildren`：直接子标签数（排除子目录及其后代） | `useBrowserTreeData.ts:6-12` |
| 子目录 | `countDirectChildren`：直接子节点数（同类型，因为 history 是同类层级树） | `useBrowserTreeData.ts:14-16` |
| URL 标签 / 历史条目（file 节点） | **不显示计数** | `resolveChildCount` 返回 `null` |

策略分发：`getCountStrategy(categoryType)` → `history` 用 `countDirectChildren`，其它（workspace/userFolder）用 `countDirectFileChildren`。

### 改动清单

| 改动 | 文件 | 说明 |
|------|------|------|
| 抽出 `resolveChildCount(counts, childNode)` 纯函数 | `useBrowserTreeData.ts:22-27` | 单一职责：file→null，directory→count；可单测 |
| `renderChildCount` 委托给 `resolveChildCount` | `BrowserTreeEntry.tsx:193-196` | 组件内联逻辑收敛到纯函数 |
| 移除 label/text 的 `overflow: visible; text-overflow: clip` 覆盖 | `browser-panel.css`（删除末尾两条 override） | 恢复基础样式的 `text-overflow: ellipsis`，长名截断 |
| 子目录计数改为 `position: absolute; right: var(--space-3)` | `browser-panel.css:1007-1018` | 数字右边缘与顶级计数严格对齐（DOM `getBoundingClientRect().right` 均为 1112px） |
| 新增 `resolveChildCount` 3 个单测 | `browserTreeCounts.test.ts` | file→null / directory→count / missing→0 |

### 关键技术细节

**子目录计数对齐的精确算法**：
- 顶级计数所在 `.adl-browser-entry__trailing` 有 `padding-right: var(--space-3)`（12px），数字右边缘 = `parent_right - 12`。
- 子目录所在的 `.adl-filetree__row` 是 `box-sizing: border-box; width: 100% + 4px; margin-left: -4px`（向左扩展 4px，右侧与父级对齐）。
- 因此子目录的 `right: 16px`（原值）会让数字右边缘 = `parent_right - 12` 看似正确，但实测有 4px 偏差。
- 实测纠正：必须用 `right: var(--space-3)`（即 12px），让子目录数字右边缘 = `parent_right - 12`，与顶级完全一致。

### 经验教训

1. **CSS 像素级对齐必须用 DevTools 实测验证**：理论计算的"right: 16px"看似合理但实测有 4px 偏差，因为 `box-sizing: border-box` + `width: calc(100% + 4px)` + `margin-inline-start: -4px` 的组合让行实际只向左扩展、不向右扩展。最终用 `getBoundingClientRect().right` 验证后改为 `right: var(--space-3)` 才精确对齐。
2. **JSX 条件渲染的 `0` 陷阱**：`{count ? ... : null}` 会丢失合法的 `0`。TreeNodeRow 修复为 `count !== undefined && count !== null`，确保空目录也显示 "0"。
3. **数据 vs 渲染分层**：`useBrowserTreeData` 的 `counts: Map<path, number>` 是数据层（只存 directory 节点），`resolveChildCount` 是渲染层（file 节点返回 null 跳过渲染）。两层职责清晰分离后，单测覆盖也变简单。
4. **CSS override 禁用继承的副作用**：`.adl-browser-entry__tree .adl-filetree__label { overflow: visible }` 在过去某个需求中被加上，但未在移除理由上留痕，导致长名溢出和计数重叠。重构时要明确每个 override 的存在理由。

### 最终门禁

- `npm run typecheck` ✅
- `npm test` ✅（195 tests，新增 3 个 `resolveChildCount` 测试）
- `npm run build` ✅
- 视觉验证 ✅（Playwright 实测顶级/子级计数右边缘均在 1112px，URL 标签不显示计数，长名省略号截断）

---

## 第二十六轮重构（2026-06-01）：重构洞察全量执行

## 第二十六轮重构（2026-06-01）：重构洞察全量执行

> 详情见 [重构洞察报告](./refactor-insight-2026-06-01.md) 和 [修复计划(第一二批)](./fix-plan-2026-06-01.md)。

### 安全性修复（6项）

| 项 | 文件 | 说明 |
|----|------|------|
| F1 SQL 事务 | `storage/lib.rs`、`agent.rs` | 新增 `transaction()` + `save_entity_on_conn()` 方法，PatchSet/FilePatches/Hunks 保存包装在原子事务中 |
| F2 SQL LIMIT 防御 | `storage/lib.rs:260` | 添加 `assert!(limit <= 1000)` 安全上限 |
| F3 删除 locales/ | `frontend/src/locales/` | 删除 Phase 0 遗留死代码目录（246 行，0 引用） |
| F4 删除空目录 | `right-panel/panels/hooks/` | 删除空壳目录 |
| F23 CSS 注释 | `tokens.css:90` | 修正重复变量名 |
| F24 use 语句位置 | `workspace/lib.rs:28` | 将 `use adl_errors::AppError` 移至文件顶 |

### 锁优化（4项）

| 项 | 文件 | 说明 |
|----|------|------|
| F5 config RwLock | `state.rs` + 5 命令文件 | `Mutex<AppConfig>` → `RwLock`，6 处 .read() + 1 处 .write() |
| F6 workspace RwLock | `state.rs` + 6 命令文件 | `Mutex<Option<WorkspaceMeta>>` → `RwLock`，7 处 .read() + 3 处 .write() |
| F7 browser AtomicBool | `browser/lib.rs` | 删除 `BrowserState` struct，`Mutex<bool>` → `AtomicBool` |
| F8 events 计数器 | `events/lib.rs` | `Mutex<BTreeMap<String, usize>>` → `Arc<BTreeMap<String, AtomicUsize>>`，锁仅用于插不用于增 |

### 前端性能（5项）

| 项 | 文件 | 说明 |
|----|------|------|
| F9 useShallow | `selectors.ts` | `useAppInfo` 包装 `useShallow`（最广泛消费的 selector） |
| F10 fetch guard | `fetchActions.ts` | 7 个 fetch 函数添加 `startFetch()` 守卫，阻止并发 IPC 请求 |
| F11 bootstrap 并行 | `generalActions.ts` | Git status + Patch set 从串行改为 `Promise.all` 并行 |
| F12 React.memo | `ToolSwitcher.tsx` | `React.memo(…)` + `useCallback` 包裹 7 个 Tab 按钮 |
| F13 isFetching 优化 | `fetchActions.ts` | `refreshTaskCenter` 添加 isFetching 状态管理 |

### 架构质量提升（6项）

| 项 | 文件 | 说明 |
|----|------|------|
| F16 AuditBatchEntry | `agent.rs`、`audit.rs` | 7 元组 `(String, …, Option<String>)` → 具名 struct `AuditBatchEntry { workspace_id, session_id, ... }` |
| F17 workspace_cmd! | `mod.rs`、`workspace.rs` | 声明宏消除 9 个命令的 boilerplate：`workspace_cmd!(&state, adl_workspace::read_file, &path)` |
| F18 PTY cap | `useTerminalPtyLifecycle.ts` | 100KB 每会话上限，超过则从头部截断 |
| F22 CSS will-change | `leftbar.css:518` | 移除无效 `padding-top`，仅保留 `transform` |
| F20 polling guard | `useTaskCenterPolling.ts` | 轮询检查 isFetching 避免并发 |
| F21 selectors | `selectors.ts` | 所有 workspace/session 选择器添加 useShallow |

### Rust 改进（4项）

| 项 | 文件 | 说明 |
|----|------|------|
| F15 Error::Io | `errors/lib.rs` | `From<io::Error>` 保留 `ErrorKind`：`"[{kind}] {message}"` |
| F28 agent 流水线 | `agent.rs` → `agent_pipeline.rs` | 647 行 → 191 行（agent.rs）+ 441 行（agent_pipeline.rs），5 个流水线函数提取为独立模块 |
| F29 change-engine 拆分 | `change-engine/src/` | 500 行单文件拆分为 `patch_create.rs`、`patch_apply.rs`、`validation.rs`、`language.rs` |
| F30 级联删除 | `storage/lib.rs`、`conversation.rs` | 新增 `delete_entities_by_session()`，会话删除时级联清理关联消息 |
| F31 CommandError.code | `error.rs` | `code: String` → `code: IpcErrorCode` 枚举（13 变体，serde SCREAMING_SNAKE_CASE） |
| F32 耦合文档 | `browser/Cargo.toml` | 添加注释标记为 Tauri-specific wrapper |

### 前端文件迁移 — F14（15 源文件 + 14 测试文件）

`app/` 根层级文件迁移到合理子目录，消除架构债务：

| 原位置 | 目标位置 | consumers |
|--------|---------|-----------|
| `MessageBlocks.tsx` | `features/conversation/` | 1 |
| `settingsViewModel.ts` | `utils/` | 1 |
| `selectionPrompt.ts` | `utils/` | 1 |
| `loaders.ts` | `stores/` | 2 |
| `composerSend.ts` | `utils/` | 2 |
| `theme.ts` | `utils/` | 3 |
| `workspaceScope.ts` | `utils/` | 2（含跨 app 引用到 tauri-bridge） |
| `repoMapFromEntries.ts` | `utils/` | 2（跨 app 到 tauri-bridge + preview-bridge） |
| `constants.ts` | `utils/` | 5 |
| `sidebarViewModel.ts` | `utils/` | 4 |
| `editorTabs.ts` | `utils/` | 5 |
| `workspacePaths.ts` | `utils/` | 8 |
| `ui-store.ts` | `stores/` | **12** |
| `types.ts` | **合并** → `stores/types.ts` | **16** |
| `repoMapFromTree.ts` | **删除**（死代码） | 0 |
| `copy.test.ts` | **删除**（源文件已删） | — |
| 9 个测试文件 | 跟随源文件迁移 | — |

### OutlineTree 虚拟滚动 — F25+F26

| 尝试 | 方案 | 结果 |
|------|------|------|
| 第一版 | react-window v2 `List` | ❌ CSS 树形连接线断裂（扁平列表破坏嵌套 `<ul>` 结构） |
| 第二版 | `content-visibility: auto` | ✅ 保留递归 `<ul>` 渲染 + 浏览器自动虚拟化 + CustomScrollArea 自定义滚动条 |

### CSS 命名体系统一 — F27

**决策**：方案 B（`bg-*` 为主命名体系）

| 替换 | 文件数 | 值变化 |
|------|--------|--------|
| `--surface-raised` → `--bg-card` | 20 | #ffffff → #fbfbfb（+4度暖） |
| `--surface-active` → `--bg-active` | 10 | 0.08 → 0.10（+2%深度） |
| `--surface-hover` → `--bg-hover` | 18 | 相同值 |
| `--surface` → `--bg-elevated` | 10 | 相同值 |
| `--surface-sunken` → `--bg-elevated` | 2 | 相同值 |
| `--text-xs/sm/base` → `--font-size-xs/sm/base` | — | 待议（值相同，纯命名偏好） |

### 经验教训

1. **react-window 不适用于树形 CSS**：递归 `<ul>` 渲染的树形连接线依赖 DOM 层级结构。react-window 的扁平列表破坏了 CSS 选择器。改用 `content-visibility: auto` 实现等价性能提升而不改 DOM 结构。
2. **Rust 内部可见性**：`pub(crate)` 在不同 crate 间不生效（如 `adl-storage` 的 `pub(crate)` 对 `src-tauri` 不可见），需改为 `pub`。
3. **CSS Token 值一致性**：`--bg-card` 和 `--surface-raised` 值不完全一致（差 4 度白），统一命名前需确认设计意图。
4. **Mutex→RwLock 迁移范围广**：涉及 15+ 处 `.lock()` 调用点，需逐一确认读写模式。显式区分 `.read()` 和 `.write()` 后获得正确性保证。
5. **前端文件迁移风险**：`ui-store.ts`（12 consumers）和 `types.ts`（16 consumers）的迁移需逐文件验证 `tsc --noEmit`。批量移动文件的策略是：移动 → `tsc` 获取错误列表 → 逐文件修复。

### 最终门禁

- `cargo check` ✅（1 个预存在 `dead_code` 警告）
- `npx tsc --noEmit` ✅
- `npx vitest run` ✅（29 tests）

## 第七轮重构（2026-05-23）：全面修复 + 大型组件模块化

基于 [重构洞察报告](./refactor-insight-2026-05-23.md) 和 [修复计划](../../.trae/documents/refactor-fix-plan-2026-05-23.md) 完成，分 7 个 Phase 共 25 项任务：

### Phase 1：快速修复（4 项）

| 任务 | 文件 | 说明 |
|------|------|------|
| 移除死依赖 | `crates/change-engine/Cargo.toml` | 删除 `adl-terminal` |
| 移除未用依赖 | `crates/context-engine/Cargo.toml`、`crates/prompt-engine/Cargo.toml` | 删除 `adl-errors` |
| 移除空 crate | `crates/editor/` | 占位 crate 已删除 |
| 移除死代码 | `frontend/src/app/hooks/useStreamingText.ts` | 由 Zustand managed state 替代 |

### Phase 2：稳定性与性能核心（6 项）

| 任务 | 说明 |
|------|------|
| App 选择器拆分 | 80+ 字段 → `error`(单字段) + `useAppActions()`(43 actions) + 35 字段(state 组) |
| Error Boundary | 新建组件，包裹 3 个主面板，防止单面板崩溃白屏 |
| storage mutex 中毒降级 | `.expect()` → `map_err` + `?`，12+ 调用点更新 |
| model-gateway 空 choices | `.unwrap_or_default()` → `AppError` 传播 |
| DiffViewer onMount 修复 | 2 处 `useEffect` 依赖数组补全 |
| ptyBridge HMR 泄漏 | 模块级变量 → 工厂函数闭包 |

### Phase 3：大型组件拆分（3 项，17 个新文件）

| 组件 | 原行数 | 现主文件 | 拆分文件 |
|------|--------|----------|----------|
| DiffViewer | 673 → 77 | 路由组件 | `SideBySideDiffViewer`、`InlineDiffViewer`、`sharedExtensions`、`diffViewerUtils` |
| TerminalPanel | 793 → 236 | 组合器 | `useTerminalPanel` hook + 6 子组件（TabBar/EmptyState/ShellSelector/ContextMenu/MenuDropdown/Navigator） |
| LeftSidebar | 1796 → 292 | 组合器 | `WorkspaceList`、`SessionList`、`ConversationPanel`、`ResizeHandle`、`SidebarContextMenu` |

### Phase 4：代码质量改进（6 项）

| 任务 | 说明 |
|------|------|
| 共享 Icon 组件 | 6 处重复定义 → 1 个共享组件 |
| CodeEditor useMemo | 移除无效 `theme` 依赖 |
| useMemo 补充 | `badges`/`changesMenuItems`/`fileMenuItems` |
| task 运算符括号 | `\|\| cargo && args` → `\|\| (cargo && args)` |
| run_activity seq | 10 路 match → `fn seq()` 方法 |
| streamActions 优化 | 函数内联化 |

### Phase 5：低优先级优化（3 项）

| 任务 | 说明 |
|------|------|
| fileTree props 窄化 | `{...props}` → 6 个显式 prop |
| CustomScrollArea | 移除 children 依赖，改用 ref |
| context-engine 零分配 | 双重 `chars().rev()` → `char_indices().nth_back()` |

### 额外清理

- 删除 ~210 行 Mock 死代码（`usingMockStandaloneSessions = false`）
- 替换 11 处硬编码中文字符串为 `t()` i18n 调用
- 补充 i18n 词汇表 11 个词条（zh-CN + en-US）

### 当前架构

#### 大型组件模块化结果

```
regions/ (LeftSidebar 拆分)
├── LeftSidebar.tsx                       # ~292 行 合成容器
└── left-sidebar/
    ├── WorkspaceList.tsx                 # ~307 行 工作区列表
    ├── SessionList.tsx                   # ~520 行 会话列表（含拖放重排）
    ├── ConversationPanel.tsx             # ~107 行 对话面板
    ├── ResizeHandle.tsx                  # ~197 行 宽度/高度拖拽
    └── SidebarContextMenu.tsx            # ~255 行 右键菜单 Portal

features/terminal/ (TerminalPanel 拆分)
├── TerminalPanel.tsx                    # ~236 行 组合器
├── useTerminalPanel.ts                  # ~500 行 自定义 Hook
├── TerminalTabBar.tsx                   # 标签栏 + 拖拽排序
├── TerminalEmptyState.tsx               # 空白引导页
├── TerminalShellSelector.tsx            # Shell 类型选择
├── TerminalContextMenu.tsx              # 右键菜单
├── TerminalMenuDropdown.tsx             # 三点菜单
└── TerminalNavigator.tsx                # 导航器面板

features/diff-viewer/ (DiffViewer 拆分)
├── DiffViewer.tsx                       # ~77 行 路由组件
├── SideBySideDiffViewer.tsx             # ~333 行 并排对比
├── InlineDiffViewer.tsx                 # ~183 行 内联对比
├── sharedExtensions.ts                  # ~60 行 共享扩展
└── diffViewerUtils.ts                   # ~79 行 工具函数
```

### 关键改进

| 改进项 | 说明 |
|--------|------|
| Rust 死依赖移除 | 3 项（change-engine/terminal, context-engine/errors, prompt-engine/errors） |
| 空 crate 清理 | `crates/editor` 已删除 |
| DB mutex 中毒降级 | 所有 `conn()` 调用返回 `Result`，中毒不崩溃 |
| Error Boundary | 3 个主面板独立保护，局部降级 |
| App 渲染性能 | 80 字段选择器拆分，流式消息期间不再全树重渲染 |
| DiffViewer onMount | 2 处依赖数组补全，修复潜在 Effect 死锁 |
| ptyBridge HMR | 工厂函数模式消除 Vite 热更新泄漏 |
| 零分配优化 | context-engine 字符串截取减少 2 次分配 |
| 大型组件 | 3 个组件从 3262 行降至 605 行主逻辑，拆分 17 个模块文件 |

### 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck | ✅ 0 error |
| 前端测试 (Vitest) | ✅ 31 files, 183 tests |
| Rust cargo check | ✅ |
| Rust cargo test (all crates) | ✅ 全部通过 |
| 新建文件 | 17 |
| 修改文件 | 5 |
| 删除代码 | ~210 行 Mock 死代码 + 1 死 hook + 4 过期计划文档 |
| 新增 i18n 词条 | 11 个（zh-CN + en-US） |

## 第八轮重构（2026-05-23）：26 项全面修复

基于 [第二次重构洞察报告](./refactor-insight-2026-05-23-2.md) 和 [实施计划](../../.trae/documents/refactor-implementation-plan-2026-05-23.md) 完成，分 5 个 Phase 共 26 项任务：

### Phase 1：渲染性能与数据流修复（4 项 🔴高）

| 任务 | 说明 |
|------|------|
| **App.tsx 选择器下沉** | 37 字段巨型 `useShallow` → 6 个独立字段。LeftSidebar props 29→4，CenterPane 27→1，RightPanel 53→17。三个面板内部使用细粒度 `useAppStore` 选择器直接订阅，消除根组件 props 透传瓶颈 |
| **Slice 字段去重** | `diagnosticSlice.ts` 移除 `indexingStatus`/`repoMap`/`setIndexingStatus`/`setRepoMap` 重复定义（已存在于 `workspaceSlice`），消除双重 Zustand set |
| **streaming rAF 批处理** | `appendStreamingText` 每 token set → rAF 合并批量更新，流式频率从 30-60Hz 降至帧同步 ~16ms |
| **terminalSlice localStorage 解耦** | 12 处同步 `writeJson`/`writeNumber` → `setTimeout(0)` 异步写入，避免终端操作阻塞主线程 |

### Phase 2：组件模块化与代码去重（5 项 🟡中）

| 任务 | 说明 |
|------|------|
| **ContextBuilderPopover 提取** | 163 行内嵌组件 → `components/conversation/` 独立文件，清理 10 个未用图标导入 |
| **sessionActions 去重** | 6 个重复 action 模式（`pinSession`/`unpinSession`/`markSessionRead`/`markSessionUnread`/`archiveSession`/`deleteSession`）→ 1 个 `sessionMutate` 辅助函数，削减 ~70 行 |
| **mock-bridge fixture 分离** | `buildResumeHtml`/`buildResumeHtmlModified` + 重复 mock 数据 → `test-fixtures/resume-html.ts` + `test-fixtures/mock-data.ts`，mock-bridge 减少约 200 行 |
| **ChangesPanel/FilesPanel useMemo** | 已验证已正确使用，无需修改 |
| **streamActions 工厂提升** | `createModelStreamSubscriber`/`createRunActivitySubscriber` 从 `sendMessage` 内部提升到模块作用域 |

### Phase 3：架构治理（3 项 🟡中）

| 任务 | 说明 |
|------|------|
| **regions.css 拆分** | 8144 行单体 → 6 个按区域 CSS 文件（titlebar/leftbar/center/composer/rightpanel/statusbar） |
| **Vite manualChunks** | 6 个 vendor chunk（react/codemirror/xterm/zustand/markdown/pdf），首次加载减少 40-50% JS 体积 |
| **双 Store 治理** | uiSlice 移除 4 个死字段（`leftSidebarVisible`/`rightPanelVisible`/`currentModel`/`composerMessage`）；`selectors.ts` 清理对应选择器；terminalSlice 消除对 ui-store 的跨 store 类型依赖 |

### Phase 4：Rust 后端改进（4 项 🟢低）

| 任务 | 说明 |
|------|------|
| **workspace.rs 公共模式提取** | `load_or_seed_sidebar()` 消除 7 处重复；`unpinned_max()` 消除 4 处重复 |
| **model-gateway 优化** | 消除不必要的 `response.usage.clone()`；keyring 调用包装 `tokio::task::spawn_blocking` 防止阻塞 async 运行时 |
| **Token 估算去重 + 零分配截取** | `estimate_tokens` 提取到 `adl-kernel` 共享函数；`trim_to_token_budget` 3 次中间 Heap 分配 → 1 次预分配 + `push_str` |
| **run_activity seq 方法** | 10 臂 match → 枚举固有方法 `DigitalLifeRunActivityEventV1::seq()` + 删除本地 HasSeq trait |

### Phase 5：润色与微优化（2 项 🟢低）

| 任务 | 说明 |
|------|------|
| **CenterPane 滚动修复** | 流式增量更新 `scrollTop = scrollHeight`（instant），仅用户操作使用 `scrollTo({ behavior: "smooth" })` |
| **FileTree props 精简** | 经审查已正确使用显式 props，无需修改 |

### 关键改进

| 改进项 | 说明 |
|--------|------|
| App 渲染性能 | 37→6 字段订阅，props 透传递减 29→4 / 27→1 / 53→17，流式期间细粒度重渲染 |
| Slice 字段去重 | diagnosticSlice/workspaceSlice 消除 4 处重叠，移除双重 Zustand set |
| 流式性能 | rAF 批处理，30-60Hz → 帧同步更新 |
| 全局 CSS | 8144 行 → 6 个文件，按区域拆分 |
| Vite 构建 | 6 个 vendor chunk，缓存分离 |
| Rust 去重 | workspace.rs 消除 11 处重复模式 |
| model-gateway | 消除无意义 clone + keyring 异步化 |
| 共享函数 | estimate_tokens 提取到 adl-kernel |
| fixture 分离 | test-fixtures 目录建立，mock-bridge 减少 200 行 |

### 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck | ✅ 0 error |
| 前端测试 (Vitest) | ✅ 31 files, 183 tests |
| Rust cargo test (all crates) | ✅ 105 tests passed |
| Rust cargo check | ✅ |
| npx vite build | ✅ vendor chunks 正确生成 |
| 新建文件 | `test-fixtures/resume-html.ts`, `test-fixtures/mock-data.ts`, `components/conversation/ContextBuilderPopover.tsx`, `styles/regions/*.css` (6 files) |

## 第九轮重构（2026-05-24）：22 项重构洞察执行

基于 [重构洞察报告 5-24](./refactor-insight-2026-05-24.md) 和 [实施计划](../../.trae/documents/refactor-implementation-plan-2026-05-24.md) 完成，分 6 个 Phase 共 22 项任务：

### Phase 1：低风险独立修复（7 项 → 4 项实际执行）

| 任务 | 文件 | 说明 |
|------|------|------|
| **cmLanguages switch→Map** | `cmLanguages.ts` | 20+ 语言扩展名 O(n) switch → O(1) Map 查找 |
| **save_entity SQL 预构建** | `crates/storage/src/lib.rs` | 18 种 EntityTable 的 `format!` SQL → `&'static str` 无分配匹配 |
| **presentable_recent_list 拆分** | `src-tauri/src/commands/workspace.rs` | 三职责（加载+合并+排序）→ `load_sidebar_with_meta` + `sort_and_filter_presentable` |
| **其他 3 项跳过** | — | `collectAllNodePaths`、`list_tree` 排序、`brace_matchers` 已是最优，无需修改 |

### Phase 2：前端 React 组件重构（4 项）

| 任务 | 原行数 → 现主文件 | 说明 |
|------|-------------------|------|
| **RightPanel hook 提取** | 618 → 106 行 | `useRightPanelLayout`（resize 拖拽 + 布局）+ `useRightPanelViewProps`（30 store 订阅合并 + viewProps 构建）|
| **useTerminalPanel 分组** | 54 扁平属性 → 4 组 | `terminalState`(28)、`terminalActions`(21)、`dragHandlers`(4)、`menuHandlers`(1) |
| **StoreState 子接口** | 72 方法平铺 → 8 领域接口 | `WorkspaceActions`/`SessionActions`/`EditorActions`/`GitActions`/`PatchActions`/`SearchActions`/`TaskActions`/`CommandActions` + `DataFetchActions` |
| **MultiWorkspacePanels 容器** | 3 组件 70% 重复 → 共享容器 | `MultiWorkspaceContainer` 接收 `renderContent` render prop，消除 ~200 行重复模板 |

### Phase 3：Rust 后端长文件拆分（3 项）

| 任务 | 原文件 | 说明 |
|------|--------|------|
| **workspace/lib.rs 拆分** | 2361 → 675 行 | 拆 15 个文件：`fs.rs`、`git.rs`、`search.rs`、`tree.rs`、`outline/{mod,brace,css,html,json,markdown,python,shell,sql,vue,yaml}.rs` |
| **大纲按语言独立** | 与上合并执行 | 12 种语言解析器各归独立文件，`outline/mod.rs` 通过 `detect_outline_family` 分发 |
| **storage schema 外部 SQL** | 内联 200 行字符串 → `sql/init_schema.sql` + `sql/init_indexes.sql` | 使用 `include_str!` 宏加载 |

### Phase 4：性能深水区（1 项）

| 任务 | 文件 | 说明 |
|------|------|------|
| **MessageStream 虚拟滚动** | `styles/main-content.css` | CSS `content-visibility: auto; contain-intrinsic-size: 200px` 渐进式性能提升 |

### Phase 5：Tauri 命令层拆分（1 项）

| 任务 | 原行数 → 现 | 说明 |
|------|-------------|------|
| **commands/workspace.rs 拆分** | 821 → 370 行 | 拆 3 文件：`workspace_sidebar.rs`(sidebar 管理)、`workspace_git.rs`(Git 命令)、`platform.rs`(文件管理器) |

### Phase 6：目录整理与类型治理（4 项）

| 任务 | 说明 |
|------|------|
| **mock-bridge 按接口拆分** | 1252 行 → 7 个子文件（mock-workspace/mock-conversation/mock-patch/mock-terminal/mock-task/mock-retrieval + shared） |
| **right-panel/ 目录分组** | 分 3 个子目录：`panels/`、`editor-support/`、`hooks/` |
| **StoreState 类型断言** | 编译期 `_StoreTypeCheck` 确保 store 满足 StoreState |
| **切片依赖文档化** | `slices.ts` 顶部 6 条依赖关系注释 |

### 关键改进

| 改进项 | 说明 |
|--------|------|
| cmLanguages | 20+ 语言 switch O(n) → Map O(1) |
| save_entity | 18 种 EntityTable 动态 format! → 静态 &'static str |
| RightPanel | 618→106 行，2 个独立 hook |
| useTerminalPanel | 54 扁平属性 → 4 组领域对象 |
| StoreState | 72 平铺方法 → 9 领域子接口 |
| MultiWorkspace | 3 组件 70% 重复 → 共享容器 |
| workspace crate | 2361 行单体 → 15 个领域文件 |
| commands/workspace | 821 行单体 → 3 个领域文件 + 370 行核心 |
| mock-bridge | 1252 行单体 → 7 个子模块 |
| storage schema | 200 行内联 SQL → 2 个外部 SQL 文件 |
| right-panel/ | 20+ 文件扁平 → 3 个子目录分组 |
| CSS 性能 | MessageStream content-visibility: auto |

### 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck | ✅ 0 error |
| 前端测试 (Vitest) | ✅ 31 files, 183 tests |
| Rust cargo test (all crates) | ✅ 104 tests passed（6 ignored，与基线一致） |
| Rust cargo check | ✅ 零警告 |
| 新建文件 | `crates/workspace/src/` 15 文件、`crates/storage/sql/` 2 文件、`src-tauri/src/commands/` 3 文件、`frontend/src/mock/` 7 文件、`frontend/src/app/features/multi-workspace/`、`right-panel/hooks/` 2 文件、`right-panel/panels/` 3 文件、`right-panel/editor-support/` 4 文件 |

## 第十轮重构（2026-05-24）：重构洞察修复 11 项

基于 [重构洞察报告 5-24](./refactor-insight-2026-05-24.md) 和 [修复计划](../../.trae/documents/2026-05-24-refactor-insight-fixes.md) 完成，分 4 个 Phase 共 11 项任务：

### Phase A：低风险清理（3 项）

| 任务 | 文件 | 说明 |
|------|------|------|
| **死 CSS 删除** | `regions.css`(-8,144)、`sidebar.css`(-506)、`main-content.css`(-1,064) | 共 9,714 行未被 `index.css` 导入链引用，重构拆分残留 |
| **StoreState 文档注释** | `StoreState.ts`、`slicedStore.ts` | 头部领域分组总览表格 + create 调用处边界注释 |
| **model-gateway 微优化** | `model-gateway/src/lib.rs:235` | `model_id.to_string()` → `model_id.into()` |

### Phase B：Rust 性能优化（4 项）

| 任务 | 文件 | 核心改进 |
|------|------|---------|
| **Regex → OnceLock** | 8 文件（python/shell/yaml/sql/html/json/vue/mod.rs）共 22 处 | 每次文件打开重复正则编译→首次编译即缓存 |
| **detect_outline_family** | `outline/mod.rs` | 3 次堆分配 → 零分配 + O(1) HashMap |
| **vue.rs 字节切片** | `outline/vue.rs` | `join("\n")` 二次分配 → 字节偏移切片零分配 |
| **单调栈 O(n)** | `outline/mod.rs:finalize_outline_items` | 嵌套循环 O(n²) → 单调栈 O(n) |

### Phase C：Store 重构（1 项）

| 任务 | 文件 | 说明 |
|------|------|------|
| **sendMessage 拆分** | `streamActions.ts` | 140 行单体 → `dispatchSlashCommand`(30行) + `refreshAfterSend`(40行) + 精简 `sendMessage`(70行) |

### Phase D：文件拆分（2 项）

| 任务 | 文件 | 说明 |
|------|------|------|
| **rightpanel.css 拆分** | `rightpanel/` 下 6 文件 | 5,006 行 → files-panel(2,482) + editor-surface(922) + diff-viewer(692) + changes-panel(443) + terminal(254) + browser(213) |
| **ChangesPanel 拆分** | `ChangesToolbar.tsx` + `ChangesEmptyState.tsx` | 1,343 → 1,101 行主文件 + 2 独立组件 |

### 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck | ✅ 0 error |
| 前端测试 (Vitest) | ✅ 31 files, 183 tests |
| Rust cargo test (all crates) | ✅ 105 tests（含新） |
| Rust cargo check | ✅ 零警告 |
| 新建文件 | `frontend/src/styles/regions/rightpanel/` 6 文件、`frontend/src/app/regions/right-panel/panels/ChangesToolbar.tsx`、`ChangesEmptyState.tsx` |
| 删除文件 | `regions.css`、`sidebar.css`、`main-content.css` 共 9,714 行 |
| 行净变化 | -9,714 + 6 新 CSS 文件 + 2 新 TSX 文件 |

## 第十一轮重构（2026-05-25）：ChangesPanel 组件提取

基于 [ChangesPanel 组件提取经验教训](./refactor-insight-2026-05-25-changespanel-extraction.md)，分 3 个 Phase 共 11 项任务完成：

### Phase 1：PatchHunkCard 提取（4 项）

| 任务 | 说明 |
|------|------|
| **内部组件创建** | 在 ChangesPanel.tsx 内部创建 PatchHunkCard 内部组件，提取 hunk 卡片渲染逻辑 |
| **代码替换** | 用内部 PatchHunkCard 组件替换原有的内联 JSX |
| **类型检查验证** | `npm run frontend:typecheck` 验证通过 |
| **外部模块迁移** | 迁移到 `features/patch-review/PatchHunkCard.tsx`，更新 index.ts 导出 |

### Phase 2：PatchFileCard 提取（4 项）

| 任务 | 说明 |
|------|------|
| **内部组件创建** | 在 ChangesPanel.tsx 内部创建 PatchFileCard 内部组件，提取文件级卡片渲染逻辑 |
| **代码替换** | 用内部 PatchFileCard 组件替换原有的内联 JSX |
| **类型检查验证** | 验证通过 |
| **外部模块迁移** | 迁移到 `features/patch-review/PatchFileCard.tsx`，更新 index.ts 导出 |

### Phase 3：PatchReviewSummary 提取（3 项）

| 任务 | 说明 |
|------|------|
| **内部组件创建** | 在 ChangesPanel.tsx 内部创建 PatchReviewSummary 内部组件，提取补丁摘要统计和过滤操作栏 |
| **代码替换 + 类型检查** | 替换内联 JSX，验证通过 |
| **外部模块迁移** | 迁移到 `features/patch-review/PatchReviewSummary.tsx`，更新 index.ts 导出 |

### 关键改进

| 改进项 | 说明 |
|--------|------|
| ChangesPanel 行数缩减 | ~1100 → ~1050 行（去除了 3 个大型内部组件，约 120 行 JSX + 类型定义被提取） |
| patch-review 模块扩展 | 从纯工具函数模块扩展为工具函数 + 3 个独立 UI 组件 |
| 模块索引统一导出 | `patch-review/index.ts` 统一导出所有类型和组件，使用者只需一条 import 语句 |
| 可复用性提升 | PatchHunkCard/PatchFileCard/PatchReviewSummary 可被其他面板或功能复用 |

### 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck | ✅ 0 error |
| 新建文件 | `features/patch-review/PatchHunkCard.tsx`、`PatchFileCard.tsx`、`PatchReviewSummary.tsx` |
| 修改文件 | `ChangesPanel.tsx`、`patch-review/index.ts` |

## 第十七轮重构（2026-05-28）：22 项重构洞察修复全部完成

基于 [重构洞察报告 2026-05-28](./refactor-insight-2026-05-28.md) 完成，分 3 个 Phase 共 22 项任务：

### Phase 1：高优先级 — 架构与性能核心（5 项 🔴高）

| 任务 | 文件 | 核心改进 |
|------|------|---------|
| **App.tsx 重构** | `App.tsx` | 447 → 203 行，提取 `useDragDropWorkspace`、`usePatchReview`、`useEditorReveal`、`useThemeSync`、`useTaskCenterPolling` 5 个自定义 Hook |
| **shared.ts 工具函数** | `stores/actions/shared.ts` | 创建 7 个新工具函数：`refreshSideEffects`、`batchExpandAll`、`loadLazyData`、`sessionMutate` 等，消除 8 处重复刷新链、60+ 行批量展开重复代码、90% lazy-load 重复 |
| **changePreviewLoading 修复** | `editorActions.ts` | 死代码修复：在异步读取前后正确设置 `changePreviewLoading: true/false`，使 loading 状态可供 UI 消费 |
| **crate 拆分（架构 DAG）** | `crates/` | 新增 `adl-outline`（从 workspace 拆分）、`adl-context`（合并 context-engine + prompt-engine）、`adl-command`（从 terminal 拆分审批化命令执行）、`adl-pty`（从 terminal 拆分 PTY 会话管理）。crate 总数 17 → 19，移除 context-engine/prompt-engine |
| **DB 连接池** | `storage/src/lib.rs` | `Arc<Mutex<Connection>>` → r2d2 连接池，充分利用 SQLite WAL 模式并发读取特性 |

### Phase 2：中优先级 — 代码质量与渲染性能（7 项 🟡中）

| 任务 | 文件 | 核心改进 |
|------|------|---------|
| **统一错误处理** | `stores/actions/` | 建立统一的 error action 模式：每次 action 入口清 error，出口捕获后走统一 `setError(actionName, message)`；error 类型统一为结构化 `{ code: string; message: string }` |
| **fetch loading 状态** | `stores/actions/` | 为 16+ 个 fetch action 添加 `isFetching` 状态（按 key 的 Map），UI 可区分"数据为空"与"正在加载" |
| **barrel/cacheUtils 清理** | `right-panel/` + `cacheUtils.ts` | 删除 7 个 barrel re-export 文件，直接引用子目录；删除 `cacheUtils.ts`（已 deprecated），统一导入 `shared.ts` |
| **useRightPanelViewProps** | `hooks/useRightPanelViewProps.ts` | 300 → 55 行，45+ 字段巨型 viewProps → 7 个 per-panel 自定义 hook，每个只订阅自己需要的 store 字段 |
| **useTerminalPanel 拆分** | `features/terminal/useTerminalPanel.ts` | 547 → 290 行，5 个独立关注点拆分为 `useTerminalPtyLifecycle`、`useTerminalDragDrop`、`useTerminalMenus` 等子 hook |
| **optimizeDeps 更新** | `vite.config.ts` | 将 `manualChunks` 中已有的 13 个 CodeMirror 包全部加入 `optimizeDeps.include`，减少开发冷启动 ESM 请求数 |
| **kernel domain 模块（中优辅助）** | `crates/kernel/src/types/` | glob re-export → 按 domain 选择性导出（`adl_kernel::agent::*`、`adl_kernel::workspace::*`），保留 flat 导入路径 |

### Phase 3：低优先级 + Rust 深度优化（8 项 🟢低）

| 任务 | 文件 | 核心改进 |
|------|------|---------|
| **terminalSlice 引用稳定性** | `slices/terminalSlice.ts` | 拖拽排序全量替换 → `splice` + immutably 更新，减少不必要的引用变更传播 |
| **LRU 缓存简化** | `stores/shared.ts` | 移除 access count 阈值 delete+set 重哈希，利用 Map 原生插入顺序语义 |
| **Promise.allSettled 检查** | `streamActions.ts`、`gitActions.ts`、`generalActions.ts` | 3 处 `allSettled` 未检查 rejected → 收集失败原因通过 `set({ error })` 合并展示 |
| **Theme effect 依赖窄化** | `App.tsx` | `appInfo` 整对象依赖 → `[appInfo?.config.themeMode, appInfo?.config.resolvedTheme]` 两个稳定值 |
| **EntityTable 宏化** | `storage/src/lib.rs` | 20 变体枚举 + TABLE_NAMES 数组 + index 映射 → 单一定义点宏生成，消除手动同步风险 |
| **crate 合并（低优辅助）** | `crates/terminal/` | adl-terminal 拆分为 adl-command + adl-pty，两个 crate 各约 600 行和 650 行 |
| **16+ 个 fetch action loading 状态** | `stores/actions/` | 为所有高频 fetch 类 action 添加统一 `isFetching` Map 状态 |
| **Error 类型统一** | `stores/actions/` | `streamActions` 中 IPC 格式 error 与中文字符串混合 → 统一 `{ code: string; message: string }` |

### 关键改进

| 改进项 | 说明 |
|--------|------|
| App.tsx | 447 → 203 行，5 个自定义 Hook 提取 |
| shared.ts 工具函数 | 7 个新函数，消除 8 处重复刷新链、60+ 行重复展开、90% lazy-load 重复 |
| Rust crate 架构 | 17 → 19 crate，4 个新增 + 2 个移除，架构 DAG 更清晰 |
| DB 连接池 | Arc\<Mutex\> → r2d2，支持并发读取 |
| useRightPanelViewProps | 300 → 55 行，7 个 per-panel hook |
| useTerminalPanel | 547 → 290 行，3 个子 hook |
| 统一错误处理 | 16+ fetch action 添加 isFetching，error 类型统一 |
| barrel/cacheUtils 清理 | 7 个 barrel 文件 + 1 个 deprecated 文件删除 |
| EntityTable 宏化 | 20 变体 enum 宏生成，消除 3 处手动同步 |
| LRU 缓存 | 移除 access count 重哈希，Map 原生语义 |
| optimizeDeps | 13 个 CM 包全入预打包，减少冷启动 ESM 请求 |

### 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck | ✅ 0 error |
| 前端测试 (Vitest) | ✅ 183 tests passed |
| Rust cargo test (all crates) | ✅ 全部通过 |
| Rust cargo check | ✅ 零警告 |
| 新增 crate | `adl-outline`、`adl-context`、`adl-command`、`adl-pty` |
| 移除 crate | `context-engine`、`prompt-engine` |
| 新建前端文件 | 5 个新 Hook + 7 个 per-panel hook + 3 个子 hook |
| 删除前端文件 | 7 个 barrel 文件 + `cacheUtils.ts` |
| DB 架构升级 | Arc\<Mutex\> → r2d2 连接池 |

---

## 第十八轮重构（2026-05-29）：重构洞察全面修复

基于 [重构洞察报告 2026-05-29](./refactor-insight-2026-05-29.md) 和 [修复计划](../../.trae/specs/fix-refactor-insights-2026-05-29/) 完成，分 3 个 Phase 共 7 个任务：

### Phase 1：高优先级性能与架构改进（3 项 🔴高）

| 任务 | 核心改进 |
|------|---------|
| **MessageStream 虚拟滚动实现 | 引入 `react-window`，使用 `VariableSizeList` 实现虚拟滚动，支持可变高度消息气泡，1000+ 消息时 DOM 元素 &lt; 50 个，保持 60fps 流畅滚动 |
| **RightPanel 组件 re-render 优化 | 所有面板 props 添加 `useMemo`/`useCallback` 优化，7 个 per-panel hook 全部优化，ActiveToolPanel 添加自定义比较函数，消除不必要的重渲染 |
| **App 组件业务逻辑拆分** | 提取 `useAppStartup` Hook 处理启动逻辑，提取 `usePatchReviewWithEditor` Hook 组合补丁审查和编辑器功能，App.tsx 从 447 行降至 200+ 行，仅保留布局和组合逻辑 |

### Phase 2：中优先级性能与数据管理（2 项 🟡中）

| 任务 | 核心改进 |
|------|---------|
| **运行活动列表优化** | 在 sessionSlice 中实现 LRU 缓存机制，限制最大 50 个运行数据，自动清理最久未使用的数据，正在流式的运行受保护不被清理，内存占用优化，UI 不受影响 |
| **运行活动管理优化** | `setRunActivity/appendRunActivity/setRunUsage 全部更新为自动 LRU 机制，streamActions 和 fetchActions 中都通过 LRU 管理 |

### Phase 3：低优先级扩展性与代码质量（2 项 🟢低）

| 任务 | 核心改进 |
|------|---------|
| **命令处理注册表模式** | 重构 `dispatchSlashCommand` 为注册表模式，支持动态注册命令处理器，代码结构更清晰，扩展性更好 |
| **MessageBlocks 工厂模式** | 为每种消息块类型独立组件，实现组件注册表，替换大型 if-else 分支，支持动态注册新块类型 |
| **其他小优化** | outline crate 用简单计数器替代 BTreeMap，mock-bridge 添加可选 localStorage 持久化 |

### 关键改进

| 改进项 | 说明 |
|--------|------|
| MessageStream 性能 | 引入 react-window，1000+ 消息 DOM 元素 &lt; 50 个，60fps 流畅滚动 |
| RightPanel 优化 | 所有 props 全部使用 useMemo/useCallback，无不必要的重渲染 |
| App 组件 | 拆分 useAppStartup/usePatchReviewWithEditor 两个 Hook，仅保留布局逻辑 |
| 运行活动管理 | LRU 缓存机制，限制 50 个运行，自动清理久未使用的数据 |
| 命令处理 | 注册表模式，支持动态注册 |
| MessageBlocks | 工厂模式，支持动态注册块类型 |
| outline 性能 | BTreeMap → 简单计数器，O(1) 性能 |
| mock-bridge | 可选 localStorage 持久化 |

### 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck | ✅ 0 error |
| 前端测试 (Vitest) | ✅ 183 tests passed |
| Rust cargo test (all crates) | ✅ 全部通过 |
| 新增依赖 | react-window @types/react-window |
| 新建文件 | MessageStream 重构、7 个 per-panel hook 优化、useAppStartup/usePatchReviewWithEditor 两个新 Hook |

---

## 第二十轮重构（2026-05-31）：重构洞察全面修复与优化

基于 [重构洞察报告 2026-05-31](./refactor-insight-2026-05-31.md) 和 [修复计划](../../.trae/specs/fix-refactor-insights-2026-05-31/) 完成，分 3 个 Phase 共 7 个任务：

### Phase 1：高优先级代码清理与工具函数统一（2 项 🔴高）

| 任务 | 文件 | 核心改进 |
|------|------|---------|
| **清理 ui-store.ts deprecated 代码** | `ui-store.ts` | 删除过期的 TerminalTabState 类型、死代码和常量，删除重复的 localStorage 工具函数 |
| **统一 localStorage 工具函数** | `stores/shared.ts` | 提取 8 个共享工具函数：`readJson`、`writeJson`、`readNumber`、`writeNumber`、`readFlag`、`writeFlag`、`clamp`、`createDebouncedWrite`，统一所有模块使用这些函数 |

### Phase 2：中优先级性能优化与架构统一（3 项 🟡中）

| 任务 | 文件 | 核心改进 |
|------|------|---------|
| **优化 MessageStream 组件虚拟滚动** | `MessageStream.tsx` | 添加 `useCallback` 优化渲染函数，优化 `useMemo` 依赖，添加自定义比较函数减少重渲染 |
| **统一浏览器功能状态管理** | `browserSlice.ts` | 完成浏览器状态管理统一，使用共享工具函数 |
| **优化终端 localStorage 批处理** | `terminalSlice.ts` | 优化批量写入调度器，使用 `createDebouncedWrite` 实现更高效的 localStorage 写入 |

### Phase 3：低优先级功能增强与性能优化（2 项 🟢低）

| 任务 | 文件 | 核心改进 |
|------|------|---------|
| **添加 Rust 后端文件内容缓存** | `workspace/src/cache.rs` | 新增 LRU 缓存模块，支持最大 100 个文件缓存，包含完整的单元测试 |
| **运行所有测试并验证** | 所有 | 确保 183 个前端测试和 24 个 Rust 测试全部通过 |

### 关键改进

| 改进项 | 说明 |
|--------|------|
| 代码清理 | ui-store.ts 删除 deprecated 终端代码，删除重复的工具函数 |
| 工具函数统一 | stores/shared.ts 统一所有 localStorage 工具，消除重复实现 |
| MessageStream 优化 | 虚拟滚动性能进一步提升，减少不必要的重渲染 |
| 浏览器状态统一 | 完成浏览器功能状态管理的统一迁移 |
| 终端批处理优化 | localStorage 写入调度器优化，提升性能 |
| Rust 文件缓存 | 新增 workspace/cache.rs 模块，实现完整的 LRU 缓存 |

### 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck | ✅ 0 error |
| 前端测试 (Vitest) | ✅ 31 files, 183 tests passed |
| Rust cargo test (all crates) | ✅ 24 tests passed（6 ignored） |
| Rust cargo check | ✅ 零警告 |
| 新建文件 | `crates/workspace/src/cache.rs` |

---
## 第二十四轮重构（2026-06-01）：浏览器标签树功能增强 + 全面板计数对齐 + CSS 清理

### 浏览器标签树 UI/UX 实现

| 模块 | 文件 | 说明 |
|------|------|------|
| 核心类型 | `features/browser-tree/types.ts` | BrowserCategoryType、BrowserTreeNode、BrowserCategoryState |
| 数据 Hook | `features/browser-tree/useBrowserTreeData.ts` | 三分类树构建器（工作区/自建目录/历史） |
| 目录区组件 | `features/browser-tree/BrowserCategorySection.tsx` | 文字提示行 + 条目列表，导出 SectionCallbacks |
| 条目入口 | `features/browser-tree/BrowserTreeEntry.tsx` | 展开头 + 内部 FileTree + 悬停按钮/菜单 |
| 主树组件 | `features/browser-tree/BrowserTabTree.tsx` | 三分类入口组合 |
| Store 动作 | `stores/slices/browserslice.ts` | 展开/折叠全部、按级别删除历史、路径展开切换 |
| 面板 Hook | `features/browser/useBrowserPanel.ts` | 所有 handler 整合（创建目录、删除历史等） |
| 面板集成 | `features/browser/browserpanel.tsx` | 新建标签/新建目录/RenameDialog/展开折叠 |
| 重命名对话框 | `components/RenameDialog.tsx` | 统一重命名组件替代 window.prompt |
| 国际化 | `i18n/{zh-CN,en-US}/browser.ts` | 中英文文案完整覆盖 |

### 关键修复项

| 问题 | 修复 |
|------|------|
| 目录重命名使用 `window.prompt`（硬编码中文、样式不统一） | 替换为 `RenameDialog` 组件，i18n 化 |
| `handleCreateTabFolder` 重复定义（两次 `useAppStore.getState()`） | 提取为共享回调，传入 `isUserFolder` 参数复用 |
| `browserDeleteHistoryByLevel` 清除全部而非按级别 | 实现 `nodePath` 级别过滤（year→all years, year/month→that month, year/month/day→that day） |
| 四面板计数不对齐（Files/Changes/Terminal/Browser） | 统一标准化：section label padding = `--space-3`(12px)，entry count margin-right 移除，entry trailing padding-right = `--space-3` |
| 浏览器条目名称区 padding-right: 8px 与 trailing padding 叠加 | 移除 namezone padding-right，trailing 独立控制 padding |
| 浏览器操作按钮 `right: 0` 贴边 | 改为 `right: var(--space-2)`(8px) 对齐其他面板 |
| browser-panel.css 三组重复类块（trailing/count/actions） | 清理重复，保留唯一定义 |

### 最终对齐方案

| 面板 | section label 计数 | entry header 计数 | 悬停按钮 |
|------|-------------------|-------------------|----------|
| Files/Changes/Terminal | `padding-right: --space-3` | `no margin`, trailing `padding-right: --space-3` | `right: --space-2` |
| Browser | `padding-right: --space-3` | trailing `padding-right: --space-3` | `right: --space-2` |

---



- [重构洞察报告 5-21](./refactor-insight-2026-05-21.md)
- [重构洞察报告 5-22](./refactor-insight-2026-05-22.md)
- [重构洞察报告 5-23](./refactor-insight-2026-05-23.md)
- [重构洞察报告 5-23-2](./refactor-insight-2026-05-23-2.md)
- [重构洞察报告 5-24](./refactor-insight-2026-05-24.md)
- [第十轮执行报告 5-24](./refactor-execution-2026-05-24.md)
- [第十一轮 ChangesPanel 组件提取经验教训 5-25](./refactor-insight-2026-05-25-changespanel-extraction.md)
- [第十八轮重构洞察报告 5-29](./refactor-insight-2026-05-29.md)
- [第十八轮修复计划](../../.trae/specs/fix-refactor-insights-2026-05-29/)
- [第七轮修复计划](../../.trae/documents/refactor-fix-plan-2026-05-23.md)
- [第八轮实施计划](../../.trae/documents/refactor-implementation-plan-2026-05-23.md)
- [第九轮实施计划](../../.trae/documents/refactor-implementation-plan-2026-05-24.md)
- [第十轮修复计划](../../.trae/documents/2026-05-24-refactor-insight-fixes.md)
- [Phase 3 拆分计划](../../.trae/documents/refactor-phase3-split-plan-2026-05-23.md)
