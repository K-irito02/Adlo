# OpenCode 快速参考 — 文件路径查找

> 按功能域组织的文件路径映射，支持 Ctrl+F 搜索关键词快速定位。
> 所有路径相对于 `references/opencode/packages/`。

## Agent 系统

```
core/src/agent.ts                        # Agent 注册/查询/选择服务（~111 行）
core/src/agent/agent.ts                  # Agent 核心逻辑
core/src/agent/prompt/                   # Agent prompt 模板（compaction/explore/summary/title）
core/src/agent/subagent-permissions.ts   # Sub-agent 权限派生
core/src/agent/generate.txt              # Agent 生成 prompt
```

## Session 会话

```
core/src/session.ts                      # Session 核心服务（~486 行）
core/src/session/info.ts                 # Session 信息类型
core/src/session/sql.ts                  # Session 数据库操作
core/src/session/todo.ts                 # Session Todo 管理
core/src/session/runner/                 # Session 执行器
core/src/session/prompt/                 # 13 个 System Prompt 模板
core/src/session/compaction.ts           # Compaction 逻辑
core/src/session/overflow.ts             # Token 溢出处理
core/src/session/revert.ts               # Revert 逻辑
core/src/session/instruction.ts          # 指令注入
```

## Tool 系统

```
core/src/tool/tool.ts                    # Tool 抽象（Context/Definition/Content/Config）~162 行
core/src/tool/tools.ts                   # ToolRegistry 接口 ~13 行
core/src/tool/bash.ts                    # Bash 执行工具 ~207 行
core/src/tool/edit.ts                    # 精确编辑工具（old_string→new_string）~223 行
core/src/tool/read.ts                    # 文件/目录/图片读取 ~117 行
core/src/tool/write.ts                   # 文件写入 ~101 行
core/src/tool/glob.ts                    # Glob 模式匹配 ~105 行
core/src/tool/grep.ts                    # 正则搜索 ~137 行
core/src/tool/task.ts                    # 子代理任务工具
core/src/tool/skill.ts                   # Skill 加载工具 ~109 行
core/src/tool/websearch.ts               # Web 搜索
core/src/tool/webfetch.ts                # Web 获取
core/src/tool/apply-patch.ts             # Patch 应用工具
core/src/tool/todowrite.ts               # Todo 写入工具
core/src/tool/plan.ts                    # Plan 模式工具
core/src/tool/question.ts                # 提问工具
core/src/tool/lsp.ts                     # LSP 工具
core/src/tool/shell.ts                   # Shell 工具
core/src/tool/registry.ts                # 工具注册表
core/src/tool/schema.ts                  # 工具 Schema
core/src/tool/truncate.ts                # 输出截断
```

## LLM 抽象层

```
llm/src/llm.ts                           # LLM.reqeust/stream/generate 高级接口
llm/src/provider.ts                      # Provider 类型定义
llm/src/tool.ts                          # 类型安全工具构造器
llm/src/tool-runtime.ts                  # 工具调度器
llm/src/cache-policy.ts                  # 缓存策略
llm/src/route/client.ts                  # Route.make() + LLMClient 服务
llm/src/route/auth.ts                    # 认证（bearer/apiKeyHeader/passthrough）
llm/src/route/endpoint.ts                # URL 构造
llm/src/route/framing.ts                 # 流帧协议（SSE/binary）
llm/src/route/executor.ts                # 请求执行器
llm/src/route/transport/http.ts          # HTTP 传输
llm/src/route/transport/websocket.ts     # WebSocket 传输
llm/src/protocols/openai-chat.ts         # OpenAI Chat 协议
llm/src/protocols/openai-responses.ts    # OpenAI Responses 协议
llm/src/protocols/anthropic-messages.ts  # Anthropic Messages 协议
llm/src/protocols/gemini.ts              # Gemini 协议
llm/src/protocols/bedrock-converse.ts    # Bedrock Converse 协议
llm/src/protocols/openai-compatible-chat.ts  # 通用兼容路由
llm/src/providers/openai.ts              # OpenAI Provider
llm/src/providers/anthropic.ts           # Anthropic Provider
llm/src/providers/google.ts              # Google Provider
llm/src/providers/xai.ts                 # xAI Provider
llm/src/providers/azure.ts               # Azure Provider
llm/src/providers/amazon-bedrock.ts      # Amazon Bedrock Provider
llm/src/providers/cloudflare.ts          # Cloudflare Provider
llm/src/providers/github-copilot.ts      # GitHub Copilot Provider
llm/src/providers/openrouter.ts          # OpenRouter Provider
llm/src/providers/openai-compatible.ts   # OpenAI 兼容 Provider
llm/src/schema/                          # LLM 专用 Schema（errors/events/ids/messages/options）
```

