# OpenCode 包索引

> 每个包的职责、关键文件、依赖和行数估算。

## 核心链

### @opencode-ai/schema（纯契约层）

**职责**：所有公共数据类型的唯一定义点，56 个文件，仅依赖 `effect`。

**关键文件**：

| 文件 | 内容 |
|------|------|
| `src/agent.ts` | Agent Info/Selection/Color schema |
| `src/session.ts` | Session 完整 schema（~最大文件） |
| `src/model.ts` | Model ID/Family/Capabilities/Cost |
| `src/provider.ts` | Provider ID/Api/Info |
| `src/permission.ts` | Permission Ruleset/Rule/Effect |
| `src/tool.ts` | 工具 schema |
| `src/event.ts` | 事件 schema |
| `src/filesystem.ts` | 文件系统 Entry/Content/Match |
| `src/llm.ts` | LLM Message/Usage 类型 |
| `src/plugin.ts` | Plugin schema |
| `src/project.ts` | Project ID/VCS Info |
| `src/location.ts` | Location schema |
| `src/pty.ts` | PTY ticket/schema |
| `src/question.ts` | Question/Reply 类型 |

### @opencode-ai/llm（LLM 抽象层）

**职责**：Provider 路由 + 协议适配 + 工具运行时。

**目录结构**：

```
src/
├── route/         # 路由核心（client/auth/endpoint/framing/executor/transport）
├── protocols/     # 6 种 API 协议
│   ├── openai-chat.ts         (~大)
│   ├── openai-responses.ts    (~大)
│   ├── anthropic-messages.ts  (~大)
│   ├── gemini.ts              (~大)
│   ├── bedrock-converse.ts    (~中)
│   └── openai-compatible-chat.ts  (~小, 通用路由)
├── providers/     # 12 个 Provider facade
│   ├── openai.ts / anthropic.ts / google.ts / xai.ts
│   ├── azure.ts / amazon-bedrock.ts / cloudflare.ts
│   ├── github-copilot.ts / openrouter.ts
│   └── openai-compatible.ts / openai-compatible-profile.ts
├── schema/        # LLM 专用类型（errors/events/ids/messages/options）
├── utils/         # record.ts（请求录制）
├── llm.ts         # LLM.request/stream/generate 高级 API
├── provider.ts    # Provider 类型
├── tool.ts        # 类型安全 Tool 构造器
├── tool-runtime.ts # 工具调度引擎
└── cache-policy.ts # 缓存策略
```

**四轴路由模型**：

```
Route = Protocol × Endpoint × Auth × Framing
  Protocol  → 构造 body + 解析 stream（语义契约）
  Endpoint  → 构造 URL（baseURL/path/query）
  Auth      → bearer | apiKeyHeader | passthrough
  Framing   → SSE | binary | AWS event-stream
```

### @opencode-ai/protocol（HTTP API 定义）

**职责**：类型安全的 HTTP API 路由签名定义，18 个路由组。

**路由组**：`agent / command / credential / event / fs / health / integration / location / message / model / permission / project-copy / provider / pty / question / reference / session / skill`

**关键文件**：
- `src/api.ts` — `HttpApi` 主类型定义（聚合所有路由组）
- `src/errors.ts` — API 错误类型
- `src/groups/*.ts` — 各路由组的输入/输出类型定义

### @opencode-ai/core（核心业务引擎）

**职责**：所有业务领域服务，~50 领域文件 + 8 业务子目录。

**领域文件（src/ 根级）**：

| 文件 | 行数 | 职责 |
|------|------|------|
| `agent.ts` | ~111 | Agent 注册/查询/选择 |
| `session.ts` | ~486 | Session 生命周期（最大单文件） |
| `config.ts` | ~227 | 多层配置聚合 |
| `permission.ts` | ~309 | PermissionV2 权限系统 |
| `snapshot.ts` | ~266 | Git-based 快照 |
| `patch.ts` | ~198 | Patch 解析/应用 |
| `plugin.ts` | ~167 | Plugin 生命周期 |
| `skill.ts` | ~132 | Skill 发现/加载 |
| `project.ts` | ~136 | 项目解析/管理 |
| `policy.ts` | ~49 | Policy 通配符引擎 |
| `command.ts` | ~64 | 自定义命令管理 |
| `git.ts` | ~中 | Git 操作封装 |
| `provider.ts` | ~25 | Provider 类型定义 |
| `model.ts` | ~41 | Model 类型/解析 |
| `file.ts` | ~中 | 文件操作 |
| `shell.ts` | ~中 | Shell 执行 |
| `workspace.ts` | ~中 | 工作区管理 |
| `state.ts` | ~中 | State 抽象（Draft/Transformable） |
| `event.ts` | ~中 | 事件系统 |
| `credential.ts` | ~中 | 凭据管理 |
| `integration.ts` | ~中 | 集成管理 |
| `process.ts` | ~中 | 进程管理 |
| `location.ts` | ~中 | Location 感知 |

