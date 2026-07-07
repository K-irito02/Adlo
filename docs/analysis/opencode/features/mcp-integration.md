# MCP 集成

> 源码：`opencode/src/mcp/`、`core/src/plugin/`（MCP Provider 适配器）

## 架构

```
MCP 客户端 (opencode/src/mcp/)
├── catalog.ts          # MCP 服务器目录（发现/注册/配置）
├── auth.ts             # MCP 认证
├── oauth-callback.ts   # OAuth 回调处理
├── oauth-provider.ts   # OAuth Provider
└── index.ts            # 入口

插件 Provider 适配器 (core/src/plugin/)
├── github-copilot/     # GitHub Copilot MCP
│   ├── copilot.ts
│   └── models.ts
├── openai/             # OpenAI Codex MCP
│   ├── codex.ts
│   ├── ws-pool.ts
│   └── ws.ts
└── (其他内置插件使用 MCP 协议)
```

## 技术栈

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@modelcontextprotocol/sdk` | 1.29.0 | MCP 协议 SDK |

## 3 种 Transport

| Transport | 说明 | 使用场景 |
|-----------|------|----------|
| **Stdio** | 标准输入/输出进程通信 | 本地 MCP 服务器（如文件系统、Git 工具） |
| **StreamableHTTP** | HTTP 流式传输 | 远程 MCP 服务器 |
| **SSE** | Server-Sent Events | HTTP 服务端推送 |

## MCP Catalog（目录系统）

```ts
// opencode/src/mcp/catalog.ts
Catalog = {
  list(): MCP.Server[]
  get(id: string): MCP.Server
  register(config: MCP.Config): MCP.Server
  unregister(id: string): void
}

MCP.Config = {
  name: string
  transport: "stdio" | "sse" | "streamable-http"
  command?: string       // stdio transport
  args?: string[]
  url?: string           // HTTP/SSE transport
  headers?: Record<string, string>
}
```

## MCP 工具暴露

MCP 服务器的工具被自动暴露给 AI Agent：

```
MCP Server 发现 → 连接到 MCP Server
  │
  ▼
MCP.listTools() → 返回 Tool[]
  │
  ▼
ToolRegistry.register(tools) → 注册到 Agent 可用工具集
  │
  ▼
Agent 调用 mcp__<server>__<tool> → ToolRuntime 转发到 MCP
```

## OAuth 集成

```ts
// opencode/src/mcp/oauth-callback.ts
// 处理 MCP OAuth 回调流程
OAuthCallback = {
  startAuthFlow(serverId: string): Effect<string>  // 返回授权 URL
  handleCallback(code: string, state: string): Effect<Token>
  refreshToken(serverId: string): Effect<Token>
}

// opencode/src/mcp/oauth-provider.ts
// 动态客户端注册 + Token 存储
```

## 内置 MCP Provider 插件

| 插件 | 路径 | 用途 |
|------|------|------|
| GitHub Copilot | `plugin/src/github-copilot/` | Copilot MCP 连接 |
| OpenAI Codex | `plugin/src/openai/` | Codex MCP + WebSocket 池 |

## 关键设计要点

1. **工具名命名空间**：MCP 工具自动添加 `mcp__<server>__<tool>` 前缀避免冲突
2. **资源工具**：MCP 资源通过 `mcp__<server>__read_resource` 自动暴露
3. **错误传播**：MCP 连接错误通过 Effect 的 Either 传播到 Agent
4. **懒连接**：MCP 服务器按需连接（首次工具调用时），非启动时全量连接
