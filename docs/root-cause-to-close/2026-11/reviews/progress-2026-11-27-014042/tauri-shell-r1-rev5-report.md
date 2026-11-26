## 范围

- scope：`manifest-rev5.md` 的 `other` 分组，8 文件：`adlo/src-tauri/Cargo.toml`、`permissions/digital-life.toml`、`tauri.conf.json`、`src/main.rs`、`src/commands/browser.rs`、`src/commands/browser_webview_setup.rs`、`src/commands/divider_strip.rs`、`src/tauri_webview_handle.rs`。只看 rev5 快照，不复用旧快照、不看增量 diff。
- 本轮增量定位：逐个比对 8 个 `-rev5.diff` 与 `-rev4.diff` 的字节数，仅 `adlo/src-tauri/src/commands/browser.rs` 变化（4901→4934 B，hunk `+106`→`+107`），其余 7 个文件与 rev4 逐字节相同。唯一改动为 `commands/browser.rs:1860-1861` 给 `browser_clear_site_cookies` 文档注释补一行 `/// 完成后重载该标签。`（上一行句号改逗号续接）；注释之外的代码、签名、配置、ACL、注册均未改动。与用户说明「本轮 src-tauri 只改了 commands/browser.rs 的注释」一致。
- 只读上下文（仅用于核对注释一致性 / 回执链路，不产出 finding）：backend 分组 `crates/browser/src/{browser_webview, webview_handle, webview2_cleanup, webview2_reload}.rs` 的 rev5 diff 与当前工作区源码；`tauri-shell-r1-rev3-report.md`（R1 零问题基线）、`tauri-shell-r2-rev4-report.md`（上一轮零问题，确认无主表未关闭项）。
- 只读约束：未运行 `git diff/log/show`，未改源码/配置，未运行测试 / clippy / 门禁，未启动任何 dev server / 浏览器 / headless Chrome，无端口占用、无后台进程遗留。结论来自 rev5 diff + 当前源码静态核对。

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

- 上一轮（rev4/r2）报告结论「需修复项 0」，无「上一轮主表未关闭项」；R1 rev3 亦为零问题。按「不要重开旧账」，本轮只核对修复质量，不回溯历史旁支。
- R1 rev3 关闭的 4 项在本轮保持关闭、无回退：
  1. F1（devtools 默认开启 / 注释因果反向）—— 已关闭保持：`Cargo.toml`、`browser_webview_setup.rs`、`divider_strip.rs`、`tauri.conf.json` 本轮均未变，四类 WebView 的 `.devtools(true/false)` 口径与补丁运行时 `unwrap_or(true)` 一致。
  2. F2（清理 FFI 失败当成功）—— 已关闭保持：`await_cleanup` 四路分支与 4 个清理命令的 async 回执样板本轮未动。
  3. F3（站点 Cookie 只删根路径可见项）—— 已关闭保持：`tauri_webview_handle.rs` 的 `current_host` + 平台 `domain_matches` 按 host 匹配未变。
  4. F4（壳 `devtools:false` 作用范围）—— 已关闭保持：`tauri.conf.json` 未变。

## 新增发现

本轮无新增需修复 finding。用户指定的三项确认逐条结论如下：

1. **命令链路未破坏**：`src/main.rs`（`invoke_handler` 注册）与 `permissions/digital-life.toml`（`commands.allow`）在 rev5 均与 rev4 逐字节相同，包含 `browser_clear_cookies`、`browser_clear_site_cookies`、`browser_clear_cache`、`browser_clear_site_cache` 四条清理命令及 `browser_hard_reload_tab`、`browser_open_devtools`；命令名与 `#[tauri::command]` 函数名、`browser_manager` 方法名逐一对应。本轮仅改注释，未触碰注册 / ACL。

2. **AC 白名单未破坏**：上述 6 个命令均在 `digital-life.toml` 白名单内，无遗漏、无多余；WebView 侧 invoke 仍经既有 ACL 边界（符合 review-judgements 判断项 1）。

