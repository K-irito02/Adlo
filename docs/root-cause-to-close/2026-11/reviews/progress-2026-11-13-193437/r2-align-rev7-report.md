# R2 定向复核报告 — 设置行对齐（rev7）

## 范围

- 基线 `e16d96659`，只读快照 `-rev7`；未跑 `git diff/log/show`、未跑测试、未改源码（只写本报告）。
- `adlo/frontend/src/app/features/harness/sub-components/SourceCard.tsx`（L43-47）
- `adlo/frontend/src/app/features/harness/__tests__/HarnessVersionCard.structure.test.tsx`（L192-194）
- `adlo/frontend/src/styles/components/settings.css`（L256、L2218-2237；对照 L838/L1780/L1787）
- 辅助核对：`workspace-settings.test.ts` rev7 快照（顺序断言是否仍在）、`progress-…-193437.md` L147-153（保留理由原文）。

## rev6 问题关闭情况

- **rev6 F1（low，注释绝对断言失真）→ 已关闭。**
  - 事实核对：`settings.css` 组级行居中规则恰为三条——`.adl-settings-controls .adl-settings-row`（L838）、`.adl-browser-settings .adl-settings-row`（L1780）、`.adl-dsh-settings .adl-settings-row`（L1787）；全文再查无 `.adl-opencode-settings … .adl-settings-row` 的 `align-items` 规则 → 「OpenCode 组不在名单内（通用/浏览器/DSH 三组）」成立。
  - 组件注释 `SourceCard.tsx:43-44` 与测试注释 `structure.test.tsx:192-193` 均改为该口径，测试侧还点出通用组类名 `.adl-settings-controls`（与 L838 选择器一致），不再与 `settings.css:2226`「通用/浏览器/DSH 三条」打架。
  - 保留的绝对断言「窄档（≤600px）由堆叠规则覆盖回 stretch」可证：`@container settings-content (max-width: 600px)`（L2218）头部 `.adl-settings-row { align-items: stretch }`（L2219-2222）+ 本行同块修饰类（L2234）双重覆盖 → 成立。
  - 收敛达成：级联/特异度细节现在只有 `settings.css:2226-2230` 一份，两个 TS 注释各 2 行只述「本行为何需要该类」「断言锁什么」，符合 rev6 建议的「唯一定义源」分工。
- **rev6 F2（low，可选清理：删窄档列表里的 `--center` / `--path-center`）→ 决定不删，理由成立，结案。**
  - 理由可验：R1 rev2 F1 的定稿注释文本正是「仍显式列出以表达意图，并让 stretch 不依赖 L2219 的声明」——该表述的前提就是这两个选择器在列表内；删除后该行必然退回「依赖头部那一条声明 + 源码顺序」的单一保障。R1 rev1 记录不修段也早已把「显式加入列表消除顺序依赖」列为纯防御建议。
  - 我 rev6 F2 已标注「可选清理、非阻塞」，并写明「若倾向自述意图优先，保持现状无需其他动作」→ 本次处置即该分支，无异议。
  - 进度文档 L150-153 的记述与事实相符：承认冗余（同特异度 + 后序生效）、给出保留理由、未夸大防护范围（只说「行为零变化但防御退化」，未声称能防整块上移）→ 不构成新的文档失真。

## 新增发现

**本轮零问题。**

检查项与结论：

1. **注释 ↔ 三条组级规则一致性**：一致（通用/浏览器/DSH），无遗漏、无多余组；`--center` 契约注释（L256）「单个控件（按钮 / 开关 / 下拉）」与 `SourceRow` 右侧 `SettingsSelect` 相符。
2. **压缩是否丢关键信息**：顺序约束完整保留——「三者同为 0-1-0，故本块必须位于 `.adl-settings-row--center` 之后」，且事实成立（`--center` L257、`--path-center` L714 均早于 L2218）；该不变式仍有 `workspace-settings.test.ts:326-328` 的 `>=0` + `< start` 双断言兜住（rev7 未改动，仍生效）。特异度链（组级 0-2-0 → 头部 0-1-0 被压 → 修饰类 0-1-0 靠后序自愈 → 显式列出为表达意图/去隐式前提）四段都在，仅压缩了「子项 shrink-to-fit、组间行为不一致」这句症状描述与「组级 **align-items** center」的属性名（见记录不修，属可读性 nit，不影响事实）。
3. **「不删」理由是否成立**：成立（见上 rev6 F2 行）。这是有据可查的设计取舍，非「默认保留」；两个选择器零行为影响，保留代价 2 行，删除收益小且会与 R1 两次定稿的注释文本冲突——维持现状更稳。
4. **本轮是否引入新问题**：无。三处文件只动注释（`SourceCard` 类名与断言未变），`settings.css` 声明未变；无 TODO/调试输出/注释掉的旧实现；无新术语、颜色、a11y 属性变化。

## 记录不修

- `settings.css:2226`「组级 center（0-2-0：…）」省略了属性名 `align-items`：下一句以 `align-items: stretch` 作对照，语义无歧义，纯措辞。
- 压缩时删掉的症状子句（窄档子项 shrink-to-fit、组间行为不一致）是有价值的「为什么」；若日后想补回，半句即可，不进本轮。
- 进度文档 L151「R1 rev2 明确要求显式列出」的归属略粗：显式加入列表最初由 R1 rev1 报告「记录不修／优化」提出，rev2 F1 落成注释文本；实质（去掉隐式前提）归属 rev2 无误，不改事实。

## 结论

- 本轮零问题（rev6 F1 已关闭；rev6 F2 的「不删」处置理由成立）。
- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）。
