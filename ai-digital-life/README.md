# AI Digital Life (Rust + Tauri)

该工作区托管 `AI Digital Life` 桌面应用的 **Rust + Tauri 2.x** 实现。

> 旧版 Electron / TypeScript 实现已废弃。

## 快速开始

```bash
# 前端
pnpm --dir frontend install
pnpm run dev:browser    # 浏览器预览模式（快速开发/测试）

# 桌面应用
pnpm run dev:tauri      # Tauri 桌面应用
pnpm run dev:both       # 同时启动浏览器 + Tauri
```

## 目录结构

```
ai-digital-life/
├── Cargo.toml          # Rust workspace 根
├── src-tauri/          # Tauri 入口（commands、capabilities）
├── crates/             # Rust 业务 crate
├── frontend/           # WebView 前端（React + Vite）
└── docs/               # architecture / design-system
```

## 关键文档

| 文档 | 内容 |
|------|------|
| [AGENTS.md](./AGENTS.md) | 实现工作区治理：技术栈、功能清单、Store 架构、安全边界 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 提交规范、双端一致性要求、Tauri Command 新增清单 |
| [仓库根 AGENTS.md](../AGENTS.md) | 项目治理规则、双根结构、禁止项、真源定位 |
| [docs/architecture/](./docs/architecture/) | 系统架构、技术栈对齐、国际化、主题 |
| [docs/design-system/](./docs/design-system/) | 设计 Token、主题、组件、可访问性 |

## 浏览器测试

```bash
pnpm run dev:browser                        # 启动浏览器预览
pnpm --dir frontend run test:e2e            # Playwright 全量测试
pnpm --dir frontend run test:e2e:workspace  # 验证工作区恢复
```

详细说明见 [AGENTS.md](./AGENTS.md#双端一致性) 和前端 `frontend/e2e/` 目录。

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | Tauri 2.x |
| 后端 | Rust + tokio + rusqlite |
| 前端 | React 19 + Vite + Zustand + TypeScript |
| 桥接 | `#[tauri::command]` + `@tauri-apps/api` |

完整技术栈与已实现功能清单见 [AGENTS.md](./AGENTS.md)。