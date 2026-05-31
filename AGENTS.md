# AI 数字生命 - 项目治理规则

## 项目定位

本仓库是 AI 数字生命项目的规划与治理工作区。根目录以文档和架构设计为主，`ai-digital-life/` 是基于 **Rust + Tauri 2.x** 的桌面应用实现工作区。

## 双根结构

| 目录 | 职责 |
|------|------|
| `notes/` | 规划与治理：文档、`AGENTS.md`、`docs/development/` |
| `ai-digital-life/` | 实现工作区：Rust + Tauri 桌面应用 + WebView 前端 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.x |
| 后端 | Rust (stable) + tokio + rusqlite + serde + tracing |
| 前端 | React 19 + Vite + Zustand + TypeScript + xterm.js |
| 桥接 | `#[tauri::command]` + `@tauri-apps/api` |
| 持久化 | SQLite（`rusqlite`，后端） |

## 当前阶段

| Phase | 状态 | 范围 |
|-------|------|------|
| Phase 0 | ✅ 已完成 | 架构底座、桌面壳层、安全边界、基础设施 |
| Phase 1 | 🚧 进行中 | 交互式 MVP、模型接入、上下文、变更预览 |
| Phase 2 | ✅ 已完成切片 | 单 Agent 薄切片、终端流式输出 |

### 已实现功能

- 桌面壳（Tauri Backend / WebView）
- SQLite 状态持久化
- 工作区与对话管理
- 补丁预览/应用/回滚
- 模型网关（含流式与取消）
- 命令治理与终端流式输出
- 自定义 Tooltip 组件
- CodeMirror 编辑器系统
- xterm.js 交互式终端（多会话、多 Shell 类型，浏览器模式通过 `child_process.spawn` + SSE 实现真实 Shell 进程）
- **Zustand 切片模式重构**（12 个独立切片 + 完整类型安全，消除 11 处 `as any`）
- **模块化分层重构**（7 个功能模块迁移到 `features/` 目录）
- **CSS 设计 Token 迁移**（亮暗主题 Shadow token + TypeScript 类型定义）
- **统一错误码枚举**（`IpcErrorCode` 跨桥接层统一）
- **重构洞察验证与修复**（消除 11 处 `as any`、错误粒度、SSE 连接管理、LRU 缓存优化、缓存短路、Send+Sync 断言、路径分隔符抽取等 20+ 项改进）
- **CodeMirror 双实例 bug 修复**（解决 `@codemirror/state` `instanceof` 检查失败：添加显式依赖 + Vite `optimizeDeps.include` 强制预捆绑为单例）
- **Store 拆分与桥接模块化**（`slicedStore.ts` 1465→87 行，拆分为 8 个 action 领域模块；`preview-bridge.ts` 615 行拆分为 4 个关注点分离的模块；`DigitalLifeBridge` 拆分为 13 个命名子接口；8 个 action 模块的 `set: any` 替换为 `StoreApi<StoreState>["setState"]` 类型保护）
- **Rust 后端优化**（搜索逻辑去重消除 81% 重复代码、文件遍历消除双重 I/O、IGNORED_DIRS 从 7 项扩展至 18 项、正则 `OnceLock` 缓存）
- **第七轮全面重构**（25 项修复：App 选择器拆分消除级联重渲染、Error Boundary 防白屏、storage mutex 中毒降级、model-gateway 错误传播、ptyBridge HMR 修复、DiffViewer 拆 4 文件、TerminalPanel 拆 7 文件 + hook、LeftSidebar 拆 5 文件 + 删除 210 行 Mock 死代码、Icon 6 处去重、3 处 useMemo 补充、context-engine 零分配优化、i18n 11 处替换等；cargo test + 183 前端测试全部通过）
- **第八轮全面重构**（重构洞察第二轮 26 项：渲染性能 37→6 字段订阅、rAF 流式批处理、Slice 字段去重、terminalSlice localStorage 异步化、regions.css 8144→6 文件拆分、Vite manualChunks 6 个 vendor chunk、Rust 模型网关优化、run_activity seq 方法等；cargo test + 105 前端测试全部通过）
- **第九轮重构洞察执行**（22 项修复：`cmLanguages` switch→Map O(1)、`save_entity` SQL 预构建消除 `format!` 分配、`presentable_recent_list` 函数拆分；RightPanel 618→106 行提取 2 个 hook、`useTerminalPanel` 54 扁平属性→4 组领域对象、`StoreState` 72 方法→8 领域接口、`MultiWorkspacePanels` 三组件去重共享容器；`workspace/lib.rs` 2361→675 行拆 15 个领域文件、`storage` schema 外部 SQL；`commands/workspace.rs` 821→370 行拆 3 文件；`mock-bridge.ts` 1252 行拆 7 个子模块；`MessageStream` CSS `content-visibility` 虚拟滚动；right-panel/ 目录 panels/editor-support/hooks 分组；StoreState 编译期类型断言；切片依赖文档化；cargo test + 183 前端测试全绿）
- **第十轮重构洞察执行**（11 项修复：22 处 Rust `Regex::new()` → `OnceLock` 缓存；`detect_outline_family` 字符串操作→静态 HashMap O(1)；vue.rs 字节偏移切片消除二次分配；`finalize_outline_items` 单调栈 O(n)；删除 9,714 行死 CSS；`rightpanel.css` 5006→6 文件；`ChangesPanel.tsx` 1343→3 文件；`sendMessage` 拆 3 函数；cargo test + 183 前端测试全绿）
- **多工作区文件选择修复**（解决右侧面板非当前工作区文件点击报错、不同工作区相同文件名同时高亮问题；添加 `selectedFileWorkspaceId` 状态、`openFileForWorkspace` 方法，更新 12+ 相关文件）
- **终端工作区默认终端类型功能修复**（第十四轮）：
  - 修复工作区头部"更多操作"菜单的子菜单功能问题（点击无效、UI不更新、刷新丢失、布局不稳定）
  - 子菜单点击问题：在 `handleClickOutside` 中添加子菜单元素检查
  - UI立即反映：使用 `requestAnimationFrame` 确保 Zustand 更新后再触发 React 重渲染；菜单选择后保持打开
  - localStorage 持久化：在 `setWorkspaceDefaultTerminalProfile` 中添加同步写入
  - useTerminalPanel 闭包问题：使用 `useAppStore.getState()` 获取最新值
  - 菜单布局稳定：将 CSS `min-width` 改为固定 `width`；使用 Flexbox `margin-left: auto` 固定箭头图标位置；修复 `file-tree.css` 和 `files-panel.css` 两处样式定义
  - 修改文件：terminalSlice.ts、WorkspaceTerminalEntry.tsx、useTerminalPanel.ts、file-tree.css、files-panel.css
  - 测试验证：cargo test + 183 前端测试全部通过
