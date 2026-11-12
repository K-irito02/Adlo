# R1 复审报告 — rev4（验证 F4 是否闭环）

## 范围

- 基线：`3f7a4a8ecb71656a38aee09acd878c9dbfb0901b`；5 个文件（manifest-rev4）：
  1. `adlo/crates/browser/src/page_meta_service.rs`（note_failure + 2 单测；rev4 与 rev3 快照逐字节一致，本轮无变化）
  2. `adlo/frontend/dev/previewWorkspaceService/pageMetaService.ts`（rev4 唯一源码变更：文件头「语义说明」重写 + 常量区注释微调）
  3. `adlo/frontend/dev/previewWorkspaceService/pageMetaService.test.ts`（与 rev3 一致）
  4. `adlo/src-tauri/src/commands/browser.rs`（与 rev3 一致）
  5. `docs/root-cause-to-close/2026-11/progress-2026-11-12-145603.md`（rev3 回填行文字与 rev4 代码现状现已对持）
- 核验方式：只读 rev4 快照 diff + 工作区源码现状（pageMetaService.ts:1-40、:274-325、:390-504；browser.rs:280-330、:700-769、:900-1049、:1833-1930；page_meta_service.rs:125-260）逐句比对；未运行 cargo/pnpm（只读约束），测试计数以进度文件所列用户实测为准，未独立复核。claims-ack-rev4（browser.rs:734）唯一一条断言与 `fetch_silent_meta`/`backfill_request_meta` 实现相符（poll 只写上报键；请求键 peek 在重定向站点必 miss），且已标 `[x]`，放行合理。

## 上轮问题关闭情况（逐条）

- **F4（低，文档，预览文件头「缓存策略同构」过度断言 / 自相矛盾）— 已关闭**：
  rev4 文件头（pageMetaService.ts:4-11）改为派发要求的闭环措辞，逐条核对：
  - 对齐项 = 失败指数退避（5min×2^n≤2h）+ 墓碑持久化 + get/warmup 退避短路（:4-5）——「get/warmup 退避短路」已移入对齐项 ✓
  - 预览模式自持（Rust 无对应）= TTL 7 天 / get 的 TTL 短路 / 单飞行 / 域名限速（:6）——「域名限速」已移回自持清单、「get 的 TTL 短路」明确列入 ✓
  - 「占位标题门控 / 失败不删缓存与 Rust 同构」（:7）——不再悬空挂「与 Rust get 退避短路同构」从句 ✓
  - 合并引擎真源仍为 meta_merge.rs 的表述保留正确 ✓
  - 各断言均与代码对应：preview `backedOff`/`warmup`（pageMetaService.ts:408-409、:485）、Rust `browser_page_meta_get` 短路（browser.rs:938）、warmup `silent_fetch_suppressed`（browser.rs:1029）、preview `markFailure→schedulePersist`（:324）、Rust `note_failure→store.upsert` ✓
  - 与行 28-32 常量区注释（:28-31）一致：两侧对齐项集合相同（退避+墓碑+get/warmup 退避短路均双端同构），自持集合无冲突声明（见「记录不修」第 1 条：常量注释 :31 自持清单少列「get 的 TTL 短路」一项，属子集罗列，不构成矛盾）✓
  - 正面矛盾已消除：同一文件再无任何处把域名限速/TTL/单飞行宣称为双端同构 ✓
  - 关联项 `progress-2026-11-12-145603.md` :40 的 rev3 回填文字（「对齐项 = 退避+墓碑持久化+get/warmup 退避短路；TTL/单飞行/域名限速预览自持」）与 rev4 磁盘现状逐字相符，§5-4「文档与报告一致性」满足 ✓

## 新增发现

本轮无需修复的新增发现。rev4 除文件头注释外无任何源码变更，不引入新行为路径；异步/并发/持久化/安全/i18n/能力登记各专项无变化（预览 JSON 非原子写仍为预存且不修项；Rust `note_failure` 在已有成功条目上刷新 `fetched_at` 的行为：当前无任何消费者以 `fetched_at` 做决策（Rust 侧无 TTL 判定，preview 用 `lastOkAt`），本轮未改动，不构成回归）。

