# R2 rev8 定向复核 — scope B（rev7 F1：持久化用例空断言）

## 范围

只读 `.review-diffs/manifest-rev8.md` 指定的 rev8 快照（base `b96a574`，`commits: 0`），未跑 `git diff/log/show`。

- 本轮实际改动只有一处：`adlo/frontend/src/app/stores/slices/__tests__/browserPanelPersistence.test.ts`。
- 抽样核对 rev8 与 rev7 的 `index` 头（Git blob 哈希）确认同范围内其余文件未变：`SearchEnginePopover.tsx`（`216dd6a32..54821089f`）、`browserSearchEnginesSlice.ts`（`4e99a0021..14f6621bc`）、`persisted/registry.ts`（`7e46f9c97..f60e411b5`）——与 rev7 快照完全一致。因此本轮只复核该测试文件的改动及其对既有迁移断言的影响。
- 只读上下文：`browserPanelPersistence.test.ts` 全文、`persisted/registry.ts:835-842`、`persisted/__tests__/keepListGuard.test.ts`、`persisted/__tests__/keyNamespace.test.ts`。
- 未启动 dev server / 浏览器 / headless Chrome（无端口、无后台进程）；未运行测试套件（用读用例 + 删除性推演判定）；未改源码。

## 上轮问题关闭情况

- **rev7 F1（`adl:browser.searchEngineAutoSelected` 行编造 `legacyKey`，导致「旧键未写入」断言恒真）：已关闭。** 三条逐项确认：
  1. **不再有恒真断言**：`Case.legacyKey` 改为可选（`:246-252`），新键行 `:346-353` 已不带 `legacyKey`；共用断言改为 `if (legacyKey) { expect(localStorage.getItem(legacyKey), …).toBeNull(); }`（`:363-365`）。缺省时整条断言不执行，不再存在「查一个永不被写入的键」这一恒真检查，也不再暗示该键有历史前身。
  2. **其他迁移键的旧键断言仍然有效**：其余 15 行全部保留真实旧命名键（`adl-ui:browser-tabs`、`adl-ui:browser-active-tab`、`adl-ui:browser-tab-folders`、`adl-ui:browser-tab-tree-expanded`、`adl-ui:browser-history`、`adl-ui:browser-bookmarks`、`adl-ui:browser-workspace-bookmarks`、`adl-ui:browser-shortcuts`、`adl-ui:browser-local-ports`、`adl-ui:browser-bg-config`、`adl-ui:browser-configured-ports`、`adl-ui:browser-navigator-width`、`adl-ui:browser-navigate-in-place`、`adl:browser:searchEngines`、`adl:browser:defaultSearchEngineId`，`:254-345`），全部为非空字符串，`if (legacyKey)` 对它们恒成立 → 断言照旧执行。删除性推演：任一迁移面若重新写旧键（如 `adl:browser.tabs` 改回写 `adl-ui:browser-tabs`），对应行在 `:364` 变红；该回归保护未被削弱。
  3. **未引入新问题**：
     - 类型层面，`cases: Case[]`（`:254`）显式标注后，漏填/拼错字段仍会编译报错（多余属性检查），不存在「字段名写错 → 静默跳过」的路径。
     - `legacyKey` 为可选不影响 `it.each` 标题插值（`$key` / `$field`，`:356`）。
     - 持久化本体断言未变：`:361-362` 仍校验新键被写入，`:371` 仍用写入值（而非 fallback）校验水合，新键行的回归价值来自这两行。
     - 新键行 `act` 经公共入口（`initializeSearchEngines` + `setDefaultSearchEngine`）触发，未绕过 store 写私有字段。

## 新增发现

无。

## 记录不修

- `legacyKey` 可选后，若将来新增的**已迁移**键行漏填旧键，本套件不会报错（只是少一条断言）；如需更强的门禁，可在 `Case` 增加 `migrated: true` 与 `legacyKey` 的互斥校验。纯测试表达层、无行为影响，不进入主表。

## 结论

- 需修复项：0（本轮零问题）