- **第十五轮 — 终端层级树状视觉优化**：独立终端常驻、树状层级视觉（缩进/连接线/全宽悬停）、空状态按钮、CSS 架构优化；详见 ai-digital-life/AGENTS.md
- **第十六轮 — 终端面板精细化修复**（10+ 项）：终端导航器 resize handle、xterm 纯黑背景消除、工作区分割线、树连接线修复、hover 高度提升、关闭按钮位置调整；详见 ai-digital-life/AGENTS.md
- **第十七轮 — 架构深度重构**：Rust crate 重组（17→19 crate，新增 adl-outline/adl-context/adl-command/adl-pty，移除 context-engine/prompt-engine）；5 个新前端 Hook（useDragDropWorkspace/usePatchReview/useEditorReveal/useThemeSync/useTaskCenterPolling）；Store 新增 isFetching/setError；shared.ts 7 个新工具函数；useTerminalPanel 拆分 3 子 hook（useTerminalPtyLifecycle/useTerminalDragDrop/useTerminalMenus）；右侧面板 7 个 per-panel hooks；useRightPanelViewProps 300→55 行；DB Arc<Mutex>→r2d2 连接池；EntityTable 宏生成；LRU 缓存简化（移除 access count）；vite.config.ts optimizeDeps 更新；terminalSlice 引用稳定性检查；cargo test + 183 前端测试全部通过
- **第十八轮 — 重构洞察全面修复**：MessageStream 虚拟滚动（react-window）、MessageBlocks React.memo、ui-store.ts deprecated 代码清理、CenterPane 简化；cargo test + 183 前端测试全绿
- **第十九轮 — 架构优化与清理**：terminal/pty crate 职责边界重构（删除 terminal crate，统一使用 pty crate）；修复 src-tauri/Cargo.toml workspace.members；更新相关文件 import（setup.rs/state.rs/patch.rs/task.rs/terminal.rs/command.rs）；所有测试通过
- **第二十轮 — 重构洞察全面修复与优化（2026-05-31）**：
  - 清理 ui-store.ts 中的 deprecated 终端代码（TerminalTabState 类型、空实现函数等）
  - 统一 localStorage 工具函数到 stores/shared.ts（readJson、writeJson、readNumber、writeNumber、readFlag、writeFlag、clamp、createDebouncedWrite 等）
  - 优化 MessageStream 组件的虚拟滚动（useCallback 优化、React.memo 优化等）
  - 统一浏览器功能状态管理到 browserSlice
  - 优化终端 localStorage 批处理机制（通过 createDebouncedWrite 实现高效批量写入）
  - 添加 Rust 后端文件内容缓存（workspace crate 新增 cache.rs 模块，LRU 缓存，最大 100 条目，完整单元测试）
  - 所有 183 个前端测试 + 24 个 Rust 后端测试全部通过
