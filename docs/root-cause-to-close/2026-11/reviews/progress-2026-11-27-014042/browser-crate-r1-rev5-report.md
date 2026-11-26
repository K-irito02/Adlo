# browser-crate R1 rev5 只读定向复审报告

> **只读声明**：未运行 `git diff/log/show`，未修改任何源码/配置，未运行测试套件，未启动 dev server / 浏览器，未使用任何端口（无占用端口需关闭）。
> **快照边界**：仅按 `.review-diffs/manifest-rev5.md` 的 `backend (crates)` 分组 7 份 `*-rev5.diff` 审查。rev5 为相对 base（`2396ec4e…`）的全量 diff；已读工作区源码（`webview2_cleanup.rs` / `webview2_reload.rs` 全文，`webview_handle.rs` / `browser_webview.rs` 相关段）与其 post-image 比对一致。rev4/rev5 同名 diff 对照仅用于定位「本轮改了什么」，不作为本轮判断依据。
> **收敛基线**：R1 rev3 主表零（rev2 F1/F2/F3 已关闭）、R2 rev4 主表零，均无未关闭 finding。按简报 §6 收敛，主表只收「上一轮主表未关闭」与「本轮修复引入的回归 / 契约错误」，不重开 R1 旧账。
> **跨边界只读上下文（不产出 finding）**：`adlo/src-tauri/src/tauri_webview_handle.rs`（生产 trait 桥接）、`adlo/src-tauri/src/commands/browser.rs`（`await_cleanup` 回执消费 + 命令注释）、`docs/adr/0038-…`（P5 同步，不审）、`browser-crate-r1-rev3-report.md` / `browser-crate-r2-rev4-report.md`。

## 范围

`backend (crates)` 7 文件（manifest-rev5.md §文件分组）：

- `adlo/crates/browser/src/browser_webview.rs`
- `adlo/crates/browser/src/lib.rs`
- `adlo/crates/browser/src/webview2_cleanup.rs` ← 本轮逻辑改动唯一文件
- `adlo/crates/browser/src/webview2_reload.rs`
- `adlo/crates/browser/src/webview_handle.rs`
- `adlo/crates/browser/tests/browser_webview_tests.rs`
- `adlo/crates/browser/tests/webview_handle_tests.rs`

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

- **R1 rev3 主表零**：rev2 的 F1（站点 Cookie 部分删除失败仍 `send(Ok)`）、F2（强制刷新文档承诺过头）、F3（注释/计数漂移）在 rev3 已逐条关闭（`browser-crate-r1-rev3-report.md`）。
- **R2 rev4 主表零**：`browser-crate-r2-rev4-report.md` 以 R2 透镜复核后仍为零，并明确 rev3「记录不修」的 PWSTR 未释放、逐条扫描静默 `continue`、`domain_matches` 大小写敏感、MockHandle 自测回执均属既有债务，不升级。
- 本轮 rev5 是在零问题基线上响应用户新需求（两项「清除 Cookie」对齐「清除缓存」的点击后重载），**无「上一轮主表未关闭」项**，无旧账需重开。

## 本轮 delta（rev4 → rev5）

- **逻辑改动仅 `webview2_cleanup.rs`**（与用户描述一致）：`clear_cookies` 的 CDP 完成回调、`clear_site_cookies` 的 `GetCookies`/CookieManager 完成回调，在「成功且无删除失败」后各加一次 `crate::webview2_reload::reload_ignoring_cache(&core_for_cb)`；重载失败 `send(Err(...))` 并 `return Ok(())`。
- **注释同步**（用户点名「函数/trait/manager/命令注释同步」）：in-scope 3 文件 + 命令层，逐处核对见 §重点核对 4：
  - `webview2_cleanup.rs:35-37`（clear_cookies doc）、`:83` / `:177-178`（clear_site_cookies doc 与行内注释）
  - `webview_handle.rs:51` / `:53-54`（trait clear_cookies / clear_site_cookies doc；后者由 rev4 英文改写为中文并补「完成后重载本 WebView」）
  - `browser_webview.rs:299-302` / `:433-434`（clear_site_cookies_for_tab / clear_cookies_for_tab doc）
  - `adlo/src-tauri/src/commands/browser.rs:81-82`（browser_clear_site_cookies 命令 doc，other scope，只读）
- **其余 4 in-scope 文件未变**：`lib.rs`、`webview2_reload.rs`、`browser_webview_tests.rs`、`webview_handle_tests.rs` 的 rev5 与 rev4 diff 大小逐字节相同（1324/3140/5979/2800），本轮无改动；两份测试文件亦未新增用例，未新增 `pub` 导出。

## 重点核对（逐项）

### 1. 回执是否在所有分支都发送（成功 / 失败 / 重载失败 / 删除失败）— 全覆盖

`CleanupDone = mpsc::Sender<Result<(), String>>`（`webview_handle.rs:39`），命令层 `await_cleanup` 在 `rx.recv_timeout(20s)` 上等真实结果（`commands/browser.rs:14-34`）。逐分支穷举（工作区 `webview2_cleanup.rs`）：

