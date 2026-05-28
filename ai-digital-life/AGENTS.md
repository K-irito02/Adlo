# AI Digital Life - 实现工作区规则

本目录是 `AI Digital Life` 的真实实现工作区，基于 **Rust + Tauri 2.x**。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Rust stable + Tauri 2.x + tokio + rusqlite + serde + tracing |
| 前端 | React 19 + Vite + Zustand + TypeScript + CodeMirror 6 + xterm.js |
| 桥接 | `#[tauri::command]` + `@tauri-apps/api` |
| 打包 | `cargo tauri build` |
| 包管理 | npm（前端）/ Cargo（Rust） |

## 当前阶段

**Phase 0 底座** + **Phase 2 单 Agent 薄切片**：

- Tauri 桌面壳、SQLite 状态
- 工作区与对话、补丁预览/应用/回滚
- 模型网关（含流式与取消）
- 命令治理与终端流式输出
- xterm.js 交互式终端（多会话 PTY，支持 CMD / PowerShell / Bash）
  - Tauri 桌面模式：Rust `portable-pty`（ConPTY）
  - 浏览器预览模式：`node-pty`（ConPTY/WinPTY），替代之前 `child_process.spawn` 的编码 hack
- **重构完成（第八轮）**：26 项全面修复，包括渲染性能（App 选择器下沉 37→6 字段、streaming rAF 批处理）、CSS 架构（regions.css 8144→6 文件）、Vite 代码分割、Rust 后端去重优化
- **第九轮 — 右侧面板多工作区改造**：
  - **Changes 面板多工作区化**：引入 `MultiWorkspaceChangesTree` + `WorkspaceChangesEntry`，每个工作区展开后显示其 git 变更（tree/list/outline 三模式）；两行导航器布局；展开/折叠全部；统计数字；hover 按钮（刷新/置顶/更多操作）
  - **Terminal 面板多工作区化**：引入 `MultiWorkspaceTerminal` + `WorkspaceTerminalEntry`，工作区分组终端标签；两行导航器布局；hover 按钮（刷新/删除全部/创建终端/更多操作）
  - **统一导航器布局**：Files/Changes/Terminal 三个面板共用 Row1/Row2 两行工具栏范式
  - **全栈 workspace-aware diff 预览**：Rust Tauri Command 添加可选 `workspace_path`，IPC 新增 `getChangePreviewForWorkspace`，Store 新增 `openChangePreviewForWorkspace` action，组件回调链传递 workspace 上下文（涉及 10 个文件）
  - **终端默认 profile 设置菜单**：hover 展开子菜单卡片，显示 ✓ 标记，即时响应 store 变化
  - **CustomScrollArea 修复**：收起工作区后滚动条残留问题 — 监听 `children` 变化触发 `updateScrollbar`
  - **刷新语义分离**：`loadGitSnapshot`（惰性加载）+ `refreshGitSnapshot`（强制刷新）
  - **统计数字系统**：每个工作区头部行显示变更文件数/终端标签数，hover 时隐藏让位给操作按钮
  - **统一菜单文本**：三个面板的移除菜单全部统一为"从此区域移除不显示"