- **第二十一轮 — 浏览器子目录 parentId 传递断链修复（2026-05-31）**：
  - **问题**：从工作区头部行的"更多操作"菜单创建子目录后，子目录出现在"自建目录"而非对应的"工作区目录"下
  - **根因**：4 层回调链（WorkspaceBrowserEntry → MultiWorkspaceBrowser → BrowserPanel → browserSlice）中，`parentId` 参数在 BrowserPanel.handleCreateTabFolder 处被丢弃，导致 `browserCreateTabFolder(name, undefined)` → addChildFolder 添加到根级
  - **修复**：6 处代码修改——① WorkspaceBrowserEntry 类型 `() => void` → `(parentFolderId: string) => void`；② handleCreateSubFolder 传 `workspace.id`；③ MultiWorkspaceBrowser 用传入值替代闭包固定值；④ TabFolderTreeEntry 转发 parentId；⑤ BrowserPanel.handleCreateTabFolder 接收并传递 parentId；⑥ allExpanded 条件移除 `tabs.length > 0 || childFolders.length > 0` 限制
  - **经验教训**：Trae 内置浏览器保留 localStorage，agent-browser 使用独立 Chrome 实例（全新 localStorage），两个环境测试结果可能不一致。调试多层级回调链时必须逐层确认参数传递。
  - **测试验证**：清除 localStorage + 清除 Vite 缓存后，在 Trae 内置浏览器中验证通过

- **第二十二轮 — 文档大纲连接竖线与展开/折叠按钮对齐修复（2026-06-01）**：
  - **问题**：outline 树子级节点的 `::before` 连接竖线（`left:13px`）与 toggle 按钮中心（`20px`）偏差 7px，按钮折线箭尖未对齐竖线
  - **根因**：row 的 `margin-inline-start: -4px` + `padding-inline-start: 8px` 使按钮起始位置在 10px 而非 4px，按钮中心实际在 20px（非直觉的 14px），此前多次猜测 1px 偏差均因未实际测量而错误
  - **修复**：使用 agent-browser 自动化工具精确测量 `getBoundingClientRect()` 后，在 `file-tree.css` 末尾添加 `.adl-outline-tree__children .adl-outline-tree__item::before { left: 20px !important; }`，精确匹配非根节点，根级 `display:none` 不受影响
  - **经验教训**：CSS 像素偏差必须通过 `getBoundingClientRect()` 精确测量，不要凭视觉猜测；`outline-panel.css` 是孤立 CSS 文件不被加载；CSS 特异性冲突和加载顺序影响覆盖效果
  - **验证**：agent-browser 测量 `align:0` + TypeScript 类型检查通过

