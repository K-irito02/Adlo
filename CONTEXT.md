# 项目领域术语表

本文档记录 AI 数字生命项目的核心领域概念、架构术语和关键术语定义。帮助贡献者和 AI 代理统一理解项目上下文。

---

## 架构概念

### 双根结构
项目仓库分为两个根目录：根目录负责规划与治理（文档、规则、配置），`ai-digital-life/` 负责实际代码实现（Rust 后端 + 前端 UI）。

### 双端一致性
所有功能必须在 **Tauri 桌面应用** 和 **浏览器模式** 中保持一致。新增 IPC 方法需同步实现 `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts` 三层桥接。

---

## 后端概念

### Tauri Command
Tauri 的 IPC 调用机制。前端通过 `invoke()` 调用 Rust 后端函数，后端通过 `#[tauri::command]` 宏暴露命令。返回类型统一为 `Result<T, AppError>`。

### AppError
统一的错误枚举类型，位于 `crates/errors/`。所有 IPC 错误都通过此类型传播，禁止使用裸 `String` 错误。

### Kernel
共享类型与常量 crate，包含 `domain` 模块，使用 `serde` 序列化。作为前后端之间的公共类型契约层。

### EntityTable
`storage` crate 中的宏，用于自动生成 SQLite CRUD 操作代码，减少样板代码。

### Layer (adl-logging crate)
Tracing 日志系统的配置层，支持文件输出和结构化字段。通过 manager 管理多 session 日志。

### Sidecar
桌面端启动的独立后端子进程（当前 Tauri 模式）。未来移动端可通过 SSH/Sidecar 连接桌面端或服务器。

---

## 前端概念

### Store (Zustand 状态管理)
前端全局状态管理，采用**切片合并模式**（Sliced Store Pattern）。每个功能域拥有独立 slice，通过 `slicedStore.ts` 合并为单一 Store。

### Bridge (桥接层)
前端与后端的通信抽象层，分为三层：
- **Tauri Bridge**：生产环境，通过 `invoke()` 调用
- **Preview Bridge**：浏览器开发模式，通过 HTTP API 调用
- **Mock Bridge**：纯前端模拟，用于测试

### IPC 域拆分
桥接层按功能域拆分为多个子接口文件（`shared/ipc/` 目录），每个域文件定义该域的接口类型。

### Design Token
设计系统的基础原子值，定义在 `frontend/src/design-system/tokens.ts`。包含 ShadowToken、ColorToken、SpacingToken 等类型。

---

## AI 代理概念

### 规则文件 (Rules)
位于 `.trae/rules/` 目录的 Markdown 文件，以 YAML frontmatter 标记元数据。通过 `alwaysApply` 或 `globs` 控制应用范围。

### 技能系统 (Skills)
基于 Superpowers 框架的 AI 代理能力包，位于 `.opencode/skills/` 目录。共 23 个技能，分为 Superpowers 核心技能和项目定制技能。

### 强制验收流程
代码变更完成后自动触发的质量检测流程，包括 Lint、类型检查、测试执行。按变更层级（L1/L2/L3）确定检测范围。

---

## 阶段概念

### Phase 0 - 架构底座
已完成。包括 Rust crate 架构、Tauri 壳层、安全边界（capability 权限策略）、SQLite 持久化、日志系统。

### Phase 1 - 交互式 MVP
进行中。包括模型接入（model-gateway）、会话/消息管理、上下文管理、变更预览/应用/回滚。

### Phase 2 - Agent 生态
进行中（部分切片已完成）。包括单 Agent 执行引擎、终端流式输出、任务管理与审批。

---

## 功能域

### 编辑器 (Editor)
前端代码编辑器面板，基于 CodeMirror，支持多标签页、语法高亮、diff 对比。

### 工作区 (Workspace)
项目管理模块，支持 Git 操作（clone/commit/diff/worktree）、文件树、大纲解析、搜索。

### 浏览器 (Browser)
内嵌 WebView（Tauri 模式）和 iframe（浏览器模式）面板，支持多标签页、书签、历史记录。

### 终端 (Terminal)
伪终端管理模块，后端通过 `crates/pty/` 管理进程，前端通过 xterm.js 渲染。浏览器模式采用轮询机制。

### 变更引擎 (Change Engine)
代码变更预览、应用、回滚、checkpoint 管理。位于 `crates/change-engine/`。

### 模型网关 (Model Gateway)
多模型/多 Provider 路由层，支持 DeepSeek、MiniMax 等模型流式接入。位于 `crates/model-gateway/`。

---

## 数据库

### SQLite (rusqlite)
本地持久化存储，通过 `r2d2` 连接池管理，`WAL` 模式。`sql/` 目录包含 schema 和索引 SQL 文件。

### Storage Layer
位于 `crates/storage/`，提供 CRUD 抽象、实体表宏、session 管理、数据清理。

---

## 技能系统

### Superpowers
基于 opencode.json 安装的 AI 代理框架，提供 14 个核心技能。插件路径：`~/.config/opencode/node_modules/superpowers`。

### 真源目录
技能文件的源目录为 `.opencode/skills/`，同步备份到 `.agents/skills/` 和 `.trae/skills/` 以兼容不同 IDE。

---

## 启动模式

| 模式 | 命令 | 引擎 | 终端 |
|------|------|------|------|
| Tauri 桌面 | `pnpm run dev:tauri` | Tauri WebView2 | xterm.js + node-pty |
| 浏览器预览 | `pnpm run dev:browser` | Vite | xterm.js + polling |
| 双端启动 | `pnpm run dev:both` | 两者 | 两者 |
