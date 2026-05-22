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
- **文件树右键菜单**（文件/变更面板通用）：打开方式、在文件资源管理器中显示、复制完整/相对路径、剪切、复制、粘贴（自动冲突处理 `-copyN`）、内联重命名、回收站删除
- **上下文菜单系统**：统一 `ContextMenu` 组件（Portal 渲染、图标/分隔线/danger 样式）、`ConfirmDialog`（删除确认）、`RenameInput`（内联重命名）
- **剪贴板切换**：Zustand `clipboardSlice`，支持跨面板 cut/copy/paste
- **回收站删除**：Rust `trash` crate（Tauri） + PowerShell `Microsoft.VisualBasic`（浏览器），文件/目录安全删除到回收站

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
├── shared.ts / cacheUtils.ts    # 共享工具
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
