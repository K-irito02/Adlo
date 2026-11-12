# R2 定向复核 — rev6（清理 4 项）

## 范围

- 仓库：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-2`
- 快照：`.review-diffs/manifest-rev6.md`（base `3f7a4a8`，6 commits，90 files）；只读 rev6 快照 + 工作区源码。
- 复核对象（仅 4 项 R2 修复）：
  1. `useBrowserPageMeta.ts` 广播与原生 meta 共用 `applyTitleToTabs`
  2. `openByMethod.ts` 删除 `OpenFileOutcome` 导出 / `toFileUrl` 注释与兜底一致 / `!rel` 守卫注释
  3. `shared/agentSiteRules.ts` 删除无消费方的 `overrideForOrigin`
  4. `init_script.js` 删除内置规则副本，改由 `window.__adlAgentRules` 单一注入，测试显式注入默认规则
- 约束：未运行 `git`，未修改任何源码/配置；只读静态复核（未执行测试命令，以源码 + 既有用例静态核对）。

## 上轮问题关闭情况

### 1. `useBrowserPageMeta.ts` 共用 `applyTitleToTabs` — 已关闭

- 共用已落地：`applyTitleToTabs`（`adlo/frontend/src/app/features/browser/useBrowserPageMeta.ts:73-90`）被 `applyMetaBroadcast`（`:105`）与 `handlePageMeta`（`:137-145`）同时调用；函数为模块私有，未新增导出面。
- 无行为漂移，逐行等价：
  - 广播路径旧循环为 `applyBroadcastTitle(tab, cleanUrl, p.title, p.source, titleSourceRef.get(tab.id))` → `browserUpdateTab` → `titleSourceRef.set(tab.id, p.source)`；新函数 `:84-88` 序列完全相同（参数名 `title/source`）。
  - 原生 meta 路径旧循环（rev6 diff 第 102-145 行）与 `handlePageMeta` 现在的 `applyTitleToTabs(filter(...), cleanUrl, meta.title, effectiveSource)`（`:138-145`）等价，门控仍用 `effectiveSource`。
  - 时序：两处调用前均已 `applyBroadcastUpdate` + `getState`，`applyTitleToTabs` 内再次 `getState` 仍在同一同步栈，读到的 store 快照一致（无 await）。
  - 订阅语义：原 `useCallback([])` + `useEffect(..., [applyBroadcast])` 与新 `useEffect(..., [])` + 模块级 `applyMetaBroadcast` 等价（`useBrowserPageMeta.ts:181-184`）。
- 测试有效性：本次为纯重构，回退共用不会改变可观测行为，无「删修复即变红」的用例属正常；现有用例覆盖两条路径（广播历史标题 `__tests__/useBrowserPageMeta.test.ts:43-61`，原生 meta `:94-132`）。
- 备注：`useBrowserPageMeta()` 的返回值目前仅测试使用（生产由 `useGlobalBrowserMeta`/`useBrowserPanelMetaWiring` 直接 import 模块函数），属可选清理，见「记录不修」。

### 2. `openByMethod.ts`（`OpenFileOutcome` / `toFileUrl` 注释 / `!rel` 守卫） — 已关闭

- `OpenFileOutcome` 已彻底移除：全仓 `grep OpenFileOutcome` 0 命中（仅进度文件历史描述），无 import/类型引用残留；`openFileByMethod` 现为 `void`（`adlo/frontend/src/app/features/preview/openByMethod.ts:230`），10 处调用方均未使用返回值。
- `toFileUrl` 注释与兜底一致：`openByMethod.ts:97-103` 的注释为「调用方只会在已识别为本地路径时调用；极端非法输入回退正斜杠原串」，实现为 `toLocalFileUrl(absPath) ?? toForwardSlashes(absPath)`（`:102`）。`toLocalFileUrl`（`adlo/frontend/src/shared/localFilePath.ts:57-94`）对非本地输入（`:59-61`）、非法 `file://`（`:65-67`）、无 share 的 UNC（`:74-76`）、`..` 上溢（`:79-81`）、非盘符（`:86-88`）均返回 `null`，注释与代码逐句相符。
- `toFileUrl` 复用有行为级用例兜底：`__tests__/openByMethod.test.ts:88-96` 断言盘符 → `file:///C:/ws/src/a.md`、UNC → `file://server/share/x.md`（实现若退回裸路径即变红）。
- `!rel` 守卫已注释为类型守卫：`openByMethod.ts:248-253`，注释「类型守卫：target 的选取已保证包含关系，正常不可达。」与 `claims-ack-rev6.md:5` 的 `[x]` 一致。
  - 核对选取逻辑：`target = explicit && explicitRel !== null ? explicit : owner`（`:242`）；`explicitRel` 与随后 `rel` 用同一 `workspaceRelative` 计算，`owner` 已被 `isWithinRoot` 过滤（`:164`），故对文件路径该分支不可达，注释成立。
  - 边界（预存，非本轮 R2 引入）：当 `absPath` 与工作区根完全相等时 `workspaceRelative` 返回 `''`（falsy）会进入该分支；`openFileByMethod` 语义为「文件」，正常调用不触发，见「记录不修」。