## 权限系统

```
core/src/permission.ts                   # PermissionV2 服务（~309 行）
core/src/policy.ts                       # Policy 通配符引擎（~49 行）
core/src/permission/evaluate.ts          # 权限评估
core/src/permission/arity.ts             # 权限参数
schema/src/permission.ts                 # 权限 Schema
schema/src/permission-v1.ts              # V1 权限 Schema
schema/src/permission-saved.ts           # 已保存权限 Schema
```

## 配置系统

```
core/src/config.ts                       # Config 核心服务（~227 行）
core/src/config/agent.ts                 # Agent 配置
core/src/config/lsp.ts                   # LSP 配置
core/src/config/mcp.ts                   # MCP 配置
opencode/src/config/config.ts            # CLI 配置加载
opencode/src/config/parse.ts             # 配置解析
opencode/src/config/paths.ts             # 配置路径
opencode/src/config/variable.ts          # 配置变量
```

## MCP 集成

```
core/src/mcp/                            # MCP 客户端
opencode/src/mcp/auth.ts                 # MCP 认证
opencode/src/mcp/catalog.ts              # MCP Catalog
opencode/src/mcp/oauth-callback.ts       # OAuth 回调
opencode/src/mcp/oauth-provider.ts       # OAuth Provider
```

## LSP 集成

```
core/src/lsp/                            # LSP 客户端核心
opencode/src/lsp/client.ts               # LSP 客户端
opencode/src/lsp/diagnostic.ts           # 诊断
opencode/src/lsp/language.ts             # 语言支持
opencode/src/lsp/launch.ts               # 服务器启动
opencode/src/lsp/server.ts               # 服务器管理
```

## Plugin 系统

```
core/src/plugin.ts                       # Plugin 生命周期管理（~167 行）
core/src/plugin/host.ts                  # Plugin Host
core/src/plugin/agent.ts                 # Plugin Agent
core/src/plugin/skill.ts                 # Plugin Skill
plugin/src/index.ts                      # Plugin SDK 入口
plugin/src/tool.ts                       # Plugin 工具 API
plugin/src/tui.ts                        # Plugin TUI API
plugin/src/v2/effect/                    # Effect API（agent/aisdk/catalog/command/context/event/filesystem/integration/location/npm/path/plugin/reference/registration/skill）
plugin/src/v2/promise/                   # Promise API
```

## Snapshot 快照

```
core/src/snapshot.ts                     # Snapshot 核心服务（~266 行）
core/src/snapshot/index.ts               # Snapshot 模块
```

## Patch 系统

```
core/src/patch.ts                        # Patch 解析（Begin/End Patch 格式）~198 行
core/src/patch/index.ts                  # Patch 模块
```

## Git 版本控制

```
core/src/git.ts                          # Git 操作
core/src/project.ts                      # 项目解析（Git remote → project ID）
core/src/project/sql.ts                  # 项目持久化
core/src/project/copy.ts                 # 项目复制
```

## Schema 核心类型

