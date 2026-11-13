# R1 定向复核报告 — 设置行对齐 + 进度文档（rev3）

## 范围

基线 `e16d96659`，本轮快照 `-rev3`，只读复核（未跑 git / 未跑测试 / 未改源码）。只核 rev2 遗留的 1 项 low 与修复引入的新问题。

- `adlo/frontend/src/styles/components/settings.css`
- `adlo/frontend/src/app/features/harness/sub-components/SourceCard.tsx`
- `adlo/frontend/src/app/features/harness/__tests__/HarnessVersionCard.structure.test.tsx`
- `adlo/frontend/src/styles/workspace-settings.test.ts`
- `docs/root-cause-to-close/2026-11/progress-2026-11-13-193437.md`

上下文实读：`settings.css` L247-259 / L714-716 / L2215-2240、`workspace-settings.test.ts` L304-329、`harness-version.css`（L34-38/L516-543）、`ToolPathsBlock.tsx`、`OpencodeSettings.tsx`、`check-no-cjk-source.mjs`（确认中文注释不在其扫描口径）。

## rev2 问题闭合情况

- **rev2 F1（low，注释把窄档兜底范围说大）→ 已闭合。**
  - 现注释（`settings.css:2226-2231`）逐句核对成立：
    - 「组级 align-items:center（0-2-0，通用/浏览器/DSH 三条）」✓（L2230-2232 三条均为 0-2-0）。
    - 「会压过本档开头的 `.adl-settings-row { align-items: stretch }`（0-1-0）」✓（L2219 为 0-1-0）。
    - 「行级修饰类 `--center` / `--path-center` 自身也是 0-1-0，本档开头的 stretch 在源码上晚于基础修饰类、正常已能覆盖」✓（L257 / L714 均早于 L2219）。
    - 「显式列出以表达意图，并让窄档 stretch 不依赖那一条声明」✓（不再声称免疫源码顺序）——rev2 的夸大点已消除。
    - 「三者同为 0-1-0，故本块仍必须位于 `.adl-settings-row--center` 之后」✓（准确点出残余依赖，且后续句点名 `--center`）。
  - 原「上方后序」的自相矛盾已改为「本档开头的 … 在源码上晚于基础修饰类」，歧义消除。
  - 行为复核：加入 `.adl-settings-row--center`（L2235）到扳回列表仍为**纯无操作**——该块只声明 `align-items`，行在该档原本已由同特异度（0-1-0）更靠前的 L2219 覆盖为 stretch；新条目赋值相同且更靠后。`ToolPathsBlock` 的 `--center` 行同样原本已是 stretch，无跨组副作用；宽档（L257 晚于 L249）仍为 center。
- **「记录不修」中的可选项（`workspace-settings.test.ts` 顺序断言）→ 已采纳，锁的方向正确、无误命中。**
  - 全文件仅一处 `'.adl-settings-row--center {'`（`settings.css:257`），扳回列表那处写作 `--center,`（L2235）→ 带 ` {` 的匹配**不会**误命中；L2231 注释里的同名文本后接「 之后。」也不匹配。`start` 取 `@container settings-content (max-width: 600px)`，该串在 settings.css 唯一（L2218，另有 460/300/320/220 档）→ 断言比较对象正确。
  - 若把基础规则移到 600 档块之后，`indexOf` 结果将大于 `start` → 断言变红，即所声称的「本档必须晚于修饰类定义」被锁住。

## 仍需修复

### F1 [severity: low] [category: 正确性]

- 位置：`adlo/frontend/src/styles/workspace-settings.test.ts:326`
- 描述：新断言在**锚点缺失时真空通过**。`indexOf` 找不到定义会返回 `-1`，而 `-1 < start` 恒真；同时全仓没有任何测试锁 `.adl-settings-row--center { align-items: center }` 这条声明（`Structure` 用例只断类名字符串，`HarnessVersionCard.structure.test.tsx:194`）。因此若该声明被删除或改名，宽档 OpenCode 行会静默回落 flex-start，而本轮新增的「顺序锁」仍为绿，`check:changed` 也拦不住。
- 证据：`workspace-settings.test.ts:326` 直接 `expect(settingsCss.indexOf(...)).toBeLessThan(start)`，无存在性断言；`settings.css:257` 是唯一出现处；`grep 'adl-settings-row--center'` 在 `*.test.ts` 中仅此一处。
- 建议修复：先取索引并断存在，再比较顺序，例如
  ```ts
  const centerRuleAt = settingsCss.indexOf('.adl-settings-row--center {');
  expect(centerRuleAt).toBeGreaterThanOrEqual(0);
  expect(centerRuleAt).toBeLessThan(start);
  ```
  （或复用 `ruleBody(settingsCss, '.adl-settings-row--center')` 断 `not.toBeNull()` 后再比位置）。

### F2 [severity: low] [category: 文档]

- 位置：`docs/root-cause-to-close/2026-11/progress-2026-11-13-193437.md:141`
- 描述：P4 清单末尾仍写「R1 rev2 复审：待派发（rev2 快照 13 files）」，而同文件 L122-130 已详细记录 rev2 复审（2 个并行子代理）的结论与 rev3 前删除性推演；本轮 rev3 也已在跑。同一份进度文件里「待派发」与「已复核并修复」互相矛盾，收尾时会被误读为 rev2 未做。
- 证据：`L122-124`（rev2 设置行：两项闭合 + 新增 1 low 已修）与 `L141`（待派发）并存；`manifest-rev2.md` 亦为 13 files，即该行指的就是已完成的 rev2。
- 建议修复：删掉该行，改为「R1 rev3 定向复核：进行中」，rev3 结束后按既有格式补一行结论。

## 结论

- rev2 的 1 项 low 已按建议修正，注释不再夸大兜底范围、旧歧义已消除；顺序断言锁对了对象且无误命中，显式列入 `--center` 仍为零行为变化（宽档 center / 窄档 stretch 两态不变）。
- 仍需修复项：2（critical 0 / high 0 / medium 0 / low 2）。
