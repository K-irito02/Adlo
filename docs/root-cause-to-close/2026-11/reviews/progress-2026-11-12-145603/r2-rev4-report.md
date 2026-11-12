# R2 审查报告 — rev4（清理轮）

快照：`.review-diffs/manifest-rev4.md`（5 个文件，base 3f7a4a8e，0 commits）；本轮只看 rev4。
规约：`.agents/rules/review-judgements.md` + 简报 `review-brief.md`。

## 范围

- adlo/crates/browser/src/page_meta_service.rs（新增 note_failure 墓碑 + 2 测试）
- adlo/frontend/dev/previewWorkspaceService/pageMetaService.ts（markFailure 墓碑持久化 + 头注释对齐）
- adlo/frontend/dev/previewWorkspaceService/pageMetaService.test.ts（新增 1 测试）
- adlo/src-tauri/src/commands/browser.rs（silent_backoff_active / silent_fetch_suppressed / now_ms / backfill_request_meta；get/warmup 退避短路；preload 显式等待；4 新测试）
- docs/root-cause-to-close/2026-11/progress-2026-11-12-145603.md（P2/P4 回写）

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

R1（rev4 = 零问题，`r1-rev4-report.md`：F4 已修复，0/0/0/0）：

- R1 全部发现（F1 注释漂移 / F2 shift 下限钳制 / F3 进度文件措辞 / F4 预览头注释自相矛盾）：已关闭（R1 三轮逐条复核后零问题确认；本轮 R2 复核 F2 落点 `clamp(1, 5)` 仍在位，F1/F3/F4 注释与最终代码逐句相符，无漂移）。
- R2 无需复核 R1 已闭环项；本轮只找清理类问题。

## 新增发现

### F1 [severity: low] [category: 文档]
- 位置：docs/root-cause-to-close/2026-11/progress-2026-11-12-145603.md:28
- 描述：`- 日志断言：待 P3 真实启动核对（见下）。` 已失实——P3 真实启动核对已完成并实证记录于本文件 :8（第二次启动 `targets selected targets=0`、`create_silent_webview` 0 次、无 ERROR、用户确认「已解决，批准进 P4」）。同一文件头约定「状态只保留「当前状态」，每轮原地替换」，此陈旧反事实行与该约定及 :8 现状直接矛盾（Brief §5.4 文档与报告一致性）。
- 证据：:8（P3 验证已完成） vs :28（「待 P3 真实启动核对」）；:4 文件头自我约定。
- 建议修复：删除该行，或改写为 `- 日志断言：已核对（见 P3 验证）。`

### F2 [severity: low] [category: 日志]
- 位置：adlo/src-tauri/src/commands/browser.rs:1032
- 描述：`tracing::info!(targets = targets.len(), "browser_page_meta_warmup: targets selected")` 是本轮新增的诊断 INFO——按进度文件 :19 明载其目的为「便于 P3 断言」；P3 已完成（用户确认），且本文件 `tracing::info!` 用于命令调用/清零计数等运维语义（:892/:903/:914/:1112 等），该行每次 warmup（每次启动一次）额外打印一行、无运维计数用途，属过期诊断残留（R2 范围：应删/降级的诊断日志）。
- 证据：progress-2026-11-12-145603.md:19「新增 targets selected INFO 便于P3 断言」；:8 显示该日志已被消费为 P3 证据；无失效引用（warmup 过滤/sem 并发逻辑均不读它）。
- 建议修复：删除该行，或降级为 `tracing::debug!`。行为中性（不改变抓取行为），若主代理按 Brief §7 裁定保留须写明理由并记入进度文件。

## 结论

- 本轮零 critical / high / medium；需修复 2 low（F1 文档失实、F2 过期诊断日志）。
  - critical 0 / high 0 / medium 0 / low 2。
- 范围内其余检查（未使用 import/变量/分支、死字段、多余防御、注释绝对断言、Rust 导出、双端一致、测试有效性、§5.1–5.8）未再发现需修复项。
- 正当保留（不删）：note_failure 的 store 失败 warn（:140-142，尽力持久化不阻塞调用方，简报明令保留）；backfill_request_meta 两处 warn（:40/:46，简报明令保留）；warmup preload 失败 warn（:1019 附近，生产 warn）；get 路径退避短路 :938（有行为语义、有测试，非多余防御）；`silent_fetch_suppressed` 仅 warmup 一处调用但有独立测试覆盖且 get 语义不同（`!hit && backoff` ≠ `hit || backoff`），非死代码。

### 记录不修（不进入主表）

- R3 [low][冗余守卫] page_meta_service.rs:122：`...unwrap_or(1).max(1)` 中 `.max(1)` 恒等（`saturating_add(1) ≥ 1`；`unwrap_or(1)` 亦 ≥ 1）；同行 `fail_count.clamp(1, 5)` 下限 1 同样恒真，`min(5)` 即可。行为等价，纯可选清理。
- R4 [low][占位/预存] pageMetaService.ts:317：`nextRetryAt: now + RETRY_BASE_MS` 初值构造后两行即被 `entry.nextRetryAt = now + delay`（:323）无条件覆盖；为必填字段占位初值不可省略，且预存（非本轮引入）。
- R5 [low][重复] browser.rs:295 `now_ms()` 与 crates/browser/src/page_meta_service.rs:218 `chrono_now_ms()` 为 6 行同构函数；跨 crate 无法共享私有函数，为此暴露 pub 工具不值得。
- R6 [文档] progress-2026-11-12-145603.md:38-39：`- R2 revN：` 与 `- 决策日志：` 空占位行；随本轮收尾回写即消除。
- R7 [记录] claims-ack-rev4.md 已全部 `[x]` 且与 browser.rs:734 注释一致（poll 只保证上报键命中→请求键 peek miss）；rev4 快照注释漂移检查通过，无需复核。

需修复项：2（critical 0 / high 0 / medium 0 / low 2）。
