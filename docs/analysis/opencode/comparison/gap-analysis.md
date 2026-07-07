# AI Digital Life vs OpenCode 差距分析

> 基于 `references/opencode/` 源码分析，列出 ADL 缺失但 OpenCode 已具备的核心能力。

## Agent 系统

| 缺失能力 | OpenCode 实现 | ADL 现状 |
|---------|--------------|----------|
| **多 Agent** | 7 内置 agent（build/plan/general/explore/compaction/title/summary）+ LLM 动态生成 | 单 Agent 三步流程 |
| **Sub-agent** | task 工具 + background 模式 + resume + 权限派生 | 无 |
| **Plan Mode** | 独立 plan agent + plan_enter/exit 工具 + 计划持久化 | /plan 斜杠命令 |

## LLM 抽象层

| 缺失能力 | OpenCode 实现 | ADL 现状 |
|---------|--------------|----------|
| **协议路由解耦** | 四轴分解（Protocol/Endpoint/Auth/Framing）| 无分层抽象 |
| **Provider Prompt** | 13 模板按模型定制 system prompt | 单一 prompt 系统 |
| **Tool Runtime** | 独立 tool-runtime 拦截 + 循环 | Tool 直接调用 |

## Session 管理

| 缺失能力 | OpenCode 实现 | ADL 现状 |
|---------|--------------|----------|
| **Compaction** | Token-aware pruning + 保护 skill 输出 + tail turns | 无压缩策略 |
| **Session Fork** | parent_id 子会话 + 从任意 message 分叉 | 无 |
| **Revert** | Git-based snapshot + unrevert | 文件副本快照（✅ 已有） |

## 生态

| 缺失能力 | OpenCode 实现 | ADL 现状 |
|---------|--------------|----------|
| **Plugin 系统** | Effect+Promise 双 API + 14 域 + Hook | 无 |
| **ACP** | Zed/编辑器集成 | 预留 |
| **HTTP API** | Hono 20+ 路由组 + OpenAPI + 自动 SDK | 仅 Tauri IPC |
| **LSP** | 完整 LSP 客户端 + tree-sitter | 仅大纲解析 |

## 编码架构

| 维度 | OpenCode | ADL |
|------|----------|-----|
| 语言 | TypeScript 全栈 | TypeScript (前端) + Rust (后端) |
| 运行时 | Bun 1.3 | Node.js 24 + Rust |
| 状态管理 | Effect-TS Ref/Draft | Zustand slices |
| ORM | Drizzle + SQLite | N/A (Rust: sled+rusqlite) |
| UI | SolidJS + opentui + Tailwind | React 19 + custom CSS |
| 桌面 | Electron | Tauri 2.x |

## 关键参考文件（ADL 实现时建议参考）

| 想要实现 | 参考 OpenCode 文件 |
|----------|-------------------|
| 多 Agent 系统 | `core/src/agent.ts`, `opencode/src/agent/` |
| Tool 系统 | `core/src/tool/tool.ts`, `core/src/tool/bash.ts` |
| Session Compaction | `core/src/session/compaction.ts`, `opencode/src/session/compaction.ts` |
| LLM 路由抽象 | `llm/src/route/`, `llm/src/protocols/` |
| Provider 管理 | `llm/src/providers/` |
| 权限系统 | `core/src/permission.ts`, `core/src/policy.ts` |
| Plugin 架构 | `core/src/plugin.ts`, `plugin/src/v2/` |
| MCP 集成 | `opencode/src/mcp/` |
| Git 快照 | `core/src/snapshot.ts` |
| System Prompt | `opencode/src/session/prompt/` |
| Effect-TS 模式 | `patterns/effect-ts.md` |