**业务子目录**：

| 目录 | 内容 |
|------|------|
| `tool/` | 15+ 内置工具 + ToolRegistry + Tool 抽象 |
| `session/` | Session 执行引擎、compaction、prompt、runner |
| `agent/` | Agent prompt、子代理权限 |
| `plugin/` | 30+ Provider 适配器 |
| `config/` | Agent/LSP/MCP 配置 |
| `database/` | SQLite 引擎 + 38 迁移 |
| `system-context/` | Context Source 代数 |
| `v1/` | 遗留 V1 Session 兼容 |
| `effect/` | Layer 节点工具 |
| `account/` | 账户管理 |
| `event/` | 事件持久化 |
| `id/` | ID 生成 |
| `image/` | 图片处理 |
| `oauth/` | OAuth 页面 |
| `project/` | 项目复制/持久化 |
| `pty/` | PTY 协议 |
| `reference/` | 代码引用 |
| `ripgrep/` | ripgrep 封装 |
| `share/` | 会话分享 |
| `skill/` | Skill 列表管理 |
| `util/` | 通用工具（array/binary/encode/flock/glob/hash/lazy/module/path/retry/slug/token） |

### @opencode-ai/server（HTTP 服务组装）

**职责**：将 Protocol 路由组注入 Core 服务实现，添加认证/CORS/中间件。

**关键文件**：
- `src/routes.ts` — 路由组装（注入依赖）
- `src/handlers/*.ts` — 21 个路由 handler 实现
- `src/middleware/` — 认证/错误/位置中间件
- `src/auth.ts` — 认证逻辑
- `src/cors.ts` — CORS 配置

### opencode（CLI 主应用）

**职责**：最复杂的包（~200+ 文件），命令行路由 + 服务启动 + TUI/Web 服务器 + 全部组装。

**关键目录**：

| 目录 | 职责 |
|------|------|
| `src/cli/` | yargs 命令路由（run/serve/tui/web/mcp/models/agent/...） |
| `src/server/` | HTTP 服务器 + WebSocket + 代理 |
| `src/session/` | Session 提示词（13 模板）+ LLM 调用 + Compaction |
| `src/tool/` | 工具注册 + 各工具实现 |
| `src/agent/` | Agent 逻辑 + Prompt 模板 |
| `src/config/` | 配置加载/解析（JSONC + 变量） |
| `src/plugin/` | 插件运行时 + 内置插件 |
| `src/mcp/` | MCP 集成 |
| `src/lsp/` | LSP 客户端 |
| `src/acp/` | ACP 协议 |
| `src/project/` | 项目引导 |
| `src/effect/` | Effect 运行时工具 |
| `src/bus/` | 全局事件总线 |
| `src/background/` | 后台任务 |
| `src/format/` | 代码格式化 |
| `src/skill/` | Skill 发现 |
| `src/snapshot/` | Snapshot CLI |
| `src/storage/` | 持久化存储 |
| `src/util/` | 通用工具（archive/bom/locale/rpc/timeout 等） |

## 客户端包

### @opencode-ai/tui（终端 UI）

- **技术栈**：SolidJS + opentui（core/keymap/solid）
- **20+ 导出入口**：组件、配置、运行时、功能插件
- **关键文件**：`src/index.tsx`, `src/runtime.tsx`, `src/config/`

### @opencode-ai/app（Web 应用）

- **技术栈**：SolidJS + Vite + Tailwind CSS + DnD Kit + Shiki + Kobalte
- **18 语言 i18n**
- **关键文件**：`src/app.tsx`, `src/entry.tsx`, `src/context/`, `src/pages/`

### @opencode-ai/desktop（Electron 桌面壳）

- **技术栈**：electron-vite + electron-builder + electron-updater
- **关键文件**：`src/main/apps.ts`, `src/main/ipc.ts`, `src/main/menu.ts`

## 生态包

### @opencode-ai/plugin（插件 SDK）

- **双 API**：Effect API（`v2/effect/`）+ Promise API（`v2/promise/`）
- **14 个 API 域**：agent/aisdk/catalog/command/context/event/filesystem/integration/location/npm/path/plugin/reference/registration/skill
- **Workspace 示例**：`example-workspace.ts`, `example.ts`

### @opencode-ai/client（HTTP 客户端，自动生成）

- 从 `HttpApi` 类型自动生成
- **双版本**：Promise（`src/contract.ts`）+ Effect（`src/effect.ts`）
- 仅依赖 schema+protocol

### @opencode-ai/sdk-next（嵌入式 SDK）

- 组合 client + core + server
- 用于进程内嵌入 OpenCode

### @opencode-ai/codemode（受限代码执行）

- 基于 `acorn` + `typescript`
- 安全执行 AI 生成的代码

### @opencode-ai/cli（守护进程入口）

- `bin/lildax.cjs` — 守护进程
- `start/stop/status/restart` 生命周期管理
