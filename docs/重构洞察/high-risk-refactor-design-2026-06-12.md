# 高风险重构设计方案 – ai-digital-life
**生成日期**：2026-06-12

> 基于 2026-06-12 重构洞察报告，针对 5 个 🔴 高风险目标的设计方案。遵循"先低风险→逐步递进"策略。

## 工作包结构

将 5 个高风险目标分为 **3 个独立工作包**，按风险升序排列：

| 工作包 | 包含目标 | 风险 | 涉及文件数 | 预期行数减少 |
|--------|---------|------|-----------|-------------|
| A: 桥接层修补 | 11 处语义一致性问题 | 🟢最低 | 6 | — |
| B: GitHub 面板重组 | GitHubPanel(1351行)+communicateSlice(712行) | 🟡中 | ~12 | ~600 |
| C: 浏览器模块拆分 | useBrowserPanel(1042行)+browserslice(962行) | 🔴较高 | ~20 | ~800 |

## 工作包 A: 桥接层语义修补

### 修改清单

| # | 文件:行 | 方法 | 当前 | 修复为 |
|---|---------|------|------|--------|
| 1 | `mock-conversation.ts:35` | `getSession` | `throw new Error(...)` | `return { ok: true, data: undefined }` |
| 2 | `mock-bridge.ts:191` | `agent.getRun` | `async () =>` | `async (runId: string) =>` |
| 3 | `mock-bridge.ts:192` | `agent.retryRun` | `async () =>` | `async (runId: string) =>` |
| 4 | `mock-bridge.ts:193` | `agent.abortRun` | `async () =>` | `async (runId: string) =>` |
| 5 | `mock-bridge.ts:231` | `browser.navigate` | `async () => {}` | `async (url: string) => {}` |
| 6 | `mock-bridge.ts:235` | `browser.onUrlChanged` | `() => () => {}` | `(listener: ...) => () => {}` |
| 7 | `preview-bridge/index.ts:256` | `workspace.restoreToSidebar` | `async () =>` | `async (workspaceId: string) =>` |
| 8a | `mock-workspace.ts:326` | `workspace.onFileChanged` | `() => () => undefined` | `(listener: ...) => () => {}` |
| 8b | `preview-bridge/index.ts:426` | `workspace.onFileChanged` | `() => () => undefined` | `(listener: ...) => () => {}` |
| 9 | `mock-workspace.ts:49` | `workspace.pickDirectory` | `code: "UNSUPPORTED"` | `code: IpcErrorCode.INTERNAL_ERROR` |
| 10 | `preview-bridge/index.ts:528` | `browser.navigate` | `async () => {}` | `async (url: string) => {}` |
| 11 | `preview-bridge/index.ts:532` | `browser.onUrlChanged` | `() => () => {}` | `(listener: ...) => () => {}` |

### 验证方式
- `pnpm run typecheck` 通过（修复参数类型不匹配）
- `pnpm test` 全部通过

---

## 工作包 B: GitHub 面板重组

### B1: communicateSlice.ts 切片拆分

**当前问题**：712 行中 ~600 行专用于 GitHub，其余 4 个频道（WeChat/QQ/Feishu/Email）仅占位符。

**方案**：按领域拆分为 2 个切片：

| 新切片 | 保留内容 | 状态字段 | Actions | 行数 |
|--------|---------|---------|---------|------|
| `communicateSlice.ts`(缩减) | 共享：activePlatform, platforms, ciPersisted, communicateNavigatorCollapsed | 4 | 3 | ~80 |
| `githubSlice.ts`(新建) | GitHub 专属：gitHubWorkspaceConfigs, ciAutoRefreshOnPush, ciSnapshot, 树状态等 | 18 | 28 | ~600 |

**迁移步骤**：
1. 新建 `githubSlice.ts`，移植 GitHub 专有状态和 Action
2. 缩减 `communicateSlice.ts`，删除 GitHub 专有内容
3. 更新 `slicedStore.ts` 注册新切片
4. 更新所有 `import` 路径

### B2: GitHubPanel.tsx 组件拆分

**当前问题**：1351 行包含 11 个内嵌组件/函数。

**方案**：提取 7 个自包含子组件 + 1 个工具模块：

| 提取目标 | 行数 | 类型 | 依赖 |
|---------|------|------|------|
| `HelpView.tsx` | 229 | 纯展示组件 | 仅 `copy` prop |
| `GitHubSettingsDialog.tsx` | 132 | Portal 组件 | props |
| `OverviewView.tsx` | 125 | 视图组件 | snapshot, loading, branch, copy, onViewLogs |
| `WorkflowsView.tsx` | 31 | 视图组件 | snapshot |
| `JobsView.tsx` + `JobRow.tsx` | 92 | 视图组件 | job, snapshot, onViewLogs |
| `StatusDot.tsx` | 15 | 小部件 | conclusion, status |
| `githubPanelUtils.ts` | 55 | 工具模块 | 纯函数 |
| `MenuHintItem.tsx` | 86 | UI 组件 | label, hint, onClick |

提取后 `GitHubPanel.tsx` 从 **1351 行降至约 500 行**。所有子组件为纯 props 驱动，零 store 依赖。

**迁移步骤**：
1. 创建各子组件文件并移植代码
2. 在 `GitHubPanel.tsx` 中改为 import 方式引用
3. 删除内联定义

---

## 工作包 C: 浏览器模块拆分

