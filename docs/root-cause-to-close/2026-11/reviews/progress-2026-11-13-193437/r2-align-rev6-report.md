# R2 清理轮报告 — 设置行对齐 + 进度文档（rev6）

## 范围

- 基线 `e16d96659`，只读快照 `-rev6`；未跑 `git diff/log/show`、未跑测试、未改源码（只写本报告）。
- `adlo/frontend/src/app/features/harness/sub-components/SourceCard.tsx`
- `adlo/frontend/src/app/features/harness/__tests__/HarnessVersionCard.structure.test.tsx`
- `adlo/frontend/src/styles/components/settings.css`（含 `Rows` 段 L247-259、L838、L1780/L1787、L2218-2238）
- `adlo/frontend/src/styles/workspace-settings.test.ts`（L311-331）
- `docs/root-cause-to-close/2026-11/progress-2026-11-13-193437.md`
- 上下文实读：`OpencodeSettings.tsx:236`、`SettingsControls.tsx:167-175`、`ToolPathsBlock.tsx:227`、`StorageSettings.tsx`、`BrowserDownloadPathSection.tsx`、`regions/harness-version.css:519-543`、`regions/environment-settings.css:12-31`、`docs/design-system/README.md:122-127`、`r1-align-rev1..rev5-report.md`。

## 上轮问题关闭情况（R1 计数链，逐条核对，不在本轮重审）

- rev1 F1（`--center` 契约注释过窄）→ 已关闭：`settings.css:256` 现为「右侧为单个控件（按钮 / 开关 / 下拉）」✓
- rev1 F2（窄档段特异度表述失真）→ 已关闭：`settings.css:2226-2238` 现称组级 0-2-0、修饰类 0-1-0 ✓
- rev2 F1（兜底防护范围说大）→ 已关闭：现文改为「不依赖本档开头那条声明」+「本档须在修饰类之后」✓
- rev3 F1（顺序断言真空通过）→ 已关闭：`workspace-settings.test.ts:326-328` 先判 `>=0` 再比顺序 ✓
- rev3 F2（文档「待派发」行过期）→ 已关闭：全文 grep 无命中 ✓
- rev4 F1（rev3 段计数少算）→ 已关闭：文档 L142-144 现写「2 项 low」✓
- rev5（零问题）→ 文档 L152 记录与之逐条一致；本轮与 rev4/rev5 报告无冲突。

## 新增发现

### F1 [severity: low] [category: 文档]

- 位置：`adlo/frontend/src/app/features/harness/sub-components/SourceCard.tsx:43-44`；同一表述复述于 `adlo/frontend/src/app/features/harness/__tests__/HarnessVersionCard.structure.test.tsx:192-193`
- 描述：新增注释里的绝对断言「OpenCode 组没有组级 `align-items: center`（settings.css **只给浏览器/DSH 组**）」与事实不符：`settings.css` 的组级居中规则有**三条**——`.adl-settings-controls .adl-settings-row`（L838，通用设置组）、`.adl-browser-settings .adl-settings-row`（L1780）、`.adl-dsh-settings .adl-settings-row`（L1787）。同文件 L2226 的注释自己写的是「通用/浏览器/DSH 三条」，两处口径互相打架；按 brief §5.8，「只给…」这类绝对断言必须能被代码证明，此处不能。
- 证据：`settings.css:838`（注释「通用设置组：所有控制行…垂直居中」）、`:1780`、`:1787`；`OpencodeSettings.tsx:236` 的容器类为 `adl-settings-opencode`→ 实为 `adl-opencode-settings`，不属于三条中的任何一条，故「OpenCode 组无组级规则」这一主句成立，只有括号里的范围说小了。`SettingsControls.tsx:175` 证实 `.adl-settings-controls` 是通用组的行容器，不是控件内部类。
- 建议修复（一处编辑同时收敛三处复述，见下）：
  1. `SourceCard.tsx:43-44` 改为只述本行事实并指向唯一定义源，例如：「// 行级修饰类：OpenCode 组没有组级 `align-items`（settings.css 只给通用 / 浏览器 / DSH 三组），
     // 该行自带 `--center` 与 DSH 组对齐；窄档覆盖见 settings.css ≤600px 档。」
  2. `structure.test.tsx:192-193` 收敛为一句说明「本断言锁什么」：「// 行级居中修饰类：删掉它该行回落到全局 flex-start（缺陷 26px 偏移）。
     // 级联与窄档覆盖的完整说明在 settings.css「Rows / ≤600px」两段，此处不复述。」
- 理由：同一事实现在在 `settings.css`（同级联说明）、组件、测试三处各有一份，其中两处已出现事实偏差（本条），第三处是对的。按「哪一处做唯一详细说明」的判断：**`settings.css:2226-2238` 是唯一定义源**（它拥有特异度与顺序事实，且是级联执行地）；组件注释只保留「为什么这一行需要类」，测试注释只保留「断言锁住什么」。这样下次改窄档策略只需改一处。R1 rev2 曾把「三处复述」记录为不修（措辞精度问题），本轮因其中两处已确认失真而升级为需修复。

### F2 [severity: low] [category: 死代码]（可选清理，非阻塞）

