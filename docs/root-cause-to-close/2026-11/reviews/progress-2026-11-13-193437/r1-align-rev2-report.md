# R1 复审报告 — 设置行对齐 + 进度文档（rev2）

## 范围

基线 `e16d96659`，本轮快照 `-rev2`，只读复审（未跑 git/未跑测试/未改源码），完整重查而非只看增量。

- `adlo/frontend/src/app/features/harness/sub-components/SourceCard.tsx`
- `adlo/frontend/src/app/features/harness/__tests__/HarnessVersionCard.structure.test.tsx`
- `adlo/frontend/src/styles/components/settings.css`（本轮新纳入范围）
- `docs/root-cause-to-close/2026-11/progress-2026-11-13-193437.md`

上下文实读：`settings.css` L247-259 / L714-716 / L1776-1789 / L2215-2241、`regions/harness-version.css` L34-38/L516-543/L607-619、`HarnessVersionCard.tsx`、`DshSettings.tsx`、`OpencodeSettings.tsx`、`OpencodeSourceSummaryCard.tsx`、`ToolPathsBlock.tsx`、`styles/workspace-settings.test.ts`、`styles/harness-version.test.ts`、`docs/design-system/README.md`（设置面板行律）、`docs/knowledge-base/interaction/settings-panel-narrow-layout-and-dot-scrollbar-2026-09-27.md`、`frontend/scripts/check-no-cjk-source.mjs`（确认新增中文注释不在其扫描口径内：只扫 .ts/.tsx 且注释被抹除）。

## rev1 各项闭合情况

- **F1（low，`--center` 契约注释过期）→ 已关闭。**
  - `settings.css:256` 已改为「右侧为单个控件（按钮 / 开关 / 下拉）的行」，与 `SourceCard.tsx:58-66` 控件列只放一个 `SettingsSelect` 的事实相符（刷新按钮在 label 侧，不算控件列）。
  - `SourceCard.tsx:43-44` 与 `structure.test.tsx:192-194` 统一为「与 DSH 组对齐」；**不再暗示 DSH 依赖该修饰类**（DSH 由 L1787 组级规则居中，本行对 DSH 冗余、对 OpenCode 是唯一来源，注释表述与之一致）。窄档「由堆叠规则覆盖回 stretch」与 L2219/L2233 事实一致。
- **F2（low，特异度注释失真 + 冗余选择器）→ 已关闭（行为零变化，注释基本准确；仅剩一处措辞夸大，见新 F1）。**
  - 核对「显式列入 `--center` 是否真的无行为变化」：该块只声明 `align-items`，`.adl-settings-row--center` 在窄档原本就被同特异度（0-1-0）且更靠前的 L2219 `.adl-settings-row { align-items: stretch }` 覆盖成 stretch；新增选择器（L2233）在其后且赋值相同 → **computed 值不变，纯无操作**。
  - 同时覆盖 `ToolPathsBlock.tsx:227` 的 `--center` 行（同样原本已是 stretch，无跨组副作用）；`--path-center` 保留并给出防御理由，rev1 提的「为什么要列」已可读。
  - 组级 0-2-0 / 行级 0-1-0 的区分写对了，原先「0-2-0 … + path-center」的错误归类已消除。

## 已核对检查项（结论：修复与两态均正确）

