# R1 审查报告 — 设置行对齐 + 进度文档（rev1）

## 范围

基线 `e16d96659`，本轮快照 `-rev1`，只读审查，未运行测试/未改源码。

- `adlo/frontend/src/app/features/harness/sub-components/SourceCard.tsx`（`SourceRow` 根节点加 `adl-settings-row--center`）
- `adlo/frontend/src/app/features/harness/__tests__/HarnessVersionCard.structure.test.tsx`（新增 `--center` 断言 + 注释）
- `docs/root-cause-to-close/2026-11/progress-2026-11-13-193437.md`（新文件，事项 3 为本范围）

上下文实读：`adlo/frontend/src/styles/components/settings.css`（L247-259、L714-716、L1776-1789、L2181-2234）、`regions/harness-version.css`（L34-38、L516-543、L607-619）、`regions/dsh-settings.css`、`HarnessVersionCard.tsx`、`DshSettings.tsx`、`OpencodeSettings.tsx`、`OpencodeSourceSummaryCard.tsx`、`ResetSourceRow.tsx`、`ToolPathsBlock.tsx`、`docs/design-system/README.md`（设置面板行律）、`docs/knowledge-base/interaction/settings-panel-narrow-layout-and-dot-scrollbar-2026-09-27.md`、`styles/workspace-settings.test.ts`。

## 上轮问题关闭情况

R1 首轮，无上轮问题。

## 已核对检查项（结论：核心修复正确）

1. **窄档覆盖链（≤600px）**：`.adl-settings-row--center` 是**单类选择器 = 0-1-0**（不是 0-2-0），与 `@container settings-content (max-width: 600px)` 内 `.adl-settings-row { align-items: stretch }`（settings.css:2219-2224，同为 0-1-0）特异度相同，后者在文件中更靠后 → **stretch 胜出**。窄档不会被 `--center` 破坏，与真机读数一致。组级规则（`.adl-settings-controls/.adl-browser-settings/.adl-dsh-settings .adl-settings-row`，0-2-0）才需要 2218 块内 L2229-2234 逐一扳回，本次不涉及。
2. **宽档**：`--center`(L257) 在全局 `.adl-settings-row`(L249, 0-1-0) 之后，宽档胜出 → OpenCode 组居中生生效；DSH 组另由 L1787 组级 center 覆盖，两者一致（重复但无害）。
3. **其它宿主**：`SourceRow` 只被 `HarnessVersionCard` 使用，后者只挂在 `.adl-dsh-settings` 与 `.adl-opencode-settings` 两组；浏览器组不含版本卡，L1780 规则与本行无关。无第三个宿主。
4. **副作用**：该组其余行为独立 `.adl-settings-row` 节点，本次只加类不改结构；`settings.css`/`harness-version.css` 中无作用于 `.adl-settings-row` 的 `:has()` 或 `+ ~` 兄弟选择器（`:has()` 命中集中在 nav/剪贴板/编辑器行）。其余 7 行不受影响（OpenCode `resetSourceAction: false`，无 ResetSourceRow；主卡 7 行含来源行 + 来源摘要卡 1 行 = 其余 7 行，与文档计数吻合）。
5. **测试有效性**：删除 `SourceCard.tsx` 的 `adl-settings-row--center` → `classList.contains(...)` 为 false → 该用例红，回归保护成立；断言用 `classList.contains` 与类名顺序无关，不因 `className` 拼接顺序变化而脆。`data-settings-row` 取 `t.harnessVersionSourceTitle`（i18n 值）为预存写法，测试与组件同源，非本轮引入。
6. **文档与代码一致性**：根因（共用 `SourceRow` + 缺组级规则）、行号（L249 flex-start、L1780/L1787 组级规则，值为 1781/1788）、类名、测试数与真机读数（OpenCode/DSH 均 center、−7px；窄档 column/stretch）均与代码事实一致；未发现夸大或过期表述。合理。

## 新增发现

### F1 [severity: low] [category: 文档]