### C1: browserslice.ts → 5 个独立切片

| # | 新切片 | 状态字段 | Action 数 | 描述行数 |
|---|--------|---------|-----------|---------|
| 1 | `browserTabsSlice.ts` | browserTabs, browserTabsById, browserActiveTabId | 7 | ~105 |
| 2 | `browserBookmarkSlice.ts` | browserBookmarks | 2 | ~84 |
| 3 | `browserHistorySlice.ts` | browserHistory | 3 | ~52 |
| 4 | `browserFoldersSlice.ts` | browserTabFolders, browserTabTreeExpanded, browserWorkspaceExpanded | 8 | ~130 |
| 5 | `browserLandingSlice.ts` | browserShortcuts, browserLocalPorts, browserPortScanning, browserBgConfig | 12 | ~113 |

**缩减后 `browserslice.ts` 保留**（~300 行）：
- 导航布局：browserNavigatorWidth, setBrowserNavigatorWidth, toggleBrowserNavigator, setBrowserNavigatorCollapsed
- 视图模式：browserViewMode, browserShowTabButtons, setBrowserViewMode, setBrowserShowTabButtons
- 持久化：browserPersisted, browserWorkspaceId, setBrowserPersisted, setBrowserWorkspaceId
- 跨领域：browserNavigateActiveTab, hydrateBrowserDefaults

**迁移步骤**：
1. 逐个创建 5 个新切片文件
2. 更新 `slices.ts` barrel 导出
3. 更新 `slicedStore.ts` 注册
4. 更新所有 import（自动 grep 替换）

### C2: useBrowserPanel.ts → 6 个独立 Hook

| # | 新 Hook | 职能 | 状态来源 | 行数 |
|---|---------|------|---------|------|
| 1 | `useBrowserTabs.ts` | 标签页 CRUD + 编辑状态 + 标签事件 | browserTabsSlice | ~120 |
| 2 | `useBrowserNavigation.ts` | 地址栏、URL 标准化、导航提交 | browserTabsSlice + browserHistorySlice | ~100 |
| 3 | `useBrowserWebView.ts` | iframe/WebView 生命周期、Tauri IPC、ResizeObserver | 组件本地状态 | ~220 |
| 4 | `useBrowserSearch.ts` | 搜索过滤、quickLinks、browserLookupIndex | browserBookmarkSlice + browserHistorySlice | ~120 |
| 5 | `useBrowserTreeActions.ts` | 树展开/折叠/批量操作 | browserFoldersSlice | ~100 |
| 6 | `useBrowserAddressState.ts` | 地址栏展开/输入、iframe 历史栈 | 组件本地状态 | ~60 |

**useBrowserPanel.ts 整体删除**。`browserpanel.tsx` 改为直接 import 各独立 Hook。

**保留的外部 Hook**（无需修改）：
- `useBrowserDragDrop.ts` ✓
- `useBrowserMenus.ts` ✓
- `useNavigatorResize.ts` ✓

**迁移步骤**：
1. 先完成 C1（切片拆分，避免 import 冲突）
2. 逐个创建 6 个独立 Hook 文件
3. 修改 `browserpanel.tsx` 的 import

### 消费者适配

`useBrowserPanel.ts` 在 `browserpanel.tsx` 的消费点（结构）：

```typescript
// 当前：一个 Hook 返回所有
const { browserState, browserActions, dragHandlers, menuHandlers } = useBrowserPanel();

// 改为：按需分别引入
const { browserTabs, activeTab, handleCreateTab, handleSelectTab, ... } = useBrowserTabs();
const { address, submitAddress, navigateBrowser, ... } = useBrowserNavigation();
const { iframeLoadError, handleIframeLoad, ... } = useBrowserWebView();
const { searchResults, navigatorQuery, ... } = useBrowserSearch();
const { allTreeExpanded, handleToggleTreePath, ... } = useBrowserTreeActions();
const { ... } = useBrowserAddressState();
const { isDragging, handleDragStart, ... } = useBrowserDragDrop();     // 已存在
const { contextMenu, handleContextMenu, ... } = useBrowserMenus();      // 已存在
```

---

## 依赖关系与执行顺序

```
工作包 A (独立) ════════════════════╗
                                   ║
工作包 B1: communicateSlice 拆分   ╠══ 全部并行
                                   ║
工作包 C1: browserSlice → 5切片    ║
                                   ║
    ↓ (C1 先于 C2)                 ║
工作包 C2: useBrowserPanel 拆散    ╝
                                   ║
工作包 B2: GitHubPanel 组件提取    ║ (与 A/B1/C1 并行)
═══════════════════════════════════╝

最后 → 质量门禁全面验证
```

- **A / B1 / B2 / C1** 可并行执行（4 路并发）
- **C2** 依赖 C1 完成后执行

---

## 质量验证计划

| 验证步骤 | 命令 | 预期 |
|---------|------|------|
| Rust Lint | `cargo clippy --workspace --all-targets -- -D warnings` | 0 warnings |
| Rust 格式化 | `cargo fmt --all -- --check` | 合规 |
| Rust 测试 | `cargo test --workspace` | 全部通过 |
| TS 类型检查 | `pnpm run typecheck` | 0 errors |
| 前端测试 | `pnpm test` | 全部通过 |
| 前端构建 | `pnpm run build` | 成功 |
| 视觉回归 | 浏览器模式手动验证 | UI 无变化 |

> 由设计方案生成于 2026-06-12
