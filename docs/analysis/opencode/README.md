# OpenCode 源码地图 — 导航入口

> 源码路径：`references/opencode/`
> 版本：v1.17.13 | 许可：MIT | 语言：TypeScript (Bun runtime)
> 仓库：[github.com/sst/opencode](https://github.com/sst/opencode)（`dev` 分支）

## 使用指南

本目录是 OpenCode 源码的**结构化索引**，按渐进式披露设计：

| 层级 | 文件 | 何时阅读 |
|------|------|----------|
| **L0 快查** | [00-quick-reference.md](./00-quick-reference.md) | 需要快速定位某个功能的源文件路径 |
| **L1 总览** | [01-project-overview.md](./01-project-overview.md) | 了解项目定位、技术栈、关键数字 |
| **L1 架构** | [02-architecture.md](./02-architecture.md) | 理解分层架构、包依赖流向、Effect-TS 模式 |
| **L1 包索引** | [03-package-index.md](./03-package-index.md) | 查阅任一个包的职责、关键文件和导出 |
| **L2 功能** | [features/](./features/) | 深入某个具体功能的实现细节 |
| **L3 模式** | [patterns/](./patterns/) | 学习跨功能的编码模式和惯例 |
| **L4 对比** | [comparison/](./comparison/) | AI Digital Life 与 OpenCode 的差距分析 |

### 阅读策略

```
需要找某个文件？       → 00-quick-reference.md（Ctrl+F 搜索关键词）
需要理解整体设计？     → 01 → 02 → 03（顺序阅读）
需要参考某个功能实现？  → README（本页）→ 定位到 features/ 对应文件
需要学习编码模式？     → patterns/
需要对比 ADL 差距？   → comparison/
```

## 功能 → 文件快速映射

| 想看什么 | 去哪个文件 |
|----------|-----------|
| LLM Provider 如何抽象 | [features/llm-layer.md](./features/llm-layer.md) |
| Agent 系统（7 个内置 agent） | [features/agent-system.md](./features/agent-system.md) |
| Tool 系统（bash/edit/read/write/glob/grep...） | [features/tool-system.md](./features/tool-system.md) |
| Session 生命周期（compaction/fork/revert） | [features/session-lifecycle.md](./features/session-lifecycle.md) |
| 权限系统（Ruleset + Policy） | [features/permission-system.md](./features/permission-system.md) |
| MCP 集成（3 transport + OAuth） | [features/mcp-integration.md](./features/mcp-integration.md) |
| LSP 集成 | [features/lsp-integration.md](./features/lsp-integration.md) |
| 快照系统（Git-based snapshot） | [features/snapshot-system.md](./features/snapshot-system.md) |
| System Prompt 模板 | [features/prompt-templates.md](./features/prompt-templates.md) |
| 配置系统（多层 config 聚合） | [features/config-system.md](./features/config-system.md) |
| Plugin 生命周期 | [features/plugin-system.md](./features/plugin-system.md) |
| ACP 协议（与 Zed 集成） | [features/acp-protocol.md](./features/acp-protocol.md) |
| Effect-TS 编码模式 | [patterns/effect-ts.md](./patterns/effect-ts.md) |
| 数据库（Drizzle + SQLite） | [patterns/database.md](./patterns/database.md) |
| 测试模式 | [patterns/testing.md](./patterns/testing.md) |
| ADL 缺失能力清单 | [comparison/gap-analysis.md](./comparison/gap-analysis.md) |

## 关键路径速记

```
OpenCode 源码根: references/opencode/

核心包:
  packages/schema/     → 纯类型契约（56 schema 文件）
  packages/llm/        → LLM 抽象层（6 协议 + 12 Provider）
  packages/protocol/   → HTTP API 路由定义（18 路由组）
  packages/core/       → 核心业务逻辑（~50 领域文件 + 8 子目录）
  packages/server/     → HTTP 服务组装
  packages/opencode/   → CLI 主应用（~200+ 文件，最复杂）

客户端:
  packages/tui/        → 终端 UI（SolidJS + opentui）
  packages/app/        → Web UI（SolidJS + Tailwind）
  packages/desktop/    → Electron 桌面壳

生态:
  packages/plugin/     → 插件 SDK（Effect + Promise 双 API）
  packages/client/     → 自动生成 HTTP 客户端
  packages/sdk-next/   → 嵌入式 SDK
  packages/codemode/   → 受限代码执行引擎
```