- **第二十三轮 — 全面重构执行与滚动条修复（2026-06-01）**：
  - **P1 删除死代码**：删除 `frontend/src/main.ts`（935行 vanilla JS 原型入口）
  - **P2 i18n 拆分**：`copy.ts`（1117行）→ `app/i18n/` 25文件/10领域/504 keys，TypeScript `satisfies` 确保中英文 key 完全一致
  - **P3 类型解耦**：`ui-store.ts` 类型迁移到 `stores/types.ts`（14个文件解耦，ToolId/ChatMode/TerminalProfile/FilesNavigatorMode/ChangesNavigatorMode/ContextChip）
  - **P4 消除 as any**：`MessageBlocks.tsx` 11 处 `as any` → discriminated union switch-case 模式
  - **P7 icons 拆分**：`icons.tsx`（814行）→ `app/icons/` 4文件（core/file/actions/status）+ barrel index.ts
  - **P9 空目录清理**：删除 5 个空 features 子目录
  - **P6 Rust Mutex 降级**：10 处 `.expect("mutex poisoned")` → `map_err` 错误传播，应用不再因 Mutex 中毒直接崩溃
  - **P8 audit 批量写入**：Agent run 5 条独立审计写入 → Vec 批量收集 + 统一 flush
  - **P10 browser 错误通道**：`adl-browser` 接入 `AppError`，返回 `IpcResult<T>` 参与统一错误映射
  - **P11 React.memo**：9 个终端/浏览器子组件添加 `React.memo` 减少不必要重渲染
  - **CSS 滚动条溢出修复**：`.adl-multitree` 添加 `position: relative`，消除右面板各导航器（文件/变更/浏览器/终端）自定义滚动条延伸到头部按钮区域的问题
   - **验证**：TypeScript 零错误 + 183 前端测试 + 106 Rust 测试全部通过

### Zustand 切片模式（已完成）

前端状态管理已重构为 Zustand 切片合并模式：

```
app/stores/
├── slicedStore.ts          # 基于切片合并的完整 Store（真源）
├── StoreState.ts           # 完整 StoreState 类型接口
├── types.ts                # 共享类型（ToolId/ChatMode/TerminalProfile/ContextChip 等）
├── slices/                 # 12 个独立切片（含 clipboardSlice + terminalSlice）
│   ├── uiSlice.ts          # UI 状态
│   ├── workspaceSlice.ts    # 工作区状态
│   ├── gitSlice.ts         # Git 状态
│   ├── sessionSlice.ts     # 会话状态
│   ├── editorSlice.ts      # 编辑器状态
│   ├── patchSlice.ts       # 补丁状态
│   ├── searchSlice.ts      # 搜索状态
│   ├── diagnosticSlice.ts  # 诊断状态
│   ├── taskSlice.ts        # 任务状态
│   ├── commandSlice.ts     # 命令状态
│   ├── clipboardSlice.ts   # 剪贴板状态
│   └── terminalSlice.ts    # 终端状态（异步 localStorage）
├── selectors.ts            # 选择器（含 useShallow React Hook 版，避免不必要重渲染）
└── index.ts                # 模块索引
```

4 个遗留独立 Store（`useWorkspaceStore`/`useSessionStore`/`useEditorStore`/`usePatchStore`）已删除。

### 模块化分层（已完成）

前端组件已按功能域重构为 `features/` 目录，大型组件已完成模块化拆分：

```
app/features/
├── file-tree/       # 文件树（FileTree, TreeNodeRow, CustomScrollArea）
├── outline/         # 代码大纲（OutlineTree, outlineModel）
├── patch-review/    # 补丁审查（patchReview 纯函数）
├── editor/          # CodeMirror 编辑器（CodeEditor, cmTheme, cmLanguages...）
├── diff-viewer/     # 差异查看器（路由 + SideBySide + Inline + 共享扩展 + 工具函数）
├── preview/         # 文件预览（MarkdownPreview, DocxPreview, PdfPreview）
├── terminal/        # 终端面板（组合器 + useTerminalPanel hook + 7 子组件）
├── multi-workspace/ # 多工作区共享容器（MultiWorkspaceContainer）
├── browser/         # 浏览器面板（BrowserPanel, BrowserTabBar, 上下文菜单）
└── workspace-*/     # 多工作区树（file-tree / changes-tree / terminal）

app/i18n/            # 国际化拆分（25 文件 / 10 领域 / 504 keys，TypeScript satisfies 类型安全）
├── zh-CN/           # 中文翻译（10 领域）
├── en-US/           # 英文翻译（10 领域，satisfies 确保 key 与 zh-CN 完全一致）
└── types.ts         # CopyDict / Locale 类型

app/icons/           # SVG 图标拆分（4 文件 + barrel index.ts）
├── core.tsx         # 品牌 / 窗口 / 面板 / 导航图标
├── file.tsx         # 文件类型图标
├── actions.tsx      # 操作按钮图标
└── status.tsx       # 状态 / 主题 / 技术图标

regions/left-sidebar/  # 左侧边栏拆分（WorkspaceList/SessionList/ConversationPanel/ResizeHandle/SidebarContextMenu）

regions/right-panel/   # 右侧面板区域
├── panels/            # 面板视图（FilesPanel/ChangesPanel/BrowserPanel）
├── editor-support/    # 编辑器插件（agentDecorations/stickyContext/cmWrapColumn）
└── hooks/             # 布局与视图属性 hooks（useRightPanelLayout/useRightPanelViewProps）
```

