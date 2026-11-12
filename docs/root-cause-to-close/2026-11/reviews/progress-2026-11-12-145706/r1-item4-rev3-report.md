# R1 复审报告 — 事项 4（DSH 官网链接重复打开两个标签页）· rev3

- 快照：`.review-diffs/adlo_crates_browser_src_init_script.js-rev3.diff`、`.review-diffs/adlo_frontend_src_app_features_browser_initScriptNavigation.test.ts-rev3.diff`（manifest-rev3，base `3f7a4a8`）
- 审查方式：只读快照 + 工作区源码（未跑 git、未改源码/配置）；用 `%TEMP%\opencode\adl-item4-rev3-probe.js`（jsdom，原样脚本 vs 删掉 `.trim()` 的变异脚本）实测发送值
- 实跑用例：`pnpm --dir adlo/frontend run test -- initScriptNavigation.test.ts` → `Test Files 1 passed (1)` / `Tests 40 passed (40)`

## 范围

- `adlo/crates/browser/src/init_script.js`
  - rev2 → rev3 的实际增量（逐行比对 rev2/rev3 快照）：`__adlFindAgentFileLinkMatch` 返回值 `url: value` → `url: value.trim()`（`init_script.js:144`）；`attributes` 取值由 `rule.attributes && rule.attributes.length ? ... : ['title']` 改为 `Array.isArray(rule.attributes) ? rule.attributes : ['title']` + `if (!attrs.length) continue;`（`:132-133`，事项 3 修复）。
  - 未变部分：`isFileLikeHref`（`:55-61`）、`isAbsoluteLocalPath`（`:66-72`）、`__adlRuleValueMatches`（`:106-119`）、`<a>` 两条 agent-link 分支（`:388-392`、`:407-410`）、规则分支调用点（`:438-443`）。
- `adlo/frontend/src/app/features/browser/initScriptNavigation.test.ts`
  - rev3 新增的 5 条规则链路用例（`:412` regex、`:429` disabledRuleIds、`:450` siteRules、`:475` 非法属性名、`:491` 空属性列表）与 `beforeEach` 清理 `__adlAgentRules` / `__adlAgentOverridesByOrigin`（`:265-270`）。
- 只评事项 4 的事件序 / 抑制语义 / 发送值规范化 / 用例有效性；事项 3a 的规则设计仅在相互作用时提及。

## 上轮问题关闭情况

### F1 [rev2 low] 属性值 `trim` 只用于判定、发送未 trim 值（JS 放行、Rust 拒绝的静默死点击）→ **已关闭**

- 代码：`init_script.js:144` 现为 `return { kind: rule.action || 'file', url: value.trim(), ruleId: rule.id };`。判定侧 `isAbsoluteLocalPath` 本就对 `v = value.trim()` 判定（`:68`），两侧口径已一致。
- 实测（`%TEMP%\opencode\adl-item4-rev3-probe.js`，原样脚本注入 jsdom，真实 DOM click 走委托监听器，读 `chrome.webview.postMessage` 实际载荷）：

  | 属性输入 | `defaultPrevented` | 实际发送 `url` |
  | --- | --- | --- |
  | `title='  E:\Test-Workspace-1\current-time.md  '` | true | `E:\Test-Workspace-1\current-time.md` |
  | `data-url=' file:///C:/ws/a.md '` | true | `file:///C:/ws/a.md` |
  | `title=' \\server\share\a.md '` | true | `\\server\share\a.md` |
  | `title='   '`（纯空白） | false | 无 agent-link |
  | `data-src='/assets/hero.png'` | false | 无 agent-link |

- 与 Rust 闸门口径对齐：rev2 已用 `rustc` 复算 `webview2_postmessage.rs::is_file_like_path`（`"E:\..."` / `"file:///C:/ws/a.md"` / `"\\server\share\a.md"` 均 true；带首尾空白均 false）。trim 后的三种形态全部落在 Rust 放行集内，rev2 描述的「点击被吞掉且无任何动作」路径不再可达。
- 无回归到 `<a>` / file 匹配：
  - `isFileLikeHref` 与两条 `<a>` 分支逐字未变（rev2→rev3 仅新增 `url: value.trim()` 与空属性列表处理）；`<a href>` 走浏览器解析后的绝对 URL，不经 `isAbsoluteLocalPath`，trim 改动对其不可达。
  - `intercepts a file:// link on a whitelisted agent host as kind=file`（`:378`）与 url 分支用例仍绿（40/40）。
  - 站点相对 `/assets/...` 仍不命中（上表第 5 行，`defaultPrevented=false`），说明 rev1 F2 的收紧未被 trim 改动放松。

## 新增发现

### F1 [severity: medium] [category: 正确性] trim 修复没有任何回归用例：删掉该修复后 40 条用例仍全绿