- **第十轮 — 重构洞察全面修复**（11 项）：22 处 Rust `Regex::new()` → `OnceLock` 缓存；`detect_outline_family` 字符串操作→静态 HashMap O(1)；vue.rs 字节偏移切片消除二次分配；`finalize_outline_items` 单调栈 O(n)；删除 9,714 行死 CSS；`rightpanel.css` 5006→6 文件；`ChangesPanel.tsx` 1343→3 文件；`sendMessage` 拆 3 函数；cargo test + 183 前端测试全绿
- **多工作区文件选择修复**：解决右侧面板非当前工作区文件点击报错、不同工作区相同文件名同时高亮问题；添加 `selectedFileWorkspaceId` 状态、`openFileForWorkspace` 方法，更新 12+ 相关文件
- **文件树右键菜单**（文件/变更面板通用）：打开方式、在文件资源管理器中显示、复制完整/相对路径、剪切、复制、粘贴（自动冲突处理 `-copyN`）、内联重命名、回收站删除
- **上下文菜单系统**：统一 `ContextMenu` 组件（Portal 渲染、图标/分隔线/danger 样式）、`ConfirmDialog`（删除确认）、`RenameInput`（内联重命名）
- **剪贴板切换**：Zustand `clipboardSlice`，支持跨面板 cut/copy/paste
- **回收站删除**：Rust `trash` crate（Tauri） + PowerShell `Microsoft.VisualBasic`（浏览器），文件/目录安全删除到回收站
- **第十一轮 — ChangesPanel 组件提取**（3 组件 → `features/patch-review` 模块）：采用渐进式内部组件模式，将 `PatchHunkCard`（hunk 级别决策卡片）、`PatchFileCard`（文件级聚合卡片）、`PatchReviewSummary`（补丁摘要统计+过滤操作栏）从 ChangesPanel.tsx 提取到独立的模块文件；`patch-review/index.ts` 统一导出所有类型和组件；类型检查零错误；6 条经验教训记录于重构洞察文档
- **第十二轮 — 阶段 3 组件架构拆分**（4 个大型模块 → 12 个独立文件）：
  - **P1 ChangesPanel.tsx**（1037 行）：提取 `ChangesTreePanel.tsx`（导航器）+ `ChangesConfirmDialogs.tsx`（确认对话框/重命名输入）；主组件降至 ~870 行
  - **P2 CenterPane.tsx**（629 行）：提取 `ApprovalInlineCard.tsx` + `WelcomeState.tsx` + `ComposerFooter.tsx` + barrel `index.ts`；主组件降至 ~360 行
  - **P3 StatusBar.tsx**（588 行）：提取 `StatusBar/utils.tsx`（6 个辅助函数：modelLabel、gitIcon、gitStatusLabel、modelHealthLabel、modelHealthTone、isDirtyWorktree）
  - **P4 useTerminalPanel.ts**（519 行）：提取 `useTerminalContextMenu.ts`（上下文菜单状态 + 5 个回调）
  - **测试回归**：outlinePanelWiring.test.ts 因文件拆分需同步更新引用路径；所有 183 项测试通过
- **第十三轮 — 剩余工作收尾 + UI 复原**：
  - **R1 agent.rs God Function 拆分**（334 行→6 个函数 + 12 行编排）：`make_activity_emitter` / `prepare_run` / `collect_context` / `call_model` / `generate_patches` / `finalize_run`；克服 `impl Fn` async Send 约束问题，方案为值传递 + String 所有权；`cargo check` + 44 测试通过
  - **R2 PromptInput 回滚**：`PromptInput` 缺少项目 CSS 样式导致 UI 破坏，回滚至原始 `contentEditable` + 自定义光标，删除约 150 行死代码
  - **R3 ChangesPanel 暂缓**：剩余 JSX（~250 行）需传递 30+ props，耦合度高，暂缓提取
  - **R4 工作区选择分离**：核心逻辑已在前序重构完成（`switchToWorkspace` action + 配线），无需额外操作
  - **UI 复原修复**：3 处 UI 被破坏—① ComposerFooter 输入框样式丢失；② ChangesTreePanel 导航器按钮消失；③ CenterPane refs/events/effects 被误删。全部恢复并通过验证
- **第十四轮 — 终端工作区默认终端类型功能修复**：
  - 修复工作区头部"更多操作"菜单的子菜单功能问题（点击无效、UI不更新、刷新丢失、布局不稳定）
  - 子菜单点击问题、UI 立即反映、localStorage 持久化、useTerminalPanel 闭包问题、菜单布局稳定
  - 修改文件：terminalSlice.ts、WorkspaceTerminalEntry.tsx、useTerminalPanel.ts、file-tree.css、files-panel.css
  - 测试验证：cargo test + 183 前端测试全部通过
- **第十五轮 — 终端层级树状视觉优化**：
  - **独立终端常驻**：独立终端工作区（`__independent__`）始终渲染，删除所有终端后头部行仍显示
  - **树状层级视觉**：终端工作区使用与文件树一致的 CSS 树节点视觉语言——缩进（14px）、树连接线（`::before`）、全宽悬停背景
  - **空状态按钮**：居中同行布局，hover 灰色背景与左右边缘贴合，直角样式
  - **终端标签精简**：移除额外描述信息，类型名缩小至 12px，标签高度与头部行一致（24px）
  - **独立终端专用**：删除头部行多余终端图标；始终显示"更多操作"按钮（菜单中隐藏"从此区域移除"选项）
  - **CSS 架构**：`file-tree.css` 通过 `rightpanel.css` 导入生效（此前为孤立 CSS）；使用 `box-sizing: border-box` 实现 padding 自包含的 hover 扩展
  - **修改文件**：file-tree.css（完整终端树 CSS）、MultiWorkspaceTerminal.tsx（添加 `adl-multitree--terminal` class）、WorkspaceTerminalEntry.tsx（条件渲染+图标删除）、rightpanel.css（添加 `@import`）
  - **测试验证**：cargo test + 183 前端测试全部通过