详见 [docs/重构洞察/refactor-insight-2026-05-21.md](./docs/重构洞察/refactor-insight-2026-05-21.md)

### 重构完成状态

| 轮次 | 内容 | 日期 |
|------|------|------|
| 第一轮 | Zustand 切片定义（创建 10 个切片） | 2026-05-20 |
| 第二轮 | 切片合并 + 性能优化（Rust DRY、搜索 debounce 等） | 2026-05-21 |
| 第三轮 | CSS Token 迁移 + 模块化分层 + 错误码统一 | 2026-05-21 |
| 第四轮 | 重构洞察验证与修复（消除 `as any`、LRU 优化、SSE 管理等） | 2026-05-21 |
| 第五轮 | CodeMirror 双实例 bug 修复（`@codemirror/state` 显式依赖 + `optimizeDeps.include`） | 2026-05-22 |
| 第六轮 | Store 拆分 + 桥接模块化 + Rust 优化 | 2026-05-22 |
| **第七轮** | **25 项全面修复 + 3 大型组件拆分 17 文件** | **2026-05-23** |
| **第八轮** | **重构洞察第二轮 26 项（渲染性能 + 模块化 + 架构治理 + Rust 改进）** | **2026-05-23** |
| **第九轮** | **重构洞察执行 22 项（Rust 长文件拆分 + 前端组件重构 + 目录治理 + 性能优化）** | **2026-05-24** |
| **第十轮** | **重构洞察执行 11 项（OnceLock 缓存、HashMap O(1)、死 CSS 删除等）** | **2026-05-24** |
| **第十一轮** | **ChangesPanel 组件提取（3 组件 → features/patch-review）** | **2026-05-25** |
| **第十二轮** | **阶段 3 组件架构拆分（4 个大型模块 → 12 个独立文件）** | **2026-05-25** |
| **第十三轮** | **God Function 拆分 + UI 复原修复** | **2026-05-25** |
| **第十四轮** | **终端工作区默认终端类型功能修复** | **2026-05-26** |
| **第十五轮** | **终端层级树状视觉优化** | **2026-05-26** |
| **第十六轮** | **终端面板精细化修复（10+ 项）** | **2026-05-26** |
| **第十七轮** | **架构深度重构（Rust crate 重组 17→19、Store 增强、5 个新 Hook、DB 连接池等）** | **2026-05-28** |
| **第十八轮** | **重构洞察全面修复（MessageStream 虚拟滚动、RightPanel 优化、App 组件拆分、运行活动 LRU 等）** | **2026-05-29** |
| **第十九轮** | **重构洞察修复计划（代码清理、架构优化、terminal crate 删除）** | **2026-05-30** |
| **第二十轮** | **重构洞察全面修复与优化（代码清理、工具函数统一、缓存添加、性能优化）** | **2026-05-31** |
| **第二十一轮** | **浏览器子目录 parentId 传递断链修复（6 处修复 + allExpanded 展开逻辑修复）** | **2026-05-31** |
| **第二十二轮** | **文档大纲连接竖线与展开/折叠按钮对齐修复（CSS 选择器 + agent-browser 精确测量）** | **2026-06-01** |
全部详情见 [重构进度报告](./docs/重构洞察/REFACTORING_PROGRESS_REPORT.md)

### 排除项

以下能力**禁止**在当前阶段引入：

