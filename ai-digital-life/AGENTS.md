# AI Digital Life Codebase Rules

本目录是 `AI Digital Life` 的真实实现工作区，基于 **Rust + Tauri 2.x**，继续受仓库根 [AGENTS.md](/E:/Programs/Obsidian/notes/AGENTS.md) 和 `docs/development/`* 约束。

## 当前阶段

- 当前规划覆盖 **Phase 0 底座** 与 **阶段二（Phase 2）单 Agent 薄切片**：Tauri 桌面壳、SQLite 状态、工作区与对话、补丁预览/应用/回滚、模型网关（含流式与取消）、命令治理与**终端流式输出**（Rust 后端执行、WebView 仅订阅白名单事件）
- WebView 禁止直接接触文件系统、子进程、SQL 与模型密钥；跨进程能力通过 `#[tauri::command]` + `capabilities/*.json` 白名单暴露
- 不在本目录默认实现多 Agent DAG、MCP、插件市场（见阶段二排除项）

## 技术栈

- **后端 crate**：Rust stable + Tauri 2.x + tokio + rusqlite + serde + tracing + notify + reqwest + keyring
- **前端**：React 19 + Vite + Zustand + TypeScript（在 Tauri WebView 中运行）
- **桥接**：`#[tauri::command]` + `@tauri-apps/api` 的 `invoke()` 与 `listen()`
- **打包**：`cargo tauri build`

## 本目录的额外要求

- 架构、技术栈、状态真相源变化必须同步 `docs/architecture/`*
- 与规划仓约束不一致时，先更新规划文档，再更新实现
- WebView 不直接接触系统原语、SQL、文件写入或命令执行
- 新 Tauri Command 必须类型化（输入/输出经 `serde`）、登记到 `capabilities/*.json`，并返回 `Result<T, AppError>` 结构化错误
- SQLite schema 变化必须附带迁移脚本（`crates/migration`）和测试
- Retrieval 相关改动必须保证状态外显、`tokio::spawn` 隔离和可恢复

## 设计系统约束

- 组件必须使用 CSS 自定义属性（`var(--…)`），禁止硬编码颜色值
- 图标必须使用 SVG 格式并继承 `currentColor`，禁止使用 emoji
- 所有交互控件必须提供完整的交互状态（default / hover / focus-visible / active / disabled / loading）
- WebView 不得直接修改持久化的主题状态，必须通过 Tauri Command（如 `app_update_preferences`）
- 颜色方案（color scheme）是前端偏好，存储在 WebView `localStorage`
- 桌面端最小支持窗口宽度为 640px
- 所有公共设计系统辅助函数必须有测试覆盖（前端 `vitest`）
- **禁止使用原生 HTML `title` 属性**，必须使用 `TooltipSimple` 组件
- UI/UX 或功能变更后必须执行全量红绿测试（`cargo test --workspace` + 前端 `vitest`）

## Tooltip 组件

- 便捷 API：`<TooltipSimple content="提示文本" placement="top">...</TooltipSimple>`
- 组合 API：`<Tooltip>` + `<TooltipTrigger>` + `<TooltipContent>`
- 核心文件：`frontend/src/app/components/Tooltip.tsx`、`hooks/useTooltip.ts`、`utils/tooltipPosition.ts`
- 侧边栏项目使用 `placement="right"`，其余区域使用 `placement="top"`

## 文档入口

### 架构文档

- [README.md](/E:/Programs/Obsidian/notes/ai-digital-life/README.md)
- [CONTRIBUTING.md](/E:/Programs/Obsidian/notes/ai-digital-life/CONTRIBUTING.md)
- [docs/architecture/system-overview.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/system-overview.md)
- [docs/architecture/tech-stack-alignment.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/tech-stack-alignment.md)
- [docs/architecture/rust-migration-plan.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/rust-migration-plan.md)
- [docs/architecture/internationalization.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/internationalization.md)
- [docs/architecture/recovery-and-migration.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/recovery-and-migration.md)
- [docs/architecture/task-governance.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/task-governance.md)
- [docs/architecture/theming.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/theming.md)
- [docs/architecture/workspace-and-retrieval.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/workspace-and-retrieval.md)

### 设计系统文档

- [docs/design-system/README.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/README.md) - 设计系统总览
- [docs/design-system/tokens.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/tokens.md) - 设计令牌
- [docs/design-system/themes.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/themes.md) - 主题系统
- [docs/design-system/components.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/components.md) - 组件规范
- [docs/design-system/accessibility.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/accessibility.md) - 无障碍指南
- [docs/design-system/responsive.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/responsive.md) - 响应式设计
- [docs/design-system/testing.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/testing.md) - 测试策略

## 项目结构

```
ai-digital-life/
├── Cargo.toml                  # Cargo workspace 根
├── .mcp.json                   # MCP 服务器配置（Chrome DevTools 等浏览器测试工具）
├── src-tauri/                  # Tauri Rust 入口
│   ├── Cargo.toml
│   ├── tauri.conf.json         # Tauri 应用配置
│   ├── src/
│   │   ├── main.rs             # tauri::Builder 启动
│   │   ├── commands/           # #[tauri::command] 处理函数
│   │   ├── state.rs            # tauri::State 共享状态
│   │   └── setup.rs            # 应用初始化、窗口、worker
│   ├── icons/
│   └── capabilities/           # Tauri 2.x 能力 / 权限声明
├── crates/                     # Rust 业务 crate
│   ├── kernel/                 # 共享类型与常量（serde）
│   ├── config/                 # 配置管理
│   ├── errors/                 # 错误处理（thiserror）
│   ├── events/                 # 事件总线
│   ├── logger/                 # 日志（tracing）
│   ├── migration/              # SQLite 迁移
│   ├── storage/                # 存储层（rusqlite）
│   ├── workspace/              # 工作区管理
│   ├── fs-ops/                 # 文件操作（notify）
│   ├── task/                   # 任务治理
│   ├── conversation/           # 会话
│   ├── agent-runtime/          # Agent 运行时
│   ├── model-gateway/          # 模型路由
│   ├── change-engine/          # 变更引擎
│   ├── context-engine/         # 上下文引擎
│   ├── prompt-engine/          # 提示词引擎
│   ├── terminal/               # 命令执行
│   └── editor/                 # 编辑器逻辑
├── frontend/                   # WebView 前端 (React + Vite)
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx            # React 入口
│       ├── app/                # React UI（全壳布局、Zustand store、区域组件）
│       ├── design-system/      # 设计系统模块
│       ├── styles/             # CSS 系统
│       ├── locales/            # i18n 资源
│       ├── kernel/             # 前端侧共享类型与 IPC 结果类型（`@ai-digital-life/kernel` 路径别名 → 此处）
│       ├── shared/ipc.ts       # `DigitalLifeBridge` 接口契约
│       ├── preview-bridge.ts   # 浏览器开发态桥接（经本地开发服务访问真实工作区）
│       ├── tauri-bridge.ts     # Tauri 桌面壳桥接（`invoke`/事件订阅）
│       └── mock-bridge.ts      # 非文件系统能力的开发态 mock 与 preview fallback
├── docs/
│   ├── architecture/           # 架构文档
│   └── design-system/          # 设计系统文档
├── scripts/                    # 开发脚本
│   └── run-project-surface.mjs # 动态端口选择，启动浏览器/Tauri/两者
└── tests/
    ├── integration/            # Rust 集成测试
    └── e2e/                    # WebDriver E2E
```
