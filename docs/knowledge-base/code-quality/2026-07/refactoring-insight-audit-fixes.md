# 重构洞察修复 — 关键经验教训 (2026-07-20)

## 1. API Key 日志安全

修复 API key 通过 `tracing::info!` 被日志泄露的问题时，仅用 `has_api_key: bool` 替代 `config = %config` 输出。测试验证了提取逻辑正确，但未实际捕获 `tracing` 输出。如需真正验证日志输出不含密钥，需用 `tracing-test` 或 `tracing-subscriber` 的 TestWriter。

## 2. Shell 命令注入防护

使用 `SHELL_METACHARS` 常量 + `has_shell_metacharacters()` 函数实施双层防御：
- `shell_command()` 层：检测到危险字符时发出 `tracing::warn`（防御性编程）
- `run_command_internal()` 层：拒绝执行危险命令，返回 `AppError::ApprovalRequired`
- 测试必须覆盖 **常量中所有字符**，避免遗漏

## 3. Provider SSE 流解析抽象

成功将 4 个 LLM Provider（OpenAI/Anthropic/Google/OpenRouter）中重复的 SSE `data: ` 前缀剥离 + 行迭代 + `[DONE]` 信号处理提取到共享 `base::parse_sse_stream()`。每个 Provider 只需提供 `extract_delta` 闭包，消除 152 行重复代码。闭包模式比 trait 更轻量，适合这种"一小段差异提取逻辑"的场景。

## 4. crud.rs God Module 拆分

Rust 允许跨文件 `impl Database { ... }` 块，非常适合按实体类型拆分 CRUD 操作。拆分步骤：
1. 新建 `entity_crud.rs`（通用 save/load/list/delete）
2. 新建 `session_crud.rs`、`task_crud.rs`（实体特定操作）
3. 保留 `crud.rs` 中的 `#[cfg(test)]` 测试模块
4. 在 `lib.rs` 添加 `mod` 声明

注意：`table_name()` 和 `get_select_all_sql()` 是 `pub(crate)` 的，外部调用者无法直接使用。可通过 `Database` 的 `conn()` 方法获取连接后直接执行 SQL。

## 5. 浏览器 IPC 权限最小化

Tauri 的 capability 文件应遵循最小权限原则。浏览器远程 webview（`adl-browser-view-*`）只需 `core:default`，不应共享主窗口的 `digital-life-commands`。创建独立的浏览器 capability 文件，并使用不同的 `webviews` 模式。

## 6. Custom Provider URL 验证

`validate_provider_url` 要求 HTTPS scheme，但允许 localhost/127.0.0.1/::1 使用 HTTP（本地开发）。内置 Provider（如 Ollama）通过 `setup.rs` 注册，绕过此验证。

## 7. `std::thread::spawn` vs `tokio::spawn` 选择

在 Tauri 的 `on_page_load` 回调中，不能使用 `tokio::spawn`（该回调不在 tokio runtime 上下文中执行）。对于短生存期（~600ms）的线程，`std::thread::spawn` 是正确选择，OS 线程开销可忽略。使用 `tokio::task::spawn_blocking` 需要在有 tokio Handle 的上下文中。

## 8. DOMPurify + dangerouslySetInnerHTML

所有 `dangerouslySetInnerHTML` 调用必须包裹 `DOMPurify.sanitize()`。为防每次渲染重复 sanitize 大文档，应使用 `useMemo(() => DOMPurify.sanitize(html), [html])` 缓存结果。
