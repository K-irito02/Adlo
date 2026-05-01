description: Tauri Backend/Commands/WebView boundaries, security baseline, and capability allowlist
globs: ai-digital-life/src-tauri/**,ai-digital-life/frontend/**,ai-digital-life/crates/**
alwaysApply: false
---

# Tauri 壳与命令边界

## 安全基线（不可降级）

- `src-tauri/tauri.conf.json` 中 `app.security.csp` 必须显式声明
- `withGlobalTauri` 默认关闭
- WebView 不得直接访问文件系统、子进程、SQLite 或模型密钥
- 高权限插件必须使用 scope 限制，禁止 `"all"` / `"**"` 通配

## 边界分层

| 层 | 允许的能力 | 禁止的能力 |
|----|-----------|-----------|
| Rust Backend | 文件系统、SQLite、模型请求、凭据、恢复编排 | 直接操作 DOM |
| Tauri Commands | 暴露白名单、参数校验、结构化错误返回 | 宽泛万能命令、未登记 capability |
| WebView Frontend | UI 渲染、状态编排、订阅事件 | 直接访问系统能力、密钥、原始 SQL |

## 契约真源

| 文件 | 职责 |
|------|------|
| `frontend/src/shared/ipc.ts` | `DigitalLifeBridge` 类型定义 |
| `frontend/src/mock-bridge.ts` | 浏览器预览 mock |
| `src-tauri/src/commands/*.rs` | `#[tauri::command]` 处理 |
| `src-tauri/capabilities/*.json` | Command 白名单 |
| `crates/kernel` | `serde` 契约类型 |

## 事件通道（版本化载荷）

| 通道名 | 用途 | 载荷类型 |
|--------|------|----------|
| `digital-life://model-stream` | 模型流式输出 | `ModelStreamEventV1` |
| `digital-life://terminal-stream` | 终端流式输出 | `TerminalStreamEventV1` |
| `digital-life://workspace-file-changed` | 工作区文件变更 | 文件变更事件 |

## 新增命令 / 事件检查清单

- [ ] 在 `crates/kernel` 增加 `serde` 类型
- [ ] 在 `src-tauri/src/commands/*.rs` 实现 `#[tauri::command]`
- [ ] 在 `src-tauri/capabilities/*.json` 登记 capability
- [ ] 在 `frontend/src/shared/ipc.ts` 对齐桥接契约
- [ ] 更新本规则通道表格
- [ ] 如有前端 mock，同步更新

## 密钥与审计

- API Key、模型请求体敏感部分：仅 Rust 后端
- 审计日志写入 SQLite，不在 WebView 记录密钥原文

## 随项目演进

- 新增 Tauri Command / 事件：更新本文件表格与检查清单
- 安全配置变更：更新安全基线表格（需评审）
- 边界变化：更新分层表格

## 相关文件

- [frontend/src/shared/ipc.ts](/E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/shared/ipc.ts)
- [frontend/src/mock-bridge.ts](/E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/mock-bridge.ts)
- [src-tauri/src/commands](/E:/Programs/Obsidian/notes/ai-digital-life/src-tauri/src/commands)
- [src-tauri/capabilities](/E:/Programs/Obsidian/notes/ai-digital-life/src-tauri/capabilities)