- 位置：`adlo/frontend/src/styles/components/settings.css:256-259`（配合 `SourceCard.tsx:43-46`）
- 描述：`--center` 的契约注释仍写「右侧只有单个按钮/开关的行」，本次把该类用于「版本来源」行——右侧是下拉（`SettingsSelect`）+ 悬停刷新按钮，不属于「单个按钮/开关」。注释未同步，后续按注释选择该类时会误判适用范围。
- 证据：`settings.css:256` 注释原文 vs `SourceCard.tsx:56-64`（`SettingsSelect` + `SettingsRowRefresh`）；同文件已有先例 `ToolPathsBlock.tsx:227` 用同类，其控件为按钮，注释当时成立。
- 建议修复：把注释放宽为「右侧为单个控件（按钮/开关/下拉）的行」，顺带在 `SourceCard.tsx` 该行上方注明「OpenCode 组无组级 align-items，靠此修饰类与 DSH 组对齐」（现注释只在测试里）。

### F2 [severity: low] [category: 预存]

- 位置：`adlo/frontend/src/styles/components/settings.css:2226-2234`
- 描述：该处注释声称窄档要扳回的三类规则「（0-2-0，通用/浏览器/DSH 三条 + path-center）」均为 0-2-0，但 `.adl-settings-row--path-center`（L714-716）是单类选择器 = 0-1-0，本来就会被本档后面的 `.adl-settings-row`（0-1-0，后序）压回 stretch，列入扳回列表是冗余；同一段里「行级修饰类也是 0-2-0」的错误暗示，正是下一次把 `--center` 误判成需要扳回（或改用 `!important`）的诱因。本轮 `--center` 之所以安全，恰恰依赖「0-1-0 + 后序」而非特异度。
- 证据：L714 `.adl-settings-row--path-center` 单类；L2219-2224 同特异度后序 stretch；`workspace-settings.test.ts:320-322` 的注释复述了同一 0-2-0 说法。
- 建议修复：把注释改为「组级 center 为 0-2-0；行级修饰类（`--path-center`/`--center`）为 0-1-0，靠后序 stretch 覆盖」，并删掉 L2232 的 `.adl-settings-row--path-center`（或保留但注明“防顺序调整的显式兜底”）。**预存问题，可延后**，不阻塞本轮。

## 记录不修

- 测试落点：`--center` 断言写在 `describe('HarnessVersionCard old-DSH structure')` 的「source row first」用例里（structure.test.tsx:192-194），而缺陷现场是 OpenCode 组。类加在共享组件上，删掉修复两种宿主都会红，保护成立；但更贴现场的写法是在 `OpencodeSettings.test.tsx` 的 `opencode version card layout adjustments` 里补一条（该 describe 已有 `__row--center` 同类断言先例，L356-368）。可选题，不改事实。
- 测试注释措辞：`--center` 是 OpenCode 组的**唯一**居中来源，DSH 组由组级规则提供（本行冗余）。现注释「该行靠 --center 在各组内保持一致居中」易被读成「DSH 也依赖它」。仅措辞精度问题，可与 F1 一并微调。
- 窄档稳健性（优化）：`--center` 在 ≤600px 依赖「@container 块位于 L257 之后」这一源码顺序。若把窄档块上移或拆文件，`--center` 会在窄档胜出、行变 column+center（label shrink-to-fit）。显式把 `.adl-settings-row--center` 加进 L2229-2234 扳回列表即可消除顺序依赖（当前行为不变，纯防御）。与 F2 的注释更正同批处理更划算。
- 双机制并存：DSH/浏览器组级 `align-items: center` 与行级 `--center` 同时存在，本行在 DSH 侧重复。不建议本轮删除组级规则——它同时服务组内其它多行，删除属行为扩散；`--center` 是更精确的修复面，与 `ToolPathsBlock`/`--path-center` 既有行级约定一致。
- 进度文档行号精度：文档写「`.adl-browser-settings`（L1780）…有组级 align-items: center」，实际 `align-items: center` 在 L1781/L1788。指向规则起始行，不影响核对，不改。
- 预存观察（范围外）：`ResetSourceRow` 注释称「仅 OpenCode 提供」，但 DSH/OpenCode 两个 bridge 均 `resetSourceAction: false`，当前无生产消费者。与本轮无关，未展开。

## 结论

- 修复本身正确：宽档两组一致居中，窄档因 0-1-0 + 后序 stretch 未被破坏，无 `:has()`/兄弟选择器耦合，其余行不受影响，回归断言删修复即红。
- 需修复项：2（critical 0 / high 0 / medium 0 / low 2）；其中 F2 为预存注释失真，可延后。
