# cleanup-backend R2 rev11 审查报告（清理专项）

## 范围

- 工作树：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1`；快照：`.review-diffs/manifest-rev11.md`（base `aced53d8`，commits 0，78 文件）。只看 rev11 完整快照；未复用旧快照作证据、未看 rev10→rev11 增量、未执行 `git diff/log/show`、未改源码/配置、未跑测试/门禁。
- 范围文件：`adlo/crates/browser/src/**`、`adlo/crates/server/src/handlers/dsh.rs`、`adlo/crates/tauri-runtime-wry-patched/src/lib.rs`、`adlo/src-tauri/src/**`、`adlo/src-tauri/scripts/browser-title-eval.js`、`adlo/Cargo.lock`、`adlo/Cargo.toml`、`adlo/src-tauri/Cargo.toml`、`adlo/src-tauri/permissions/digital-life.toml`。
- 本轮边界（非 git）：rev11 快照 + 工作区源码；范围目录内只有 3 个文件带本轮 mtime（2026-11-24 08:34:21）——`crates/browser/src/init_script.js`、`crates/browser/src/browser_webview.rs`、`frontend/src/app/features/browser/initScriptNavigation.test.ts`，其余范围文件 mtime ≤ 07:49（上一轮落笔时间），据此把本轮变更面收敛到这 3 个文件；同时逐条复核 rev10 报告引文的落点未漂移。
- 连带只读核对（仅用于判断注释/断言是否成立，不进范围结论）：`adlo/frontend/src/app/features/browser/initScriptNavigation.test.ts`（F1 建议 2 的落地处）。
- 方法：只读源码 + 删除性推演（读用例 + 读实现）。**未运行测试/门禁**，**未启动 dev server / 浏览器 / headless Chrome**（未占用任何端口，无后台进程，未写临时文件）。
- `.review-diffs/` 无 `claims-ack-rev11.md`；本轮新增/改动注释中的绝对断言我逐条人工核对，结论见「回归检查 › 绝对断言核对」。
- 文档（`docs/**`、ADR、进度文件）按简报导则交 P5。

## 上轮问题关闭情况（逐条）

1. **F1（rev10 唯一 low）「安装期 gate 与关闭方向即时生效的注释不对称、且缺源码断言」→ 已关闭（两部分均落地）。**
   - **措辞（源码侧）已改为不对称口径**：
     - `crates/browser/src/init_script.js:41-43` → 「The `window.open` rewrite and SPA nav-guard are install-time gates: enabling them needs a reload, while disabling takes effect immediately through their runtime checks.」
     - `crates/browser/src/browser_webview.rs:322-326` → 「Click interception reads the globals dynamically, so re-assigning them takes effect on already-loaded pages. Two paths are installed when the document loads: enabling them requires a reload, while disabling takes effect immediately through their runtime checks.」
   - **逐句核实成立**（对照工作区源码）：
     - 安装期门控确为两处、且只有两处：`init_script.js:645 if (__adlIsAgentHost()) {`（`window.open` 重写）、`:756 if (!__adlIsAgentHost()) return;`（SPA nav-guard）。全文 9 处出现（`:44` 为定义、其余 8 处为调用：`:174/:436/:472/:503/:645/:685/:706/:756`），除这两处外都是**事件时**判定，故「Two paths are installed when the document loads」准确。
     - 「enabling needs a reload」：开关/白名单只经 `browser_webview.rs:340-342` 的 `eval_js`（`:367`）改写全局量，不重载；`init_script.js:590-593`、`:620-623` 在 `__startNavGuard` 缺席时回退 `navigateToUrl`，`:685` 之前 `:645` 的门控使包装不存在 → 开启方向确实需要重载。
     - 「disabling takes effect immediately」：`window.open` 分支在 `:685 if (__adlIsAgentHost() && __adlSendAgentLink('url', resolvedUrl))` 复判，关闭/移出白名单后落到 `:690 origOpen.call(...)`；nav-guard 由 `:503 if (!__adlIsAgentHost()) return;` 拦截，点击不再进入 `__startNavGuard`。两处都用运行期读到的全局量，故关闭方向即时。
     - 新措辞没有反向断言「关闭后完全原生」：`window.open` 的下载分支 `:672-684`（`location.assign` 同文档原生 DownloadStarting）本就不受开关影响，`install-time gate` 的表述保留了「包装仍在」这一既有事实（rev10 已记录为不修）。
   - **源码断言已落地**：`frontend/src/app/features/browser/initScriptNavigation.test.ts:196-199` 新增
     `// 安装期 gate 的 window.open 包装仍按运行期开关复判（关闭方向即时生效）。` +
     `expect(initScript).toContain("if (__adlIsAgentHost() && __adlSendAgentLink('url', resolvedUrl))")`，与 `init_script.js:685` 逐字一致（全文件只此一处该字符串，无重复锁）。
   - **删除性推演：该锁真能变红**：删掉 `:685` 的 `__adlIsAgentHost() && ` → `toContain` 失败。且这是**唯一**保护：同一 describe 的 `beforeAll`（`:356-376`）在未设置 `__adlAgentOrigins` 时求值一次脚本，`setAgent`（`:385-389`）在其后，故 jsdom 中 `:645` 门控恒假、`window.open` 包装从未安装，`:426` 起的 agent 用例只覆盖点击拦截；`:282-290`「delegates window.open(http)」也只断言切片内含 `window.open`/`origOpen`。
2. **结转记录项（rev10「记录不修」）：`webview2_postmessage.rs:1-19` 模块文档仍未列 `save-blob-failed` / `adl-agent-link` / `dl-log` / `adl-media` → 仍未补。** 该段本轮未改（仅列 meta / open-new-tab / save-blob），属摘要性列举、无「穷尽」断言，继续留在「记录不修」。
3. **rev10 建议里的第三处（`init_script.js:641-642` → 现 `:642-643`）未按建议改写**：现文「安装期判断：开关变更后需重载页面才会安装/移除该重写（点击拦截本身是动态的）」。判断为**不构成未关闭**：该句只陈述「重写对象的安装/移除发生在文档加载时」，事实成立（关闭开关后包装仍存在、只是 `:685` 失效），且同段头部 `:41-43` 已给出不对称口径；仅措辞未合并为单句，列入「记录不修」。
4. **rev10 其余条目均为「记录不修」**，本轮状态未变（回归检查逐条复核）。

### 回归检查（本轮是否有新退化）

- **本轮变更面只含上述 3 个文件**（见「范围」的 mtime 界；`browser_webview.rs` 的 rev11 差异仅 2105 B，全部落在 `setup_webview2_handlers` 签名/探针接线与 `:320-326` rustdoc；`init_script.js` 差异里注释改动只有 `:41-43` 一处新增）。rev10 报告引用的其余落点逐条复核为同一内容：`browser_navigation.rs:30-32` about-only 背景 + `:36-60` agent 前缀、`webview2_background.rs:38-43`/`:68-73` 与 `browser_navigation.rs:26-29` 的 `#f2f2f2`/`#e0e0e0` 同值、`webview2_postmessage.rs` 分派顺序（save-blob-failed → save-blob → agent-link → open-new-tab → media）、`webview_handle.rs:76-107` 触发源说明、`download_commands.rs:9-17`（`MAX_BLOB_BYTES = 64 MiB`、`blob_exceeds_limit` 判 `>`）与 `init_script.js:299`/`:327` 同界、`main.rs:251-283` 三条源码锁（`browser-title-eval.js:7`、patched `lib.rs` 的 `if !is_untrusted_browser_webview(&label)`/`"adl-browser-view-"`/`"adl-silent-view-"`、workspace `Cargo.toml` 的 `[patch.crates-io] tauri-runtime-wry = { path = "crates/tauri-runtime-wry-patched" }`）逐字一致，`main.rs:291-320` 命令白名单锁与 `permissions/digital-life.toml` 已删 `download_save_blob` 一致，`src-tauri/Cargo.toml` 的 `Win32_System_JobObjects` 带用途注释（`adl_server.rs` job object 的实现依赖）。
- **绝对断言核对（本轮新增/改动注释，逐句对照落点）**：
  - 成立：`init_script.js:41-43`（enabling 需重载 / disabling 即时，落点 `:645`/`:756`/`:503`/`:685`）；`browser_webview.rs:323-326`（click 拦截动态 + 两条 install-time 路径，落点同上 + `:340-342`/`:367`）；`initScriptNavigation.test.ts:196`（「关闭方向即时生效」，落点 `:685`）。
  - 无「关闭后完全原生」一类反向断言（`init_script.js:642-643` 只说「安装/移除该重写需重载」，与 `:672-684` 的下载分支不冲突）。
  - 旧流程术语回扫：全仓已无「the `window.open` rewrite … only change after a reload」类表述（`grep takes effect|reload|重载` 在范围源码内仅剩 `init_script.js:42`/`:643`/`:746`/`:755`、`browser_webview.rs:275`/`:325-326`、`webview2_challenge.rs:5`，均为多轮已定稿口径）。

## 新增发现

无（本轮未发现 critical / high / medium / low 级需修复项）。

## 记录不修

- `init_script.js:642-643` 未按 rev10 建议合并为「该重写需重载才会安装/移除；`:685` 的门控随开关即时变化」：现措辞事实成立、同段头部已补不对称口径，合并属可选收紧。
- `init_script.js:460-467` `__adlRouteNewWindowEvent` 文档只写「target=_blank/修改键走 postMessage」，未提 `:472 if (__adlIsAgentHost()) return;` 让 agent 站点交给 `__adlAgentClickHandler`（agent 站点上纯 `target=_blank` 非下载链接走 `adl-agent-link`，不是新标签页）；`webview_handle.rs:76-80` 与 `webview2_postmessage.rs:12-15` 的同向描述同样省略该例外。属描述不完整，非失效断言，建议下次触碰补一句。
- `initScriptNavigation.test.ts:196-199` 的源码锁放在标题为「routes target=_blank and modified clicks to the new-tab helper」的用例内，标题未涵盖该断言；与本文件既有「同用例聚合文本锁」写法一致（`:184`/`:195`/`:201-207` 同类），不算失效文案；若要更清晰可另起「window.open 运行期复判」用例。
- `init_script.js:641` 注释与 `:671-682` 下载分支同 agent 开关无关（页面以 agent 站点加载、随后关闭开关后，`window.open` 下载 URL 仍走同文档 `location.assign`）：rev8 之前既有差别，本轮措辞已用 install-time gate 保留该事实。
- `webview2_postmessage.rs:1-19` 模块摘要未列 `save-blob-failed` / `adl-agent-link` / `dl-log` / `adl-media`（结转 rev9/rev10）。
- `webview2_challenge.rs:8-10`「Production builds stay silent」与 `:86` 环境变量 opt-in 的措辞张力（整模块按进度文件保留，结转）。
- `webview2_challenge.rs:173-205` 两段 `info!` 字段表重复约 30 行（探针模块，按进度文件保留，结转）。
- `init_script.js` 内 9 条 `console.log('[ADL-DL-JS] …')` + 1 条 `console.error`（写进页面 devtools，Rust 侧同构日志已走 `__adlSendLog`）：按既定口径维持，未扩围。
- `browser_webview_setup.rs:944` 孤立 `///`（base 即存在，纯风格）。
- `dsh.rs` `restarted_authenticated` 的 `unwrap_or_else(|| url_has_launch_token(&url))` 兜底、`main.rs:236-246` 在 `Exit | ExitRequested` 双路径 `terminate()`：宽松兜底/幂等路径，理由同 rev8/rev9。
- `commands/browser.rs` `is_search_or_challenge_url` 对 baidu / so.com 用 `path.starts_with("/s")` 会连带命中 `/static`、`/signin`：启发式行为问题，非清理项，仍交 R1。
- `is_download_url`（`browser_webview_setup.rs:64-76`）前后各算一次 `url.path().to_lowercase()`：轻微重复分配，可选优化。
- `webview2_navigation.rs:17-22` `navigate_core_with_referrer` 自身不校验 `referrer`（净化在 `commands/browser.rs:42` 边界）：当前唯一调用方已用净化值，属可接受的边界信任。
- 依赖/清单类：`adlo/Cargo.lock` 仅 `tauri 2.11.5 → 2.11.6`；`src-tauri/Cargo.toml` 新增 `Win32_System_JobObjects`（有用途注释、非零引用）；`permissions/digital-life.toml` 移除 `download_save_blob` 与 `generate_handler!` 同名项删除一致，全仓已无残留，postMessage 桥接（`webview_event_bridge.rs:42-86` → `save_blob_download`）已接替；`save_blob` / `save_blob_failed` 不属命令，无需权限项。
- 文档类残留（ADR 0001 修订叙述、`docs/analysis/browser-embedding/**`、`docs/root-cause-to-close/**` 进度文件）留 P5。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；本轮零问题。
