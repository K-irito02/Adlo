# Task 2 报告 — 静默标签页创建/导航/销毁的后端基础

## 状态

DONE_WITH_CONCERNS（见"未决疑虑"——现有 PTY 集成测试因环境失败，与本次改动无关）

## 变更文件

| 文件 | 类型 |
|------|------|
| `ai-digital-life/src-tauri/src/commands/browser.rs` | 修改 |
| `ai-digital-life/src-tauri/src/commands/browser_webview_setup.rs` | 修改 |

未改动本 Task 范围外的任何文件。未新增依赖。

## 新增/抽取的函数与签名

### 1. `create_silent_webview`（本 Task 交付物，pub）

```rust
#[allow(dead_code)]
#[allow(clippy::type_complexity)]
pub fn create_silent_webview(
    app: tauri::AppHandle,
    state: &AppState,
    url: &str,
) -> Result<
    (String, tokio::sync::mpsc::UnboundedReceiver<(String, String, String, String)>),
    AppError,
>;
```

- 签名与简报锁定项完全一致（同步 `pub fn`，非 async），Task 3 的 fetch 循环消费该 channel。
- 流程：读取当前配色 → `app.run_on_main_thread` dispatch（参照 `browser_create_for_tab` 的
  `run_on_main_thread + tokio::sync::oneshot` 模式）→ 主线程上用 `build_silent_webview_builder`
  建 builder → `attach_webview_child` 屏外 `add_child(-10000,-10000)` + 挂 WebView2 handler →
  `CachedMetaBridge::new(Some(tx))` 作为事件桥 → `apply_theme_and_navigate_for_platform` 导航到真实 url。
- 等待创建结果：因签名锁定为同步函数，用 `tokio::sync::oneshot::Receiver::blocking_recv()`
  阻塞等待，而非 `.await`（async 上下文无法使用）。
- 失败路径：`created?` 将主线程错误透传为 `Err(AppError)`；`blocking_recv` 的 channel 错误映射为
  `AppError::Internal`。全程无 `unwrap()`，错误统一走 `AppError`。

### 2. `silent_webview_label`（pub，供 Task 3 定位/关闭 webview）

```rust
pub fn silent_webview_label(tab_id: &str) -> String {
    format!("adl-silent-view-{tab_id}")
}
```

### 3. `attach_webview_child`（内部共享辅助，抽取）

```rust
fn attach_webview_child(
    window: &tauri::Window<tauri::Wry>,
    label: &str,
    tab_id: &str,
    webview_builder: tauri::webview::WebviewBuilder<tauri::Wry>,
    make_bridge: impl FnOnce() -> EventBridgeRef,
) -> Result<(), AppError>;
```

- 从 `browser_create_for_tab` 中抽取的"屏外 add_child + 挂 handler"逻辑，两条路径共用。
- `browser_create_for_tab` 重构后行为逐行等价（build builder → attach → register →
  apply_theme&navigate 的 register 分支逻辑原样保留），仅中间 add_child/handler 收纳进 helper。

### 4. `build_silent_webview_builder`（browser_webview_setup.rs 新增，pub(super)）

```rust
pub(super) fn build_silent_webview_builder(
    label: &str,
    target: url::Url,
    color_scheme: &str,
) -> tauri::webview::WebviewBuilder<tauri::Wry>;
```

- 带 `init_script_with_background`，但**不挂** `on_navigation` / `on_new_window`。

## 决策取舍说明

### 注册进可见标签系统？——否

静默 tab 不调用 `register_webview_with_manager`，不进入 `browser_manager` 的可见 tab 管理，
避免混入颜色主题批量更新/UI 标签列表。实现中已验证其仍可工作：WebView2 handler（`setup_webview2_handlers_for_platform`）
通过 `window.get_webview(&label)` 拿到 controller，**不依赖** BrowserManager 注册；导航经
`apply_theme_and_navigate_for_platform`（内部 `with_webview` 取 controller）完成，亦不依赖注册。
销毁由 Task 3 通过持有 `(tab_id → silent_webview_label(tab_id))` 取 webview 并 `close()`。
因此按简报决策第 4 点维持"不注册"。

### 前端事件抑制？——是