`clear_cookies`（:38-81）：
- CDP 回调 :48-67：`error_code` Err → `send(Err)` + return（:54-57）；reload Err → `send(Err("cookies cleared but reload failed: …"))` + return（:59-63）；否则 → `send(Ok(()))`（:65）。
- 同步派发 :70-79：`Ok(_)` 不 send（回执交给异步回调，与 `fail()` 注释「否则等待方只能等超时」及 `await_cleanup` 超时一致）；`Err(e)` → `fail(&done, …)`（:30-33）→ `send(Err)` + 返回 `Err`。
- 同步派发失败时 handler 已 create 但未交 COM 持有、随栈 drop，回调不会触发，**无双重 send**。

`clear_site_cookies`（:97-200）：
- 前置失败：`core.cast::<ICoreWebView2_2>()` Err（:107-112）、`core2.CookieManager()` Err（:114-119）→ `fail(&done, …)` → `send(Err)` + return；两处均在注册 GetCookies handler 之前，回调不会触发。
- GetCookies 回调 :126-187：`error_code` Err（:127-130）、`cookie_list` None（:132-134）、`list.Count` Err（:137-140）→ 各 `send(Err)` + return；删除循环 :145-165 后 `failed > 0`（**删除失败**）→ `send(Err("{failed} of {matched} … could not be deleted"))` + return（:169-175）；reload Err（**重载失败**）→ `send(Err("site cookies cleared but reload failed: …"))` + return（:179-184）；否则 `send(Ok(()))`（:185）。
- 同步派发 :189-198：`Ok(_)` 不 send（靠回调）；`Err(e)` → `fail(&done, …)` → `send(Err)` + `Err`。
- `matched == 0`（本站无 cookie）按成功处理（rev3 口径），与删除失败分支互不混淆；`failed > 0` 分支在 reload **之前**，删除失败既不触发重载也不误报成功。

结论：两函数的成功 / CDP(GetCookies) 失败 / 重载失败 / 删除失败 / 同步派发失败 / 前置失败分支均有且仅有一次回执；同步 `Ok` 路径由异步回调补发；无悬挂、无双重 send。

### 2. 重载是否在清理完成之后 — 是

- `clear_cookies`：`Network.clearBrowserCookies` 的 CDP 完成回调里，先判 `error_code`（:54）为 Ok 才调用 reload（:59），即清空动作完成回调已返回后。
- `clear_site_cookies`：在 `GetCookies` 完成回调内，逐条 `DeleteCookie` 循环（:145-165）结束、统计日志（:166）之后，先 `if failed > 0 { … return }`（:169-175），再调用 reload（:179）——严格「成功且无删除失败后」。
- 两处均挂在完成回调里，与既有 `clear_cache_and_reload`（:229）、`clear_site_data_and_reload`（:293）同构；「清理与重载是一个语义单元」与实现相符。

### 3. 是否只作用于本 WebView — 是

- 两处重载均调用 `reload_ignoring_cache(&core_for_cb)`，`core_for_cb = core.clone()`（:45 / :122），`core` 即 `clear_cookies(core, …)` / `clear_site_cookies(core, …)` 入参，来自 `TauriWebViewHandle` 按 `tab_id` 解析出的该标签 WebView（`tauri_webview_handle.rs:50 / :151`），即「当前标签」。
- `webview2_reload.rs:16-52` 只对该传入 `core` 发一次 `Page.reload{ignoreCache}`（:34-38），不枚举/遍历其它 WebView；`Page.reload` 作用于发起调用的 WebView 当前文档。全局 Cookie 罐 / HTTP 缓存虽是 profile 级，但**重载**只作用于本 WebView，与 trait `clear_cache_and_reload` doc「不会重载其它标签（含另一个宿主正在显示的那个）」（`webview_handle.rs:58-59`）及 ADR 0038 #4 一致。

### 4. 注释与实现是否逐句相符 — 是（本轮新增/改写注释逐条核对）

- `webview2_cleanup.rs:35-37`「清空全局 Cookie 罐，完成后重载一次该 WebView……重载挂在完成回调里，只作用于本 WebView 对应的标签页」↔ :48-67 实现；与 :202-207 `clear_cache_and_reload` 既有 doc 同措辞，非新造绝对断言。
- `webview2_cleanup.rs:83`「完成后重载一次该 WebView」+ :177-178「清理完成后重载本 WebView……只作用于这个标签」↔ :179-185 实现（删除循环与 `failed` 检查之后）。
- `webview2_cleanup.rs:167-168`「删除失败必须回执错误……`matched == 0` 仍按成功处理」↔ :169-185 实现。
- `webview_handle.rs:51`「完成后重载本 WebView」、:53-54「按当前文档 host 删除该站点的 cookie，完成后重载本 WebView（`Self::clear_cookies` 是全局版本）」↔ 生产 `current_host(&wv)`（取当前文档 `url().host_str()`，`tauri_webview_handle.rs:32-38, :152`）+ `domain_matches` 域名匹配、全局 `clear_cookies` 的 CDP `Network.clearBrowserCookies`，逐句相符；「按当前文档 host」比 rev4 英文「visible to origin」更贴合按域名后缀匹配的真实口径。
- `browser_webview.rs:299-302`「cookie 枚举、逐条删除与重载都在异步回调里」↔ 三者同处 `GetCookies` 完成回调；:433-434「完成后由平台层重载该标签」↔ `clear_cookies` 完成回调内 reload。
- `commands/browser.rs:81-82`（只读）「完成后重载该标签」↔ 同实现。
- 绝对断言回扫（§5.8）：本轮新增的「只作用于本 WebView / 只作用于这个标签」可由 `core_for_cb = core.clone()` + `reload_ignoring_cache` 单 WebView 调用证明；无「必然/总是/永远/所有…都」类无依据断言，无被取代的旧流程术语残留。

