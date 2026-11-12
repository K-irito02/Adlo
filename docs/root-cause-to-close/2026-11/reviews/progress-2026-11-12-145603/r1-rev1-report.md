# R1 正确性审查报告 — rev1

## 范围

- 基线：`3f7a4a8ecb71656a38aee09acd878c9dbfb0901b`；5 个文件：
  1. `adlo/crates/browser/src/page_meta_service.rs`（note_failure 墓碑 + 2 个单测）
  2. `adlo/frontend/dev/previewWorkspaceService/pageMetaService.ts`（markFailure 增 schedulePersist）
  3. `adlo/frontend/dev/previewWorkspaceService/pageMetaService.test.ts`（新增跨重启用例）
  4. `adlo/src-tauri/src/commands/browser.rs`（silent_backoff_active / silent_fetch_suppressed / now_ms / backfill_request_meta；get 退避短路；warmup 显式 preload + 新过滤；4 个单测）
  5. `docs/root-cause-to-close/2026-11/progress-2026-11-12-145603.md`（新进度文件）
- 核验方式：只读快照 diff + 读工作区源码现状核对；未运行 cargo/pnpm（按本轮只读约束，测试计数以进度文件的用户实测为准，未独立复核）。

## 变更性质分类

- 根因修复（静默抓取全空不记失败 → 每次启动重抓）：`note_failure` + Rust `fetch_silent_meta` 结束后 `backfill_request_meta` 落墓碑 + get/warmup 退避短路。
- 重定向分叉修复：非空 meta 按请求键 report（复用占位/质量/data-URI 既有门控），请求键不再永远 miss。
- 预发布竞态修复：warmup 入口显式 `svc.preload().await`（幂等 or_insert）。
- 双端对齐：预览端 markFailure 增 schedulePersist（墓碑持久化）。
- 测试：Rust 2 个 note_failure 用例 + 4 个命令层用例；前端 1 个跨重启用例。
- 进度文档。

## 验证通过项（无发现）

- 退避数学：`min(BASE(5min) × 2^min(fail_count,5), MAX(2h))`，fail_count 取自增后值；与预览端 `RETRY_BASE_MS * pow(2, min(n,5))` 同构（首次失败 10 分钟）。`saturating_mul` 无溢出。fail_count 通过饱和自增，上界被 min(…,5) 截断。
- 墓碑保留既有字段（title/title_source/favicon_url/favicon_data_uri 原样保留），`last_ok_at` 不伪造（unwrap_or(0)），`fail_count` 自增；store 写失败仅 warn+仍写内存（注释已明示刻意差异，与 report 的 warn-only 风格一致）。
- backfill_request_meta 非空分支经 `svc.report` 复用占位/质量门控，**不会覆盖既有更好条目**：标题按 should_apply_exact_match_title（placeholder/com 规则），图标按 should_replace_favicon（质量分≥、data-URI 不可覆盖）。重定向站点由此在请求键 peek 命中；无重定向时重复 report 为 no-op（report 内门控拒绝）。
- 空 meta 分支 note_failure 落墓碑于请求键，poll 无上报（空 title/favicon）→ report no-op，无双写冲突。
- 内存锁序：note_failure / report / upsert / update_favicon_data_uri 全程持 memory 锁且无 await（rusqlite 同步调用），先写 store 再提交内存（note_failure 除外，见记录不修），与 clear/preload 串行；warmup 显式 preload 取 memory 锁后 store.get_all，无 await 持锁。
- preload 幂等：or_insert 以内存为准，不覆盖新条目；作为 warmup 的 peek 过滤前置，消除 fire-and-forget 竞态。
- get 退避短路：在 `!force` 守卫内、`silent_cache_hit` 检查之后，不创建 WebView、不 emit；既有缓存命中（含 favicon-only）条目仍走原路径，不受退避约束；上限由 force 绕过。
- warmup：`silent_fetch_suppressed = silent_cache_hit || silent_backoff_active`，仅过滤；`targets selected` 只记数量不记 URL（无 token/隐私泄漏面）。
- 前端镜像：Tauri 广播走 `applyBroadcastUpdate` 的 RC3 合并守卫（空字段广播不清镜像），get 短路不 emit 且 `useBrowserUrlChange` 以 `meta.title || tab.title` 兜底，不会把标签标题清空。预览端 get 退避路径同样不 emit、返回键 url 正确。
- 双端语义：Rust 墓碑持久化+退避、预览墓碑持久化+退避，两端行为对齐（实现更优的既有刻意差异已消弭）。i18n 无新增展示文案；无 IPC 新增（不涉及能力登记/四端桥接）。
- 测试有效性：删掉 note_failure/schedulePersist/backfill/退避过滤后，Rust 5 个 + 前端 1 个用例均会变红（前端用例经 calls 计数真实覆盖"未重抓 + warmup 跳过"，且 lastOkAt==0 排除了 TTL 短路的混淆路径）。回归用例从公共入口进入，无私有方法断言。
- claims-ack-rev1.md 的 1 条断言（browser.rs:734「poll 只保证上报键命中…否则重定向站点 warmup/get 永远 miss」）与代码相符，放行合理。

## 新增发现

