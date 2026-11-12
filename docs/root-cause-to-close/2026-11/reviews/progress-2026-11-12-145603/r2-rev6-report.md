# R2 审查报告 — rev6（清理轮复审）

快照：`.review-diffs/manifest-rev6.md`（5 个文件，base 3f7a4a8e，0 commits）；本轮只看 rev6。
规约：`.agents/rules/review-judgements.md` + 简报 `review-brief.md`。

## 范围

- adlo/crates/browser/src/page_meta_service.rs（note_failure 墓碑 + 2 测试）— 与 rev5 逐行等同
- adlo/frontend/dev/previewWorkspaceService/pageMetaService.ts（markFailure 墓碑 schedulePersist + 头注释/常量注释对齐）— 与 rev5 等同
- adlo/frontend/dev/previewWorkspaceService/pageMetaService.test.ts（新增 1 测试）— 与 rev5 等同
- adlo/src-tauri/src/commands/browser.rs（silent_backoff_active / silent_fetch_suppressed / now_ms / backfill_request_meta；get/warmup 退避短路；preload 显式等待；4 新测试）— 与 rev5 等同
- docs/root-cause-to-close/2026-11/progress-2026-11-12-145603.md（P2 节 F1 回写，唯一变更）

rev6 = rev5 + F1 文档修复（P2 节一行字改动）；代码/测试部分与 rev5 逐字节一致，复审聚焦该文档修复及 §5 强制项复核。

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

### rev5 F1（low，文档）：进度文件 P2 节「（后降级——见 P4/R2 rev4 F2）」失实 → **已关闭**

- rev6 进度文件 :19 现为 `- \`browser_page_meta_warmup\`：入口显式 \`svc.preload().await\`（幂等）消除竞态；过滤改 \`silent_fetch_suppressed\`。（P3 断言期间临时加过一条 targets 计数 INFO，R2 复审后删除——见 P4/R2。）`
- 与要求措辞「P3 断言期间临时加过一条 targets 计数 INFO，R2 复审后删除——见 P4/R2。」逐字一致；「删除」（非「降级」）与 rev5 核验结论（rev5 快照中该行不存在、当前源码零命中）及 r2-rev4-report.md F2 建议处置一致，无失实。
- 自洽性：① :8 P3 节保留 `targets selected targets=0` 历史实证（rev5 F2 关闭时已认可可保留，本文档未再改），与新增括注互为印证；② "R2 复审后删除"时序成立（F2 由 R2 rev4 提出、rev5 快照已删除）；③ "见 P4/R2"指向 P4 节 R2 区块，rev5 记录不修项 R6 已明示「rev5 快照为评审前状态，随本轮收尾回写即消除」，rev6 仍未收尾，P4/R2 占位行（:37-39）未回写属预期中间态，非本行新引入的失实——延续 R6，不重复计为发现。
- 全文件无"后降级"残留（grep 确认 :19 为唯一相关句）。

R1 rev4 已确认零问题（F4 已修复），本轮不复核 R1 已闭环项。

## 新增发现

无。

### §5 强制项复核（rev6 整体）

- 测试有效性（§5.1）：note_failure 跨重启/保留好条目两 Rust 测试、silent_backoff_active / silent_fetch_suppressed / backfill 两 Rust 测试、前端 failure tombstone 测试，均走公共入口，删掉对应修复会变红（函数/行为不存在），无空断言、无内部字段窥探。
- 持久化元数据原子性（§5.2）：note_failure 先写 store（失败仅 warn＝尽力持久化、不阻塞调用方，注释 §5.8 逐句相符）再提交内存；get 短路路径不创建 WebView、不 emit；warmup 入口显式 `preload().await`（get_all + or_insert，注释与实现相符）。
- ADR/决策漂移（§5.2.1）：本轮无 ADR 明文决策改动。
- 多来源/部分失败（§5.3）：无新增多腿场景。
- 文档与报告一致性（§5.4）：P2/P3/P4 节现状与 rev5 报告逐条一致；「已完成」状态对应用户确认 + P3 实证，R2 进行中不提前写「零问题」。
- 领域术语（§5.5）：无新增 `_Avoid_` 词；"墓碑"等既有术语沿用。
- Rust 导出（§5.6）：note_failure 有跨 crate 消费方（commands/browser.rs），非无调用方 pub 包装。
- 注释与文案绝对断言（§5.8）：claims-ack-rev6 单条（browser.rs:734「poll 只保证上报键命中……warmup/get 永远 miss」）已 [x]，与 poll 写上报键、warmup/get 按请求键 peek 的代码一致；`silent_backoff_active`「有成功记录的条目由缓存命中/TTL 语义管辖」与 `last_ok_at == 0` 守卫 + 测试覆盖相符（「TTL 语义」为双端共享管辖划分的既有表述，rev5 已定性可选优化，未升级）；note_failure 注释 `min(BASE × 2^min(fail_count,5), MAX)` 在 fail_count≥1 可达域上与 `clamp(1,5)` 实现等价。warmup 注释「or_insert」与 preload 实现逐字相符。
- 双端一致性：预览 markFailure 经 schedulePersist 持久化、get/warmup 退避短路（get 的 backedOff 与 Rust silent_backoff_active 同构：`lastOkAt === 0 && now < nextRetryAt`），Rust note_failure/silent_fetch_suppressed 与之对应；头注释白名单（TTL/单飞行/域名限速预览自持、退避+墓碑+get/warmup 退避短路双端同构）与上下文无矛盾。预览 warmup 以 `now >= entry.nextRetryAt` 过滤、由 get() 的 ttlHit/backedOff 短路兜底，抓取抑制与 Rust 等价（返回值形态为预览自有设计，非本轮变更）。
- 测试文件：新增用例仅用既有导入（readSiteMetaCache 等）与本地 emptyMeta，无未用符号。
- claims-ack-rev6 已全部 `[x]`，与最终代码一致。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；本轮零问题。
- 上一轮 F1：**已修复**（P2 节措辞逐字符合要求，全文件无残留失实表述）。

### 记录不修（不进入主表）

- rev6 R3（延续）：page_meta_service.rs note_failure `unwrap_or(1).max(1)` 中 `.max(1)` 恒等、`clamp(1, 5)` 下限恒真——行为等价，延续 rev4/rev5 记录。
- rev6 R4（延续）：pageMetaService.ts `nextRetryAt: now + RETRY_BASE_MS` 占位初值两行后被无条件覆盖，必填字段不可省略，预存。
- rev6 R5（延续）：browser.rs `now_ms()` 与 page_meta_service.rs `chrono_now_ms()` 跨 crate 6 行同构，无法共享私有函数，不暴露 pub 工具。
- rev6 R6（延续，弱指针）：进度文件 :37-39 的 `R2：（rev4 快照，进行中）` / `R2 revN：` / `决策日志：` 占位行及 P2 新增括注「见 P4/R2」指向该未回写区块——rev6 为评审前状态，收尾回写时一并消除/填充（rev4 已记录、rev5 R6 复述）。本轮未明显升级，不重复计为需修复。
- 注释措辞（可选）：`silent_backoff_active` 注释「TTL 语义」一词，Rust 侧无 TTL 实现；鉴别性结论有测试覆盖，属可选优化，维持记录。