静默路径使用 `build_silent_webview_builder`（无 `on_navigation`/`on_new_window`），
因此**不会**向前端 emit `digital-life://browser-url-changed` / `digital-life://browser-open-new-tab`。
`browser_create_for_tab` 仍用原 `build_webview_builder`（保留两处 emit），行为不变（核心约束满足）。
静默 tab 的 title/favicon 完全经 channel (`CachedMetaBridge`) 流入，不对前端产生噪声。

### label 方案？——`adl-silent-view-{id}`

- 查明 `webview_label(label) = format!("adl-browser-view-{tab_id}")`（见 `crates/browser/src/browser_webview.rs`）。
- 静默 tab id 用 `adl_types::create_id("silent")`（→ `silent_{uuid}`），label 前缀 `adl-silent-view-`，
  与可见 tab 的 `adl-browser-view-*` 前缀互异，不可能碰撞。
- 提供 `pub fn silent_webview_label` 供 Task 3 由返回的 silent_tab_id 反查 label 用于 close。

### 同步等待方式

签名锁定为同步 `pub fn`（不可 async），故 `create_silent_webview` 内用 `blocking_recv()` 等待
主线程创建结果。见"未决疑虑"。

## 验证输出（按简报顺序）

1. PATH：`$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`
2. `cargo check --workspace`：✅ `Finished dev profile ... in 15.98s`（编译通过）
3. `cargo clippy --workspace --all-targets -- -D warnings`：✅ 通过
4. `cargo test --workspace`：⚠️ 除 `crates/server` 的 `pty_ws` 集成测试外全部通过
5. `cargo fmt --all`：✅ 通过（仅格式化本次改动文件，未产生无关 diff）

### 测试细节

全工作区所有测试二进制几乎全部 `ok`（0 failed），唯独 `-p ad-server --test pty_ws` 失败：
- `pty_ws_create_returns_session_id`：`a frame of the requested kind should arrive within the timeout: Elapsed(())`
- `pty_ws_echo_round_trip`：同上

这两个测试会**启动真实 ad-server 并通过 WS 打开 `/pty` 会话、等待 PTY 子进程产出 `created` 帧**。
本沙箱环境中 PTY 子进程无法正常工作，无帧返回导致 10s 超时。二者与本 Task 的 webview 改动零耦合
（我的 diff 仅涉及 `src-tauri/src/commands/browser.rs` 与 `browser_webview_setup.rs` 的 WebView 创建逻辑），
属**既有、环境导致的失败，非本次回归**。为佐证，单独重跑 `cargo test -p ad-server --test pty_ws -- --test-threads=1`
仍稳定失败（22s 超时），排除并行资源竞争因素。

## 提交

- Commit：`01303b3d22bde726e5de05d06e28d075283a59dd`（`feat(browser): add create_silent_webview for silent-tab meta rendering`）
- 纳入提交的文件：`src-tauri/src/commands/browser.rs`、`src-tauri/src/commands/browser_webview_setup.rs`
- 本报告文件**未**提交。

## 未决疑虑

1. **同步函数阻塞语义**：`create_silent_webview` 按简报锁定为同步 `pub fn`（非 async），
   内部必须阻塞等待主线程创建结果，故用 `blocking_recv()`。`blocking_recv()` 在 tokio runtime
   工作线程内调用会 panic。Task 3 应在自己的阻塞/非 runtime 上下文调用它（或把它放进
   `spawn_blocking`/`thread::spawn`），否则需在接线时评估改回 async + `.await` 的模式。
2. **`#[allow(dead_code)]`**：在当前二进位 crate（无 lib target）中，签名锁定的 `pub fn create_silent_webview`
   在 Task 3 接线命令前尚未被引用，`dead_code` lint 会触发。简报明确排除其为废弃代码，故以
   `#[allow(dead_code)]` 过渡放行并注释说明；Task 3 一旦将其接入 command，即可移除该 allow。
3. **`#[allow(clippy::type_complexity)]`**：返回类型嵌套层数超过 clippy 阈值。为保持与简报锁定签名
   逐字一致，未改用类型别名，而以 allow 抑制并注释理由。
4. **`pty_ws` 测试失败**：见上文，环境问题，非本改动引入；请主 Agent 确认 CI 环境是否有对应 PTY 能力。
5. **共享辅助的日志微调**：`attach_webview_child` 的 `tracing::info!` 现仅记录 `tab_id`（原 `browser_create_for_tab`
   内还为同一事件记录了 `url`）。仅日志内容、非行为/语义差异，可视需要后续补回。