3. **完成回执链路四端贯通（未被破坏）**：
   - 命令层 `browser.rs:1819-1893`：4 个清理命令均 `async` + `mpsc::channel()` + `clear_*_for_tab(&tab_id, tx)` + 同步失败 `return Ok(ipc(Err(e)))` + `await_cleanup(rx).await`。新增注释所在函数 `browser_clear_site_cookies:1863-1873` 的回执样板与其它三条完全一致，未改。
   - `await_cleanup`（`browser.rs:1792-1817`）：`spawn_blocking(recv_timeout(20s))`，`Ok(Ok)`/`Ok(Err)`/`Timeout`/`Disconnected` 四路分别落 `IpcResult::ok`/`AppError::Internal`/`AppError::Timeout`/`AppError::Internal`。
   - manager 层 `browser_webview.rs`：`clear_cookies_for_tab` / `clear_site_cookies_for_tab` / `clear_cache_for_tab` / `clear_site_cache_for_tab` 均带 `done: CleanupDone`，经 `require_handle` → `handle.clear_*(done)`；`CleanupDone = mpsc::Sender<Result<(), String>>`（`webview_handle.rs:11`）与命令层 `tx` 类型匹配，编译前提成立。
   - handle 层 `tauri_webview_handle.rs`：4 个 `clear_*` 方法把 `done.clone()` 传入 `adl_browser::clear_*`；`with_webview` 返回 `Err` 时闭包连同 `done` 被丢弃 → 命令层收到 `Disconnected` 报错，不假成功、不静默超时。
   - 平台层 `webview2_cleanup.rs`：两项 Cookie（`clear_cookies:46`、`clear_site_cookies:110`）与两项缓存（`clear_cache_and_reload:221`、`clear_site_data_and_reload:275`）均在完成回调里先 `reload_ignoring_cache(&core)` 再 `done.send(Ok(()))`；同步派发失败 `fail()` 既 `send(Err)` 又返回 `Err`。→ 清理完成后才回执，且重载只作用于本 WebView 对应标签，与两项清缓存口径一致，新需求在平台层已兑现。

4. **注释与平台实现一致（本轮唯一改动 `browser.rs:1860-1861`）**：
   - 新句「完成后重载该标签」可由代码证明：平台 `clear_site_cookies` 在 `GetCookies` 完成回调里逐条删除后调用 `reload_ignoring_cache(&core_for_cb)`（`webview2_cleanup.rs:192`），随后 `send(Ok(()))`；`matched==0`（本站无 cookie）仍走重载，故「清理完成后重载」成立。
   - 与同链路其它注释口径一致：manager「清除指定标签页当前站点的 Cookie……完成后由平台层重载该标签」（`browser_webview.rs:37-40`）、trait「清除本站 Cookie……完成后重载本 WebView」（`webview_handle.rs:24-26`）、命令文件缓存两项「完成后重载该标签页 / 不动其它标签」（`browser.rs:1832,1846`）。
   - 无绝对断言词（必然/总是/所有/唯一/不会等），为可由代码证明的行为描述，符合简报 §5-8；注释承诺未超出实现（重载对象是 `with_webview` 给出的本标签 `controller()`，非其它标签），不存在「注释承诺得比实现多」的漂移。
   - 站点级 / 全局口径表述（`browser_clear_cookies` 是全局）与平台实现一致：全局走 `Network.clearBrowserCookies`，站点走 `CookieManager` + `domain_matches` 按 host 过滤。

5. **无新增回归**：other 分组 8 文件本轮仅一行注释变化，无逻辑 / 签名 / 配置 / ACL / 注册改动；命令层调用与 manager 方法签名匹配，`await_cleanup` 契约不变。R1 rev3 与 rev4 已零问题的链路本轮未被改写。

## 记录不修

- `browser_clear_cookies`（全局 Cookie，`browser.rs:1820`）无文档注释写明「完成后重载」，而另外三条清理命令都有；四项清理的平台实现均重载。属注释覆盖不齐，但该函数本就无文档注释、不含与实现矛盾的错误断言，不改变行为或事实，且为 R1 rev3 既有状态（本轮未动它）。按简报 §6 复审收敛 / 降噪约定，pre-existing 低危项放记录不修、不进主表；若主代理希望四项注释对齐可下一轮顺手补，不作需修复项。
- 跨 scope 提示（不计入本 scope）：backend 平台层在 `reload_ignoring_cache` 派发失败时 cookie 已清仍 `send(Err)` 报失败、`domain_matches` 删除父域 cookie 连带影响兄弟子域，以及 `hard_reload` 非 Windows 退化语义，均属 backend / browser-crate scope 的既有实现语义（R1 rev3 已记录边界），由对应 scope 处理。
- 文档类（`docs/**`、ADR 0038、`progress-2026-11-27`、知识库完成记录）本轮不审，按简报 §2 留 P5 统一同步。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；本轮零问题。
