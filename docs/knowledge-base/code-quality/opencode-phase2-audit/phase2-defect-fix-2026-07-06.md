# Phase 2 缺陷修复总结 — 2026-07-06

## 修复内容

对照 `2026-07-06-phase2-defect-fix-plan.md` 完成 7 项缺陷修复：

| Task | 模块 | 修复内容 |
|------|------|----------|
| 1 | model-gateway | 5 个 provider 的 `chat_stream()` 桩替换为真实 SSE 实现 |
| 2 | lsp-client | diagnostics/symbols/goto-definition 真实实现（背景 reader 任务 + oneshot channels） |
| 3 | agent-runtime | `fire_hook()` 集成到 agent pipeline（ChatMessageBefore/ChatResponseAfter）|
| 4 | setup | ConfigWatcher 启动 + 热重载 config.json |
| 5 | session_fork / agent | `list_session_forks` DB 查询 + durable session register/heartbeat/complete |
| 6 | durable | 60s 间隔后台崩溃会话自动恢复任务 |
| 7 | custom_agent / prompt / references / CommandEditor | 多项次要修复 |

## 关键经验

### 1. Tauri setup 回调无 tokio 运行时

`tokio::spawn` 在 Tauri 2.x 的 `.setup()` 回调中触发 panic："there is no reactor running"。

**解决**：将后台任务移到 `std::thread::spawn` 中，线程内创建自己的 `tokio::runtime::Runtime` 并用 `block_on` 驱动。

```rust
std::thread::spawn(move || {
    let rt = tokio::runtime::Runtime::new().expect("...");
    rt.block_on(async move {
        // 使用 tokio::spawn 和 tokio::time 等
    });
});
```

### 2. ConfigWatcher 防抖：try_recv() 而非 recv()

原代码在防抖等待后调用 `notify_rx.recv().await` 阻塞等待第二个通知，导致单次保存永远不触发重载。

**解决**：使用 `try_recv()` 循环排空累积事件：

```rust
while notify_rx.recv().await.is_some() {
    sleep(100ms).await;
    while notify_rx.try_recv().is_ok() {}  // drain pending
    load(&data_dir);  // reload
}
```

### 3. `lsp-server` 0.7.9 的 Connection 是服务端视角

`Connection::stdio()` 创建的是连接当前进程 stdin/stdout 的 I/O 线程（服务端）。**LSP 客户端**需要手动 `Command::spawn` + `Message::read/write` + 背景 reader 任务。

**客户端模式**：
1. `std::process::Command::new(program).stdin/out/piped().spawn()`
2. 发送 `initialize` Request → 读取 Response → 发送 `initialized` Notification
3. `tokio::task::spawn_blocking` 启动背景 reader，读取 server → client 的 Message
4. 发送 Request 时注册 `oneshot::Sender<Response>`，reader 通过 RequestId 匹配分发

### 4. `Arc<RwLock<T>>` 作为 AppState 字段

AppState 的 `config` 字段从 `RwLock<AppConfig>` 改为 `Arc<RwLock<AppConfig>>` 后，所有 `.read()` / `.write()` 调用点不需要修改（`Arc` 实现 `Deref` 到 `RwLock`）。

这对后台任务特别有用：可以在创建完 `AppState` 后再克隆 `Arc` 传给 `std::thread::spawn`，让后台任务也能安全读取/写入配置。

### 5. Tauri 命令返回值的 IpcResult 陷阱

（已存在于 `opencode-feature-defects-2026-07-06.md`，确认一致性）

## 相关文件

- [修复计划](../../../plans/phase2/2026-07-06-phase2-defect-fix-plan.md)
- [参考实现功能缺陷修复](opencode-feature-defects-2026-07-06.md)
