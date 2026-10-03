# Phase 2 审计修复 — 经验沉淀

## 背景

Phase 2 全功能实现后，对照参考实现源码进行全面审计，发现 12 类问题。本次修复覆盖 13 个任务、34 个文件。

## 修复内容

| 类别 | 问题 | 修复 |
|------|------|------|
| **严重** | Tauri 权限白名单 9 个命令名不匹配 + 6 个缺失 | `digital-life.toml` 对齐 `main.rs` |
| **严重** | Plugin 系统只有 list/setEnabled，无法加载插件 | 新增 `register_plugin`/`unregister_plugin` + `SimplePlugin` |
| **严重** | LSP stop 不清理静态 Map，restart 不关闭旧客户端 | `remove()` 替代 `get()`，`drop+re-lock` |
| **高** | 13 处 UI 硬编码字符串 | 均替换为 i18n keys |
| **高** | 1 处跨域 i18n key 引用 | 使用 permission 域专属 key |
| **中** | RevertButton 绕过 Zustand Store 直接调用 bridge | 使用 `useAppStore(s => s.revertToSnapshot)` |
| **中** | PlanCard 使用 emoji 图标 | 替换为 SVG 图标 |
| **低** | DurableStatusIndicator 始终显示 "Running" | 按 status 显示不同标签 |
| **低** | Session Fork 信任前端传入 fork 计数 | 服务端从 DB 查询 |
| **低** | Preview Bridge 10 个 Phase 2 桥接隐式继承 | 显式声明 |

## 关键经验

### 1. Tauri 权限白名单是独立的命令列表

Tauri 2.x 的 `capabilities/*.json`（项目实际使用 `permissions/*.toml`）是一个独立于 `#[tauri::command]` 注册的命令名白名单。在 `main.rs` 注册命令和在 `digital-life.toml` 允许命令是两个独立步骤，**两者名称必须完全一致**。名称不匹配时前端 `invoke('xxx')` 触发 Tauri 内部权限拒绝，表现为调用静默失败。

**教训**：新增 Tauri Command 时须同时更新 `main.rs` + `permissions/*.toml` + `tauri-bridge.ts` + 对应的 IPC 接口定义。

### 2. Bridge 方法必须使用 invokeIpc<T>() 而非 invok()

`tauri-bridge.ts` 的 `invokeIpc<T>()` 封装了结构化错误处理，返回 `IpcResult<T>`。若使用裸 `invoke()`，Tauri 端返回 `Ok(T)` 时序列化为原始值（非 `{ok:true,data:T}`），导致前端 `result.ok` 为 `undefined` → 错误分支误触。

**修复模式**：所有 bridge 调用使用 `invokeIpc<T>('cmd', {params})`，只有不需要 `IpcResult` 的错误不关心场景才用 `invoke()`。

**陷阱**：Task 11 修复时将 `forkSession` 从 `invokeIpc` 改为 `invoke`（认为类型不匹配），实际破坏了错误处理。正确做法是保持 `invokeIpc`，调整泛型参数。

### 3. 跨层 IPC 接口变更须更新 7 个文件

变更 `fork_session` 的接口（移除 `existing_fork_count` 参数）需要同时更新：
1. Rust Tauri 命令 (`session_fork.rs`)
2. IPC 接口定义 (`session_fork.ts`)
3. Tauri 桥接 (`tauri-bridge.ts`)
4. Mock 桥接 (`mock-bridge.ts`)
5. Store 状态类型 (`StoreState.ts`)
6. Store 操作实现 (`sessionForkActions.ts`)
7. 调用组件 (`ForkButton.tsx`)

任何一层遗漏都会导致编译错误或运行时异常。

### 4. Plugin trait 实现需要 async-trait 依赖

`adl_agent_runtime::plugins::Plugin` trait 使用 `#[async_trait]` 宏。在 `src-tauri` crate 中实现 `impl Plugin for SimplePlugin` 时，`async-trait` 必须是 `src-tauri/Cargo.toml` 的直接依赖（workspace level via `async-trait.workspace = true`），即使 `adl_agent_runtime` 已间接依赖。

## 相关文件

- [实施计划](../../../plans/phase2/2026-07-06-phase2-audit-fixes.md)