- **第十八轮 — 内置浏览器双模式实现**（2026-05-28）：
  - **Rust 新增**：新增 `crates/browser` crate，`BrowserManager` 封装 Tauri child WebView 生命周期（8 个方法：create/destroy/navigate/goBack/goForward/reload/setBounds/eval）；注册 8 个 `#[tauri::command]` IPC 命令
  - **前端桥接**：在 `DigitalLifeBridge` 中新增 `BrowserBridge` 子接口（navigate/goBack/goForward/reload/onUrlChanged）
  - **双模式 iframe 降级**：浏览器预览模式使用 `<iframe>` 直连 + 前端历史栈（50 条）+ "在外部浏览器打开"浮动按钮
  - **地址栏体验修复**：移除 `onMouseLeave` 折叠逻辑，仅通过 `onBlur` 折叠
  - **Tauri 特有操作**：WebView 创建/销毁/边界同步通过 `safeInvoke`（`isTauriShell()` 守卫 + 动态 `import()`）
  - **CSP 更新**：`tauri.conf.json` CSP 放宽支持外部资源（img/media/frame/connect-src）
  - **测试验证**：cargo check + 183 前端测试全部通过
- **第十六轮 — 终端面板精细化修复**（10+ 项）：
  - **终端导航器 resize handle**：在内联 `<aside>` 中添加 `adl-tool-navigator__resize-handle`，利用已有的 `handleNavigatorResizeStart` 回调实现导航器宽度拖拽调整（如文件/变更面板）
  - **xterm 纯黑背景消除**：多层覆盖 xterm.js 内部 `background:#000`——`.xterm`（`transparent !important`）、`.xterm-viewport`、`.xterm-screen`、`canvas`、`.xterm-scroll-area`；padding 移至 canvas 容器以控制间隙背景为 `var(--bg)`
  - **工作区分割线**：恢复 `border-bottom: 1px solid var(--border-subtle)` 于工作区头部行之间
  - **独立终端树连接线**：移除 `first-child > .adl-multitree-entry__tree::before` 的 display:none，所有工作区显示连接竖线
  - **空状态 + 图标位置**：删除 `gap`，用 `svg:first-child { margin-left: 6px }` 单独控制图标位置
  - **hover 背景高度**：标签/空按钮 `min-height` 从 24px 提升至 28px
  - **关闭按钮位置**：恢复 `<li>` 的 `padding: 0 8px 0 14px`（右侧 8px 内边距）避免关闭按钮太靠右
  - **修改文件**：TerminalPanel.tsx（resize handle）、terminal-panel.css（xterm 背景+padding）、file-tree.css（分割线/hover 高度/关闭按钮/图标位置）
  - **测试验证**：cargo test + 183 前端测试全部通过
- **第十七轮 — 架构深度重构**：
  - **Rust crate 重组**：was 17, now 19。REMOVED `crates/context-engine/`（adl-context-engine）、`crates/prompt-engine/`（adl-prompt-engine）。ADDED `crates/outline/`（adl-outline）、`crates/context/`（adl-context）、`crates/command/`（adl-command）、`crates/pty/`（adl-pty）。`workspace/src/outline/` 提取为独立 crate `adl-outline`
  - **Frontend 精简**：App.tsx 447→203 行；5 个新 Hook——`useDragDropWorkspace`、`usePatchReview`、`useEditorReveal`、`useThemeSync`、`useTaskCenterPolling`；删除 7 个 right-panel barrel 文件；删除 `cacheUtils.ts`
  - **Store 增强**：新增 `isFetching` 状态 + `setError` action；`shared.ts` 新增 7 个工具函数（`postMutationRefresh`、`batchExpandAll`、`expandSingle`、`createLazyLoader`、`clearError`、`captureError`、`setError`）
  - **Terminal hook 拆分**：`useTerminalPanel` 547→290 行，提取 3 个子 hook——`useTerminalPtyLifecycle`、`useTerminalDragDrop`、`useTerminalMenus`
  - **右侧面板 hooks**：7 个 per-panel hooks 创建；`useRightPanelViewProps` 300→55 行
  - **DB 连接池**：`Arc<Mutex<Connection>>` → r2d2 连接池
  - **EntityTable 宏生成**：数据访问层宏简化
  - **kernel domain 模块**：新增 `crates/kernel/src/domain/`
  - **Loading 性能测试**：更新
  - **vite.config.ts**：`optimizeDeps.include` 更新
  - **LRU 缓存简化**：移除 access count 逻辑
  - **terminalSlice 引用稳定性检查**：添加检查防止闭包引用过期
  - **测试验证**：cargo test + 183 前端测试全部通过