## 双端一致 / 测试有效性 / 其余专项

- 双端一致：rev4 无双端行为变更；注释描述的双端语义（退避+墓碑+get/warmup 短路对齐、TTL/单飞行/域名限速预览自持）与两侧代码现状一致。
- 测试有效性：rev4 无新测试用例、无源码路径变更；rev3 所列回归用例（`note_failure_*`、`silent_*`、`backfill_*`、前端 tombstone 测试）的有效性结论沿用，且断言均经公共入口进入、可证否。
- 异步/并发：`markFailure` 路径未变（同步 + 500ms 防抖持久化队列）；未引入新并发写。Rust `note_failure` 全程持 memory 锁写 store，与 report/upsert/clear 串行化，未变。
- 持久化元数据：`schedulePersist` JSON read-modify-write 非原子仍为预存问题（承袭，见「记录不修」），本轮未扩大影响面。
- 安全/i18n/能力登记/ADR/GLOSSARY：无新 IPC、无展示文案、无 capability 变更、无新日志、未改动任何 ADR 明文决策、无新领域术语。

## 记录不修（无需修复，各一行）

- 【观察】常量区注释 :31「预览模式自持（Rust 无对应）：TTL 7 天、单飞行、域名限速」未列入「get 的 TTL 短路」（文件头 :6 已列）；两侧对齐项完全一致且 :31 无任何把它归为同构的断言，属子集罗列，不构成矛盾。若主代理希望两处枚举逐项对齐，加一行「get 的 TTL 短路」即可；不作为需修复项。
- 【承袭 rev1–rev3 不修项（用户已认可）】请求键别名不带 `favicon_data_uri`（上报键回填 + get 路径 `spawn_favicon_download(请求键)` 兜底自愈）。
- 【承袭】force / get_silent / refresh 绕过退避/缓存（用户显式动作 / 强制刷新，设计取舍）。
- 【承袭】`browser_page_meta_get` 新鲜抓取失败仍 emit 空 meta（RC3 合并守卫保护；退避短路分支不 emit）。
- 【承袭】预览 fetchedAt 不刷新 / `schedulePersist` JSON 非原子写（upsertSiteMetaCache read-modify-write 无 rename；预存）。
- 【承袭】`note_failure` store 写失败仅 warn 仍写内存（尽力持久化，注释已声明；与 report/upsert/clear 刻意不同）。
- 【承袭】别名条目双键并存使同站两条记录（存储翻倍为修复设计内代价；无 ADR/GLOSSARY 冲突）。
- 【观察·交主代理】progress 文件末尾仍有重复的「R2 revN：」行与空壳「决策日志：」；P3 实测断言为用户机实测、未独立复核；progress 尚无 rev4 轮次回填行（按派发由主代理在验收后回写）。
- 【观察】pageMetaService.ts:20 门控注释写「走失败退避（mark_failure）」，与 preview 函数名 `markFailure`、Rust 函数名 `note_failure` 均不精确匹配；属预存注释小瑕疵、未随 rev4 引入，不在本轮范围。

## 对用户「不修项理由」的异议

无。rev1/rev2/rev3 已认可并由用户确认接受的不修项在 rev4 中无新的对立证据，理由依然成立。

## 结论

- 需修复项：**0**（critical 0 / high 0 / medium 0 / low 0）
- F4：**已修复**。文件头现为「双端对齐项 = 失败指数退避 + 墓碑持久化 + get/warmup 退避短路；预览自持（Rust 无对应）：TTL 7 天 / get 的 TTL 短路 / 单飞行 / 域名限速；占位标题门控 / 失败不删缓存与 Rust 同构」，与同文件常量区注释（:28-31）不冲突、与行为代码逐项相符；进度文件 rev3 回填行与磁盘现状对持。
- Rust / browser.rs / test.ts 与 rev3 逐字节一致，rev4 无行为变更、无新引入问题；根因修复方向未被本轮改动破坏。本轮零需修复项，可收敛。