- 位置：`adlo/frontend/src/styles/components/settings.css:2235-2236`（`--center` / `--path-center` 两个选择器）与 `:2228-2231`（为其辩护的注释）
- 结论：**纯冗余，建议删除这两个选择器**（保留 `.adl-settings-controls / .adl-browser-settings / .adl-dsh-settings` 三条 0-2-0）。
- 理由（不只说可删）：
  1. 级联上零效果：两个修饰类定义在 L257 / L714（均 0-1-0），本档头部 `.adl-settings-row { … align-items: stretch }`（L2219-2222，0-1-0）在源码上更晚，单独已能压过它们；把同特异度选择器再写进同一声明块，不改变任何计算值。
  2. 「兜底」防的场景不存在：它只防「本档头部那条 `align-items: stretch` 被删/改写」。而那条是本档堆叠行为的主声明（`flex-direction: column` + `width: 100%` 同块），删了它整块所有行一起坏，这两个选择器只能救 2 行；若整块上移到基础修饰类之前，头部声明同样失效，两个显式选择器也救不了（这层事实 R1 rev2 F1 已认可）。
  3. 顺序不变式已有更强守卫：`workspace-settings.test.ts:324-328` 现在锁「`--center` 定义必须早于本档起点」，比重复声明更能表达「本块必须位于修饰类之后」。
  4. 应用口径不一致：同类 0-1-0 行级居中还有 `.adl-settings-font--row { align-items: center }`（L821-825），本档只在 L2287-2291 用同特异度后序扳回，**没有**把它列进兜底清单——说明本仓窄档实际奉行的是「靠后序」，兜底清单是局部特例，会让读者误判此处需要特异度对抗（正是 R1 rev1 F2 担心的误读诱因）。
- 建议修复：删 2235-2236 两行；把 2228-2231 的「这里仍显式列出以表达意图，并让窄档 stretch 不依赖那一条声明。三者同为 0-1-0，故本块仍必须位于 `.adl-settings-row--center` 之后。」压成一句：「行级修饰类同为 0-1-0，已被本档头部 stretch 按源码顺序覆盖，不重复列出；本块仍必须位于 `.adl-settings-row--center` 之后。」
- 说明：该判断与 R1 rev2「保留为显式兜底」的记录相反（rev1 F2 原本也判其冗余）。这是本轮清理轮的正常取舍，不涉及行为变化；若主代理倾向「自述意图优先」，保持现状也无需其他动作——但**不要在两处口径之间来回改**，请一次定稿。

## 已核对但无问题（本轮检查项）

1. **guard 必要性（item 2）**：`SourceCard` 的 `--center` 没有更小的清理动作。唯一的单一机制化选项是「删 DSH/浏览器组级规则」——R1 已判行为扩散；另一选项是给 `SourceRow` 加 `center?: boolean` 由 OpenCode 调用点传 true，但那是把「两组必须一致」从组件层挪回调用点，正是本次根因（两组靠组级 CSS 分叉）的复现，代码量也更大。DSH 侧该类冗余是共享组件的必然代价，保留。
2. **测试冗余（item 3）**：`structure.test.tsx:194` 与同文件 L224/228/232 的 `className` 断言锁的是不同修饰类（`--center` vs `--row--center`），不重复；与 `ToolPathsBlock.test.tsx:175`、`BrowserDownloadPathSection.test.tsx:195-196` 是不同组件，不重复。`workspace-settings.test.ts:326-328` 的顺序断言与同用例 L322-323 的「块内含组级选择器 + stretch」是不同不变式，不重复。
3. **`indexOf` 锚点（item 3）**：`>=0` 已是必要且充分的真空守卫（`-1 < start` 会静默通过）。逐处枚举：`.adl-settings-row--center {` 在 `settings.css` 仅 L257 命中（L2231 注释为「` 之后」、L2235 为 `--center,`，均不匹配），`start`（`@container settings-content (max-width: 600px)`）全文件唯一；不会再误命中。若日后 prettier 把该规则改写成选择器列表，`>=0` 会**变红**而不是真空通过——这是期望的失败方式，无需再加严格锚点（如行首正则）。删除 F2 的两个选择器后，L2235 这个近似串也一并消失，锚点环境更干净。
4. **临时痕迹（item 4）**：五个范围内文件 grep `TODO|FIXME|XXX|console.|debugger|待办|临时`（文档另查「待派发/占位/TBD」）→ 零命中；无注释掉的旧实现、无调试输出。
5. **进度文档一致性**：R1 计数链（rev1=2 / rev2=1 / rev3=2 / rev4=1 / rev5=0）与五份报告逐条吻合；真机读数、测试数、`check:changed` 结论均标注为手工/命令验证，未把人工验证写成自动化测试；无「待派发」残留。L74-77 的根因段只列浏览器/DSH 两组（非穷尽表述，未称「只有」），不构成事实错误；若要和 F1 统一口径，可在该句补「另有通用组（`.adl-settings-controls`）」，属可选。
6. **ADR/术语/颜色/a11y**：本轮只加类名与注释，无新领域术语、无颜色、无 a11y 状态属性，不触发 §5.5/§4 的登记或配对规则。

## 记录不修

- 测试落点（`structure.test.tsx` 而非 `OpencodeSettings.test.tsx`）：R1 rev1 已记录为可选题；类加在共享组件上，删修复两种宿主都变红，保护成立。
- `--center` 断言写法用 `classList.contains` 而邻近行用 `className).toContain`：同文件既有两种写法并存，纯风格。
- `settings.css:2226-2227`「本档开头的 `.adl-settings-row`」指选择器列表 `.adl-settings-row, .adl-settings-keybinds__row`：未点名 `--keybinds__row` 但语义正确，不值得再动。
- 进度文档 L74-77 未提通用组：非穷尽表述，仅在采纳 F1 时顺手补一句即可。

## 结论

- 需修复项：1（critical 0 / high 0 / medium 0 / low 1）——F1 错误注释（两处复制同一失真断言）。
- 另有 1 条可选清理（low，F2 冗余选择器，零行为变化）；不计入需修复。
