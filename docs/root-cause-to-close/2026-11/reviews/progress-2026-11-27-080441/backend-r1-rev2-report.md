# backend scope — R1 确认复审（rev2）

## 范围

- 契约：先读 `.agents/skills/root-cause-to-close/references/review-brief.md`，再读 `.review-diffs/manifest-rev2.md`；快照只看 `manifest-rev2.md` 列出的 8 个 `-rev2.diff`（backend owner scope），未复用 rev1 快照、未看增量 diff。
- 只读审查：`download_handler.rs` / `download_manager.rs` / `download_types.rs` / `init_script.js` / `digital-life.toml` / `commands/browser.rs` / `commands/download_commands.rs` / `main.rs` 的 rev2 diff；为核对实现来源，另只读工作区源码 `download_handler.rs`、`download_manager.rs`、`commands/browser_webview_setup.rs`、`init_script.js`。
- 未运行 `git diff/log/show`、未跑任何测试套件 / 门禁；未修改源码或配置；未启动 dev server / 浏览器 / 端口，无后台进程遗留；仅写本报告。
- 本轮任务：定向确认 rev1 backend 的 F1 / F2 是否关闭，并检查这两处修复是否引入新的 Critical/Important 回归；按简报 §复审收敛，更早的 pre-existing low 不进主表。

## 上轮问题关闭情况（逐条）

### 1. F1 — `take_pending_redownload` 兜底跨 tab（rev1 medium）→ **已关闭**

- 实现（`download_manager.rs:1197-1221`）：`exact = pending.tab_id.as_deref() == tab_id && pending.url == url`；新增 `same_tab = pending.tab_id.is_none() || pending.tab_id.as_deref() == tab_id`；`if !exact && !same_tab { return None; }` 在克隆 id、清空槽位之前返回，故异 tab 且 pending 有 tab 时**不消费、留原样**，该下载走 `create_download`。同 tab URL 变化（重定向/签名）与 `tab_id=None` 回退仍消费，符合设计稿 §8 的兜底语义。
- 注释准确性：doc comment（1185-1196）与 inline stage comment（1206-1212）均写明「仅同 tab 或无 tab 兜底；异 tab 保留并返回无匹配」。其中「单槽 + `register_pending_redownload` 拒绝第二个未过期登记」「过期即丢弃」均可由代码直接验证，无「必然/永远/唯一」类不可证绝对断言。
- 测试有效性（`download_manager.rs:4373` `pending_redownload_fallback_does_not_cross_tabs`）：注册 `rec-1` / `tab-1` / URL a → 以 `tab-2` + 不同 URL 取 → 断言 `None`（删除 tab 守卫后会返回 `Some("rec-1")`，转红）→ 再以 `tab-1` + URL a 取 → 断言 `Some("rec-1")`（若前一步误消费则转红，证明 pending 未被清掉）。用例确实覆盖跨 tab 不消费且 owner 仍可消费。既有 `pending_redownload_unique_fallback_on_url_mismatch`（`tab_id=None`）与 `begin_download_record_resets_pending`（`tab_id=None`）在新守卫下仍走合法回退，未被破坏。
- `download_redownload` 导航失败清理（`download_commands.rs:115-118`）用精确 `(tab_id, record.url)` 消费，新守卫不影响该清理路径。

### 2. F2 — `reset_for_redownload` 未更新记录 `url`（rev1 medium）→ **已关闭**

- SQL（`download_manager.rs:1251-1266`）：`UPDATE ... file_path = ?3, file_name = ?4, source_tab_id = ?5, url = ?6 WHERE id = ?7`；params 顺序为 status?1 / created_at?2 / file_path?3 / file_name?4 / source_tab_id?5 / url?6 / id?7，占位符与实参一一对应，无错位。doc comment（1223-1226）已写明写入 resolved URL（含重定向变化）。
- 调用链传值：`download_handler.rs:13-23` `begin_download_record` 用 `take_pending_redownload(source_tab_id, url)` 命中后调用 `reset_for_redownload(&record_id, url, final_path, source_tab_id)`；其 `url` 来自 `setup_download_handler` 闭包的 `DownloadEvent::Requested { url, destination }`（`browser_webview_setup.rs:341-347`），即 WebView2 实际上报的 DownloadStarting URL，与 `handle_download_finished` 的 `r.url == url`（`download_handler.rs:239`）及按 `record.url` 查原生 operation 的口径一致。全部 3 个调用点参数顺序已核对一致（handler 1 处 + manager 测试 2 处）。
- 测试有效性：
  - `begin_download_record_updates_url_on_redirect_reuse`（`download_handler.rs:522-552`）：pending 注册为 URL X / `tab-1`，以 URL Y（含 `?sig=`）进入 `begin_download_record`，断言 `out.id == record.id`（id 不变）、`out.url == Y`、`list_downloads().iter().any(|r| r.id == id && r.url == Y)`（DB 实际落盘 URL）。删除 `url = ?6` 后 `out.url` 与 list 断言均转红。
  - `reset_for_redownload_reuses_id_and_resets_fields`（`download_manager.rs:4201`）已补 `assert_eq!(reset.url, ...)`，直接守住 UPDATE 写入 URL。
- 未触碰 schema，无需迁移脚本；旧记录仅在被复用时才改写 URL，与 fix report 说明一致。

## 新增发现

无新增 Critical/Important 回归。两处修复均未改变其它分支：

- capability / 命令注册仍然闭环：`digital-life.toml` 新增的 `download_file_states` / `download_redownload` / `download_prepare_redownload` 与 `main.rs` 的 `generate_handler!` 注册、`download_commands.rs` 的 `#[tauri::command]` 同名一致，无遗漏。
- `init_script.js` 新 helper 使用 `DOWNLOAD_EXTENSIONS`（`/i`，无 `g` 标志），`.test()` 无 `lastIndex` 状态问题；改动未触及本次两项修复的链路。
- `download_types.rs` 的 `DownloadFileState`、迁移计数返回类型等改动属 rev1 已审范围，本轮未重复上主表。

### 记录不修（复审收敛：更早的 pre-existing 项 / 已记录理由，不进入主表）

- `DownloadFileState.error` 无生产读取方、`reconcile_orphaned_in_progress` 为 `pub` 但仅 crate 内调用：rev1 backend 报告已记录，本轮不重复上报。
- `take_pending_redownload` 对 `tab_id=None` 的 pending 仍允许任意 tab 兜底消费：这是「无活动 tab 准备路径」的既有设计（fix report「Concerns」已明确承认），本次修复只收紧有 tab 的跨 tab 场景，非本轮引入。
- `download_redownload` 对 `Paused` 记录会在 `setup_download_handler` 的 `get_record_by_url` Paused 早退分支被拒绝（pending 留至 15s TTL）：属 redownload 功能既有交互，与本次两项修复无关；若需支持暂停记录重下应另立事项。
- 隐藏 iframe 下载链接对内联渲染类型（PDF/SVG/媒体）是否必然触发 `DownloadStarting` 依赖 WebView2 行为：rev1 backend 已就 `init_script.js` 该项确认关闭，本轮不重复挖。

## 结论

本轮零问题：rev1 backend 的 F1（跨 tab 兜底）与 F2（记录 URL 未更新）均已按建议修复，doc/inline 注释与实现逐句相符，两条新增删除性测试均能守住修复；rev2 diff 中未见由这两处修复引入的 Critical/Important 回归。无需修复项。

- 需修复项：0
