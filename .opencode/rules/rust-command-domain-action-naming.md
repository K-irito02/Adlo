---
description: Tauri Command 函数必须使用 {domain}_{action} 蛇形命名
globs: ai-digital-life/src-tauri/src/commands/**/*.rs
alwaysApply: false
---

## Tauri Command 函数命名约定 `{domain}_{action}`

### 规则描述

所有 `#[tauri::command]` 标记的函数必须使用 `{domain}_{action}` 蛇形命名（snake_case），其中 `{domain}` 是所属领域的前缀，与命令文件的基本文件名一致（如 `browser.rs` → `browser_`）。非公共辅助函数不要求前缀。

### 命名映射表

| 文件 | 命令前缀 | 示例 |
|------|----------|------|
| `browser.rs` | `browser_` | `browser_create_for_tab` |
| `workspace.rs` | `workspace_` | `workspace_open` |
| `conversation/session.rs` | `conversation_` | `conversation_create_session` |
| `ci.rs` | `ci_` | `ci_get_status` |
| `app.rs` | `app_` | `app_get_info` |
| `provider.rs` | `provider_` | `list_providers` |
| `mcp.rs` | `mcp_` | `list_mcp_servers` |

### 正确示例

```rust
// browser.rs
#[tauri::command]
pub fn browser_navigate_tab(tab_id: String, url: String) -> Result<IpcResult<()>, CommandError> { ... }

// conversation/session.rs
#[tauri::command]
pub async fn conversation_create_session(title: Option<String>) -> IpcResult<ConversationSessionRecord> { ... }
```

### 错误示例

```rust
// 不统一前缀
#[tauri::command]
pub fn create_tab(...)  // 应为 browser_create_for_tab

// 非 snake_case
#[tauri::command]
pub fn openWorkspace(...)  // 应为 workspace_open
```

### 适用场景

所有 `src-tauri/src/commands/` 目录下的 `#[tauri::command]` 公共函数。私有辅助函数（不标记 `#[tauri::command]`）不受此约束。
