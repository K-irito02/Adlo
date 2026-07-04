# OpenCode 深度分析（三）：功能模块深度剖析

> 源码参考路径：`references/opencode/packages/core/src/`、`references/opencode/packages/llm/src/`

---

## 1. LLM 抽象层 (`packages/llm/`)

### 1.1 核心设计：四轴路由分解

OpenCode LLM 层最精妙的设计是将一次 Provider 调用分解为四个正交维度：

```
Route = {
  Protocol   — 语义 API 契约：body 构造、stream 解析、事件状态机
  Endpoint   — URL 构造：baseURL / path / query
  Auth       — 每请求传输认证：bearer token / API key header
  Framing    — 字节流 → 帧：SSE / AWS event-stream / 二进制
}
```

**核心价值**：DeepSeek、TogetherAI、Cerebras、Fireworks 等共享 `OpenAIChat.protocol`，每个提供商只需 5-15 行配置，而非 300-400 行克隆代码。

### 1.2 关键源文件

| 文件 | 路径 | 用途 |
|------|------|------|
| `route/client.ts` | `packages/llm/src/route/client.ts` | 路由客户端：`Route.make()` + `LLMClient` 服务 |
| `route/auth.ts` | `packages/llm/src/route/auth.ts` | 认证：`Auth.bearer`、`Auth.apiKeyHeader`、`Auth.passthrough` |
| `route/endpoint.ts` | `packages/llm/src/route/endpoint.ts` | URL 构造：`Endpoint.path` |
| `route/framing.ts` | `packages/llm/src/route/framing.ts` | 流帧协议：`Framing.sse`、`Framing.binary` |
| `llm.ts` | `packages/llm/src/llm.ts` | 高级请求：`LLM.request()`、`LLM.stream()`、`LLM.generate()` |
| `tool.ts` | `packages/llm/src/tool.ts` | 类型安全工具构造器 |
| `tool-runtime.ts` | `packages/llm/src/tool-runtime.ts` | 工具调度器 |

### 1.3 协议实现

`protocols/` 目录包含具体协议实现：

- `openai-chat.ts` / `openai-responses.ts`
- `anthropic-messages.ts`
- `gemini.ts`
- `bedrock-converse.ts`
- `openai-compatible-chat.ts`（通用兼容路由）

### 1.4 Provider Facade

`providers/` 目录配置各提供商 facade：
- `openai.ts`、`anthropic.ts`、`google.ts`、`xai.ts`
- `azure.ts`、`amazon-bedrock.ts`、`cloudflare.ts`
- `github-copilot.ts`、`openrouter.ts`
- `openai-compatible.ts` + `openai-compatible-profile.ts`

### 1.5 设计要点

- `LLM.generate()` = 一次 provider turn，不执行本地工具，不继续对话
- 工具循环由外部 Session Runner 手动编排——保证每一步都可持久化和权限控制
- 支持 provider-hosted tools（Anthropic web_search、OpenAI Responses web_search_call），`providerExecuted: true` 跳过本地 dispatch
- 工具系统支持 Typed 模式（Effect Schema 静态类型）和 Dynamic 模式（运行时 JSON Schema）

---

## 2. 核心业务层 (`packages/core/`)

### 2.1 核心领域服务

| 文件 | 路径 | 职责 |
|------|------|------|
| `agent.ts` | `packages/core/src/agent.ts` | Agent 管理：创建、选择、默认 Agent |
| `session.ts` | `packages/core/src/session.ts` | Session 全生命周期：create/list/messages/prompt/compact/revert |
| `config.ts` | `packages/core/src/config.ts` | 多层配置加载（全局→项目→`.opencode/`） |
| `permission.ts` | `packages/core/src/permission.ts` | 权限三态：deny/ask/allow + wildcard 匹配 |
| `provider.ts` | `packages/core/src/provider.ts` | Provider 类型定义 |
| `git.ts` | `packages/core/src/git.ts` | Git 全操作封装（worktree、tree、changeSet） |
| `plugin.ts` | `packages/core/src/plugin.ts` | 插件运行时生命周期 |
| `skill.ts` | `packages/core/src/skill.ts` | 技能发现和加载（Markdown frontmatter） |
| `state.ts` | `packages/core/src/state.ts` | **可重放状态机** |
| `global.ts` | `packages/core/src/global.ts` | 全局路径管理（XDG 目录） |

### 2.2 Tool 子系统

| 文件 | 路径 | 职责 |
|------|------|------|
| `tool/tool.ts` | `packages/core/src/tool/tool.ts` | Core 工具构造器（带权限、Location Scope） |
| `tool/tools.ts` | `packages/core/src/tool/tools.ts` | 工具注册服务 |
| `tool/bash.ts` | `packages/core/src/tool/bash.ts` | Bash 工具：命令执行、超时控制 |
| `tool/edit.ts` | `packages/core/src/tool/edit.ts` | Edit 工具：精确文本替换 |
| `tool/read.ts` | `packages/core/src/tool/read.ts` | Read 工具：文件/目录/图片读取 |
| `tool/write.ts` | `packages/core/src/tool/write.ts` | Write 工具 |
| `tool/grep.ts` | `packages/core/src/tool/grep.ts` | Grep 工具：ripgrep 搜索 |
| `tool/glob.ts` | `packages/core/src/tool/glob.ts` | Glob 工具 |
| `tool/skill.ts` | `packages/core/src/tool/skill.ts` | Skill 工具 |
| `tool/AGENTS.md` | `packages/core/src/tool/AGENTS.md` | Tool 设计规范 |