- 位置：`adlo/crates/browser/src/init_script.js:144`；缺失用例应在 `adlo/frontend/src/app/features/browser/initScriptNavigation.test.ts:240` 起的 `init_script.js agent-link interception` describe 内。
- 描述：rev2 F1 的修复只改了一行实现，未补用例（rev2 报告已明确建议「同一 describe 内补一条 `title: '  E:\\ws\\a.md  '` 的用例，断言发出的 `url` 无首尾空白」）。按审查简报 §5.1「删掉该修复，测试会变红吗？」与 `mandatory-testing.md`「回归修复：以修复前的代码/数据形态作输入，先在修复前跑一次确认会红」，该修复目前零保护——任何人把 `value.trim()` 改回 `value`，测试套件仍 40/40 绿，rev2 的静默死点击会原样复发。
- 证据：
  - 该 describe 内 9 处 `clickButtonWithAttrs(...)` 输入（`:351` `/assets/hero.png`、`:358-361` 盘符 title、`:373` `Something else`、`:425` / `:445` / `:487` / `:503` `E:\ws\a.md`、`:471` `D:\ws\b.md`）**没有任何一个带首尾空白**；`setAgentRules` 的 regex 用例输入同样无空白。→ 无输入能区分 trim 与不 trim。
  - 变异实测（同一探针，把 `url: value.trim()` 换成 `url: value`）：带空白的三类输入重新发出 `'  E:\...  '` / `' file:///C:/ws/a.md '` / `' \\server\share\a.md '`（`sentHasEdgeWhitespace: true`），而现有用例断言的值全为无空白形态，故不会变红。
- 建议修复：在既有 describe 内补 1–2 条用例（走公共入口 `clickButtonWithAttrs`）：
  1. `title: '  E:\\ws\\a.md  '` → `agentLinks()` 恰为 `[{ type:'adl-agent-link', kind:'file', url:'E:\\ws\\a.md' }]`，并断言 `event.defaultPrevented === true`（同时锁「命中」与「发送值已规范化」）；
  2. 可选 `data-url: ' file:///C:/ws/a.md '` → 发送 `file:///C:/ws/a.md`（覆盖 `file://` 形态的同一口径）。
  补完后本地做一次变异自检：删掉 `.trim()` 应使新用例变红。

### F2 [severity: low] [category: 文档] 进度文件记录的事项 4 测试计数与实际不符（34 vs 40）

- 位置：`docs/root-cause-to-close/2026-11/progress-2026-11-12-145706.md:60`（事项 4「`initScriptNavigation.test.ts` 34 passed」）；同文件 `:47`（事项 3 同一命令的 `Tests 34 passed (34)`）同样滞后。
- 描述：该文件是需求/验收真源，且事项 4 的验证证据只有这一行计数。实际运行结果为 `Tests 40 passed (40)`（rev2 时已是 35）。rev2 报告把此项列入「记录不修」并建议 P6 归档时改用最新数字，但该理由**未被转写进进度文件的「记录不修」清单**（`:123` 未列此项），按简报 §7「不修理由必须由主代理转写进进度文件」当前不构成有效的不修记录；且数字偏差随轮次继续扩大（34 → 35 → 40）。
- 证据：`pnpm --dir adlo/frontend run test -- initScriptNavigation.test.ts` 输出汇总行 `Tests  40 passed (40)`；源码内 `it(` 计数同为 40（另有 4 个 `describe(`），与实跑一致。
- 建议修复：把 `:47`、`:60` 的计数改为 40（或改写为「40 passed，含 rev1–rev3 新增用例」），并在 P4 记录中注明该行已按最新实跑更新。

## 记录不修

- **regex preset 的 trim 不对称**：`value.trim()` 只作用于发送值，匹配仍用原始值（`:111`）；因此带首尾空白的同一路径在 `fileLike` 规则下命中、在用户自写 `^E:` 正则下不命中。用户自写正则按原始字符串语义判定是合理预期，且发送侧 trim 后与 Rust 闸门一致，不改。
- **残余重复路径（rev1 F4，未变）**：页面把 `window.open` 放在 `window` 捕获阶段、`pointerdown`/`mousedown` 或 `setTimeout` 内调用时，`stopImmediatePropagation` 管不到，`window.open` 重写仍会发第二条 agent-link；用户已复测确认观测到的症状消失，本轮不动。
- **抑制范围大于去重本身（rev1 F3，未变）**：agent 站点上被拦截链接的页面点击处理器（埋点、关弹层）一律不再执行，属既定机制。
- **规则匹配 O(d²)（rev1 F6，未变）**：外层 `while` 每个祖先都调用 `__adlFindAgentFileLinkMatch`，内部再向上遍历且每次重算规则数组 / 重编译正则；属事项 3a 代码，不影响事项 4 正确性。
- **三份默认规则逐字重复（rev2，未变）**：JS `:77-85` / TS `shared/agentSiteRules.ts` / Rust `kernel/src/config.rs` 无同步断言；漂移风险低。
- **`agentRuleMatch.ruleId` 无消费方**（`:144`）：可选删除或用于诊断日志。
- **用例仍带第三方类名（rev1 F8，未变）**：`:356-369` 传 `class: '_fileMention_... _fileLink_...'`，而实现明确不依赖类名；纯风格。

## 结论

- 上轮 low 已实质关闭：发送值改为 `value.trim()`，与 Rust `is_file_like_path` 闸门口径一致，实测三类带空白路径均发送规范化值且点击不再被静默吞掉；`<a href>` / `file://` / 站点相对路径匹配均无回归（40/40 绿，站点相对仍不命中）。
- 新增 1 条 medium：该修复零回归用例（删掉 `.trim()` 后 40 条用例全绿），需补公共入口用例并做变异自检。
- 新增 1 条 low：进度文件事项 4 的测试计数仍为 34，实际 40。
- 需修复项：2（critical 0 / high 0 / medium 1 / low 1）
