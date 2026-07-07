# OpenCode 架构设计

> 源码参考：`references/opencode/packages/`

## 分层架构

```
Layer 0: Schema (纯类型契约)
   └─ 仅依赖 effect（运行时）
   └─ 56 个文件，定义所有公共类型
   └─ Schema.Struct / Schema.Class / Branded Types

Layer 1: LLM & Protocol (独立领域)
   ├─ llm: 依赖 schema，定义 LLM 抽象
   │   ├─ route/    → 四轴路由（Protocol/Auth/Endpoint/Framing）
   │   ├─ protocols/ → 6 种 API 协议实现
   │   └─ providers/ → 12 个 Provider facade
   └─ protocol: 依赖 schema，定义 HTTP API
       └─ groups/   → 18 路由组（类型安全路由定义）

Layer 2: Core (核心业务)
   └─ 依赖 schema + llm（不依赖 protocol/server）
   └─ ~50 领域服务文件 + 8 业务子目录
   └─ 所有 Effect Service（Agent/Session/Config/Permission/...）

Layer 3: Server (HTTP 组装)
   └─ 依赖 core + protocol
   └─ 将 Protocol 路由组注入 Core 服务实现
   └─ 添加认证/CORS/中间件

Layer 4: CLI 入口 (opencode)
   └─ 依赖所有下层包
   └─ yargs 命令路由 + Effect 运行时引导
   └─ 组装所有 Layer 为可执行应用

Layer 5: 客户端 (TUI/Web/Desktop)
   └─ 通过 HTTP Client 与服务端通信
   └─ SolidJS 组件 + 各自渲染引擎
```

## 包依赖矩阵

```
            schema ─────────────────────────────┐
            │                  │                 │
            ▼                  ▼                 ▼
           llm             protocol           plugin
            │                  │                 │
            ▼                  │                 │
           core ◄──────────────┘                 │
            │                                    │
            ▼                                    │
          server                                 │
            │                                    │
            ▼                                    │
         opencode ◄──────────────────────────────┘
            │
   ┌────────┼────────┐
   ▼        ▼        ▼
  app      tui    desktop

独立生态:
  client    → 仅依赖 schema + protocol
  sdk-next  → 组合 client + core + server (嵌入式)
```

## 核心设计模式

### 1. Effect-TS 服务层模式

每个领域模块遵循统一的三组件模式：

```ts
// ① 服务接口（纯类型契约）
export interface Interface {
  list(): Effect<Info[], Error>
  get(id: ID): Effect<Info, Error>
}

// ② Context.Tag（依赖注入标记）
export const Service = Context.GenericTag<Interface>("@opencode/Service")

// ③ Layer 实现（具体服务）
export const node = Layer.effect(Service, Effect.gen(function*() {
  // 通过 yield* 获取依赖
  const db = yield* Database.Service
  return { list, get } satisfies Interface
}))
```

### 2. 四轴路由分解（LLM 层）

一次 Provider 调用被分解为四个正交维度：

```
Route = {
  Protocol   — 语义 API 契约（body 构造/stream 解析/事件状态机）
  Endpoint   — URL 构造（baseURL/path/query）
  Auth       — 每请求传输认证（bearer token/API key header/passthrough）
  Framing    — 字节流→帧（SSE/AWS event-stream/二进制）
}
```

**价值**：DeepSeek/TogetherAI/Cerebras 等共享 `OpenAIChat.protocol`，每个只需 5-15 行配置，而非 300-400 行克隆代码。

### 3. Protocol-Server 分离

Protocol 定义路由结构（纯类型，无实现），Server 注入具体依赖：

```
protocol/src/groups/session.ts   → 定义路由签名: POST /session, GET /session/:id
server/src/handlers/session.ts   → 注入 Core Session 服务实现
```

**价值**：同一路由定义可生成 Promise SDK、Effect SDK、嵌入式 SDK 三种客户端。

