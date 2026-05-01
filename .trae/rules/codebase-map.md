---
description: Codebase map, Cargo workspace, frontend layout, and indexing strategy
globs: ai-digital-life/**/*
alwaysApply: false
---

# 代码地图

## 顶层结构

```
ai-digital-life/
├── Cargo.toml          # Rust workspace 根
├── .mcp.json           # MCP 服务器配置（Chrome DevTools 等）
├── .claude/            # Claude Code MCP 配置
├── src-tauri/          # Tauri 二进制与 #[tauri::command]
│   └── tauri.conf.json # Tauri 应用配置
├── crates/             # Rust 库 crate（kernel、storage、…）
├── frontend/           # WebView：React + Vite
├── scripts/            # 开发脚本（run-project-surface.mjs）
├── docs/               # 架构与设计文档
└── tests/              # 集成 / E2E 等
```

## 应用层（Tauri + WebView）

| 位置 | 职责 |
|------|------|
| `src-tauri/` | 窗口、Rust 启动、`invoke` 处理、capabilities |
| `frontend/src/` | React UI、Zustand、`window.digitalLife` 桥接（开发态为 `mock-bridge.ts`） |
| `frontend/src/shared/ipc.ts` | `DigitalLifeBridge` 类型契约 |
| `frontend/src/kernel` | 前端侧 `@ai-digital-life/kernel` 类型与工具（与 `crates/kernel` 后端契约应对齐） |

## Crates 层（`crates/`）

| 区域 | crate 名 | 职责 |
|------|----------|------|
| 契约与常量 | `kernel` | 后端共享类型与常量（Rust） |
| 持久化 | `storage` / `migration` | SQLite |
| 支撑 | `config`、`logger`、`errors`、`events` 等 | 见 `AGENTS.md` 完整表 |
| Phase 2+ | `workspace`、`task`、`conversation`、`model-gateway` 等 | 业务域 |

## 测试目录（`tests/`）

| 目录 | 职责 |
|------|------|
| `integration/` | 跨 crate 集成（Rust） |
| `e2e/` | 端到端（计划 tauri-driver 等） |

## 前端关键目录（`frontend/src/app/`）

| 目录 | 职责 |
|------|------|
| `components/` | React 组件（含 Tooltip） |
| `hooks/` | 自定义 Hooks |
| `utils/` | 纯函数（如 tooltipPosition） |
| `regions/` | 区域布局（TitleBar、侧栏、中心、右侧面板等） |

## 索引策略

1. **定位入口**：业务逻辑 → `crates/*`；Tauri 边界 → `src-tauri/*`；UI → `frontend/src/*`。
2. **类型契约**：Rust 以 `crates/kernel` 为准；WebView 以 `frontend/src/kernel` + `shared/ipc.ts` 为准，变更时双向对齐。
3. **架构引用**：`docs/architecture/system-overview.md`

## 随项目演进

- 新增 crate：更新 Crates 层表格
- 前端子目录重命名：更新「前端关键目录」
- 目录结构调整：更新顶层结构图

## 相关文件

- [ai-digital-life/AGENTS.md](/E:/Programs/Obsidian/notes/ai-digital-life/AGENTS.md)
