# AI Digital Life - 实现工作区规则

本目录是 `AI Digital Life` 的真实实现工作区，基于 **Rust + Tauri 2.x**。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Rust stable + Tauri 2.x + tokio + rusqlite + serde + tracing |
| 前端 | React 19 + Vite + Zustand + TypeScript + CodeMirror 6 + xterm.js |
| 桥接 | `#[tauri::command]` + `@tauri-apps/api` |
| 打包 | `cargo tauri build` |
| 包管理 | pnpm（前端）/ Cargo（Rust） |
| Rust 质量 | `cargo clippy` + `cargo fmt` + `rustfmt.toml` + `clippy.toml` |
| 前端质量 | ESLint v9（flat config）+ Prettier + TypeScript-ESLint + React Hooks plugin |
| Rust Lint 执行命令 | `cargo clippy --workspace --all-targets` | |
| 前端全量检查执行命令 | `cd frontend && npx eslint . && npx tsc --noEmit` | |
| CI/CD | GitHub Actions | `.github/workflows/quality-gates.yml` |
| 凭据存储 | `crates/credential/`（keyring + 加密文件降级） | `ai-digital-life/Cargo.toml` |

## 当前阶段

**Phase 0 底座** + **Phase 2 单 Agent 薄切片**：

- Tauri 桌面壳、SQLite 状态
- 工作区与对话、补丁预览/应用/回滚
- 模型网关（含流式与取消）
- 命令治理与终端流式输出
- xterm.js 交互式终端（多会话 PTY，支持 CMD / PowerShell / Bash）
- CodeMirror 编辑器系统 + 文件预览 + 差异查看器（inline/side-by-side）
- 内置浏览器（Tauri WebView / iframe 双模式 + 新建标签对话框）
- Zustand 切片模式（13 切片 + 11 action 模块）+ 模块化分层（features/ + regions/）
- CSS 设计 Token 亮暗主题 + 自定义 Tooltip + 自定义滚动条
- i18n 国际化（10 领域 / 529 keys，TypeScript satisfies 类型安全）

### 重构历史

共完成 **42 轮**迭代重构，详情见 [根目录 AGENTS.md](../AGENTS.md#重构历史)。

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

```
app/stores/
├── slicedStore.ts               # 切片合并 Store（真源）
├── StoreState.ts                # 完整类型接口
├── types.ts                     # 共享类型（ToolId/ChatMode/TerminalProfile/ContextChip）
├── shared.ts                    # 共享工具函数
├── selectors.ts                 # 性能选择器（useShallow）
├── slices/                      # 13 个独立切片
│   ├── uiSlice.ts / workspaceSlice.ts / gitSlice.ts
│   ├── sessionSlice.ts / editorSlice.ts / patchSlice.ts
│   ├── searchSlice.ts / diagnosticSlice.ts / taskSlice.ts
│   ├── commandSlice.ts / clipboardSlice.ts / terminalSlice.ts
│   ├── browserSlice.ts
│   └── communicateSlice.ts          # 通信面板（GitHub CI / 飞书 / QQ / 微信 / 邮箱）
└── actions/                     # 11 个跨切片 action 模块
    ├── workspaceActions.ts / sessionActions.ts / editorActions.ts
    ├── patchActions.ts / gitActions.ts / fetchActions.ts
    ├── streamActions.ts / generalActions.ts / searchActions.ts
    ├── taskActions.ts / commandActions.ts
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `frontend/src/app/stores/slicedStore.ts` | 切片合并 Store（真源） |
| `frontend/src/app/stores/StoreState.ts` | 完整类型接口 |
| `frontend/src/app/stores/selectors.ts` | 性能选择器（useShallow） |
| `frontend/src/shared/preferencesMerger.ts` | 模型配置合并共享函数（桥接层使用） |

## 文档入口

- [README.md](./README.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [docs/architecture/system-overview.md](../docs/architecture/system-overview.md)
- [docs/design-system/README.md](../docs/design-system/README.md)

## 调试工具

| 功能 | 说明 |
|------|------|
| 日志收起器 | `frontend/src/app/utils/debugLogCollector.ts`，拦截所有 console 输出，自动收起存储 |
| 复制按钮 | 页面右上角可拖拽"复制调试日志"按钮 |
| 自动写入 | Tauri 模式 `debug-logs.txt`，浏览器模式 `debug-logs-browser.txt`（均写入项目根目录） |
| 后端命令 | `src-tauri/src/commands/app.rs` → `write_debug_logs_to_project` |
| 浏览器后端 | `frontend/dev/previewWorkspaceService.ts` → `writeDebugLogs` |

**优先级**：调试日志收起器是最高优先级的调试手段，遇到 UI/交互问题时优先使用。详见 [仓库根 AGENTS.md](../AGENTS.md#调试工具)。

## 相关文件

- [仓库根 AGENTS.md](../AGENTS.md) — 项目治理规则
- [FUTURE-ROADMAP.md](../FUTURE-ROADMAP.md) — 远期规划