### 5. 删除性推演（测试有效性）— 本轮新增行为无回归测试保护，按收敛记「记录不修」

两份测试文件 rev5 与 rev4 逐字节相同（本轮未新增用例）。按简报 §1「读用例 + 读实现，说明删掉修复后哪个断言会变红」逐用例推演「删掉两处 reload（及重载失败 `send(Err)`）」：

- `browser_webview_tests.rs::tab_scoped_actions_target_only_the_requested_webview`（rev5 diff +51-119）：`RecordingHandle` 记录的是 **trait 层**方法调用与 `done.send(Ok(()))` 回执，断言 recorded 序列（+85-96）与 6 条 `NotFound`（+100-115）。删掉 `webview2_cleanup.rs` 平台实现里的 reload，序列与回执断言**全绿**。
- `webview_handle_tests.rs::mock_handle_mute_clear`（rev5 diff +43-65）：`MockHandle` 自测四个清理动作的 `Ok` 回执，删掉 reload **全绿**。
- `webview2_cleanup.rs` 内联 `domain_matches` 单测（:349-363）：与 reload 无关，删掉 reload **全绿**。

结论：本轮新增的「Cookie 清理完成回调重载」**没有任何现有用例会因删掉修复而变红**——`#[cfg(windows)] mod imp` 的 COM 回调在非 Windows CI 不编译、在 Windows 亦需真实 WebView2 实例，现有 `WebViewHandle` Mock/Recording 用例触达不到平台层。

不进主表的理由：① 与 R1 rev3 已零问题通过的 `clear_cache_and_reload`（:229）/ `clear_site_data_and_reload`（:293）两处缓存重载**完全同构**（同一 `reload_ignoring_cache`、同一回执模式、同一类完成回调），其测试盲区是既有架构约束而非本轮修复引入；② 本轮修复未破坏任何既有测试或契约，不属 §6「本次修复引入的回归 / 契约错误」；③ 按 §6「复审收敛（rev≥2）」与用户「R1 rev3 已零问题，不要重开旧账」，更早的 pre-existing 平台层测试盲区放「记录不修」。要覆盖须把平台层 reload 抽象为可注入依赖（架构重构），超出本轮「对齐缓存行为」范围。

## 新增发现

无。本轮修复引入的路径未发现回执悬挂、双重 send、重载时序/作用域错误、注释漂移、契约错误或行为回归；in-scope 7 文件其余 4 个本轮无实质改动（`lib.rs` 导出、trait 方法签名、两份测试均与 rev4 一致，无新增 `pub` 导出、无死代码回流）。

## 记录不修

- **本轮 Cookie 两项重载无删除性推演可保护的用例**（见 §重点核对 5）：平台层 `cfg(windows)` COM 回调的既有测试盲区，与 rev3 已接受的缓存重载同构，按 §6 收敛不进主表。
- **ADR 0038 #4 与 rev5 实现一致**（「Cookie 两项与缓存两项都在完成回调里发一次 `Page.reload{ignoreCache}`，重载未发出时回执错误」）；用户中途改变交互（Cookie 也要重载）已在 ADR 明文体现，无「代码与 ADR 两套权威打架」。文档事实/措辞同步按 manifest-rev5.md「文档（未写 diff，P5 同步）」与简报 §2 留 P5，不作为 R1 需修复项。
- `browser_clear_cookies`（全局 Cookie）命令未像 `browser_clear_site_cookies` 那样补「完成后重载」doc；属 other scope 的可选注释缺失（非注释漂移、无错误承诺），不产出 finding。
- 沿用 rev3/rev4 既有观察：`cookie.Domain()` 的 `PWSTR` 未 `CoTaskMemFree`、`GetValueAtIndex`/`Domain()`/`to_string()` 失败静默 `continue`（极端下 matched=0 仍报 Ok）、`domain_matches` 大小写敏感、`webview_handle_tests.rs` MockHandle 自测回执、`webview2_reload.rs` 非 Windows 桩；均非本轮引入，不重开。

## 结论

- 需修复项：0（本轮零问题；critical 0 / high 0 / medium 0 / low 0）
