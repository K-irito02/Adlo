# R1 复审报告 — rev3（验证 F4 修复是否闭环）

## 范围

- 基线：`3f7a4a8ecb71656a38aee09acd878c9dbfb0901b`；5 个文件（manifest-rev3）：
  1. `adlo/crates/browser/src/page_meta_service.rs`（note_failure + 2 单测；rev3 与 rev2 快照逐字节一致，无新增 hunk）
  2. `adlo/frontend/dev/previewWorkspaceService/pageMetaService.ts`（文件头/常量注释/markFailure doc 重写——本轮唯一源码变更）
  3. `adlo/frontend/dev/previewWorkspaceService/pageMetaService.test.ts`（与 rev2 一致，无变化）
  4. `adlo/src-tauri/src/commands/browser.rs`（与 rev2 一致，无变化）
  5. `docs/root-cause-to-close/2026-11/progress-2026-11-12-145603.md`（P4 进度 rev2 回填）
- 核验方式：只读 rev3 快照 diff + 与工作区源码现状（pageMetaService.ts:1-31、:301、:395-433、:475-504；Rust/browser.rs 侧经 rev2 审查且本轮快照逐字节未变）比对；rev2→rev3 增量 = 预览文件头重写 + 进度文件回填。未运行 cargo/pnpm（只读约束）；测试计数以进度文件所列用户实测为准，未独立复核。claims-ack-rev3（browser.rs:734）的 1 条断言与 `backfill_request_meta` 实现相符，放行合理。

## 上轮问题关闭情况（逐条）

- **F4（低，文档，预览文件头「缓存策略同构」过度断言）— 未关闭**：
  - 已改善的部分：rev3 文件头不再把「TTL 7 天 / get 的 TTL 短路 / 单飞行」宣称为双端同构，改列「预览模式自持、Rust 无对应实现」——原 F4 的核心错误断言（TTL/单飞行 列入同构）已被摘除。
  - 但未达成派发要求的闭环措辞（「对齐项 = 退避 + 墓碑持久化 + get/warmup 退避短路；TTL 7 天 / 单飞行 / 域名限速为预览自持」，且与行 28-30 注释一致）：
    1. **对齐项漏列 get/warmup 退避短路**：文件头（:4-5）只把「失败指数退避 + 墓碑持久化」列为双端对齐项，而同文件 :29-30 注释明确写有「get/warmup 的退避短路双端同构」——两处注释自相不一致（对齐项清单一多一少）。Rust 侧 `browser_page_meta_get`（退避墓碑直接返回空 meta、不创建 WebView、不 emit）与 preview `get`（:408-412 backedOff 短路）、warmup 双侧（Rust `silent_fetch_suppressed`；preview :485 `now >= nextRetryAt` 入选 + `get` 短路复核）确有同构的退避短路，文件头应当如实枚举。
    2. **域名限速被挂进「同构」从句，与同文件 :31 直接矛盾**：文件头 :7-8 写「占位标题门控 / 失败不删缓存 / 域名限速与 Rust get 退避短路同构」——按字面，域名限速被宣称为与 Rust 同构的机制；而 :31 写「预览模式自持（Rust 无对应）：TTL 7 天、单飞行、**域名限速**」。Rust 全仓无域名限速实现（crates/ 与 commands/ 检索 限速/rate-limit 仅命中无关的 download_manager.rs:376）。同一文件两处注释互相打架，属 brief §5-8「不许把意图写成事实」/「同文件注释漂移」。
    3. 该句子本身语法悬空（三个并列名词后接「与 Rust get 退避短路同构」），不可无歧义解读。
  - 进度文件（:38「rev2：…已按实修复（文件头改为「对齐项 = 退避+墓碑持久化；TTL/单飞行/域名限速为预览自持」），行 28-30 注释同步收窄」）对文件头的描述与磁盘现状不符——文件头并未把域名限速列为自持、也未把 get/warmup 退避短路列入对齐项。按 brief §5-4，进度文件回填应由主代理在 F4 真正闭环后一并改写。

## 新增发现

