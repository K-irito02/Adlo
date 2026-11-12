# R2 审查报告 — rev5（清理轮复审）

快照：`.review-diffs/manifest-rev5.md`（5 个文件，base 3f7a4a8e，0 commits）；本轮只看 rev5。
规约：`.agents/rules/review-judgements.md` + 简报 `review-brief.md`。

## 范围

- adlo/crates/browser/src/page_meta_service.rs（note_failure 墓碑 + 2 测试）
- adlo/frontend/dev/previewWorkspaceService/pageMetaService.ts（markFailure 墓碑 schedulePersist + 头注释/常量注释对齐）
- adlo/frontend/dev/previewWorkspaceService/pageMetaService.test.ts（新增 1 测试）
- adlo/src-tauri/src/commands/browser.rs（silent_backoff_active / silent_fetch_suppressed / now_ms / backfill_request_meta；get/warmup 退避短路；preload 显式等待；4 新测试）
- docs/root-cause-to-close/2026-11/progress-2026-11-12-145603.md（P2/P4 回写）

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

rev4 需修复 2 low，逐条验证：

- **rev4 F1（low，文档）：进度文件「日志断言：待 P3 真实启动核对」失实 → 已关闭。**
  rev5 进度文件 :28 现为 `- 日志断言：已核对（P3 验证节记录）。`，与 :8 P3 验证节（第二次启动 `targets selected targets=0`、`create_silent_webview` 0 次、无 ERROR、用户确认「已解决，批准进 P4」）及文件头「状态只保留「当前状态」」约定一致，无残留「待 P3」字样（全文件 grep 仅 :8 历史实证命中，允许保留）。
- **rev4 F2（low，诊断日志）：`browser_page_meta_warmup` 的 `tracing::info!(targets = …, "browser_page_meta_warmup: targets selected")` → 已关闭。**
  核验过程：
  1. rev5 browser.rs diff 中该行不存在；当前源码 grep `targets selected` 仅 docs :8（P3 历史实证记录，属历史事实，可保留，与修复指示一致）命中，代码/测试零命中；
  2. 无其它代码/测试/文档引用该字符串（全仓 grep 同 :8 单一命中）；
  3. `targets` 变量仍被 `Vec::with_capacity(targets.len())` 与 `for url in targets` 正常使用，无未用变量/导入残留；
  4. P3 实证记录（:8）自洽：该日志行在 P3 时点确实存在（rev1–rev4 快照均含 `+    tracing::info!(targets = targets.len(), ...)`），作为第二次启动实证证据成立，未被删除后的现状矛盾——文档无需改动，符合简报「历史事实可保留」口径。
  - 附带发现：P2 节对 F2 修复的描述 wording 不准，见新增发现 F1。

R1 rev4 已确认零问题（F4 已修复），本轮不复核 R1 已闭环项。

## 新增发现

### F1 [severity: low] [category: 文档]
- 位置：docs/root-cause-to-close/2026-11/progress-2026-11-12-145603.md:19
- 描述：`过滤改 silent_fetch_suppressed；同时打印 targets 数量供断言（后降级——见 P4/R2 rev4 F2）。` 中「后降级」失实——F2 的实际修复是**整体删除**该 `tracing::info!` 行（非降级为 `tracing::debug!` 或其它更低级别）。按「降级」的字面读法，读者会预期在代码里找到降级后的 debug 行，实际并不存在；本文件 :28 与 rev4 F1 修复口径同属「进度文档与最终代码/事实一致」要求（Brief §5.4/§5.8）。同类失实上一轮（F1）已按需修复处理。
- 证据：
  - rev5 `adlo_src-tauri_src_commands_browser.rs-rev5.diff` 中该行不存在（对比 rev3/rev4 快照第 102 行的 `+` 行）；
  - 当前源码 grep `targets selected` 零命中；
  - r2-rev4-report.md F2 建议「删除该行，或降级为 `tracing::debug!`」，实际执行删除；
  - 该行为 P2 节的如实回写目标行（本行即 F2 同步落点）。
- 建议修复：改为「…（后删除——见 P4/R2 rev4 F2）。」（一行字改动，不影响行为）。

## 结论

- 需修复项：1（critical 0 / high 0 / medium 0 / low 1）。
- 范围内其余检查未再发现需修复项：
  - 死代码/未用符号：`silent_backoff_active`、`silent_fetch_suppressed`、`now_ms`、`backfill_request_meta`、`note_failure` 均有生产调用方 + 测试覆盖；warmup 的 `now`、get 路径内联 `now_ms()` 均被使用；无未用 import。
  - 测试有效性（§5.1）：4 个 Rust 新测试与 1 个前端新测试均从公共入口进入，删掉对应修复会变红（backfill 别名/墓碑、note_failure 持久化、get/warmup 退避抑制均有断言落点），无空断言。
  - 双端一致性：预览端 markFailure 经 schedulePersist 持久化墓碑、get/warmup 共用 backedOff 短路，与 Rust note_failure/silent_backoff_active 语义同构；头注释白名单（TTL/单飞行/域名限速自持；退避+墓碑持久化+get/warmup 退避短路双端同构）与上下文一致无自相矛盾。
  - §5.8 注释绝对断言：claims-ack-rev5 单条断言（browser.rs:734「poll 只保证上报键命中，本步补齐请求键——否则重定向站点 warmup/get 永远 miss」）与代码一致（poll 经 `svc.report(&u…)` 写在上报键；warmup/get 只按请求键 peek；claims-ack-rev5 已全部 `[x]`）。Rust 侧 同构 措辞（`silent_backoff_active` 注释「与预览端 backedOff 同构」）经核对预览端 :408 `backedOff = entry.lastOkAt === 0 && now < entry.nextRetryAt` 属实。
  - 其余新增 warn（backfill_request_meta 两处、warmup preload 失败）均为尽力项失败语义，简报口径保留；无应删/应降级的诊断残留。
  - ADR/决策漂移（§5.2.1）：本轮未改动任何 ADR 明文决策。

### 记录不修（不进入主表）

- R3 [冗余守卫] page_meta_service.rs note_failure：`unwrap_or(1).max(1)` 中 `.max(1)` 恒等（`saturating_add(1) ≥ 1`），同行 `fail_count.clamp(1, 5)` 下限 1 亦恒真，`min(5)` 即可。行为等价，延续 rev4 记录不修。
- R4 [占位/预存] pageMetaService.ts：`nextRetryAt: now + RETRY_BASE_MS` 初值构造后两行即被无条件覆盖；必填字段占位初值不可省略，预存。延续记录。
- R5 [重复] browser.rs `now_ms()` 与 crates/browser/src/page_meta_service.rs `chrono_now_ms()` 跨 crate 6 行同构，无法共享私有函数，暴露 pub 工具不值得。延续记录。
- R6 [文档] progress :37-38 `- R2：（rev4 快照，进行中）` 与 `- R2 revN：` 空占位行：rev5 快照为评审前状态，随本轮收尾回写即消除（rev4 已记录，非本轮新增）。
- 注释措辞（可选）：browser.rs `silent_backoff_active` 注释写「有成功记录的条目由缓存命中/TTL 语义管辖」——Rust 侧无 TTL（TTL 为预览端自持概念），但该句描述的是双端共享的管辖划分且鉴别性结论（backoff 不介入，由 `last_ok_at == 0` 保证）有测试覆盖，属可选措辞优化，不进需修复表。
- claims-ack-rev5 已全部 `[x]` 且与 browser.rs:733-735 注释一致，无需复核。

需修复项：1（critical 0 / high 0 / medium 0 / low 1）。
