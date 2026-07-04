# OpenCode 深度分析（二）：架构设计与包依赖

> 源码参考路径：`references/opencode/packages/`

---

## 1. 整体架构理念

OpenCode 采用 **Effect-TS 函数式编程范式** 构建，核心设计理念：

| 理念 | 描述 |
|------|------|
| **依赖倒置** | Schema→Protocol→Core→Server，高层不依赖低层 |
| **分层解耦** | 每层只依赖下层，通过 Layer/Service 注入绑定 |
| **不可变值传递** | Schema 契约默认只读，运行时可变性显式声明 |
| **Effect 服务层组合** | 所有 IO 通过 `Effect` 类型表达，服务通过 `Layer` 组合 |

---

## 2. 包依赖流向

```
              ┌────────────────────────────────────────┐
              │           schema (纯契约, 无依赖)         │
              └─────┬──────────────────────────┬───────┘
                    │                          │
              ┌─────▼────────┐          ┌──────▼──────┐
              │     llm       │          │   plugin    │←─ 纯类型契约
              │ (依赖 schema)  │          └──────────────┘
              └─────┬────────┘
                    │
              ┌─────▼────────┐
              │   protocol    │  HTTP API 路由定义
              │ (依llm+schema) │
              └─────┬────────┘
                    │
              ┌─────▼────────┐
              │     core      │  所有业务领域服务
              │ (依sch+llm)   │  Agent, Session, Config, Git, Permission...
              └─────┬────────┘
                    │
              ┌─────▼────────┐
              │    server     │  HTTP 服务组装
              │ (依core+proto) │
              └─────┬────────┘
                    │
         ┌──────────┼──────────┐
         │          │          │
    ┌────▼───┐ ┌───▼────┐ ┌──▼──────┐
    │opencode│ │  tui   │ │  app    │  客户端入口
    │(CLI)   │ │(终端UI)│ │(Web UI) │
    └────────┘ └────────┘ └─────────┘
```

### 关键约束

1. **Client 可依赖 Schema 和 Protocol，但绝不依赖 Core 或 Server**
2. **Schema 和 Protocol 不得传递依赖**：数据库、Drizzle、Session 执行、providers、watchers、原生模块、WASM
3. **sdk-next 组合 Client + Core + Server**（内嵌SDK）
4. **Plugin 包是纯类型契约**，Core 通过 `PluginHost.make()` 创建运行时宿主

---

## 3. Effect-TS 核心模式

### 3.1 Service + Layer 依赖注入

每个领域模块定义三要素：

```typescript
// 1. 服务接口声明
class SessionV2 extends Context.Service<"SessionV2">()("SessionV2", {
  create: Effect<...>,
  prompt: Effect<...>,
  list: Effect<...>,
}) {}

// 2. Layer 实现绑定
const layer = Layer.effect(SessionV2, makeSessionV2Service)

// 3. 节点定义（声明依赖关系）
const node = makeLocationNode({
  service: SessionV2,
  layer,
  deps: [Database.node, EventV2.node, SessionExecution.node]
})
```

### 3.2 Global vs Location 节点

| 类型 | 生命周期 | 示例 |
|------|----------|------|
| `makeGlobalNode` | 进程级单例 | Database、Git、Global paths |
| `makeLocationNode` | 每工作目录独立实例 | Agent、Config、Permission、Skill、Plugin |

### 3.3 State 可重放变换

`packages/core/src/state.ts` 提供 `transform()` + `reload()` 模式：

```typescript
// 插件/配置通过 scoped transform 注册变更
State.transform(state, PluginAdded({ ... }))
// Scope 关闭后自动回滚
// 状态重建：initial() → 重放所有 transform → 提交
```

---

## 4. 数据流架构