### 2.3 权限三态模型

```
规则匹配优先级: deny > ask > allow

支持:
├── wildcard 匹配（`read:*`）
├── reject（带纠正反馈）
└── always（记住 + 级联批准同会话其他请求）
```

---

## 3. Schema 类型系统 (`packages/schema/`)

### 3.1 架构模式

- 所有类型使用 `Schema.Struct`、`Schema.Class`、`Schema.TaggedErrorClass` 定义
- 命名空间投影模式：`export * as X from "./x"` 让消费者可通过 `Agent.ID`、`Session.Info` 访问
- ID 使用 branded types：`Schema.String.pipe(Schema.brand("Agent.ID"))` 确保类型安全
- 只读不可变性：公共契约默认只读

### 3.2 关键模块

| 文件 | 路径 | 用途 |
|------|------|------|
| `agent.ts` | `packages/schema/src/agent.ts` | Agent 信息、ID、颜色 |
| `session.ts` | `packages/schema/src/session.ts` | Session 信息、消息、事件 |
| `provider.ts` | `packages/schema/src/provider.ts` | Provider 定义 |
| `model.ts` | `packages/schema/src/model.ts` | 模型引用、定价、能力元数据 |
| `permission.ts` | `packages/schema/src/permission.ts` | 权限规则和请求/回复 |
| `skill.ts` | `packages/schema/src/skill.ts` | 技能定义 |
| `plugin.ts` | `packages/schema/src/plugin.ts` | 插件 ID 和事件 |
| `llm.ts` | `packages/schema/src/llm.ts` | LLM schema：消息、事件、请求、响应 |
| `schema.ts` | `packages/schema/src/schema.ts` | 基础工具 schema（AbsolutePath、PositiveInt） |

---

## 4. 会话执行引擎

### 4.1 核心概念

| 概念 | 定义 |
|------|------|
| **Session Drain** | 一次进程本地的执行跨度，无持久身份 |
| **Prompt Promotion** | 将 Admitted Prompt 从 pending 转为 Session History |
| **Context Epoch** | 一个不变的 provider-cache baseline 活跃期 |
| **System Context** | 作为初始指令呈现给模型的结构化上下文 |

### 4.2 执行流程

```
1. SessionV2.prompt(...) → 持久准入 session_input
2. SessionExecution.wake(sessionID) → 调度建议
3. SessionRunner → 加载历史 → 组装 Context → Provider Turn
4. Tool Dispatch → 本地执行 → 结果持久化
5. 循环直到无继续
```

### 4.3 核心与会话系统相关文件

| 文件 | 路径 |
|------|------|
| Session 执行引擎 | `packages/core/src/session/runner/index.ts` |
| Session 执行调度 | `packages/core/src/session/execution/` |
| Session 存储 | `packages/core/src/session/store/` |
| Session 输入准入 | `packages/core/src/session/input/` |
| 事件投影 | `packages/core/src/session/projector/` |

---

## 5. 插件架构 (`packages/plugin/`)

### 5.1 插件 Hook 系统

```typescript
Hooks {
├── chat.message       — 新消息到达时调用
├── chat.params        — 修改发送给 LLM 的参数
├── chat.headers       — 修改发送给 LLM 的 HTTP 头
├── permission.ask     — 权限询问拦截
├── command.execute.before/after — 命令执行前后
├── tool.execute.before/after  — 工具执行前后
├── shell.env          — Shell 环境变量增强
├── auth               — 认证钩子（OAuth / API Key）
├── provider           — Provider 模型注册
├── event              — 通用事件钩子
├── config             — 配置变更钩子
└── experimental.*     — 实验性钩子
```

### 5.2 设计决策

- 插件函数签名: `(input: PluginInput, options?: PluginOptions) => Promise<Hooks>`
- Plugin 包是纯类型契约，Core 通过 `PluginHost.make()` 创建运行时宿主
- 认证提供 OAuth 和 API Key 两种方式
- Workspace 适配器允许注册自定义工作区类型

---

## 6. 对当前项目的模块借鉴

| OpenCode 模块 | 你的对应模块 | 可借鉴内容 |
|-------------|-------------|----------|
| `llm/` Provider 路由 | `model-gateway/` crate | 四轴分解模式可直接应用 |
| `core/tool/` 工具系统 | 无明确对应 | 可参考 Tool Registry + Location Scope 设计 |
| `core/session/` 会话引擎 | 对话管理 | Context Epoch + Prompt Promotion 概念 |
| `core/permission.ts` 权限 | 命令风险检查 | 三态模型（deny/ask/allow）值得参考 |
| `schema/` 类型契约 | `kernel/types/` | Branded ID 模式提升类型安全 |
| `plugin/` 插件架构 | 未来需求 | 先定义契约 trait，再实现宿主 |
| `core/state.ts` 状态机 | 配置管理 | 可重放变换 + 自动回滚模式 |
