# OpenCode 功能集成修复 — 经验沉淀

## 背景

对照参考实现源码审计后，发现 6 个核心功能模块代码已存在但未端到端联通：

| 模块 | 断点 | 修复 |
|------|------|------|
| Provider 路由 | `call_provider` 仅支持 DeepSeek/MiniMax | 重写为 `dispatch_to_provider`，分发到 5 个 adapter（Anthropic/OpenAI/Google/Ollama/OpenRouter） |
| Permission 拦截 | `evaluate_permission` 未集成到执行链 | 在 `generate_patches` 中添加 `check_tool_permission` 拦截 `apply_patch` |
| Plan Mode | 模板存在但未注入 system prompt | 在 `start_run_inner` 中添加 `inject_plan_mode_prompt` 强制 `ConversationScenario::Plan` |
| Compaction | 摘要模板未与 LLM 调用联通 | 在 `compact_session_cmd` 中调用 `build_summary_prompt` + LLM 生成 anchored summary |
| ToolRegistry | 工具注册表未集成 webfetch/websearch | 创建 `ToolRegistry` 统一注册表，`global_registry()` 注册全部工具 |
| Subagent | 返回 stub 标记，未真实执行 LLM | 重写 `spawn_subagent_inner` 为真实 LLM 调用，前台/后台双模式 |

## 关键经验

### 1. 前后端契约断裂是最高风险

Task 4 后端 Compaction 签名变更后，前端 5 个文件未同步更新（`compaction.ts`、`tauri-bridge.ts`、`mock-bridge.ts`、`StoreState.ts`、`compactionActions.ts`）。**教训**：修改 IPC 契约后必须全局搜索所有引用点，不能仅依赖类型检查（类型检查捕获的是编译期错误，运行时契约断裂仍可能通过编译）。

### 2. rustc 1.96.0 增量编译 ICE

`adl-subagent` crate 编译时触发 `no entry found for key` ICE。**解决方案**：`CARGO_INCREMENTAL=0` 禁用增量编译。这是 rustc 1.96.0 的已知 bug，与代码无关。

> **2026-07-18 更新**：工具链已升级至 **rustc 1.97.1**。`incremental = false` 的 workaround 保留在 `.cargo/config.toml` 中待验证。若 1.97.1 已修复该 ICE，可移除该配置以启用增量编译加速开发。

### 3. 计划类型与实际代码的差距

6 个任务中，每个任务的实现者都需要适配计划中的类型假设与实际代码的差异（如 `evaluate_permission` 实际 5 参非 3 参、`AppState` 非 Clone、`ConversationRole` 无 `as_str()` 等）。**教训**：计划应基于实际代码签名编写，而非基于理想化接口。

### 4. cargo test 路径问题

仓库根目录的 `Cargo.toml` 是虚拟 workspace manifest，实际 `Cargo.toml` 在 `adlo/` 子目录。必须使用 `--manifest-path adlo/Cargo.toml` 或 `cd adlo` 后执行。

## 相关文件

- [实施计划](../../../plans/refactoring/2026-07/2026-07-05-opencode-feature-integration-fix.md)