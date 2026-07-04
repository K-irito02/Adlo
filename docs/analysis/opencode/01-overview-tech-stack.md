# OpenCode 深度分析（一）：项目总览与技术栈

> 源码仓库：[github.com/sst/opencode](https://github.com/sst/opencode)（`dev` 分支）
> 本地参考路径：`references/opencode/`

---

## 1. 项目定位

OpenCode 是 SST 团队开发的一款**完全开源的终端 AI 编码代理**，通过命令行在终端中运行，核心能力对标 Claude Code，但架构更灵活、模型选择更多样。

### 核心特征

| 特征 | 说明 |
|------|------|
| 100% 开源 | MIT 许可，代码完全公开 |
| 模型无关 | 推荐 Anthropic，同时支持 OpenAI、Google Gemini、本地模型 |
| TUI 优先 | Neovim 用户打造，追求极致终端交互体验 |
| Client/Server 架构 | 支持远程驱动——后台运行，手机等设备远程操控 |
| 多客户端 | TUI / Web / Desktop(Electron) 三种客户端并存 |

---

## 2. 项目目录结构

```
opencode/
├── .github/              # CI/CD + PR/Issue 自动化（26个工作流）
│   └── workflows/        # test, typecheck, publish, review, triage...
├── .husky/               # pre-push hook（版本检查 + 类型检查）
├── .opencode/            # 自我引导配置（OpenCode 用自身管理自身）
│   ├── agent/            # 自动分类、重复检测 agent
│   ├── command/          # 自动化命令
│   ├── skills/           # Effect 编码规范
│   └── tool/             # GitHub Triage 自定义工具
├── packages/             # 30+ 个 Bun workspace 包
│   ├── schema/           # 类型/契约定义层
│   ├── llm/              # LLM 抽象层（Provider 路由 + 协议适配）
│   ├── protocol/         # HTTP API 路由定义
│   ├── core/             # 核心业务逻辑引擎
│   ├── server/           # HTTP 服务组装
│   ├── opencode/         # CLI 入口（yargs 命令路由）
│   ├── tui/              # 终端 UI（SolidJS + opentui）
│   ├── app/              # Web UI（SolidJS + Tailwind）
│   ├── desktop/          # Electron 桌面应用
│   ├── plugin/           # 插件 SDK
│   ├── cli/              # 新版 CLI 入口
│   ├── client/           # 生成的 HTTP 客户端（Promise + Effect）
│   └── sdk/              # 嵌入式 SDK
├── infra/                # SST 基础设施（AWS 部署）
├── nix/                  # Nix 构建/开发环境
├── AGENTS.md             # 编码规范（源头文件）
├── CONTEXT.md            # 领域术语体系（80+ 个正式定义）
├── CONTRIBUTING.md       # 贡献工作流
└── SECURITY.md           # 安全边界定义
```

---

## 3. 技术栈全景

### 3.1 运行时与语言

| 技术 | 版本 | 用途 |
|------|------|------|
| **Bun** | 1.3.14 | 主运行时（JavaScript/TypeScript） |
| **TypeScript** | 5.8.2 | 主语言 |
| **TypeScript Native** | 7.0.0-dev | 类型检查（`tsgo`，替代 `tsc`） |
| **Golang** | 1.24.x | 部分底层组件 |

### 3.2 前端技术栈

| 技术 | 用途 | 说明 |
|------|------|------|
| **SolidJS** | UI 框架 | TUI + Web + Desktop 统一使用 |
| **@opentui/core** | 终端渲染引擎 | TUI 专用的字符级渲染（BoxRenderable、ScrollBoxRenderable） |
| **@opentui/keymap** | 键盘映射 | 模态键位绑定、Leader 键、组合键序列 |
| **@opentui/solid** | opentui 的 SolidJS 绑定 | `render()`、`useRenderer()`、`useTerminalDimensions()` |
| **Tailwind CSS v4** | Web 样式 | 原子化 CSS |
| **@solidjs/router** | Web 路由 | SolidJS 官方路由 |
| **@tanstack/solid-query** | 服务端状态管理 | Web 端数据缓存 |
| **@kobalte/core** | UI 原语 | Dialog、Popover 等无障碍组件 |
| **@pierre/trees** | 文件树 | 高性能虚拟文件树 |
| **shiki** | 代码高亮 | 精确语法高亮（Marked+Shiki 集成） |
| **ghostty-web** | 终端模拟 | Web 端内嵌终端 |
| **Vite** | 构建工具 | Web 端 HMR 开发服务器 |
| **Electron** | 桌面壳层 | 包裹 Web UI |

### 3.3 后端技术栈

| 技术 | 用途 | 说明 |
|------|------|------|
| **Effect-TS** | 函数式编程框架 | 核心范式，所有 IO 通过 `Effect` 类型表达 |
| **Effect/Schema** | 类型/契约定义 | `Schema.Struct`、`Schema.Class`、`Schema.TaggedErrorClass` |
| **Effect/HttpApi** | HTTP 路由 | 声明式路由定义，替代 Express/Koa |
| **Drizzle ORM** | 数据库 | SQLite，轻量级 ORM |
| **SQLite (libsql)** | 本地数据存储 | 会话、消息、配置持久化 |
| **@lydell/node-pty** | 伪终端 | 终端进程管理 |
| **@parcel/watcher** | 文件监听 | 跨平台文件系统变更通知 |
| **Vercel AI SDK** | LLM 客户端 | `ai` 6.0.168 |
| **yargs** | CLI 框架 | 命令解析和路由 |

### 3.4 开发工具链

| 工具 | 用途 |
|------|------|
| **Bun Workspaces + Catalog** | 包管理（exact 版本锁定 + 最小发布年龄策略） |
| **oxlint** | Lint 检查（替代 ESLint，type-aware） |
| **Prettier** | 代码格式化（semi:false, printWidth:120） |
| **Husky** | Git hooks（pre-push 类型检查） |
| **Turbo** | 任务编排和缓存 |
| **Playwright** | E2E 测试 |
| **SST** | 云基础设施部署 |
| **Sentry** | 前端错误监控 |

### 3.5 关键第三方库

| 库 | 用途 |
|------|------|
| `diff` | 文本差异计算 |
| `fuzzysort` | 模糊搜索 |
| `luxon` | 日期时间处理 |
| `marked` + `marked-shiki` | Markdown 解析 + 代码高亮 |
| `remend` | 流式文本修正 |
| `dompurify` | XSS 防护 |
| `zod` | Web 端参数验证 |
| `remeda` | 实用函数库 |
| `clipboardy` | 剪贴板访问 |
| `cross-spawn` | 跨平台子进程 |

---

## 4. 包管理与版本策略

### 4.1 Bun Workspace + Catalog

```json
{
  "workspaces": {
    "packages": [
      "packages/*",
      "packages/console/*",
      "packages/stats/*",
      "packages/sdk/js",
      "packages/slack"
    ],
    "catalog": {
      "effect": "4.0.0-beta.83",
      "solid-js": "1.9.10",
      "typescript": "5.8.2"
    }
  }
}
```

所有跨包依赖版本集中管理，各包使用 `"catalog:"` 引用。

### 4.2 供应链安全策略

```
[install]
exact = true
minimumReleaseAge = 259200  # 仅安装发布 ≥3 天的包
```

- **exact**: 精确版本锁定，不使用 `^` 语义范围
- **minimumReleaseAge**: 防止供应链攻击（允许 AI SDK 相关包例外）

### 4.3 包命名约定

所有内部包使用 `@opencode-ai/` scope：

| 包名 | 职责 |
|------|------|
| `@opencode-ai/schema` | 共享类型/domain 类型 |
| `@opencode-ai/llm` | LLM Provider 路由和协议适配 |
| `@opencode-ai/protocol` | HTTP 路径/载荷/错误/流 |
| `@opencode-ai/core` | 核心业务逻辑 |
| `@opencode-ai/server` | HTTP 服务器 |
| `@opencode-ai/client` | 生成的 HTTP 客户端 |
| `@opencode-ai/sdk` / `sdk-next` | 嵌入式 SDK |
| `@opencode-ai/app` | SolidJS Web 前端 |
| `@opencode-ai/desktop` | Electron 桌面应用 |
| `@opencode-ai/tui` | 终端 TUI |
| `@opencode-ai/plugin` | 插件 SDK |

---

## 5. 对当前项目的借鉴要点

| OpenCode 做法 | 可借鉴方向 |
|--------------|-----------|
| Effect-TS 函数式范式 | Rust 后端已有类似模式（强类型 + Result），前端可参考 Effect/Result 模式 |
| Schema 驱动的类型系统 | 前后端共享类型契约，类似你的 `kernel/types/` |
| Monorepo + Bun Workspace + Catalog | 已有 pnpm workspace，可参考 catalog 统一版本管理 |
| Drizzle ORM + SQLite | 对比你当前 rusqlite 方案，风格类似 |
| Self-bootstrapping (.opencode/) | 用 AI 管理 AI 项目的理念，可直接借鉴到项目配置 |
| 三端客户端共享核心 | 你当前桌面端 + 未来移动端的设计方向与此完全一致 |
