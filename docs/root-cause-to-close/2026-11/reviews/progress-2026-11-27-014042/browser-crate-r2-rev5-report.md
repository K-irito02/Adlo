# browser-crate R2 rev5 只读清理复审报告

> **只读声明**：未运行 `git diff/log/show`，未修改任何源码/配置，未运行测试套件，未启动 dev server / 浏览器 / headless Chrome，无端口占用需关闭。
> **快照边界**：仅按 `.review-diffs/manifest-rev5.md` 的 `backend (crates)` 分组 7 份 `*-rev5.diff` 审查。rev5 为相对 base（`2396ec4e…`）的全量 diff；用普通文件 `diff` 对照 rev4/rev5 定位本轮 delta，旧快照只用于定位「本轮改了什么」，不作判断依据（rev4 同名 diff 与 rev3 逐字节相同，R2 rev4 主表零）。已读工作区 `webview2_cleanup.rs` 全文，与 rev5 post-image 一致；Grep 复核 `reload_ignoring_cache` 与 4 个清理函数的跨 crate 消费方。本轮 R2 只按清理透镜复核 rev4→rev5 新增，不重开 R1 正确性/注释旧账。

## 范围

`backend (crates)` 7 文件（manifest-rev5.md §文件分组）：

- `adlo/crates/browser/src/browser_webview.rs`
- `adlo/crates/browser/src/lib.rs`
- `adlo/crates/browser/src/webview2_cleanup.rs` ← 本轮逻辑改动唯一文件
- `adlo/crates/browser/src/webview2_reload.rs`
- `adlo/crates/browser/src/webview_handle.rs`
- `adlo/crates/browser/tests/browser_webview_tests.rs`
- `adlo/crates/browser/tests/webview_handle_tests.rs`

跨边界只读上下文（不产出 finding）：`adlo/src-tauri/src/tauri_webview_handle.rs`（生产 trait 桥接/消费方）、`adlo/src-tauri/src/commands/browser.rs`（`await_cleanup` 回执消费）、`adlo/src-tauri/src/main.rs`（命令注册）、`browser-crate-r2-rev4-report.md`、`browser-crate-r1-rev5-report.md`（背景）。

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

- **R2 rev4 主表零**（`browser-crate-r2-rev4-report.md`）：无「上一轮主表未关闭」项。rev4「记录不修」4 项（两段 CDP 回调骨架重复、非 Windows 桩、6 条入口 info 日志、`domain_matches` 的 `format!` 分配）属可选重构/既有风格，本轮不重开、不升级。
- **R1 rev5（同一 rev 的 R1 透镜）主表亦零**：回执全分支覆盖、重载时序/作用域、注释逐句相符已由 R1 rev5 §重点核对逐条确认；按简报 §6「复审收敛（rev≥2）」，主表只收「上一轮主表未关闭」与「本轮修复引入的回归 / 契约错误」，R2 不重复审正确性与注释漂移。

## 本轮 delta（rev4 → rev5）

- **逻辑改动仅 `webview2_cleanup.rs`**（与用户描述「两项 Cookie 完成回调内追加重载 + 回执」一致）：
  - `clear_cookies` 的 CDP 完成回调：新增 `core_for_cb = core.clone()`（`:45`）；原 `match error_code` 重写为 `if let Err(e)` 早返回（`:54-58`）；成功路径新增 `reload_ignoring_cache(&core_for_cb)` + 重载失败 `send(Err("cookies cleared but reload failed: …"))` 早返回（`:59-64`）+ 末尾 `send(Ok(()))`（`:65`）；回调 error 分支补一条 `warn!`（`:55`）。
  - `clear_site_cookies` 的 GetCookies 完成回调：新增 `core_for_cb = core.clone()`（`:122`）；原 `if failed > 0 { send Err } else { send Ok }` 改为 `if failed > 0 { send Err; return Ok(()) }`（`:169-176`），其后新增 `reload_ignoring_cache(&core_for_cb)` + 重载失败 `send(Err("site cookies cleared but reload failed: …"))` 早返回（`:179-184`）+ `send(Ok(()))`（`:185`）。
- **注释同步（非逻辑）**：`webview2_cleanup.rs` 两函数 doc 与行内注释、`webview_handle.rs` 两个 trait doc（`clear_site_cookies` 由英文改写为中文）、`browser_webview.rs` 两个 manager doc，均补「完成后重载本 WebView」；`clear_cookies` 的 SAFETY 注释「自有字符串」→「克隆的 COM 接口」。
- **其余 4 文件逐字节未变**：`lib.rs`、`webview2_reload.rs`、`browser_webview_tests.rs`、`webview_handle_tests.rs` 的 rev5 与 rev4 diff 相同（1324/3140/5979/2800）；两份测试未新增用例，无新增 `pub` 导出、无签名变化。

## 新增发现

无。按 R2 透镜对本轮新增行逐条核对：