### F1 [severity: low] [category: 文档]
- 位置：`adlo/crates/browser/src/page_meta_service.rs:111-112`（note_failure 文档注释）；`adlo/frontend/dev/previewWorkspaceService/pageMetaService.ts:4-8`（文件头寿命注释）；`adlo/src-tauri/src/commands/browser.rs:1014-1016`（warmup 入口注释）
- 描述：（a）Rust 注释写「与预览端刻意差异…预览端墓碑仅存会话内存，重启后永久失败站点会再次重抓」——本轮同一 diff 给预览端 markFailure 加了 schedulePersist 墓碑持久化，该断言已不成立。（b）预览文件头写「Rust 已简化为『仅缓存 + report 上报』实现（无 TTL/退避/单飞行），二者语义不一致是刻意保留的预览行为，非 bug」——本轮 Rust 新增 note_failure 退避，此断言同样不成立。（c）warmup 注释仍写「仅对尚无有效缓存（真实标题或非空 favicon）的 URL 触发」，未涵盖本轮新增的退避抑制分支与入口 preload。
- 证据：pageMetaService.ts:321（新增 schedulePersist）、page_meta_service.rs:109-144（note_failure）、browser.rs:1019-1032（preload + silent_fetch_suppressed）。违反 brief §5-8（注释必须与最终代码相符）与仓库「注释漂移占满 R1/R2 后半场」的实测教训。
- 建议修复：三处注释改为如实陈述（Rust 与预览端均持久化墓碑；warmup 抑制 = 缓存命中 ∪ 退避，入口先 preload）。保留内容级双端差异（TTL 仅预览、Rust 无 TTL/无单飞行）。

### F2 [severity: low] [category: 正确性]
- 位置：`adlo/crates/browser/src/page_meta_service.rs:123`
- 描述：`1_i64 << fail_count.min(5)` 未对下限钳制。fail_count 来自 SQLite（INSERT OR REPLACE 由本代码写入，正常 ≥0），但若库被手动改写出负值：debug 构建 `<<` 溢出 panic（dev Tauri 即 debug），release 构建按掩码移位出意外巨大 shift 量，`saturating_mul` 后退化为 RETRY_MAX_MS（行为错但不崩）。预览端 `Math.pow(2, min(n,5))` 对负 n 给出小于 BASE 的分数，无崩溃。
- 证据：Rust `<<` 溢出为 panic（debug_asserts）；`fail_count.min(5)` 只截断上限。
- 建议修复：`let fail_count = existing.…saturating_add(1).max(1)` 或 shift 前 `let shift = fail_count.clamp(0, 5)`。

### F3 [severity: low] [category: 文档]
- 位置：`docs/root-cause-to-close/2026-11/progress-2026-11-12-145603.md:13`
- 描述：进度文件在 R1 审查报告产出之前即写「状态：已完成（用户确认 2026-11-12 ~15:13；批准进 P4）」。按 brief §5-4，进度文件的「已完成」须与最新一轮报告逐条一致；本轮 R1 发现需修复项（F1/F2/本项），若不回写，「已完成」即与审查结论矛盾。另：P3「双重启实测 targets=0、db-wal 4MB」为用户机实测断言，本报告未独立复核（只读约束）。
- 证据：文件头状态行 + §审查报告占位「R1 rev1：」尚未回填。
- 建议修复：状态先置「P3 实测通过、待 R1/R2 收敛后更新」，审查闭环后回写最终状态与报告链接；P3 实测断言注明「用户实测，未独立复核」。

## 记录不修（无需修复，各一行）

- 【优化/本轮引入】请求键别名不携带 favicon_data_uri：`backfill_request_meta` 只 report(title, favicon)，且 `resolve_favicon_backfill_key`（browser.rs:1313）在候选 [page_meta_url=上报键 K, req_url=R] 中优先取 favicon 匹配的第一个（K），data-URI 回填只落 K——别名条目 R 长期缺 data-URI，防盗链站点图标直到用户打开 tab（get 缓存命中缺 data-URI 路径 spawn_favicon_download(R)）才自愈；建议 backfill 时从上报键搬运既有 data-URI 或 resolve 同时回填双键（不在本轮强修，不违双端行为一致）。
- 【预存】`browser_page_meta_get` 新鲜抓取失败时仍 `emit_page_meta_updated` 空 meta（browser.rs:965-967），与短路分支「不 emit」的意图不一致；但前端 `applyBroadcastUpdate` 有 RC3 合并守卫（空字段广播不清镜像）且调用方以 `meta.title || tab.title` 兜底，实际无清空镜像后果。
- 【预存】`browser_page_meta_get_silent`（browser.rs:774）与 `browser_page_meta_refresh`（browser.rs:990）绕过退避/缓存语义强制抓取：get_silent 为显式用户动作 + 前端 10 分钟自愈节流，refresh 明示强制刷新，属设计取舍。
- 【预存】预览端 markFailure 对既有条目不更新 `fetchedAt`（Rust 无条件置为 now）；`upsertSiteMetaCache` 为 read-modify-write 非原子 rename；JSON 单文件崩溃可能截断——沿用既有实现，本轮 schedulePersist 仅复用该通道。
- 【记录】`note_failure` store 写失败仅 warn 且仍写内存（与 upsert/clear「store 失败不动内存」的模式有刻意差异，注释已声明，跨重启可能丢墓碑——尽力持久化语义）；`backfill_request_meta` 的 `if let Err = svc.note_failure` 错误分支当前不可达（note_failure 无 Err 路径），与 report 调用处既有 idiom 一致。
- 【记录】别名条目双键并存使同一站点占两条记录（K 与 R），存储翻倍属本次修复设计内代价；无 ADR/GLOSSARY 冲突（无相关 ADR）。

## 结论

- 需修复项：3（critical 0 / high 0 / medium 0 / low 3）
  - F1 注释与最终代码不符（三处）
  - F2 `fail_count` 移位缺下限钳制（debug panic 隐患）
  - F3 进度文件「已完成」早于审查结论（流程/文档）
- 根因修复方向正确、双端行为对齐、测试真实覆盖修复点，无 critical/high/medium 问题；残余风险为注释漂移与一处潜在 shift 溢出，均为小修。
