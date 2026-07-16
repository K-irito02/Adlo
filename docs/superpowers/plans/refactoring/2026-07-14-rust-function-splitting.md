# Plan H: Rust Function Splitting — LSP Client + Browser Command

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split two ~105-line functions into focused helpers: `start_server_inner` (LSP client) and `browser_create_for_tab` (Tauri browser command).

**Architecture:** Each function has 4-5 distinct concerns (process spawning, LSP handshake, WebView builder, platform-specific handlers) that can be extracted into named helper functions. Task 1 handles the lower-risk LSP client. Task 2 handles the slightly riskier browser command (platform-specific `#[cfg]` code, unsafe blocks). Both use a `|| -> Result` inner closure pattern to replace match/return sentinel with `?`.

**Tech Stack:** Rust 2021, Tauri 2.x, lsp-server 0.7, thiserror

## Global Constraints

- `unwrap()` prohibited in production code — use `?` or pattern matching
- All tests must pass: `cargo test --workspace`
- Clippy zero warnings: `cargo clippy --workspace --all-targets -- -D warnings`
- Follow `rustfmt.toml` (max_width=100, tab_spaces=4, Unix newlines)
- No behavioral changes — refactoring only
- `#[cfg(windows)]` / `#[cfg(not(windows))]` platform-specific blocks must remain functional

---

### Task 1: Split `start_server_inner` in LSP client

**Files:**
- Modify: `crates/lsp-client/src/client.rs` — 提取 4 个辅助函数，简化 `start_server_inner`

- [ ] **Step 1: Read the full function**

```bash
cd ai-digital-life
Select-String -Path "crates/lsp-client/src/client.rs" -Pattern "async fn start_server_inner" -Context 0,110
```

确认当前代码结构与分析一致（~109 行，7 个阶段）。

- [ ] **Step 2: 提取 `spawn_lsp_process`**

在 `start_server_inner` 之前添加：

```rust
fn spawn_lsp_process(
    program: &str,
    args: &[&str],
) -> Result<(Child, ChildStdin, BufReader<ChildStdout>), AppError> {
    let mut child = StdCommand::new(program)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Io(format!("Failed to spawn LSP server: {e}")))?;

    let child_stdin = child.stdin.take()
        .ok_or_else(|| AppError::Internal("Failed to capture stdin".into()))?;
    let child_stdout = child.stdout.take()
        .ok_or_else(|| AppError::Internal("Failed to capture stdout".into()))?;

    Ok((child, child_stdin, BufReader::new(child_stdout)))
}
```

- [ ] **Step 3: 提取 `build_initialize_params`**

```rust
fn build_initialize_params(
    workspace_root: &Path,
) -> Result<serde_json::Value, AppError> {
    let root_url = url::Url::from_directory_path(workspace_root)
        .map_err(|_| AppError::InvalidInput("Invalid workspace path".into()))?;
    let root_uri: lsp_types::Uri = root_url.to_string().parse()
        .map_err(|e| AppError::Internal(format!("Invalid URI: {e}")))?;
    let folder_name = workspace_root.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "workspace".to_string());

    serde_json::to_value(InitializeParams {
        process_id: Some(std::process::id()),
        workspace_folders: Some(vec![WorkspaceFolder { uri: root_uri, name: folder_name }]),
        capabilities: ClientCapabilities::default(),
        ..Default::default()
    })
    .map_err(|e| AppError::Internal(e.to_string()))
}
```

- [ ] **Step 4: 提取 `perform_lsp_handshake`**

```rust
fn perform_lsp_handshake(
    reader: &mut BufReader<ChildStdout>,
    writer: &mut ChildStdin,
    init_params: &serde_json::Value,
) -> Result<(), AppError> {
    let init_req = lsp_server::Message::Request(lsp_server::Request::new(
        lsp_server::RequestId::from(1),
        "initialize".to_string(),
        init_params.clone(),
    ));
    init_req.write(writer).map_err(|e| AppError::Io(format!("Failed to write initialize: {e}")))?;
    writer.flush().map_err(|e| AppError::Io(format!("Failed to flush initialize: {e}")))?;

    let resp = lsp_server::Message::read(reader)
        .map_err(|e| AppError::Io(format!("Failed to read initialize response: {e}")))?;

    match resp {
        Some(lsp_server::Message::Response(resp)) => {
            if let Some(err) = resp.error {
                return Err(AppError::Internal(
                    format!("LSP initialize error ({}): {}", err.code, err.message)
                ));
            }
        },
        Some(other) => return Err(AppError::Internal(
            format!("Expected initialize response, got: {:?}", other)
        )),
        None => return Err(AppError::Internal("LSP server closed during initialize".into())),
    }

    let initialized = lsp_server::Message::Notification(lsp_server::Notification::new(
        "initialized".to_string(),
        serde_json::Value::Null,
    ));
    initialized.write(writer).map_err(|e| AppError::Io(format!("Failed to write initialized: {e}")))?;
    writer.flush().map_err(|e| AppError::Io(format!("Failed to flush initialized: {e}")))?;

    Ok(())
}
```

