# 项目领域术语表

本文档记录 AI 数字生命项目的核心领域概念、架构术语和关键术语定义。帮助贡献者统一理解项目上下文。

---

## 参考项目

### OpenCode
本项目的主要参考开源项目（MIT 许可），由 SST/Anomaly 团队开发。终端优先的 AI 编码助手，支持 TUI/Web/Desktop 多客户端。本地副本位于 `references/opencode/`，源码地图见 [docs/analysis/opencode/](./docs/analysis/opencode/)。

> 本项目的架构设计、编码模式与功能实现多处借鉴 OpenCode，包括但不限于：命名空间投影、Service+Layer 依赖注入、Schema 驱动类型系统、三态权限引擎、ConfigTransform 可重放配置变换。

---

## 架构概念

### 双根结构
项目仓库分为两个根目录：根目录负责规划与治理（文档、规则、配置），`ai-digital-life/` 负责实际代码实现（Rust 后端 + 前端 UI）。

### 双端一致性
所有功能必须在 **Tauri 桌面应用** 和 **浏览器模式** 中保持**功能行为一致**。由于两种模式的运行环境不同（Tauri 有 Rust 后端 + SQLite + 系统 API，浏览器仅有 WebView + Web API），实现策略可以因环境而异。通过统一接口抽象（如 `TerminalOutputStore`、`PreviewBridge`）隔离环境差异，消费端不感知底层实现。新增 IPC 方法需同步实现 `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts` 三层桥接。

---

## 架构模式

### 命名空间投影 (Namespace Projection)
模块通过自己的导出命名空间暴露类型，消费者通过命名空间限定符访问：`import { Config } from "./config"` 后通过 `Config.ID`、`Config.Info` 引用。避免扁平化导入导致的命名冲突。对应本项目：`kernel/types/` 中 `Config`、`ConversationConfig` 等类型的组织方式。

### Global 节点 vs Location 节点
服务生命周期管理策略：
- **Global 节点**：进程级单例，如 Database、Git、全局配置
- **Location 节点**：每工作目录独立实例，如 Config、Permission

对应本项目：进程级服务（`adl-logging`、`errors` crate）vs 工作区级服务（`workspace`、`pty` crate）。

### Service + Layer 依赖注入
每个领域模块定义三要素：Service 接口声明（方法签名）、Layer 实现绑定（具体实现注入）、节点定义（依赖关系声明）。对应本项目：Rust 中 `trait` 定义 + Tauri `manage()` 状态注入模式。

### Schema 驱动类型系统
使用结构化 Schema 定义公共数据模型作为前后端契约层：
- 所有公共类型在一个独立层定义（本项目对应 `kernel/types/`）
- 使用 branded types 增强类型安全（如工作区 ID 而非裸 `String`）
- 契约默认只读，运行时可变性显式声明
- 通过 serde 序列化/反序列化确保跨语言边界一致性

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
Tracing 日志系统的配置层，支持文件输出和结构化字段。

### Sidecar
桌面端启动的独立后端子进程（当前 Tauri 模式）。未来移动端可通过 SSH/Sidecar 连接桌面端或服务器。

### DSH (DeepSeek Shell)
DeepSeek Harness 的简称，一个基于 npm 的 Web 应用，通过 WebView2 子窗口嵌入到应用中间区域。启动方式为 `npx @deepseek-ai/dsh@<version> --profile web --no-open`。

### DSH Bundle
内置的 DSH 预安装包，位于 `<data_dir>/dsh-bundle/`。包含 `manifest.json`（版本元数据）和 `package/` 目录（实际 dsh 代码）。离线环境下可直接使用，无需 npm 下载。

### DSH Version
DSH 版本管理系统，位于 `crates/dsh-version/`。管理已安装版本列表、版本切换、npm 仓库查询，并提供智能源选择（优先级：已运行 > 系统安装 > 内置 > 下载）。

### Download Source
可配置的下载源系统，位于 `crates/download-source/`。支持 npm 仓库地址、镜像源（如 npmmirror）、代理设置。配置文件为 `<data_dir>/config/download-sources.json`。

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

### Branded Types（标记类型）
编译时名义类型（nominal typing）模式，定义在 `frontend/src/shared/branded.ts`。使用 TypeScript `unique symbol` 交叉类型实现零运行时开销的类型安全：
- `WorkspaceID`、`TerminalSessionID` 等 ID 类型
- 赋值时必须显式转型（`asWorkspaceID(str)`），防止 ID 类型间混用
- 桥接层保持使用 `string` 传输，前端边界处通过 `as string` 剥离品牌

### Typed Error Classes（类型化错误类）
前端定义在 `frontend/src/shared/typedErrors.ts`，16 个具体错误类（其中 14 个对应 Rust `AppError` 变体，另 `InvokeError`、`PreviewApiError` 为前端专用；Rust 端共 17 个变体）。支持 `instanceof` 判断，`fromIpcErrorCode(code, message)` 工厂函数从 IPC 错误码转换。

