# OpenCode 项目总览

> 源码仓库：[github.com/sst/opencode](https://github.com/sst/opencode)（`dev` 分支）
> 本地参考：`references/opencode/`

## 项目定位

OpenCode 是 SST 团队开发的**完全开源的终端 AI 编码代理**（MIT 许可），核心能力对标 Claude Code。

| 特征 | 说明 |
|------|------|
| 100% 开源 | MIT 许可，代码完全公开 |
| 模型无关 | 推荐 Anthropic，同时支持 OpenAI、Google Gemini、本地模型 |
| TUI 优先 | 为 Neovim 用户打造，追求极致终端交互体验 |
| Client/Server 架构 | 支持远程驱动——后台运行，远程操控 |
| 多客户端 | TUI / Web / Desktop(Electron) 三种客户端 |
| Effect-TS 函数式 | 全栈 Effect-TS 4.0 作为核心运行时 |
| TypeScript 全栈 | 无 Rust/C++ 后端，纯 TypeScript + Bun |

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 运行时 | Bun 1.3.14 | 包管理 + 脚本执行 + 构建 |
| 语言 | TypeScript 5.8.2 | 严格模式 |
| 函数式核心 | Effect-TS 4.0.0-beta.83 | 依赖注入、并发、错误处理 |
| 数据库 | SQLite (bun:sqlite) + Drizzle ORM 1.0.0-rc.2 | 本地持久化 |
| HTTP 框架 | Hono 4.10.7 | HTTP API 服务器 |
| Web UI | SolidJS 1.9.10 + Tailwind CSS 4.1.11 + Vite 7.1.4 | Web 应用 |
| TUI | SolidJS + opentui | 终端渲染框架 |
| 桌面 | Electron | 桌面壳（electron-builder 打包） |
| LLM SDK | @ai-sdk/* (Vercel AI SDK 6.0.168) | Provider 抽象 |
| MCP | @modelcontextprotocol/sdk 1.29.0 | MCP 客户端 |
| ACP | @agentclientprotocol/sdk | Zed 编辑器集成 |
| 终端 | @lydell/node-pty 1.2.0-beta.12 | PTY 伪终端 |
| LSP | web-tree-sitter + tree-sitter-bash/powershell | LSP 客户端 |
| 包管理 | bun workspaces (30+ packages) | Monorepo |

## 项目规模

| 指标 | 数量 |
|------|------|
| Workspace 包 | 30+ |
| Schema 类型文件 | 56 |
| LLM 协议 | 6（openai-chat/responses, anthropic-messages, gemini, bedrock-converse, openai-compatible-chat） |
| LLM Provider | 12 |
| 内置 Agent | 7（build/plan/general/explore/compaction/title/summary） |
| 内置 Tool | 15+（bash/edit/read/write/glob/grep/task/skill/websearch/webfetch/plan/question/lsp/shell/apply_patch/todowrite） |
| HTTP API 路由组 | 18 |
| CI/CD Workflow | 26 |
| 内置 Plugin | 10+（Copilot/Codex/Cloudflare/Azure/DigitalOcean/Snowflake/xAI/GitLab/Poe 等） |

## 仓库顶层结构

```
opencode/
├── .github/workflows/     # 26 个 CI/CD 工作流
├── .husky/                # pre-push hook
├── .opencode/             # 自我引导配置（用 OpenCode 管理 OpenCode）
│   ├── agent/             # 自动分类 agent
│   ├── command/           # 自动化命令
│   ├── skills/            # Effect 编码规范
│   └── tool/              # GitHub Triage 自定义工具
├── packages/              # 30+ Bun workspace 包
├── infra/                 # SST 基础设施（AWS）
├── nix/                   # Nix 构建配置
├── script/                # 构建/发布/统计脚本
├── specs/                 # 产品规格文档
├── sdks/vscode/           # VS Code 扩展
├── github/                # GitHub Action 代码
├── patches/               # 16 个依赖补丁
├── artifacts/             # 演示产物
├── flake.nix              # Nix flake
├── turbo.json             # Turborepo 配置
├── package.json           # 根工作区配置
├── bunfig.toml            # Bun 配置
├── tsconfig.json          # 根 TypeScript 配置
├── AGENTS.md              # 代理编码规范
└── CONTEXT.md             # 领域术语表
```

## 核心架构速览

```
┌─────────────────────────────────┐
│  schema（纯契约，仅依赖 effect）   │  ← 最底层
├─────────────────────────────────┤
│  llm          │  protocol       │  ← 独立领域
│  (依赖schema)  │  (依赖schema)    │
├───────────────┴─────────────────┤
│  core（依赖 llm+schema）         │  ← 核心业务
├─────────────────────────────────┤
│  server（依赖 core+protocol）    │  ← HTTP 组装
├─────────────────────────────────┤
│  opencode CLI（依赖以上全部）     │  ← 主入口
├───────────────┬─────────────────┤
│  app (Web)    │  tui (终端)      │  ← 客户端
├───────────────┴─────────────────┤
│  desktop (Electron)             │  ← 桌面壳
└─────────────────────────────────┘

横向生态：
  plugin（插件 SDK）→ 被 core/opencode 消费
  client（HTTP 客户端）→ 仅依赖 schema+protocol
  sdk-next（嵌入式 SDK）→ 组合 client+core+server
```

## 关键设计理念

1. **依赖倒置**：Schema→Protocol→Core→Server，高层不依赖低层
2. **Effect-TS 作为骨架**：所有 IO 通过 `Effect` 类型表达，服务通过 `Layer` 组合
3. **不可变值传递**：Schema 契约默认只读，运行时可变性显式声明
4. **Protocol-Server 分离**：Protocol 定义路由结构（纯类型），Server 注入具体实现
5. **Codegen 驱动**：HTTP Client 从 `HttpApi` 类型自动生成（Promise + Effect 双版本）
6. **双平台条件导入**：`#sqlite`/`#pty`/`#fff` 通过 Bun 条件导出切换 Bun/Node 实现