### F4 [severity: low] [category: 文档]
- 位置：`adlo/frontend/dev/previewWorkspaceService/pageMetaService.ts:4-11`（rev3 文件头「语义说明」）与同文件 `:28-31` 的注释自相矛盾；关联 `docs/root-cause-to-close/2026-11/progress-2026-11-12-145603.md:38`
- 描述：rev3 重写后文件头仍未闭环 F4：对齐项漏列双端同构的 get/warmup 退避短路；「域名限速」被挂在「与 Rust get 退避短路同构」从句中（Rust 无域名限速、无爬虫门控对应物），与同文件 :31「预览模式自持（Rust 无对应）…域名限速」正面冲突；句子悬空。行 28-31 注释按派发口径写正确了，但被指派「与之一致」的文件头未改齐。
- 证据：pageMetaService.ts:4-11（rev3 快照新增行）vs :28-31（同文件注释）；Rust 侧无 限速/domain-gate 实现（crates/browser、src-tauri/commands/browser.rs 检索无命中，download_manager.rs:376 为无关恢复限速）；派发词要求与 lines 28-31 一致，实际不一致；progress 文件 :38 回填与代码现状不符（「文件头改为 …TTL/单飞行/域名限速为预览自持」——文件头实际未如此表述）。
- 建议修复：文件头改为「语义说明：双端对齐项 = 失败指数退避（5min×2^n≤2h）+ 墓碑持久化 + get/warmup 退避短路（Rust note_failure/get/warmup 与预览 markFailure/get/warmup 同构）。预览模式自持、Rust 无对应实现的：TTL 7 天 / get 的 TTL 短路 / 单飞行 / 域名限速。占位标题门控 / 失败不删缓存双端一致。合并引擎语义真源仍为 `crates/browser/src/meta_merge.rs` …」，即把域名限速移回自持清单、把 get/warmup 退避短路移入对齐项，与 :28-31 逐项对齐；主代理随后回写进度文件 rev3 回填行。

## 双端一致 / 测试有效性 / 其余专项（rev3 增量范围）

- 双端一致：本轮无 Rust/browser.rs 行为变更；预览侧仅文档注释。双端对齐本体（退避+墓碑+get/warmup 短路）结论承袭 rev2，未被本轮破坏。
- 测试有效性：无新增可执行路径；rev3 未改动测试。F4 为纯注释修复，无回归保护诉求。
- 异步/并发：markFailure 路径未变（同步 + schedulePersist 防抖队列）；未引入新并发写。
- 持久化元数据：schedulePersist JSON 非原子写仍为预存问题（见「记录不修」），本轮未扩大影响面。
- 安全/i18n/能力登记：无新增 IPC、无展示文案、无 capability 变更、无新日志。
- ADR/GLOSSARY：未改动任何 ADR 明文决策；无新领域术语；`meta_merge.rs` 真源表述保留正确。
- claims-ack-rev3（browser.rs:734）：断言与 `backfill_request_meta` 及 L1 用例相符，放行合理。

## 记录不修（无需修复，各一行）

- 【承袭 rev1/rev2 不修项（用户已认可）】请求键别名不带 favicon_data_uri（上报键回填 + get 路径 spawn_favicon_download 兜底自愈）。
- 【承袭】force / get_silent / refresh 绕过退避/缓存（用户显式动作 / 强制刷新，设计取舍）。
- 【承袭】`browser_page_meta_get` 新鲜抓取失败仍 emit 空 meta（RC3 合并守卫保护；短路分支不 emit）。
- 【承袭】预览 fetchedAt 不刷新 / schedulePersist JSON 非原子写（upsertSiteMetaCache read-modify-write 无 rename；预存）。
- 【承袭】note_failure store 写失败仅 warn 仍写内存（尽力持久化，注释已声明；与 report/upsert/clear 刻意不同）。
- 【承袭】别名条目双键并存使同站两条记录（存储翻倍为修复设计内代价；无 ADR/GLOSSARY 冲突）。
- 【观察·交主代理】progress 文件末尾「R2 revN：（下一步）」与重复的「R2 revN：」行、「决策日志：」空壳；P3 实测断言仅为用户机实测、未独立复核；`## [x] 事项 1` 与「已完成」状态现已对持一致，但其下「R2 revN：」空位需主代理在 R2 收敛后回写。
- 【观察】rev3 进度文件 :38 对 F4 修复的文字描述与代码现状不符——归入 F4 证据，随 F4 一并修复后回写，不单列。

## 对用户「不修项理由」的异议

无。rev1/rev2 已认可并由用户确认接受的不修项（别名 data-URI 自愈、force/get_silent/refresh 绕过退避、emit 空 meta 有 RC3 守卫、预览 JSON 非原子写）在 rev3 中未引入新的对立证据，理由依然成立。

## 结论

- 需修复项：1（critical 0 / high 0 / medium 0 / low 1）
  - F4 预览文件头仍未闭环：对齐项漏列 get/warmup 退避短路、域名限速被挂入「与 Rust 同构」从句并与同文件 :31 自相矛盾（纯注释/文档项，行为不受影响）。
- F4：**未修复**（已摘除原「TTL/单飞行列入同构」的错误断言，但派发要求的闭环措辞未达成，且新注释引入同文件注释漂移）。修复成本为文件头若干行改写 + 进度文件 rev2/rev3 回填行订正。
- Rust / browser.rs / test.ts 与 rev2 逐字节一致，rev3 无行为变更、无新引入问题；根因修复方向未被本轮改动破坏。建议进入 rev4 仅做文件头对齐即可收敛。