```
┌─────────────────────────────────────────────────────┐
│  Client (TUI / Web / Embedded)                       │
│  ├─ HTTP RESTful API 调用                            │
│  └─ SSE 事件流订阅                                   │
├─────────────────────────────────────────────────────┤
│  Server (HTTP Layer)                                 │
│  ├─ 认证/授权 (Basic Auth / Embedded)                │
│  ├─ 中间件链 (Auth -> SchemaError -> Routes)         │
│  └─ 请求路由 → Handler → Core Service                │
├─────────────────────────────────────────────────────┤
│  Core (Domain Layer)                                 │
│  ├─ Session Execution Engine                         │
│  │   └─ SessionPrompt → LLM Stream → Tool Dispatch   │
│  ├─ Tool Registry (bash/read/write/edit/grep/glob)  │
│  ├─ Permission Engine (deny/ask/allow)               │
│  └─ Git Operations (clone/commit/diff/worktree)     │
├─────────────────────────────────────────────────────┤
│  LLM (Provider Layer)                                │
│  ├─ Route = Protocol + Endpoint + Auth + Framing    │
│  ├─ Provider Facades (OpenAI/Anthropic/Google...)    │
│  └─ Tool Runtime (typed + dynamic)                   │
├─────────────────────────────────────────────────────┤
│  Storage (Drizzle + SQLite)                          │
│  ├─ sessions / messages / parts                      │
│  ├─ events / permissions / config                    │
│  └─ projections / compacted transcripts             │
└─────────────────────────────────────────────────────┘
```

---

## 5. Client/Server 通信架构

### 5.1 HTTP API 协议

- 使用 Effect `HttpApi` 框架声明式路由定义
- 每个路由组通过 middleware 注入 Location/Session 上下文
- 支持 HTTP RESTful + SSE 事件流

### 5.2 三种客户端模式

| 模式 | 连接方式 | 使用场景 |
|------|----------|----------|
| **本地 (TUI)** | 进程内直连 | 终端开发 |
| **Web** | HTTP + SSE (Sidecar 或远程) | 浏览器访问 |
| **Embedded** | 内存 HTTP Transport | 插件/SDK 集成 |

### 5.3 桌面端 Sidecar 架构

```
┌──────────────────────────────────────────────────────┐
│ Electron Main Process                                  │
│  ├─ 启动本地 Sidecar 服务器（随机端口 + 密码认证）       │
│  ├─ 管理 WSL Sidecar（Windows）                        │
│  ├─ IPC 处理（文件选择器、剪贴板、原生通知）            │
│  └─ 自动更新                                           │
├──────────────────────────────────────────────────────┤
│ Electron Renderer Process                              │
│  ├─ 加载 Web UI                                       │
│  ├─ contextBridge 暴露 window.api                     │
│  └─ HTTP 连接 Sidecar 服务器                          │
└──────────────────────────────────────────────────────┘
```

---

## 6. 对当前项目的架构借鉴

### 你的项目 (Tauri + Rust) vs OpenCode (Electron + TypeScript)

| 维度 | 你的项目 | OpenCode | 借鉴方向 |
|------|----------|----------|----------|
| **类型契约** | `kernel/types/` Rust struct | `schema/` Effect Schema | 可建立独立 `types` crate 作为公共契约 |
| **IPC** | Tauri Command | HTTP API (Effect HttpApi) | Tauri Command 本质也是声明式 API 定义 |
| **状态管理** | Zustand store | SolidJS Context + createStore | 借鉴分层 Context 模式 |
| **依赖注入** | Tauri State | Effect Layer | 已有 Rust DI 模式，可参考分层设计 |
| **插件系统** | 暂无 | Plugin SDK (纯契约 + 宿主实现) | 先定义插件契约 trait，再在 core 实现宿主 |
| **自我引导** | `.trae/rules/` | `.opencode/` | 可增强 `.trae/` 目录作为 AI 管理入口 |
| **Sidecar** | Tauri 内置 | Electron 手动管理 | Tauri 有更好的内置支持 |

### 关键可复用模式

1. **服务分层**：参考 OpenCode 的 Schema→Core→Server 分层，你的项目可对应为 `kernel` (types)→`crates/*` (domain)→Tauri Commands (API)
2. **Location Scope**：OpenCode 的 Global vs Location 节点划分，可对应你的进程级 vs 工作区级服务
3. **State 可重放变换**：配置/插件的增量变更+自动回滚机制，适合你的插件热加载需求
