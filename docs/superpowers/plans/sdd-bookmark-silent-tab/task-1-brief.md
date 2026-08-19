# Task 1 简报 — CachedMetaBridge（后端事件→缓存通路）

> 本简报是唯一需求来源。请严格按此实现，不要读整个计划文件。

## 目标与上下文

在 `crates/browser`（crate 名 `adl-browser`）新增后端事件桥 `CachedMetaBridge`，让静默标签页（后台 WebView2 渲染）拿到的 title/favicon 能直接流入 `PageMetaService` 缓存，不经前端回传。这是"书签静默标签页改造"的 Task 1，后续 Task 3 会消费本 Task 的通道。

## 设计决策（重要，已由主 Agent 解决）

计划原文设想 `emit_meta_changed` 内 `tauri::async_runtime::spawn(svc.report(...))`。**此路不可行**，原因：
1. `crates/browser/Cargo.toml` 只有 `tokio`、`futures`，**没有 `tauri` 依赖**，`tauri::async_runtime` 不可用。
2. WebView2 事件回调运行在 COM STA 线程，**不保证处于 tokio runtime 上下文**，直接 `tokio::spawn(svc.report(...))` 会 panic（"no reactor running"）。

**改为 channel 方案（本任务采用）：**
- `CachedMetaBridge` 持有一个 `Option<tokio::sync::mpsc::UnboundedSender<(String, String, String, String)>>`，元组为 `(tab_id, url, title, favicon)`。
- `emit_meta_changed` 同步地把元组 `send` 进 channel（若 sender 存在），其余 4 个 trait 方法为 no-op。
- 消费方是 Task 3 的静默 fetch 循环（它运行在 tokio `await` 上下文），收到后自行调用 `svc.report`。**本 Task 不直接调 `report`**。
- 该方案避免"STA 线程无 runtime panic" + 避免后台任务泄漏（静默 fetch 完成即销毁 channel，无长驻任务）。

## 涉及文件

- Create: `crates/browser/src/meta_cache_bridge.rs`
- Modify: `crates/browser/src/lib.rs`（声明模块 + 导出）

## 需要读取的接口（用 Read 确认精确签名）

- `crates/browser/src/webview_handle.rs`：`WebView2EventBridge` trait 的全部方法签名（`emit_meta_changed`、`emit_url_changed`、`emit_audio_changed`、`emit_open_new_tab`、`spawn_spa_fallback`）。参照 `src-tauri/src/webview_event_bridge.rs` 里 `TauriWebView2EventBridge` 的实现方式来了解各方法要做什么。
- `crates/browser/src/lib.rs`：现有模块声明与 `pub use` 风格，照此新增 `mod meta_cache_bridge;` + `pub use meta_cache_bridge::CachedMetaBridge;`。
- `crates/browser/src/page_meta_service.rs`：仅需了解 `PageMetaService` 存在（本 Task 不直接调用，但保留引用以便 Task 3）。

## 实现代码

```rust
use tokio::sync::mpsc::UnboundedSender;
use crate::webview_handle::WebView2EventBridge;

/// 静默标签页专用事件桥：把 (tab_id, url, title, favicon) 转发到 channel。
/// 消费方为静默 fetch 循环（tokio await 上下文）。不走前端回传。
pub struct CachedMetaBridge {
    tx: Option<UnboundedSender<(String, String, String, String)>>,
}

impl CachedMetaBridge {
    pub fn new(tx: Option<UnboundedSender<(String, String, String, String)>>) -> Self {
        Self { tx }
    }
}

impl WebView2EventBridge for CachedMetaBridge {
    fn emit_meta_changed(&self, tab_id: &str, title: &str, favicon: &str, url: &str) {
        if url.is_empty() || title.is_empty() {
            return;
        }
        if let Some(tx) = &self.tx {
            let _ = tx.send((
                tab_id.to_string(),
                url.to_string(),
                title.to_string(),
                favicon.to_string(),
            ));
        }
    }
    fn emit_url_changed(&self, _tab_id: &str, _url: &str) {}
    fn emit_audio_changed(&self, _tab_id: &str, _is_playing: bool, _is_muted: bool) {}
    fn emit_open_new_tab(&self, _url: &str) {}
    fn spawn_spa_fallback(&self, _label: &str, _url: &str) {}
}
```

> 若 `WebView2EventBridge` trait 还有其它方法，请照实实现为 no-op，并确保与 trait 定义完全一致。

## 测试（写失败测试 → 实现 → 通过）

在 `crates/browser/src/meta_cache_bridge.rs` 内 `#[cfg(test)] mod tests`：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::mpsc;

    #[tokio::test]
    async fn cached_bridge_forwards_meta_over_channel() {
        let (tx, mut rx) = mpsc::unbounded_channel::<(String, String, String, String)>();
        let bridge = CachedMetaBridge::new(Some(tx));
        bridge.emit_meta_changed(
            "tab-1",
            "真实标题",
            "https://a.com/fav.ico",
            "https://a.com/",
        );
        let got = rx.try_recv().expect("meta should be queued synchronously");
        assert_eq!(got.0, "tab-1");
        assert_eq!(got.1, "https://a.com/");
        assert_eq!(got.2, "真实标题");
        assert_eq!(got.3, "https://a.com/fav.ico");
    }

    #[tokio::test]
    async fn cached_bridge_skips_empty_title_or_url() {
        let (tx, mut rx) = mpsc::unbounded_channel::<(String, String, String, String)>();
        let bridge = CachedMetaBridge::new(Some(tx));
        bridge.emit_meta_changed("tab-1", "", "https://a.com/fav.ico", "https://a.com/");
        assert!(rx.try_recv().is_err());
        bridge.emit_meta_changed("tab-1", "标题", "", "");
        assert!(rx.try_recv().is_err());
    }
}
```

## 执行步骤

1. 先写测试（用上面的两个测试），运行确认失败：
   `cargo test -p adl-browser meta_cache_bridge`（预期 FAIL：`CachedMetaBridge` 未定义）
2. 实现 `CachedMetaBridge`（上文代码）+ 在 lib.rs 声明模块并 `pub use` 导出。
3. 运行确认通过：`cargo test -p adl-browser meta_cache_bridge`（预期 PASS）。
4. lib.rs 补导出后，跑全量：`cargo test -p adl-browser`。
5. `cargo clippy -p adl-browser --all-targets -- -D warnings`
6. `cargo fmt --all`
7. Commit（见下表）。

> 若 `cargo` 不在 PATH：先 `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`。

## 全局约束

- 禁止 `unwrap()`（测试代码除外）；错误用 `AppError`。
- 遵循 `rustfmt` 默认格式；`cargo clippy -D warnings` 通过。
- 不要改动本 Task 范围外的文件；不要重构现有逻辑。

## 提交

```
git add crates/browser/src/meta_cache_bridge.rs crates/browser/src/lib.rs
git commit -m "feat(browser): add CachedMetaBridge chan-널 bridge for silent-tab meta forwarding"
```

## 报告契约

将完整报告写入本简报同目录下的 `task-1-report.md`。报告须自包含：改动文件、测试命令与输出、clippy/fmt 结果、commit hash、任何未决疑虑。返回消息只需给：状态（DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED）、commit hash、一句话测试摘要、疑虑（如有）。