### 3. `shared/agentSiteRules.ts` 删除 `overrideForOrigin` — 已关闭

- 全仓 `grep overrideForOrigin` 0 命中，无 import/注释残留；`adlo/frontend/src/shared/agentSiteRules.ts` 现有导出中，`defaultAgentSiteRules` / `normalizeAgentSiteRules` / `normalizeAgentSiteOverrides` 由设置 UI / merger 实际消费（`AgentSiteRulesControl.tsx:317,321,350,416`、`preferencesMerger.ts:107-120`、`settingsViewModel.ts:267`）；三个 `DEFAULT_*` / `BUILTIN_*` 常量仅文件内使用（可选收紧，见「记录不修」）。
- 删除未使调用方失去必要能力：站点覆盖查找在 UI 内联实现（`AgentSiteRulesControl.tsx:360,372,397`），不依赖被删函数。
- 测试：删除项无行为，无回归用例需求；现有归一化用例（`settingsViewModel.test.ts:382-425`）保持覆盖。

### 4. `init_script.js` 删除内置规则副本 — 已关闭

- JS 侧已无副本：`adlo/crates/browser/src/init_script.js:74-77` 明确「Keep no JS-side copy」；`__adlGetActiveAgentRules`（`:79-96`）只从 `window.__adlAgentRules`（`:80-81`）取全局规则，并与 `window.__adlAgentOverridesByOrigin` 的站点规则合并；`grep 'data-path|data-file-path|aria-label|builtin-file-like-attribute'` 在 `init_script.js` 0 命中（无默认规则字面量）。
- 生产注入链完整，删除后不会出现「无规则」回退：
  - 创建：`browser_webview_setup.rs:234-240` → `browser_navigation.rs:36-53` 在脚本前注入 `window.__adlAgentRules`；
  - 运行期刷新：`browser_webview.rs:306-321` 重新赋值同一组全局；
  - 默认规则由 Rust 物化：`crates/kernel/src/config.rs:246-266`（`default_agent_site_rules`）。
- 测试已显式注入默认规则：`adlo/frontend/src/app/features/browser/initScriptNavigation.test.ts:242-259`（`DEFAULT_TEST_RULES`）+ `:283-288` `beforeEach` 赋给 `window.__adlAgentRules`；命中/不命中、regex、站点覆盖、开关关闭等用例均基于该注入运行。
- 说明：测试 fixture 是默认规则的第三份手写副本（Rust / TS / 测试各一份），且无静态断言阻止 JS 副本回潮；属可选加固，见「记录不修」。

## 新增发现

### F1 [severity: low] [category: 文档] `init_script.js` 注释的「single source of truth」无法由代码证明