**不在本目录实现**：多 Agent DAG、MCP、插件市场、云协作等 Phase 2+ 能力。

## 安全边界

| 层 | 允许 | 禁止 |
|----|------|------|
| Rust Backend | 文件系统、SQLite、模型请求、凭据 | 直接操作 DOM |
| WebView | UI 渲染、状态编排、订阅事件 | 直接访问系统能力、密钥、原始 SQL |

跨进程能力通过 `#[tauri::command]` + `capabilities/*.json` 白名单暴露。

## 双端一致性

应用同时运行于 Tauri 桌面和浏览器模式，所有功能必须双端可用。

| 检测方式 | 说明 |
|----------|------|
| `isTauriShell()` | 运行时环境检测 |
| `data-shell="tauri\|browser"` | HTML 根元素属性，CSS 适配用 |

新增 IPC 方法时，必须同步实现：
- `tauri-bridge.ts`（Tauri 模式）
- `preview-bridge/`（浏览器模式，Vite Preview API）
- `mock-bridge.ts`（纯内存回退）

## 命令规范

- 新 Tauri Command 必须类型化（`serde`）、登记到 `capabilities/*.json`
- 返回 `Result<T, AppError>` 结构化错误
- SQLite schema 变更必须附带迁移脚本

## 设计系统约束

| 约束 | 规则 |
|------|------|
| 颜色 | 必须使用 CSS 自定义属性 `var(--…)` |
| 图标 | SVG 格式，继承 `currentColor`，禁止 emoji |
| Tooltip | 禁止原生 `title`，必须使用 `TooltipSimple` |
| 窗口 | 最小宽度 640px |

详见 [docs/design-system/](../docs/design-system/)

## Stores 架构（Zustand 切片合并模式）

前端状态管理采用 Zustand 切片合并模式：

```
app/stores/
├── slicedStore.ts               # 基于切片合并的完整 Store（真源，~87 行）
├── StoreState.ts                # 完整 StoreState 类型接口（interface extends）
├── slices.ts                    # 统一导出所有切片
├── selectors.ts                 # 选择器（含 useShallow React Hook 版本）
├── shared.ts                    # 共享工具（新增 7 个 util：postMutationRefresh/batchExpandAll/expandSingle/createLazyLoader/clearError/captureError/setError）
├── index.ts                     # 模块索引
├── slices/                      # 12 个独立切片
│   ├── uiSlice.ts               # UI 状态
│   ├── workspaceSlice.ts         # 工作区状态（含 indexStatus/repoMap）
│   ├── gitSlice.ts              # Git 状态
│   ├── sessionSlice.ts          # 会话状态（含 rAF 批处理流式文本）
│   ├── editorSlice.ts           # 编辑器状态
│   ├── patchSlice.ts            # 补丁状态
│   ├── searchSlice.ts           # 搜索状态（含 300ms debounce）
│   ├── diagnosticSlice.ts       # 诊断状态
│   ├── taskSlice.ts             # 任务状态
│   ├── commandSlice.ts          # 命令状态
│   ├── clipboardSlice.ts        # 剪贴板状态
│   └── terminalSlice.ts         # 终端状态（异步 localStorage）
├── actions/                     # 8 个跨切片 action 模块
│   ├── workspaceActions.ts      # 工作区操作
│   ├── sessionActions.ts        # 会话操作
│   ├── editorActions.ts         # 编辑器操作
│   ├── patchActions.ts          # 补丁操作
│   ├── gitActions.ts            # Git 操作
│   ├── fetchActions.ts          # 数据拉取操作
│   ├── streamActions.ts         # 流式消息操作
│   └── generalActions.ts        # 通用操作
└── (已删除)                     # 4 个 @deprecated 遗留独立 Store
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `frontend/src/app/stores/slicedStore.ts` | 切片合并 Store（真源） |
| `frontend/src/app/stores/StoreState.ts` | 完整类型接口 |
| `frontend/src/app/stores/selectors.ts` | 性能选择器（useShallow） |
| `frontend/src/utils/preferencesMerger.ts` | 模型配置合并共享函数 |

## 文档入口

- [README.md](./README.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [docs/architecture/system-overview.md](../docs/architecture/system-overview.md)
- [docs/design-system/README.md](../docs/design-system/README.md)

## 相关文件

- [仓库根 AGENTS.md](../AGENTS.md)
- [FUTURE-ROADMAP.md](../FUTURE-ROADMAP.md)
