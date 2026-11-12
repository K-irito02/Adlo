# R1 复审报告 — rev2（验证 rev1 修复闭环）

## 范围

- 基线：`3f7a4a8ecb71656a38aee09acd878c9dbfb0901b`；5 个文件（manifest-rev2）：
  1. `adlo/crates/browser/src/page_meta_service.rs`（note_failure + 2 单测）
  2. `adlo/frontend/dev/previewWorkspaceService/pageMetaService.ts`（文件头/常量注释/markFailure doc + schedulePersist + 测试侧不变）
  3. `adlo/frontend/dev/previewWorkspaceService/pageMetaService.test.ts`（与 rev1 一致，无变化）
  4. `adlo/src-tauri/src/commands/browser.rs`（warmup 注释对齐；其余与 rev1 一致）
  5. `docs/root-cause-to-close/2026-11/progress-2026-11-12-145603.md`（状态行/P4 回填）
- 核验方式：只读 rev2 快照 diff + 逐 hunk 与工作区源码现状比对；rev1↔rev2 快照 diff 逐行对比确认增量仅为注释/clamp/文档回填。未运行 cargo/pnpm（只读约束；测试计数以进度文件所列用户实测为准，未独立复核）。claims-ack-rev2.md 的 1 条断言（browser.rs:734）已 [x] 且与代码相符。

## 上轮问题关闭情况（逐条）

- **F1（低，文档，注释漂移三处）— 已关闭**（含一处同行新漂移，见本轮 F4）：
  - ① Rust note_failure 注释：rev2 已改为「双端墓碑均持久化（预览端 markFailure 经 schedulePersist 写 JSON 持久层），跨重启仍生效」+「store 写失败仅 warn（尽力持久化…）」，与实现一致（page_meta_service.rs:107-114 现行源码核对无误）。
  - ② 预览文件头：rev1 中「Rust 已简化为仅缓存+report（无 TTL/退避/单飞行），二者语义不一致是刻意保留」已删除，改为「预览模式与 Rust … 的缓存策略同构：…墓碑持久化（preview markFailure 经 schedulePersist 写 JSON；Rust note_failure 写 SQLite）」。但同一改动引入了新的过度断言，见本轮 F4。
  - ③ warmup 注释：browser.rs:1014-1021 现行源码已涵盖「有效缓存命中 ∪ 退避期中失败墓碑」抑制 + 入口显式 `svc.preload().await`（get_all + or_insert，幂等，与 preload 实现第 21-31 行逐行相符），并保留信号量说明。
- **F2（低，正确性）— 已关闭**：fail_count 现为 `existing.…saturating_add(1).unwrap_or(1).max(1)`（page_meta_service.rs:121-122），shift 为 `fail_count.clamp(1, 5)`（:123），`1_i64 << shift` 移位量恒在 [1,5]，debug 下无 panic；库写入负值（i64::MIN/-3 等）均被 max(1)/clamp 收敛。饱和自增 + 双钳制，F2 场景全部覆盖。
- **F3（低，文档）— 已关闭**：进度状态行（progress…145603.md:7）现为「已完成（用户确认「已解决，批准进 P4」，2026-11-12 ~15:13；P4+ 见本文件下方）」——只陈述用户确认 + P3 实证（双重启 targets=0、0 次 create_silent_webview、db-wal 写入），不再宣称与 R1 结论一致；R1 结论与修复记录如实回填于「P4 进度（R1）」节（:31-33）。注：行 5 仍为 `## [ ] 事项 1` 且「R2 revN：」位空——属 R2 收敛后的流程回写事项，归主代理，不构成修复项。

## 新增发现

### F4 [severity: low] [category: 文档]
- 位置：`adlo/frontend/dev/previewWorkspaceService/pageMetaService.ts:5-8`（rev2 新写的文件头「语义说明」）
- 描述：文件头称「预览模式与 Rust `crates/browser/src/page_meta_service.rs` 的缓存策略同构：**TTL 7 天 / get 的 TTL 与退避短路 / … / 单飞行**」。但 Rust 侧并无 TTL（`page_meta_service.rs` 全文无 TTL 概念，get 路径无时效短路）、亦无单飞行（`inFlight Map` 仅存在于预览 `pageMetaService.ts:256,415-428`）。同一 diff 第 28-30 行补充的注释反而如实写明「本文件其余缓存策略（TTL/退避短路）为预览模式自持实现」，与文件头自相矛盾。属本轮修复引入的新注释漂移（brief §5-8：不许把范围写成全集）。
- 证据：pageMetaService.ts:4-10（rev2 头注释）vs :28-30（同文件后补注释）vs Rust get（page_meta_service.rs 无 TTL/in-flight 逻辑）；rev1 报告 F1 已指出该文件头曾犯同类错误（断言 Rust 无退避），本轮换了一个方向的过度断言。
- 建议修复：文件头改为「失败退避 + 墓碑持久化双端同构；TTL 7 天 / get 短路 / 单飞行为预览模式自持实现（Rust 无 TTL/单飞行）」，与其同文件的第 28-30 行注释对齐即可。