- 位置：`adlo/crates/browser/src/init_script.js:74-77`
- 描述：注释写「the built-in defaults live in Rust/TS so there is a single source of truth」。实际默认规则同时硬编码在 Rust 与 TS 两处（另有测试第三份副本），不存在单一真源；该绝对断言违反简报 §5.8「注释绝对断言必须可由代码/测试证明」。
- 证据：
  - Rust：`adlo/crates/kernel/src/config.rs:246-266` 硬编码 id / selector / 7 个属性 / `FileLike` / `File`；
  - TS：`adlo/frontend/src/shared/agentSiteRules.ts:18-36` 硬编码同一组默认值；
  - 测试：`initScriptNavigation.test.ts:242-259` 再写一份；
  - 同一文件 `init_script.js:145-147` 对跨栈复制使用的是「Keep in sync with …」表述，可见本仓惯例并非「single source」。
- 建议修复：降级为可证措辞，例如「Keep no JS-side copy: at runtime the JS reads only the injected `window.__adlAgentRules`; defaults are materialized by the Rust config and mirrored in TS for the settings UI.」或在两处默认值旁标注 `Keep in sync`。

### F2 [severity: low] [category: 文档] 进度文件 R2 记录与代码不一致（`!rel` 注释）

- 位置：`docs/root-cause-to-close/2026-11/progress-2026-11-12-145706.md:136-137`
- 描述：代码已为 `!rel` 守卫补上类型守卫注释（`openByMethod.ts:249-250`），但进度文件「已修复」清单未包含该项，「记录不修」仍把它列为未修改项；读者会误以为该守卫既无行为修改也无注释说明。属简报 §5.4「文档与报告一致性」。
- 证据：`openByMethod.ts:248-253` 含新增注释；进度 `:136` 的 4 项已修复不含守卫注释；进度 `:137` 仍写「记录不修：… `!rel` 类型守卫（…正常不可达）」。
- 建议修复：把该项移入「已修复」（如「为 `!rel` 守卫补类型守卫注释，行为未改」），或在「记录不修」该条后补「（已在代码中注释说明）」。

## 记录不修（可选 / 范围外）

- `openByMethod.ts:169` 存在孤立 JSDoc「按「文件」设置打开一个本地绝对路径。」（其后空行再接 `notifyOutsideWorkspace` 的注释），使该文案实际贴近 `notifyOutsideWorkspace`、而 `openFileByMethod` 失去文档。该行由 3a 助手插入（rev6 新增行），非本次 4 项 R2 修复引入，未计入需修复；建议下一轮文档清理时前移到 `openFileByMethod`（`:230`）。
- `useBrowserPageMeta.ts:98` `applyMetaBroadcast` 为导出函数但仅本文件 hook 使用；可降级为模块内函数（纯风格，可选）。
- `agentSiteRules.ts:3-5` 三个导出常量（`BUILTIN_AGENT_SITE_RULE_ID` / `DEFAULT_AGENT_SITE_MATCH_SELECTOR` / `DEFAULT_AGENT_SITE_ATTRIBUTES`）无外部消费方（仅文件内使用）；如需收紧模块 API 可去掉 `export`（可选）。
- `initScriptNavigation.test.ts:242-259` 的 `DEFAULT_TEST_RULES` 是默认规则第三份副本；可改为由 `defaultAgentSiteRules()` 派生，并加一条静态断言（如 `expect(initScript).not.toContain('builtin-file-like-attribute')`）防止 JS 副本回潮。属可选加固，不计需修复。
- `openByMethod.ts:248-253` 当 `absPath` 与工作区根完全相等时 `workspaceRelative` 返回 `''`，会进入该分支并登记父目录（3a 预存边界，非 R2 引入）；`openFileByMethod` 面向文件，正常不触发，仅记录。

## 诊断日志核验

- `grep '\[DBG-'` 全仓命中仅：`adlo/scripts/check-source-hygiene.mjs:99`（卫生检查器自身规则模式，带 `hygiene-allow`）、`.agents/.opencode/.trae` 技能说明与 `docs/root-cause-to-close/` 历史记录。
- `adlo/**` 业务源码（含本次 4 个文件）零残留，无未清理诊断埋点。

## 结论

- 需修复项：2（critical 0 / high 0 / medium 0 / low 2）
