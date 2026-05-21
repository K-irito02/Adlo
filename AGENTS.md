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
- **Zustand 切片模式重构**（11 个独立切片 + 完整类型安全，消除 11 处 `as any`）
- **模块化分层重构**（7 个功能模块迁移到 `features/` 目录）
- **CSS 设计 Token 迁移**（亮暗主题 Shadow token + TypeScript 类型定义）
- **统一错误码枚举**（`IpcErrorCode` 跨桥接层统一）
- **重构洞察验证与修复**（消除 11 处 `as any`、错误粒度、SSE 连接管理、LRU 缓存优化、缓存短路、Send+Sync 断言、路径分隔符抽取等 20+ 项改进）
- **CodeMirror 双实例 bug 修复**（解决 `@codemirror/state` `instanceof` 检查失败：添加显式依赖 + Vite `optimizeDeps.include` 强制预捆绑为单例）
- **Store 拆分与桥接模块化**（`slicedStore.ts` 1465→87 行，拆分为 8 个 action 领域模块；`preview-bridge.ts` 615 行拆分为 4 个关注点分离的模块；`DigitalLifeBridge` 拆分为 13 个命名子接口；8 个 action 模块的 `set: any` 替换为 `StoreApi<StoreState>["setState"]` 类型保护）
- **Rust 后端优化**（搜索逻辑去重消除 81% 重复代码、文件遍历消除双重 I/O、IGNORED_DIRS 从 7 项扩展至 18 项、正则 `OnceLock` 缓存）

### Zustand 切片模式（已完成）

前端状态管理已重构为 Zustand 切片合并模式：

```
app/stores/
├── slicedStore.ts          # 基于切片合并的完整 Store（真源）
├── StoreState.ts           # 完整 StoreState 类型接口
├── slices/                 # 11 个独立切片（含 clipboardSlice）
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
│   └── clipboardSlice.ts   # 剪贴板状态
├── selectors.ts            # 选择器（含 useShallow React Hook 版，避免不必要重渲染）
└── index.ts                # 模块索引
```

4 个遗留独立 Store（`useWorkspaceStore`/`useSessionStore`/`useEditorStore`/`usePatchStore`）已删除。

### 模块化分层（已完成）

前端组件已按功能域重构为 `features/` 目录：

```
app/features/
├── file-tree/       # 文件树（FileTree, TreeNodeRow, CustomScrollArea）
├── outline/         # 代码大纲（OutlineTree, outlineModel）
├── patch-review/    # 补丁审查（patchReview 纯函数）
├── editor/          # CodeMirror 编辑器（CodeEditor, cmTheme, cmLanguages...）
├── diff-viewer/     # 差异查看器（DiffViewer, changePreviewDiffRanges）
├── preview/         # 文件预览（MarkdownPreview, DocxPreview, PdfPreview）
└── terminal/        # 终端面板（TerminalPanel）
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