- [ ] **Step 5: 提取 `spawn_response_dispatcher`**

```rust
fn spawn_response_dispatcher(
    reader: BufReader<ChildStdout>,
    servers: Arc<Mutex<HashMap<LanguageServer, ServerHandle>>>,
) {
    tokio::task::spawn_blocking(move || {
        let mut reader = reader;
        loop {
            match lsp_server::Message::read(&mut reader) {
                Ok(Some(lsp_server::Message::Response(resp))) => {
                    let mut map = servers.blocking_lock();
                    for handle in map.values_mut() {
                        if let Some(tx) = handle.pending.remove(&resp.id) {
                            let _ = tx.send(resp);
                            break;
                        }
                    }
                },
                Ok(_) => continue,
                Err(_) => break,
            }
        }
    });
}
```

- [ ] **Step 6: 重写 `start_server_inner`**

```rust
async fn start_server_inner(
    &self,
    program: &str,
    args: &[&str],
) -> Result<(Child, ChildStdin), AppError> {
    let (mut child, mut child_stdin, mut reader) = spawn_lsp_process(program, args)?;

    let workspace_root = self.workspace_root.as_path();
    let init_params = build_initialize_params(workspace_root)?;

    perform_lsp_handshake(&mut reader, &mut child_stdin, &init_params)?;

    let servers = self.servers.clone();
    spawn_response_dispatcher(reader, servers);

    Ok((child, child_stdin))
}
```

- [ ] **Step 7: 验证编译和测试**

```bash
cd ai-digital-life
cargo check --workspace 2>&1
cargo test --workspace 2>&1
cargo clippy --workspace --all-targets -- -D warnings 2>&1
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(lsp): split start_server_inner into 4 helper functions

Extracted spawn_lsp_process, build_initialize_params,
perform_lsp_handshake, and spawn_response_dispatcher from
the ~105-line start_server_inner function. Each helper is
independently testable."
```

---

### Task 2: Split `browser_create_for_tab` in browser command

**Files:**
- Modify: `src-tauri/src/commands/browser.rs` — 提取 4 个辅助函数，简化 `browser_create_for_tab`
- Note: 涉及 `#[cfg(windows)]` 平台条件编译，需要谨慎操作

- [ ] **Step 1: Read the full function**

```bash
cd ai-digital-life
Select-String -Path "src-tauri/src/commands/browser.rs" -Pattern "pub async fn browser_create_for_tab" -Context 0,110
```

- [ ] **Step 2: 提取 `resolve_window_and_url`**

```rust
fn resolve_window_and_url(
    app: &tauri::AppHandle,
    url: &str,
) -> Result<(tauri::Window<tauri::Wry>, url::Url), AppError> {
    let window = app.get_window("main")
        .ok_or_else(|| AppError::Internal("main window not found".into()))?;
    let target = adl_browser::resolve_url(url)
        .map_err(|e| AppError::Internal(format!("failed to resolve URL: {e}")))?;
    Ok((window, target))
}
```

- [ ] **Step 3: 提取 `build_webview_builder`**

```rust
fn build_webview_builder(
    label: &str,
    target: url::Url,
    app_handle: tauri::AppHandle,
) -> tauri::webview::WebviewBuilder<tauri::Wry> {
    let app_nav = app_handle.clone();
    tauri::webview::WebviewBuilder::new(label, tauri::WebviewUrl::External(target))
        .initialization_script(adl_browser::INIT_SCRIPT)
        .on_navigation(move |url| {
            adl_browser::navigation_handler(url, &|normalized| {
                let _ = app_nav.emit(
                    "digital-life://browser-url-changed",
                    serde_json::json!({ "url": normalized }),
                );
            })
        })
        .on_new_window(move |url, _window_features| new_window_handler(&app_handle, &url))
}
```

