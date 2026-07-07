# Plugin 系统

> 源码：`core/src/plugin.ts`（~167 行）、`plugin/src/`、`opencode/src/plugin/`

## 架构层次

```
Plugin SDK (@opencode-ai/plugin)
├── v2/effect/         # Effect-TS API（14 个域）
└── v2/promise/        # Promise API（14 个域）

Plugin Host (core/src/plugin/)
├── host.ts            # Plugin 宿主环境
├── agent.ts           # Plugin Agent
└── skill.ts           # Plugin Skill

Plugin Runtime (opencode/src/plugin/)
├── loader.ts          # npm + 本地插件加载
├── install.ts         # Plugin 安装
├── runtime.ts         # TUI 插件运行时
├── meta.ts            # 插件元数据
├── shared.ts          # 共享工具
└── pty-environment.ts # PTY 环境
```

## Plugin SDK API（14 个域）

| 域 | Effect API | Promise API | 说明 |
|----|-----------|-------------|------|
| `agent` | `v2/effect/agent.ts` | `v2/promise/agent.ts` | Agent 注册/配置 |
| `aisdk` | `v2/effect/aisdk.ts` | `v2/promise/aisdk.ts` | AI SDK Provider 注册 |
| `catalog` | `v2/effect/catalog.ts` | `v2/promise/catalog.ts` | 模型目录 |
| `command` | `v2/effect/command.ts` | `v2/promise/command.ts` | 自定义命令 |
| `context` | — | — | 上下文源 |
| `event` | — | — | 事件系统 |
| `filesystem` | — | — | 文件系统工具 |
| `integration` | — | — | 集成注册 |
| `location` | — | — | 位置服务 |
| `npm` | — | — | NPM 工具 |
| `path` | — | — | 路径工具 |
| `plugin` | — | — | 插件管理 |
| `reference` | — | — | 引用系统 |
| `registration` | — | — | 插件注册 |
| `skill` | — | — | 技能系统 |

## 插件生命周期

```
Plugin.add(id, effect)
  │
  ├── KeyedMutex 锁定（防止并发加载）
  ├── 加载 npm 包或本地模块
  │
  ▼
Plugin Runtime 初始化
  ├── 执行插件 setup()
  ├── 注册 Tool / Agent / Provider / Skill
  └── 注册 Hooks（事件监听）
  │
  ▼
运行时
  ├── Hook: tool.execute.before → 工具执行前拦截
  ├── Hook: tool.execute.after  → 工具执行后拦截
  ├── Hook: experimental.chat.system.transform → System Prompt 转换
  └── ... 更多 Hook
  │
  ▼
Plugin.remove(id)
  ├── 清理注册的工具/Agent/Provider
  ├── 移除 Hook 监听
  └── 卸载模块
```

## Plugin 核心服务

```ts
// core/src/plugin.ts (~167 行)
Plugin.Interface = {
  add(id: Plugin.ID, effect: Effect<void>): Effect<void>
  remove(id: Plugin.ID): Effect<void>
  wait(id: Plugin.ID): Effect<void>   // 等待初始化完成
}
```

## 内置插件（10+）

| 插件 | 路径 | 功能 |
|------|------|------|
| GitHub Copilot | `plugin/src/github-copilot/` | Copilot 模型接入 |
| OpenAI Codex | `plugin/src/openai/` | Codex MCP + WebSocket 池 |
| Cloudflare | `plugin/src/cloudflare.ts` | Cloudflare AI Gateway |
| Azure | `plugin/src/azure.ts` | Azure OpenAI |
| DigitalOcean | `plugin/src/digitalocean.ts` | DO GenAI |
| Snowflake Cortex | `plugin/src/snowflake-cortex.ts` | Snowflake AI |
| xAI | `plugin/src/xai.ts` | Grok 模型 |
| GitLab | 内置 | GitLab AI |
| Poe | 内置 | Poe API |

## 插件加载源

```ts
// opencode/src/plugin/loader.ts
PluginLoader = {
  npm: "npm:<package-name>"        // npm 包
  local: "./path/to/plugin"        // 本地路径
  url: "https://..."               // 远程 URL
  github: "github:user/repo"       // GitHub 仓库
}
```

## Hook 系统

```ts
interface PluginHooks {
  "tool.execute.before": (ctx: ToolContext) => Effect<ToolContext>
  "tool.execute.after": (ctx: ToolContext, result: ToolResult) => Effect<ToolResult>
  "experimental.chat.system.transform": (prompt: string) => Effect<string>
  "session.create": (session: Session.Info) => Effect<Session.Info>
  "session.before-compaction": (session: Session.Info) => Effect<void>
}
```

## 关键设计要点

1. **双 API**：Effect 和 Promise 两个版本，适合不同使用场景
2. **KeyedMutex 锁**：防止同一插件的并发加载/卸载
3. **失败缓存**：加载失败的插件 5 分钟内不重试
4. **等待机制**：`wait(id)` 允许依赖插件初始化完成后执行
5. **Provider 适配器**：30+ Provider 适配器以插件形式注入（`core/src/plugin/`）