## 双端一致 / 测试有效性 / 其余专项（rev2 增量范围）

- 双端一致：Rust note_failure 与预览 markFailure 在 failCount+1 / 2^min(n,5) / cap 2h / 墓碑持久化 四要素上同构（两端 store 不同：SQLite vs JSON，刻意且已在注释双方均声明）。get 退避短路在两端均为 last_ok_at==0 && now<next_retry_at、不 emit。一致。
- 测试有效性：删掉 note_failure / schedulePersist / backfill / 退避过滤，Rust 5 个 + 前端 1 个用例均变红；前端用例经 `calls` 计数真实覆盖「未重抓 + warmup 跳过退避墓碑」。F2 修复（clamp）无专项用例，但它是防御性钳制、修复前后正常路径行为不变，不影响回归保护结论。
- 异步/并发：note_failure 全程持 memory 锁、无 await（rusqlite 同步调用），先 store 后内存（写失败仅 warn，已在注释声明，尽力语义）。warmup 入口显式 preload（持锁 + 无 await），与 clear/upsert/report 串行。无新的并发写路径。
- 持久化元数据：note_failure 落盘与描述同一次 upsert；fetched_at 更新但 last_ok_at 不伪造（unwrap_or(0)）；成功路径（report）清零 fail_count/next_retry_at 由既有用例覆盖。
- 安全/i18n/能力登记：无新增 IPC、无展示文案、无 capability 变更、日志无敏感数据（targets 仅记数量）。
- ADR/GLOSSARY：本 diff 未改动任何 ADR 明文决策；无新领域术语入 GLOSSARY 需求。
- claims-ack-rev2（browser.rs:734）：断言「poll 只保证上报键命中…否则重定向站点 warmup/get 永远 miss」与 `backfill_request_meta` 实现及 L1 回归用例相符，放行合理。

## 记录不修（无需修复，各一行）

- 【承袭 rev1 不修项（用户 R1 已认可）】请求键别名不带 favicon_data_uri（resolve_favicon_backfill_key 上报键回填 + get 路径 spawn_favicon_download(请求键) 兜底，自愈）。
- 【承袭 rev1 不修项】force / get_silent / refresh 绕过退避/缓存（用户显式动作 / 强制刷新，设计取舍）。
- 【承袭 rev1 不修项】`browser_page_meta_get` 新鲜抓取失败仍 `emit_page_meta_updated` 空 meta（applyBroadcastUpdate RC3 合并守卫不清镜像；get 短路分支不 emit，两端不 emit 行为已对齐）。
- 【承袭 rev1 不修项】预览 fetchedAt 不刷新 / schedulePersist JSON 非原子写（upsertSiteMetaCache read-modify-write 无 rename；沿用既有通道，本轮仅复用）。
- 【承袭 rev1 记录项】note_failure store 写失败仅 warn 仍写内存（尽力持久化，注释已声明，跨重启可能丢墓碑，与 report/upsert/clear「store 失败不动内存」的模式有刻意差异）；`backfill_request_meta` 中 `if let Err = …note_failure` 分支当前不可达（与 report 调用处既有 idiom 一致）。
- 【承袭 rev1 记录项】别名条目双键并存使同一站点两条记录（K 与 R），存储翻倍属修复设计内代价；无 ADR/GLOSSARY 冲突。
- 【观察·交主代理】progress 文件 `## [ ] 事项 1` 与「状态：已完成」并存、`R2 revN：` 位空、P3 实测断言仅为用户机实测（未独立复核）——R2 收敛后应回写最终状态并把 P3 标注为用户实测。
- 【观察】进度文件 :14「注：预览端墓碑仅存会话内存（重启即失效），本次一并修正为持久化」读起来像现状断言，实为「修复前现状」的历史叙述（尾句已点明修正）；保留，不构成需修复项。

## 对用户「不修项理由」的异议

无。rev1 已认可并由用户确认接受的不修项（请求键别名 data-URI 自愈、force/get_silent/refresh 绕过退避属设计、emit 空 meta 有 RC3 守卫、预览 JSON 非原子写为预存）在 rev2 中未引入新的对立证据，理由依然成立。

## 结论

- 需修复项：1（critical 0 / high 0 / medium 0 / low 1）
  - F4 预览文件头「缓存策略同构」清单含 Rust 并不具备的 TTL 7 天 / get TTL 短路 / 单飞行（注释与实现不符）
- rev1 三项（F1/F2/F3）均已关闭；根因修复方向正确、双端行为对齐、测试真实覆盖修复点。剩余唯一问题为本轮修复引入的一处文件头注释过度断言，属小修文档项。
