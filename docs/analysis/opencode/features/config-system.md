# 配置系统

> 源码：`core/src/config.ts`（~227 行）、`opencode/src/config/`、`core/src/config/`

## 多层配置聚合

OpenCode 的配置从多个来源聚合，后加载的覆盖先加载的：

```
优先级（低→高）：
1. 全局默认值（硬编码）
2. 系统级配置（~/.config/opencode/opencode.jsonc）
3. 用户级配置（~/.opencode/opencode.jsonc）
4. 项目级配置（<project>/.opencode/opencode.jsonc）
5. 环境变量（OPENCODE_*）
6. CLI 参数（--model, --agent 等）
```

## 配置核心服务

```ts
// core/src/config.ts
Config.Interface = {
  entries(): Effect<ConfigEntry[]>
}

Config.Info = {
  $schema?: string
  shell?: string
  model?: string             // 默认模型
  default_agent?: string     // 默认 agent
  autoupdate?: boolean
  share?: ShareConfig
  enterprise?: EnterpriseConfig
  username?: string
  permissions?: Permission.Ruleset[]
  policies?: Policy.Info[]
  // ... 更多配置项
}
```

## 配置加载链

```
opencode/src/config/
├── config.ts        # 主配置加载器
├── parse.ts         # JSONC 解析（支持注释和尾逗号）
├── paths.ts         # 配置查找路径（全局/用户/项目）
├── variable.ts      # 环境变量解析（OPENCODE_*）
├── agent.ts         # Agent 配置
├── command.ts       # 命令配置
├── managed.ts       # 托管配置
├── markdown.ts      # Markdown 配置
├── plugin.ts        # Plugin 配置
└── entry-name.ts    # 入口名称
```

## 子配置

### Agent 配置（`core/src/config/agent.ts`）
```ts
AgentConfig = {
  [agentID: string]: {
    name: string
    model?: string
    prompt?: string
    hidden?: boolean
    permission?: Permission.Ruleset[]
    color?: string
  }
}
```

### LSP 配置（`core/src/config/lsp.ts`）
```ts
LSPConfig = {
  enabled: boolean
  servers: Map<Language, ServerConfig>
}
```

### MCP 配置（`core/src/config/mcp.ts`）
```ts
MCPConfig = {
  servers: {
    [serverID: string]: {
      type: "stdio" | "sse" | "streamable-http"
      command?: string
      args?: string[]
      url?: string
      headers?: Record<string, string>
    }
  }
}
```

## JSONC 配置示例

```jsonc
// .opencode/opencode.jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-opus-4-5",
  "default_agent": "build",
  "shell": "bash",
  "permissions": {
    "allow": [
      { "action": "Read", "resource": "/**" },
      { "action": "Glob", "resource": "/**" },
      { "action": "Grep", "resource": "/**" }
    ]
  },
  "agent": {
    "reviewer": {
      "name": "Code Reviewer",
      "model": "anthropic/claude-sonnet-4-5",
      "permission": { "allow": ["Read", "Glob", "Grep"] }
    }
  },
  "mcp": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}
```

## 配置热重载

- 配置文件变更后通过文件监听自动重载
- TUI/Web 界面实时反映最新配置
- 重载后不中断正在运行的 Session

## 环境变量

| 变量 | 说明 |
|------|------|
| `OPENCODE_MODEL` | 默认模型 |
| `OPENCODE_AGENT` | 默认 agent |
| `OPENCODE_SHELL` | Shell 类型 |
| `OPENCODE_AUTH_TOKEN` | 认证 token |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 |
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `GOOGLE_API_KEY` | Google API 密钥 |
| `*_API_KEY` | 通用 Provider API 密钥模式 |