1. **死代码 — 无**。新增 `core_for_cb`（`:45`、`:122`）均被新增的 `reload_ignoring_cache(&core_for_cb)`（`:59`、`:179`）消费；新增 `if let Err` 分支、`send(Err)`、`return Ok(())` 全在活跃控制流；无新增未用局部变量、未调用符号、未消费字段、悬挂分支。Grep 复核 `reload_ignoring_cache` 消费方：`lib.rs:53` 导出、`tauri_webview_handle.rs:266` 跨 crate 调用、本文件 `:59/:179/:229/:293` 四处内部调用（本轮 +2），无死符号。rev4 已确认非死的 `fail<T>`（`:30`，4 处调用）、`domain_matches`（`:6`，Windows 回调 + 7 单测）、非 Windows 桩本轮未动。
2. **多余守卫 / 根因修后多余防御 — 无**。`clear_cookies` 把 `match error_code` 改为 `if let Err` 早返回，是「成功路径需追加 reload」的必要重写，非新增冗余判断；两处 `if let Err(reload)` 是「重载失败必须回执错误，否则命令层 `await_cleanup` 会把部分成功当完整成功」的必要守卫，与既有 `clear_cache_and_reload`（`:229`）、`clear_site_data_and_reload`（`:293`）同构。本轮未删除/修正任何根因，不存在「根因修后遗留的防御」。
3. **应删 / 降级诊断日志 — 无**。本轮新增 3 条 `warn!`：回调内 `cdp: Network.clearBrowserCookies failed`（`:55`）、`reload after cookie clear failed`（`:60`）、`reload after site cookie clear failed`（`:180`），全在失败路径，与既有两缓存函数的 `cdp … failed`（`:225/:289`）/`reload after cache clear failed`（`:230/:294`）完全同型，补齐的是 rev4 里 `clear_cookies` 回调 error 分支缺的一致性 warn。`:55` 与同步派发失败的 `:76` 文案相同但互斥（同步失败时 handler 随栈 drop、回调不触发，R1 rev5 §重点核对 1 已证），非重复日志。无新增 `info!` / 临时调试打印；`info!` completed/processed 条目（`:49-53`、`:166`）均既存。
4. **无消费方 pub — 无**。`lib.rs` 本轮逐字节未变，无新增 pub 导出；`webview_handle.rs`、`browser_webview.rs` 仅改注释，无新增 trait 方法 / pub 方法；`webview2_cleanup.rs` 只在既有 `pub fn` 函数体内加逻辑，无新增 `pub`。Grep 复核 rev4 已确认的导出消费方仍在：`cleanup.rs:345-347` 的 4 个函数由 `tauri_webview_handle.rs:145/174/205/236` 调用，`commands/browser.rs:1820/1863` 与 `main.rs:198/199` 注册命令，`CleanupDone`（`webview_handle.rs:39`）由 `tauri_webview_handle.rs` 导入。无「仅为未发布阶段兼容」的包装。
5. **重复逻辑 — 记录不修，不进主表**。两处新增的 `warn→reload→send(Err)→send(Ok)` 骨架与既有 `:229`、`:293` 同构，现共 4 处。rev4「记录不修」已就同型重复给出理由（method/params/origin 日志字段不同，属可选提取共享 helper 的纯结构优化）。本轮是复用既有 `reload_ignoring_cache` 的同构扩展（响应「Cookie 对齐缓存」需求），非新造不一致的复制抽象；按简报 §3（Duplicated Code 为启发式气味、非硬性违规）与 §6 降噪/复审收敛（主表只收回归/契约错误），不升级为需修复项，见「记录不修」。

## 结论

- 需修复项：0（本轮零问题；critical 0 / high 0 / medium 0 / low 0）

## 记录不修

- **4 处 CDP 回调骨架重复**（`cleanup.rs:54-66`、`:169-186`、`:224-237`、`:288-300`）：可提取共享 helper，但各 method/params/日志字段与失败文案不同，属可选结构优化；同型重复 rev4 已记录不修，本轮为同构扩展，按 §6 收敛不进主表。
- **本轮 Cookie 两项重载无删除性推演可保护的用例**：两份测试文件 rev5 与 rev4 逐字节相同，`cfg(windows)` COM 回调触达不到 Mock/Recording 层；与 rev3 已接受的缓存重载测试盲区同构，R1 rev5 §重点核对 5 已详述，属既有架构约束、非本轮引入的回归，不重开。
- **沿用 rev4「记录不修」既有项**：`webview2_reload.rs` 非 Windows 桩（跨平台符号占位，删则编译失败）、6 条入口条目 `info!`（计划性 trace，与既有 `reload_tab` 同型）、`domain_matches` 的 `format!` 分配、`cookie.Domain()` 的 `PWSTR` 未释放 / 扫描静默 `continue` / 大小写敏感、MockHandle 自测回执——均非本轮引入，不升级。
- **本轮新增/改写注释与实现逐句相符**（「完成后重载一次该 WebView」「只作用于本 WebView」可由 `core_for_cb = core.clone()` + 单 WebView `Page.reload` 证明），R1 rev5 §重点核对 4 已逐条确认；注释漂移不属本 R2 清理透镜，且非本轮引入的回归。