- [ ] **Step 4: 提取平台特定处理程序设置和配色方案**

处理 `#[cfg(windows)]` vs `#[cfg(not(windows))]` 差异：

```rust
fn setup_webview2_handlers_for_platform(
    webview: &tauri::Webview<tauri::Wry>,
    tab_id: &str,
    label: &str,
    bridge: EventBridgeRef,
) {
    #[cfg(windows)]
    {
        let bridge = bridge.clone();
        let tab_id = tab_id.to_string();
        let label = label.to_string();
        let _ = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();
            if let Ok(core) = controller.CoreWebView2() {
                adl_browser::setup_webview2_handlers(&core, &tab_id, &label, &bridge);
            }
        });
    }

    #[cfg(not(windows))]
    {
        adl_browser::setup_webview2_handlers(tab_id, label);
    }
}

fn apply_color_scheme_for_platform(
    webview: &tauri::Webview<tauri::Wry>,
    color_scheme: &str,
) {
    #[cfg(windows)]
    {
        let _ = webview.with_webview(move |platform_wv| unsafe {
            let controller = platform_wv.controller();
            if let Ok(core) = controller.CoreWebView2() {
                adl_browser::webview2_set_color_scheme(&core, color_scheme);
            }
        });
    }

    #[cfg(not(windows))]
    {
        adl_browser::webview2_set_color_scheme(color_scheme);
    }
}
```

- [ ] **Step 5: 提取 `register_webview_with_manager`**

```rust
fn register_webview_with_manager(
    state: &AppState,
    app_handle: tauri::AppHandle,
    label: String,
    tab_id: &str,
) -> Result<Option<String>, AppError> {
    let handle: Arc<dyn WebViewHandle> =
        Arc::new(TauriWebViewHandle::new(app_handle, label));
    state.browser_manager.create_for_tab(handle, tab_id)
        .map_err(|e| AppError::Internal(format!("failed to register browser: {e}")))
}
```

- [ ] **Step 6: 重写 `browser_create_for_tab`**

使用 `|| -> Result` 内部闭包统一错误路径：

```rust
#[tauri::command]
pub async fn browser_create_for_tab(
    app: tauri::AppHandle,
    tab_id: String,
    url: String,
) -> Result<IpcResult<Option<String>>, CommandError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let app_inner = app.clone();

    app.run_on_main_thread(move || {
        let state = app_inner.state::<AppState>();
        let label = webview_label(&tab_id);

        let result = (|| -> Result<Option<String>, AppError> {
            let (window, target) = resolve_window_and_url(&app_inner, &url)?;
            let webview_builder = build_webview_builder(&label, target, app_inner.clone());

            window.add_child(webview_builder, (-10000, -10000), (800, 600))
                .map_err(|e| AppError::Internal(format!("failed to create webview: {e}")))?;

            tracing::info!(tab_id = &tab_id, url = &url, "browser webview created for tab");

            if let Some(webview) = window.get_webview(&label) {
                let bridge: EventBridgeRef = Arc::new(TauriWebView2EventBridge::new(app_inner.clone()));
                setup_webview2_handlers_for_platform(&webview, &tab_id, &label, bridge.clone());
                let cs = state.browser_manager.current_color_scheme();
                apply_color_scheme_for_platform(&webview, &cs);
            }

            register_webview_with_manager(&state, app_inner.clone(), label.clone(), &tab_id)
        })();

        let _ = tx.send(result);
    }).map_err(|e| AppError::Internal(format!("main thread dispatch: {e}")))?;

    Ok(ipc(rx.await.map_err(|e| AppError::Internal(format!("channel: {e}")))?))
}
```

- [ ] **Step 7: 验证编译和测试**

```bash
cd ai-digital-life
cargo check --workspace 2>&1
cargo test --workspace 2>&1
cargo clippy --workspace --all-targets -- -D warnings 2>&1
```

特别注意：`#[cfg(windows)]` 块在非 Windows 平台不会编译——确保 Windows 代码提取后，`unsafe` 块和 `controller()` 调用被正确包裹。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(browser): split browser_create_for_tab into 5 helper functions

Extracted resolve_window_and_url, build_webview_builder,
setup_webview2_handlers_for_platform, apply_color_scheme_for_platform,
and register_webview_with_manager from the ~106-line function.
Used inner || -> Result closure for unified error handling with ?."
```
