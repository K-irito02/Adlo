# R1 定向复核报告 — 设置行对齐 + 进度文档（rev4）

## 范围

基线 `e16d96659`，本轮快照 `-rev4`，只读复核（未跑 git / 未跑测试 / 未改源码）。只核 rev3 遗留的 2 项 low 及修复引入的新问题。

- `adlo/frontend/src/styles/components/settings.css`
- `adlo/frontend/src/styles/workspace-settings.test.ts`
- `adlo/frontend/src/app/features/harness/sub-components/SourceCard.tsx`
- `adlo/frontend/src/app/features/harness/__tests__/HarnessVersionCard.structure.test.tsx`
- `docs/root-cause-to-close/2026-11/progress-2026-11-13-193437.md`

相关上下文实读：`settings.css` L247-259 / L2215-2240、`workspace-settings.test.ts` L304-331、`harness-version.css`、`ToolPathsBlock.tsx`、`check-no-cjk-source.mjs`。

## rev3 问题闭合情况

- **rev3 F1（low，顺序断言真空通过）→ 已闭合。**
  - `workspace-settings.test.ts:326-328` 现为三行：先取索引 → `toBeGreaterThanOrEqual(0)` → `toBeLessThan(start)`。锚点字符串缺失时 `indexOf` 返回 `-1`，第一条断言即失败，**真空通道已堵住**；本轮声明的改名删除性验证（`expected -1 to be greater than or equal to 0`）与该代码路径一致。此前全仓无其它测试锁 `.adl-settings-row--center { align-items: center }` 的存在，现在至少被这条断言兜住。
  - **锚点误命中复核（逐处枚举）**：`settings.css` 中 `.adl-settings-row--center` 仅 3 处 —— L257 规则定义（带 ` {`，即目标）、L2231 注释内引用（后接「 之后。」，不匹配）、L2235 扳回列表条目（写作 `--center,`，**不匹配**）。`settingsCss` 只含本文件，不会跨文件命中。`start` 取的 `@container settings-content (max-width: 600px)` 在文件内唯一（L2218；其余为 220/300/320/460 档）→ 比较基准正确。
  - 顺序锁语义仍成立：基础定义被移到 600 档块之后时索引 > `start` → 变红。锁的范围是「首个定义 vs 本档起点」（不拦“日后在同一文件再写一条 `--center {` 覆盖”），属该断言声明意图之内，可接受。
- **rev3 F2（low，进度文档「rev2 复审待派发」自相矛盾）→ 已闭合。**
  - 旧行已删除，替换为 L136-140「R1 rev3 定向复核：设置行 1 项 low … 开屏 1 项 low …」。全文再 grep「待派发」无命中；P4 段与 L116-124 的 rev1/rev2 结论不再冲突。

## 仍需修复

### F1 [severity: low] [category: 文档]

- 位置：`docs/root-cause-to-close/2026-11/progress-2026-11-13-193437.md:136`
- 描述：新增的 rev3 记录把设置行范围写成「**1 项** low（顺序断言真空通过）」，但 `r1-align-rev3-report.md` 的结论是 **2 项 low**：① 顺序断言真空通过（代码侧）；② 同文件 P4 段旧行「R1 rev2 复审：待派发」与上文 rev2 已完成的结论矛盾（文档侧，本轮正是靠改写这一段关闭的）。该文件前两轮记录用的是准确计数（L116「设置行范围 2 项」、L123「新增 1 low」），唯独 rev3 少了 1 项，与报告逐条对不上，也不易看出第二条问题是怎么闭合的。
- 证据：`r1-align-rev3-report.md`「结论」→「需修复项：2（… low 2）」；本文档 L136 写「1 项 low」。
- 建议修复：改为「设置行 2 项 low（① 顺序断言真空通过 → 先判 `>=0` + 改名删除性验证变红；② P4 段旧行『rev2 复审待派发』与上文结论矛盾 → 已改为本段 rev3 结论）」。

## 结论

- 顺序断言的真空通道与锚点误命中两问均已排除；文档矛盾行已消除，`settings.css` 注释/SourceCard/结构测试与 rev3 一致，无新问题。
- 仍需修复项：1（critical 0 / high 0 / medium 0 / low 1）。