1. **宽档**：`--center`（L257，0-1-0）晚于全局 `.adl-settings-row`（L249，0-1-0）→ center；DSH 另由 L1787（0-2-0）覆盖，两者一致。
2. **窄档（≤600px）**：L2219 `.adl-settings-row`(0-1-0) 与 L2233–2235 显式 `.adl-settings-row--center`(0-1-0) 均为 stretch，且都晚于 L257 → stretch；组级 3 条（0-2-0）由 L2230-2232 扳回。两态与 rev1 真机读数（宽档两组 center/−7px；窄档 column+stretch+410=410）一致，rev2 改动不改变任何 computed 值，故无需重新取样式证据。
3. **新增改动的层叠影响面**：settings.css 本轮仅两个 hunk（L256 注释、L2226-2234 注释+一个选择器），无新属性、无 `!important`、无 `@layer`、无结构变化；选择器只影响带 `--center` 且是 `.adl-settings-row` 的节点（全仓仅 `SourceCard`、`ToolPathsBlock`），无 `:has()` / 兄弟选择器耦合。
4. **测试稳定性**：`classList.contains('adl-settings-row--center')` 与类名顺序无关，不因 `className` 拼接顺序变化而脆；删掉组件里的类即红（有效回归保护）；`data-settings-row` 用 i18n 值为预存写法，测试与组件同源。
5. **文档与代码一致性**：进度文件事项 3 的根因（共用 `SourceRow` + 缺组级规则）、行号（L249 flex-start、L1780/L1787 组级规则，值在 1781/1788）、类名、测试数与真机读数均与当前代码相符；rev2 后仍未出现夸大或过期表述（「该组其余 7 行」与 DOM 一致：主卡 7 行含来源行 + 来源摘要卡 1 行，`resetSourceAction: false` 无 reset 行）。
6. **注释事实性**：三处新注释均描述事实，且对「窄档覆盖」的说明与实际层叠一致；仅「避免日后调整源码顺序时失效」把防护范围说大了（见下）。

## 新增发现

### F1 [severity: low] [category: 文档]

- 位置：`adlo/frontend/src/styles/components/settings.css:2226-2229`
- 描述：注释「这里仍显式列出，避免日后调整源码顺序时失效」**把该防御的适用范围说大了**。三条 `align-items` 声明全是 0-1-0，最终仍由源码顺序决胜：若把整个 600 档块移到基础 Rows 段（L247-259）之前，`--center`(L257) 会重新胜出，显式选择器同样救不了。它实际保证的是「不依赖 L2219 那条 `.adl-settings-row` 的 align-items 声明（该声明被删/改写时窄档仍是 stretch）」。另外「上方后序的 `.adl-settings-row`」字面自相矛盾（规则在上方、但在源码中晚于基础修饰类），易被读反。
- 证据：L257（center）、L2219（stretch）、L2233-2235（stretch）三者均为单类选择器即 0-1-0；文件内无 `!important`/`@layer` 改变优先级。
- 建议修复：改为「显式列出以表达意图，并让 stretch 不依赖 L2219 的声明；三者同为 0-1-0，故本块仍必须位于 `.adl-settings-row--center` 之后」，并把「上方后序的 `.adl-settings-row`」改为「本档开头的 `.adl-settings-row`（源码位置早于本行、但晚于基础修饰类）」。

## 记录不修

- 同一理由复述三处（`settings.css:2226-2229` / `SourceCard.tsx:43-44` / `structure.test.tsx:192-194`）。当前三处互不矛盾，但改一处易漏另两处；建议以 `SourceCard` 为唯一详细说明，测试注释收敛为一句指向组件。
- 进度文档未记录 settings.css 的两个触点（注释 + 防御选择器），事项 3「修复」只列 `SourceCard` + 测试。文档自称 P4 进行中、P5 待办，收尾汇总补一句即可，不算事实错误（已知延后项另计：design-system README 行律补充、tokens.md `--splash-*` 登记）。
- `workspace-settings.test.ts:311-326` 未把新增的 `.adl-settings-row--center` 纳入断言；因是零行为变化，属可选项（若采纳 F1 的措辞修订，可顺手加一行 assert 锁住「本档必须晚于修饰类」的意图）。
- 快照状态提醒（非代码问题）：rev2 的 commit 列表与 rev1 完全相同（`c1cc5bc73`/`5e198361f`/`06a0210c8`），但 `SourceCard`/测试 blob 与 `settings.css` 已进入 diff → 本次修复在**工作树未提交**状态被快照。收尾提交时确认这些改动并入 `5e198361f` 或补 fixup commit，避免 P6 遗漏。

## 结论

- 重新完整核对通过：宽档 center、窄档 stretch（显式 + 隐式双保险）、两组其它行与 `ToolPathsBlock` 的 `--center` 行均无行为变化，无耦合副作用，测试删修复即红，文档事实与代码一致。
- 需修复项：1（critical 0 / high 0 / medium 0 / low 1）；rev1 两项均已闭合。
