# OpenCode 审计缺陷修复 — 经验沉淀（2026-07-08）

## 背景

Phase 2 功能落地后，对照参考实现进行功能审计，发现 10 项实现缺陷。Squash commit `5a83ebfb`。

## 关键经验

### 1. Compaction 阈值：PRUNE_MINIMUM 是触发点，PRUNE_PROTECT 是保护区

修复前将 Compaction 触发阈值设为 PRUNE_PROTECT(40000)，语义混淆。正确理解：

- **PRUNE_MINIMUM(20000)**：当 token 数超过此值时触发 compaction
- **PRUNE_PROTECT(40000)**：compaction 后保留的最小 token 数（保护区下限）

**教训**：阈值类常量必须明确语义——"何时触发"与"保护多少"是两个独立概念，不可混用同一常量。

### 2. Plugin hook 链式传播要求有序执行

修复前插件存储使用 HashMap，执行顺序不确定。Hook 链式传播（Modify 类型 hook 的输出作为下一个 hook 的输入）依赖严格的注册顺序。

**修复**：HashMap → Vec，`fire_hook` 按注册顺序遍历并链式传递结果。

**教训**：凡是涉及结果链式传播的扩展点，数据结构必须保证有序（Vec 而非 HashMap）。插件/hook/middleware 系统均应遵循此原则。

### 3. DurableSession 错误可见性：静默失败是 bug

修复前所有 DurableSession 操作错误用 `let _ =` 吞掉。这导致：
- 数据丢失无感知（session 恢复失败但无任何日志）
- 问题排查极其困难（无错误痕迹可追踪）

**修复**：`let _ =` → `tracing::warn!`（可恢复错误）或返回 `Result`（不可恢复错误）。

**教训**：持久化操作的错误不可静默忽略。至少 `tracing::warn!`，关键路径必须返回 `Result` 向上传播。`let _ =` 仅适用于真正可忽略的操作（如 UI 动画清理）。

### 4. MCP 自动重连 via rmcp ClientHandler trait

修复前 MCP 连接断开后无恢复机制。rmcp crate 提供 `ClientHandler` trait，其中 `handle_tool_list_changed` 回调是通知工具列表变更的正确入口。

**修复**：实现 `auto_reconnect()` 方法 + `ClientHandler` trait 的 `handle_tool_list_changed` 回调发射 `ToolListChanged` 通知。

**教训**：使用 rmcp 等 SDK 时，先查阅其 trait 定义（如 `ClientHandler`），利用框架提供的回调机制而非自造轮子。

### 5. Subagent 权限继承必须受父 Agent 约束

修复前 subagent 权限独立计算，可能超过父 Agent 权限范围。修复后 `derive_subagent_permission` 以父 Agent 的 `allowed_tools` 为上限，write 工具强制 deny。

**教训**：层级权限系统中，子级权限必须是父级的严格子集，不可独立扩展。

### 6. 默认模型解析不可硬编码

修复前 `default_model()` 使用硬编码 match 返回固定模型。当 ProviderRegistry 动态注册新 provider 时，默认模型不会自动更新。

**修复**：`default_model()` 查询 ProviderRegistry 获取当前注册的第一个 provider 的默认模型。

**教训**：动态注册系统的所有衍生查询（默认值、列表、路由）必须走注册表，不可硬编码。

## 相关文件

- `重构进度报告`（原文已归档）
- [前次缺陷修复经验](./opencode-feature-defects-2026-07-06.md)
