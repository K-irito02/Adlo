# OpenCode 功能缺陷修复 — 经验沉淀

## 背景

Phase 2 功能（多 Agent / MCP / Snapshot / Permissions 等）落地后，对照 OpenCode 审计发现 8 项实现缺陷：

| 模块 | 缺陷 | 修复 |
|------|------|------|
| model-gateway | 回退路径未传递 `run_id` | 补传 `run_id`（1行）|
| command | `truncate_output` 超过 MAX_CAPTURE_CHARS | 减去截断标记长度（27 chars）|
| agent-runtime | `/plan` 前缀匹配误触 `/planning` | 精确匹配 + 带参数检查 |
| command | `classify_profile` 误将 echo 输出判为 Test | 前缀/后缀精确匹配；恢复 build/lint/install 宽匹配 |
| kernel | `pattern_matches` `**` 不匹配零段 | 正则重写（OpenCode Wildcard.match 模式）|
| change-engine | 快照仅记录元数据，revert 用 `git checkout -- .` 数据丢失 | 文件副本快照 + 安全 revert |
| mcp-client | transport 为 stub | `rmcp` v1.8.0 真实实现（TokioChildProcess + StreamableHttpClientTransport）|
| kernel | 无 last-match-wins 测试 | 新增显式测试 |

## 关键经验

### 1. 截断标记长度是易遗漏的边界情况

`truncate_output` 的 `MAX_CAPTURE_CHARS` 包含截断标记本身。修复前：`head + "[output truncated]" + tail` 总长度超出上限。修复：先减标记长度再分半。**教训**：截断类函数须将插入文本计入预算。

### 2. `classify_profile` 的精确匹配与宽匹配平衡

旧代码 `contains(" test")` 误伤 `echo "running test suite"`。修复后使用 `starts_with("cargo test ")` + `joined == "cargo test"` 精确匹配 Test，同时保留 `contains(" build")` / `contains("lint")` / `contains("install")` 宽匹配用于 Build/Lint/Install。**教训**：低风险分类可接受宽匹配（false positive 无害），高风险分类（Test 影响行为）须精确。

### 3. 正则通配替换 glob 分段的陷阱

`**` 在 glob 中匹配零个或多个路径段。手写分段逻辑难以正确处理零段场景（如 `dir/**/file` 匹配 `dir/file`）。改用 `regex` crate + OpenCode Wildcard.match 转换后，`**` → `(?:/.*)?` 首次正确。**教训**：通配匹配直接委托给正则引擎，避免手写状态机。

### 4. Snapshot 文件副本优于 git 操作

用 `git checkout -- .` 做 revert 会销毁未提交的修改。改用文件副本（`snapshot/{id}/files/`）后，revert 仅恢复已备份文件，零副作用。**教训**：生产级 revert 不应依赖 `git checkout`。

### 5. MCP Transport 的真实化

`rmcp` crate 的 `TokioChildProcess` 和 `StreamableHttpClientTransport` 类型签名与预期有差异（如 `TokioChildProcess::new(tokio::process::Command)` 而非 `std::process::Command`）。需要实际阅读 rmcp 源码确认接口。**教训**：SDK 类型签名不可假定，必须查阅实际 API。

### 6. 代码审查循环的价值

首轮审查发现 `classify_profile` 回归（npm run lint/pnpm install 被降级为 Custom），在合并前即修复。较之合并后修复，节省了 revert/回滚时间。

### 7. Tauri 命令必须返回 `IpcResult<T>` 而非裸 `T`

Phase 2 新增的 40+ Tauri 命令返回 `Result<T, AppError>`，前端通过 `invokeIpc<T>()` 调用，期望 Tauri 返回 `{ ok: true, data: T }` 格式。因 Rust 将 `Ok(T)` 序列化为原始值（如纯数组），前端 `result.ok` 为 `undefined` → 错误分支误触发 → `result.error` 为 `undefined` → 显示 "An unknown error occurred"。

**修复模式**：命令返回 `Result<IpcResult<T>, AppError>` 并用 `ipc()` 包装。

**陷阱**：`Ok(ipc({...?...}))` 中 `?` 传播到外层函数而非 `ipc()`，导致 `Err(AppError)` 直接返给 Tauri 而非编码为 `IpcResult::Error`。**必须将 fallible 逻辑提取为 helper 函数**：

```rust
fn helper_inner(...) -> Result<T, AppError> { ...?... }
pub async fn cmd(...) -> Result<IpcResult<T>, AppError> {
    Ok(ipc(helper_inner(...)))
}
```

**检查清单**：
- 每条 `#[tauri::command]` 检查返回类型是否含 `IpcResult<T>`
- `ipc({})` 块内不得出现 `?` 操作符
- 对照 `tauri-bridge.ts` 中 `invokeIpc<T>()` 调用验证 Rust 端返回类型

## 相关文件

- [实施计划](../../superpowers/plans/2026-07-06-opencode-feature-defects-fix.md)