### 4. Context Source 代数（System Context）

System Context 通过可组合的 Context Source 构建：

```ts
// 每个 Context Source 是一个独立观察
interface ContextSource<T> {
  id: string
  render(): Effect<T>
}

// 通过 Registry 组合
const systemContext = yield* ContextRegistry.render()
```

### 5. State 模式（非 Zustand）

OpenCode 不使用 Zustand，而是自定义 `State.create()` 模式：

```ts
// Draft: 纯状态 CRUD
interface Draft<T> {
  list(): Effect<T[]>
  get(id: ID): Effect<T>
  update(id: ID, input: Partial<T>): Effect<T>
  remove(id: ID): Effect<void>
}

// Transformable: 可变形状态
interface Transformable<T> extends Draft<T> {
  reload(): Effect<void>
  transform(fn: (items: T[]) => T[]): Effect<void>
}
```

### 6. 工具系统抽象

```
Tool.Definition<Input, Output>
├── description: string
├── input: Schema.Codec<Input>
├── output: Schema.Codec<Output>
├── execute(ctx: Tool.Context, input: Input): Effect<Output>
└── toModelOutput(output: Output): string

Tool.Context = {
  sessionID, agent, assistantMessageID, toolCallID
}

Tool.withPermission(tool) → 用权限检查包装工具执行
```

### 7. 权限模型（V2）

```
PermissionV2:
  Ruleset[] → 规则集列表（按优先级）
    Rule = { effect: "allow"|"deny", action, resource }
  
  evaluate(action, resource, rules) → "allow" | "deny"
  
  Policy:
    evaluate(action, resource, fallback) → Effect
    → last-match-wins 策略

  Assert:
    assert(input) → Effect<AskResult>
    → 检查 rules → match → 允许
    → 无 match → 弹出请求 → 等待用户批准/拒绝
```

### 8. 条件导入（双平台）

```json
// package.json imports 字段
{
  "#sqlite": { "bun": "./src/database/sqlite.bun.ts", "node": "./src/database/sqlite.node.ts" },
  "#pty":    { "bun": "./src/pty/pty.bun.ts", "node": "./src/pty/pty.node.ts" },
  "#fff":    { "bun": "./src/filesystem/fff.bun.ts", "node": "./src/filesystem/fff.node.ts" }
}
```

## 数据流

```
用户输入 (TUI/Web/CLI)
  │
  ▼
Session Runner (core/src/session/runner/)
  ├─ 组装 System Context (Context Sources)
  ├─ 构建 Prompt (Provider-specific templates)
  ├─ 插入 Session History (compacted)
  │
  ▼
LLM Layer (llm/src/)
  ├─ Route.make() → 四维分解
  ├─ Protocol.stream() → API 调用
  ├─ ToolRuntime → 工具调用拦截
  │
  ▼
Tool Execution (core/src/tool/)
  ├─ Tool.withPermission() → 权限检查
  ├─ execute() → 实际执行
  └─ toModelOutput() → 格式化输出
  │
  ▼
Response → Session 持久化 → UI 更新
```

## 关键常量

| 常量 | 值 | 文件 |
|------|-----|------|
| `PRUNE_MINIMUM` | 20000 | compaction |
| `PRUNE_PROTECT` | 40000 | compaction |
| `DEFAULT_TAIL_TURNS` | 2 | compaction |
| `DEFAULT_TIMEOUT_MS` | 120000 (2min) | tool/bash.ts |
| `MAX_TIMEOUT_MS` | 600000 (10min) | tool/bash.ts |
| `MAX_CAPTURE_BYTES` | 1048576 (1MB) | tool/bash.ts |
| `SUPPORTED_IMAGE_MIMES` | jpeg/png/gif/webp | tool/read.ts |
| `FILE_LIMIT` | 10 | tool/skill.ts |
| 快照 prune 周期 | 7 天 | snapshot |
| 快照大小限制 | 2MB | snapshot |