```
schema/src/agent.ts              schema/src/catalog.ts
schema/src/command.ts            schema/src/connection.ts
schema/src/credential.ts         schema/src/event.ts
schema/src/file-diff.ts          schema/src/filesystem.ts
schema/src/ide-event.ts          schema/src/identifier.ts
schema/src/llm.ts                schema/src/location.ts
schema/src/lsp-event.ts          schema/src/mcp-event.ts
schema/src/model.ts              schema/src/models-dev.ts
schema/src/permission.ts         schema/src/plugin.ts
schema/src/project.ts            schema/src/prompt.ts
schema/src/provider.ts           schema/src/pty.ts
schema/src/question.ts           schema/src/reference.ts
schema/src/revert.ts             schema/src/session.ts
schema/src/skill.ts              schema/src/tui-event.ts
schema/src/vcs-event.ts          schema/src/workspace.ts
schema/src/index.ts              # 统一导出
```

## HTTP API 路由（Protocol + Server）

```
protocol/src/groups/             # 18 路由组定义（agent/command/credential/event/fs/health/integration/location/message/model/permission/project-copy/provider/pty/question/reference/session/skill）
protocol/src/api.ts              # HttpApi 主定义
protocol/src/errors.ts           # API 错误类型
server/src/handlers/             # 18 路由 handler 实现
server/src/routes.ts             # 路由组装
server/src/auth.ts               # 认证
server/src/cors.ts               # CORS
```

## CLI 入口

```
opencode/src/index.ts            # CLI 主入口
opencode/src/cli/cmd/run.ts      # run 命令
opencode/src/cli/cmd/serve.ts    # serve 命令
opencode/src/cli/cmd/tui.ts      # tui 命令
opencode/src/cli/cmd/web.ts      # web 命令
opencode/src/cli/cmd/mcp.ts      # mcp 命令
opencode/src/cli/cmd/models.ts   # models 命令
opencode/src/cli/cmd/agent.ts    # agent 命令
opencode/src/cli/cmd/cmd.ts      # 命令注册
opencode/src/cli/bootstrap.ts    # 启动引导
opencode/src/cli/ui.ts           # CLI UI 工具
```

## TUI 终端界面

```
tui/src/                         # SolidJS TUI 组件
tui/src/index.tsx                # TUI 入口
tui/src/runtime.tsx              # TUI 运行时
tui/src/config/                  # TUI 配置
tui/src/feature-plugins/         # 功能插件
```

## Web 应用

```
app/src/app.tsx                  # Web App 入口
app/src/entry.tsx                # 渲染入口
app/src/context/                 # Context Providers（file/mcp/sdk/sync/tabs）
app/src/pages/home.tsx           # 主页
app/src/pages/layout.tsx         # 布局
app/src/i18n/                    # 18 语言翻译
app/src/utils/                   # 工具函数
```

## 桌面应用

```
desktop/src/main/apps.ts         # Electron 主进程
desktop/src/main/ipc.ts          # IPC 通信
desktop/src/main/menu.ts         # 菜单
```

## 数据库

```
core/src/database/               # SQLite 引擎（bun/node 双实现）
core/src/data-migration.sql.ts   # 数据迁移
core/drizzle.config.ts           # Drizzle 配置
core/schema.json                 # 数据库 Schema JSON
```

## 测试

```
core/test/                       # Core 测试
core/test/fixture/git.ts         # Git 测试 Fixture
core/test/lib/effect.ts          # Effect 测试工具
core/test/lib/tool.ts            # Tool 测试工具
core/test/preload.ts             # 测试预加载
llm/test/                        # LLM 测试
llm/test/lib/effect.ts           # LLM Effect 测试工具
llm/test/lib/http.ts             # HTTP 测试工具
llm/test/lib/sse.ts              # SSE 测试工具
opencode/test/                    # CLI 测试
opencode/test/preload.ts         # CLI 测试预加载
```

## 规范文件

```
references/opencode/AGENTS.md    # 代理规范（bun API 优先、Effect-TS 风格、禁止 any 等）
references/opencode/CONTEXT.md   # 术语表（System Context/Context Epoch/Session Drain 等）
references/opencode/package.json # 工作区配置（30+ workspace 包）
references/opencode/turbo.json   # Turbo 构建配置
references/opencode/bunfig.toml  # Bun 配置
```