### EventBuffer（事件缓冲区）
前端定义在 `frontend/src/shared/eventBuffer.ts`，泛型缓冲区类，用于收集高频事件
（终端输出）后批量刷出，减少 React re-render 次数：
- `flush()` — 清空并返回所有缓冲事件
- `drainWithReconciliation(mergeKey, reducer)` — 按 key 去重合并
- `scheduleFlush(callback)` — 微任务级批量刷新

### ConfigTransform（可重放配置变换）
前端 `frontend/src/app/stores/configStateMachine.ts` 和 Rust `crates/kernel/src/types/config.rs` 共同实现。借鉴 OpenCode 的 `State.transform() + reload()` 模式：
- `createConfigState(base)` — 创建状态 + transform 日志
- `applyTransform(state, transform)` — 应用变换并追加日志
- `reloadFromBase(base, transforms)` — 在新基线上重放
- `rollbackLastTransform(state)` — 撤销最后一次变换

### PermissionEngine（三态权限引擎）
Rust 端 `crates/kernel/src/command_risk.rs`，基于 OpenCode 的 deny/ask/allow 三态模型：
- `PermissionDecision` 枚举：`Allow < Ask < Deny`（PartialOrd 优先级）
- `PermissionRule` 结构：`pattern` 支持 `*`（单段）和 `**`（多段）通配符

### Design Token
设计系统的基础原子值，定义在 `frontend/src/design-system/tokens.ts`。包含 ShadowToken、ColorToken、SpacingToken 等类型。

---

## 阶段概念

### Phase 0 - 架构底座
已完成。包括 Rust crate 架构、Tauri 壳层、安全边界（capability 权限策略）、SQLite 持久化、日志系统。

### Phase 1 - 交互式 MVP
已完成。包括变更预览/应用/回滚。

### Phase 3+ - 生态与规模化
规划中。包括 ACP、HTTP API、CodeMode 沙箱、插件市场、浏览器自动化运行时、云服务集成、多模态输入、CI/CD 集成等。

---

## 功能域

### 编辑器 (Editor)
前端代码编辑器面板，基于 CodeMirror，支持多标签页、语法高亮、diff 对比。

### 工作区 (Workspace)
项目管理模块，支持 Git 操作（clone/commit/diff/worktree）、文件树、大纲解析、搜索。

### 浏览器 (Browser)
内嵌 WebView（Tauri 模式）和 iframe（浏览器模式）面板，支持多标签页、书签、历史记录。网站元数据缓存（favicon data-URI + 标题）为三层架构：Tauri 端 `crates/browser/src/site_meta_cache.rs`（SQLite）、浏览器端 preview JSON 文件（`.adl-cache/`）、前端内存层 `siteMetaCache.ts`（唯一渲染真源）。

### 终端 (Terminal)
伪终端管理模块。Tauri 模式后端通过 `crates/pty/` 管理进程，浏览器模式通过 `previewTerminalService.ts`（Node.js）管理；前端通过 xterm.js 渲染，浏览器模式采用轮询机制（1000ms，`preview-pty-bridge.ts`）。

### 只读历史 (Read-only History)
终端面板中实时终端之外的历史回放区。每次 PTY 会话结束（shell 退出 / 关闭应用时的落盘）即定稿为一段历史，末尾附日期分隔条（`─── HH:MM:SS DD-MM-YYYY ───`，固定格式不随语言变化），按标签累积并跨重启保留。语义是**采集时刻的屏幕快照**（不随当前窗口宽度重新分列）；渲染为轻量 DOM 虚拟列表（`TerminalHistoryList`），空白单元格按 xterm 渲染器同口径还原为空格，含宽字符或粗斜体的行逐字钉格以贴合 xterm 单元格网格。磁盘超预算时按最旧优先整段淘汰，且始终保留最近 20 段。

### 变更引擎 (Change Engine)
代码变更预览、应用、回滚、checkpoint 管理。位于 `crates/change-engine/`。

---

## 数据库

### SQLite (rusqlite)
本地持久化存储，通过 `r2d2` 连接池管理，`WAL` 模式。`sql/` 目录包含 schema 和索引 SQL 文件。

### Storage Layer
位于 `crates/storage/`，提供 CRUD 抽象、实体表宏、数据清理。

---

## 启动模式

| 模式 | 命令 | 引擎 | 终端 |
|------|------|------|------|
| Tauri 桌面 | `pnpm run dev:tauri` | Tauri WebView2 | xterm.js + Rust PTY（`pty_commands.rs`） |
| 浏览器预览 | `pnpm run dev:browser` | Vite | xterm.js + 轮询（`preview-pty-bridge.ts`，1000ms） |
| 双端启动 | `pnpm run dev:both` | 两者 | 两者 |
