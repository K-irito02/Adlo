# backend scope — R2 清理复核（rev2）

## 范围

- 契约：先读 `.agents/skills/root-cause-to-close/references/review-brief.md`，再读 `.review-diffs/manifest-rev2.md`；快照只看 manifest 列出的 8 个 `-rev2.diff`（backend owner scope），未复用 rev1 快照、未看增量 diff。
- 只读审查：`download_handler.rs` / `download_manager.rs` / `download_types.rs` / `init_script.js` / `digital-life.toml` / `commands/browser.rs` / `commands/download_commands.rs` / `main.rs` 的 rev2 diff；为判定日志是否为临时/临时脚手架，另只读工作区源码 `download_commands.rs`、`init_script.js`、`download_manager.rs` 核对既有日志约定与符号引用。
- 未运行 `git diff/log/show`、未跑任何测试套件 / 门禁；未修改源码或配置；未启动 dev server / 浏览器 / 端口，无后台进程遗留；仅写本报告。
- 本轮任务（R2 清理）：死代码 / 冗余守卫 / 根因修复后不再需要的防御性检查 / 应删除或降级的诊断与临时日志。按简报 §复审收敛，不重开 rev1 已关闭的 finding，不审文档。

## 上轮问题关闭情况（逐条）

- rev1 backend 的 F1（`take_pending_redownload` 兜底跨 tab）与 F2（`reset_for_redownload` 未更新记录 `url`）已由 `backend-r1-rev2-report.md` 在 rev2 逐条确认关闭（含删除性测试）。本轮为 R2 清理复核，按契约不重复评审这两条，只检查两处修复是否遗留临时脚手架 / 调试输出。
- 复核结果：F1/F2 修复链路（`begin_download_record`、`take_pending_redownload`、`reset_for_redownload`、`download_redownload` 导航失败清理）均为正式实现与既有 `[ADL-DL]` 日志约定，无 DBG/temp 残留、无一次性探针、无注释掉的死分支。

## 新增发现

无进入主表的清理项（critical/high/medium/low 均为 0）。

### 记录不修（可选优化 / 已按契约归位，不进入主表）

- `take_pending_redownload`（`download_manager.rs:1213-1215`）：`exact = (tab_id && url 双等)` 是 `same_tab = (tab.is_none() || tab 相等)` 的真子集——`exact` 为真时 `same_tab` 必为真，故 `if !exact && !same_tab` 等价于 `if !same_tab`，`exact` 变量对分支结果无贡献。属行为保持的可选清理（删 `exact` 不改变任何分支），且 stage1/stage2 注释借此描述意图；按复审收敛与「纯优化不算需修复」归此节。若后续统一简化消费逻辑可一并去掉，不建议在本 rev 为它单独改代码。
- 日志：全 scope 未出现 `[DBG-` 类前缀或一次性 `console`/`tracing` 探针。新增的 `download_file_states` / `download_redownload` / `download_prepare_redownload` 调用日志与 `create_download_manager` 的 reconcile 失败 `warn!`、init_script 的 `download link → hidden iframe` info 日志，均沿用本仓既有的 `[ADL-DL]` / `__adlSendLog` 生产日志约定（`download_commands.rs` 既有 20+ 条同前缀日志），非本轮引入的 ad-hoc 调试输出，按规约不报。
- `DownloadFileState.error` 无生产读取方、`reconcile_orphaned_in_progress` 为 `pub` 但仅 crate 内 / 测试调用：rev1 backend 报告已记录并归「记录不修」，本轮不重复上报。
- `download_redownload` 有 `InProgress` 拒绝而 `download_prepare_redownload` 无该状态守卫：属功能行为对称性判断（非清理、且可能改变行为），不在 R2 清理范围；如需统一另立事项。

## 结论

R2 清理复核未发现死代码、可由根因修复消除的冗余守卫/防御检查，或应删除/降级的诊断与临时日志。rev1 的两项修复未遗留调试脚手架；新增日志均符合既有生产日志约定。无可列入主表的需修复项。

- 需修复项：0