| 排除项 | 原因 |
|--------|------|
| 多 Agent DAG | Phase 2+ |
| MCP 协议 | Phase 2+ |
| 插件市场 | Phase 2+ |
| 浏览器自动化运行时 | Phase 2+ |
| 复杂云协作 | Phase 3+ |

详见 [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md)

## 禁止项

- WebView 直接触达系统能力（必须通过 Tauri Command）
- 低层 crate 依赖高层 crate
- 凭据写入普通配置或日志（必须使用 OS keyring）
- 使用原生 HTML `title` 属性（必须使用 `TooltipSimple` 组件）
- UI/UX 或功能变更后跳过红绿测试
- 在 capability 文件中使用 `"all"` / `"**"` 通配权限
- 功能或显示效果仅在 Tauri 或浏览器单一模式下可用（必须双端一致）

## 双端一致性原则

所有功能实现、显示效果和交互行为必须在 **Tauri 桌面应用** 和 **浏览器模式**（内置预览 / 外部浏览器）中保持一致。

### 架构机制

| 机制 | 说明 |
|------|------|
| `DigitalLifeBridge` | 统一 IPC 抽象层，Tauri 模式走 `createTauriBridge()`，浏览器模式走 `setupPreviewBridge()` |
| `isTauriShell()` | 运行时环境检测，用于条件渲染平台专属 UI |
| `data-shell` 属性 | `<html data-shell="tauri|browser">`，CSS 可据此适配样式 |
| `preview-bridge.ts` | 浏览器模式桥接层，通过 Vite Preview API 提供真实文件系统访问 |
| `mock-bridge.ts` | 纯内存模拟数据，作为 preview-bridge 的基础回退 |

### 差异允许清单

以下差异是**允许的**，因为它们属于平台原生能力的合理映射：

| 差异 | Tauri 模式 | 浏览器模式 | 原因 |
|------|-----------|-----------|------|
| 窗口控制按钮 | 显示（最小化/最大化/关闭） | 显示但无实际操作效果 | 浏览器不支持窗口操作，保持 UI 一致性 |
| 窗口拖拽区域 | `data-tauri-drag-region` 启用 | 禁用拖拽 | 浏览器无自定义标题栏拖拽 |
| 窗口图标同步 | `syncTauriWindowIcon()` | 跳过 | 浏览器使用 favicon |
| 目录选择器 | 原生对话框 | Vite Preview API | 平台限制 |

### 新增功能检查清单

引入新功能或修改现有功能时，必须确认：

- [ ] Tauri 模式和浏览器模式下功能是否一致？
- [ ] 是否有 `isTauriShell()` 条件分支？如有，浏览器模式是否有等效替代？
- [ ] CSS 是否依赖 Tauri 专属属性（如 `-webkit-app-region`）？如有，浏览器模式是否有降级？
- [ ] 新增 IPC 方法是否在 `mock-bridge.ts` 和 `preview-bridge.ts` 中同步实现？

## 真源定位

| 内容 | 真源位置 |
|------|----------|
| 项目级治理 | `AGENTS.md` |
| 实现侧治理 | `ai-digital-life/AGENTS.md` |
| 架构文档 | `ai-digital-life/docs/architecture/` |
| 设计系统 | `ai-digital-life/docs/design-system/` |
| 开发约束 | `docs/development/` |
| IPC 契约 | `ai-digital-life/frontend/src/shared/ipc.ts` |
| 进程边界 | `ai-digital-life/src-tauri/`、`ai-digital-life/crates/` |
| UI 测试 | `UIOperationManual/`、`.trae/skills/browser-automation/` |
| 重构进度 | `docs/重构洞察/REFACTORING_PROGRESS_REPORT.md` |

## 相关文档

- [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md) - 远期规划
- [docs/development/agent-routing.md](./docs/development/agent-routing.md) - Agent 路由
- [docs/development/hook-policy.md](./docs/development/hook-policy.md) - Hook 策略
- [docs/development/project-engineering-constraints.md](./docs/development/project-engineering-constraints.md) - 工程约束
- [docs/重构洞察/REFACTORING_PROGRESS_REPORT.md](./docs/重构洞察/REFACTORING_PROGRESS_REPORT.md) - Zustand 切片模式重构报告
