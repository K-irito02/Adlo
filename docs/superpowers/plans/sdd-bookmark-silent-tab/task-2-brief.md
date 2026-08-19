# Task 2 简报 — 静默标签页创建/导航/销毁的后端基础

> 本简报是唯一需求来源。请严格按此实现，不要读整个计划文件。
> **子 Agent 隔离**：你只实现本 Task。Task 3（SilentTabFetcher + 命令接线）由另一个 Agent 实现，会消费你本 Task 产出的接口。因此接口签名必须按本简报锁定，不得自行更改。

## 目标与上下文

在 `src-tauri/src/commands/browser.rs` 增加"静默 WebView"创建能力：后台渲染一个 WebView（对用户不可见），把渲染出的 title/favicon 经 Task 1 的 `CachedMetaBridge` 流入 channel，供 Task 3 的 fetch 循环消费。静默 tab 是临时的：渲染完即销毁，不进入可见标签页系统。

## 已由主 Agent 解决的关键设计决策

1. **channel 通路**：静默 tab 的事件桥用 `CachedMetaBridge::new(Some(tx))`，`tx` 是 `tokio::sync::mpsc::UnboundedSender<(String, String, String, String)>`，元组为 `(tab_id, url, title, favicon)`。消费方在 tokio await 上下文（Task 3）。
2. **创建只能在主线程**：参照 `browser_create_for_tab`（browser.rs L21-L109）用 `app.run_on_main_thread(move || ...)` + `tokio::sync::oneshot` 返回结果的模式。
3. **屏外创建**：`add_child` 置于 `LogicalPosition::new(-10000.0, -10000.0)`（同现有实现），不调用 `show()`，用户无感知。
4. **不注册进 BrowserManager 可见标签系统**：静默 tab 是临时的，不进 `browser_manager` 的可见 tab 管理（否则会混入颜色主题批量更新/UI 标签列表）。销毁由 Task 3 通过持有(`tab_id`→`webview_label(tab_id)`)取到 webview 并 `close()`。**若实现中发现不注册会导致 WebView2 handler 拿不到 controller 而无法工作，请改为注册并在销毁时同步注销，并在报告里说明取舍。**

## 涉及文件

- Modify: `src-tauri/src/commands/browser.rs`

## 接口（锁定，Task 3 依赖）

产出两个 `pub` 函数（在本文件顶层，非命令）：

```rust
/// 创建静默 WebView（后台不可见，不注册进可见标签系统）。
/// 在主线程 dispatch；渲染 title/favicon 经 CachedMetaBridge 流入返回的 channel。
/// 返回 (silent_tab_id, meta 接收 channel)。
pub fn create_silent_webview(
    app: tauri::AppHandle,
    state: &AppState,
    url: &str,
) -> Result<
    (
        String,
        tokio::sync::mpsc::UnboundedReceiver<(String, String, String, String)>,
    ),
    AppError,
>;
```

> **为何返回 channel 而非仅 tab_id**：静默 tab 的唯一目的是把元数据交给 Task 3 的 fetch 循环，若只返回 tab_id，channel receiver 会在函数返回时丢失。计划里 `Result<String>` 是示意，此处以本简报为准。

## 实现要求

1. **共享创建逻辑抽取（优先）**：`browser_create_for_tab` 内"build builder → add_child → setup handlers → register → apply theme & navigate"是主线程命令的核心。为避免复制大段代码，抽取内部辅助函数供 `browser_create_for_tab` 与静默路径复用。两点差异：
   - **bridge 不同**：`browser_create_for_tab` 用 `TauriWebView2EventBridge`；静默路径用 `CachedMetaBridge::new(Some(tx))`。
   - **注册差异**：`browser_create_for_tab` 用 `register_webview_with_manager` 注册；静默路径按决策第 4 点不注册（除非不注册无法工作）。
   - 抽取后必须保证 `browser_create_for_tab` 现有行为完全不变（回归）。
2. **前端事件抑制（设计点）**：`build_webview_builder`（browser_webview_setup.rs L51-L82）的 `on_navigation` / `on_new_window` 会向前端 emit `digital-life://browser-url-changed` / `browser-open-new-tab`。静默 tab 不应把这些事件泼到前端。**设计点**：静默路径构造一个不 emit 前端事件的 builder（或不挂 `on_navigation`/`on_new_window`），若如此做会显著偏离现有结构，则在报告中说明并保留（前端噪声可接受）——由你权衡并记录理由。**核心约束：不得破坏 `browser_create_for_tab` 的现有行为。**
3. **label 唯一性**：静默 tab 的 label 应与可见 tab 区分（避免与 `webview_label(tab_id)` 碰撞），例如前缀 `silent-`。查明 `webview_label` 实现后决定，保证不冲突。
4. **导航**：创建后即导航到真实 `url`（复用 `apply_theme_and_navigate_for_platform` 或对应导航调用，需主线程）。

## 测试

- 本 Task 是 WebView 基础设施，**不需要新增单元测试**（无法在无 Tauri runtime 的 `cargo test` 中实例化 AppState/Window/WebView2）。
- 必须通过：
  - `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`（若 cargo 不在 PATH）
  - `cargo check --workspace`（编译通过）
  - `cargo clippy --workspace --all-targets -- -D warnings`（无警告）
  - `cargo test --workspace`（现有测试不回归）
  - `cargo fmt --all`
- **不得引入 dead code**：只实现被消费/被引用的函数。Task 3 会消费 `create_silent_webview`，故其为 `pub` 不算 dead code。

## 全局约束

- 不新增依赖（除非确有需要并说明）。
- 禁止 `unwrap()`（测试除外）；错误用 `AppError`。
- 遵循 `rustfmt` 默认格式；`cargo clippy -D warnings` 通过。
- 不改变 `browser_create_for_tab` 的对外行为与语义。
- 不要改动本 Task 范围外的文件；不要重构非相关逻辑。
- 变更后按 `.trae/rules/mandatory-testing.md` 触发结束验收。

## 提交

```
git add src-tauri/src/commands/browser.rs
git commit -m "feat(browser): add create_silent_webview for silent-tab meta rendering"
```

> 若还改动了 `crate::commands` 的 mod 声明或其它文件，一并 `git add`（仅限为支撑本次改动所需的最小文件）。

## 报告契约

将完整报告写入本简报同目录 `task-2-report.md`。报告须自包含：改动文件、抽取/新增的函数与签名、决策取舍说明（注册否、前端事件抑制否、label 方案）、cargo check/clippy/fmt/test 输出、commit hash、任何未决疑虑。返回消息只需给：状态（DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED）、commit hash、一句话编译/测试摘要、疑虑（如有）。