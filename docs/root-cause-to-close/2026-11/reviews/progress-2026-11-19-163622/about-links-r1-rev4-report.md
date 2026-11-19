# P4 R1 rev4 · 定向复核报告（scope: about-links）

## 范围

- 快照：`.review-diffs/adlo_frontend_src_styles_about-settings.test.ts-rev4.diff`（manifest-rev4，base `ab91161741fc569c03281c5c7e23456f57289682`），只审 rev4 快照。
- 定向：仅 `adlo/frontend/src/styles/about-settings.test.ts`（rev4 新增 43 行）；其余 about-links 文件 rev3→rev4 未变，沿用 rev3 报告结论（零新发现 / 仅一条 low）。
- 对照源码：`adlo/frontend/src/styles/about-settings.test.ts`（43 行）、`adlo/frontend/src/styles/regions/about-settings.css:81-94`、`adlo/frontend/src/app/features/about/AboutSettings.test.tsx:335-347`、`adlo/frontend/src/app/i18n/{zh-CN,en-US}/about.ts:10-11`、`adlo/frontend/src/app/i18n/{zh-CN,en-US}/index.ts:21,47`（字典确为 App 实际合并的同一对象）、`adlo/frontend/src/styles/testing/cssRules.ts:51-59`。
- 需求真源：进度文件事项 1（①文案去掉「仓库」；②GitHub/Gitee 同一行；③「问题反馈」独占下一行且水平居中；用户 2026-11-19 指定）。
- 未运行测试套件、未启动 dev server / 浏览器 / headless Chrome：无端口占用、无后台进程残留。测试有效性用「读用例 + 读实现 + 删除性推演」判断。

## 上轮问题关闭情况（逐条）

### rev3 F1（low，注释称「本文件只钉 CSS 声明」与第三个用例不符）—— **已关闭**

- 新注释（rev4 `about-settings.test.ts:14-16`）：「结构守卫在 `AboutSettings.test.tsx`（断言两行包裹与按钮归属）；本文件钉 CSS 声明，并直接断言中英真实字典的文案值（去「仓库」后缀），二者一起构成回归保护」。
- 逐句核对：
  - 「结构守卫在 `AboutSettings.test.tsx`（断言两行包裹与按钮归属）」：`AboutSettings.test.tsx:339-346` 断言 `.adl-about__links-row` 恰 2 个，且第一行按钮恰为 `['GitHub','Gitee']`、第二行恰为 `['问题反馈']` —— 两行包裹与按钮归属均有会变红的断言。✅
  - 「本文件钉 CSS 声明」：`:21-35` 两个用例读真实 CSS 文本，分别断言 `.adl-about__links` 的 `flex-direction: column`，以及 `.adl-about__links-row` 的 `display: flex`、无 `column`、`justify-content: center`（`ruleBody` 取首个命中规则体，`.adl-about__links` 首命中为 css:81，不会被 `.adl-about__links-row` 串扰）。✅
  - 「并直接断言中英真实字典的文案值」：`:37-42` import 真实 `aboutZh` / `aboutEn`（两者经 `i18n/*/index.ts:21,47` 展开进 App 字典，非副本），逐键断言 4 个值与真实字典（`about.ts:10-11`）一致。✅
  - 「（去「仓库」后缀）」：断言为严格等值 `'GitHub'` / `'Gitee'`，比「无后缀」更强，故不弱于该措辞；用例标题 `keeps the repository labels free of the "仓库/repository" suffix` 与断言同向。✅
  - 新句未引入「必然/唯一/所有/全部」等绝对量词；「文案值」由括号与用例标题限定到仓库标签，未越出断言范围。✅
- 删除性推演：删掉 `justify-content: center` → `:34` 变红；删 `.adl-about__links-row` 包裹 → 结构断言变红；zh 值回退为「GitHub 仓库」→ `:38` 变红（进度 `progress-2026-11-19-163622.md:39` 亦记录三次回退实测）。
- 结论：rev3 F1 已按最小改动关闭，无「加宽注释以覆盖实现缺口」的迹象。

### 其余注释/标题回扫（未发现新漂移）

- 头注两条布局事实（`:10-12`）与断言一致：block `column` ⇒ 问题反馈行独占下一行；行内 `justify-content: center` ⇒ 单按钮水平居中于链接块（`.adl-about__links` 为默认 stretch 列，行宽等于块宽）。「用户 2026-11-19 指定」与进度文件 `:9`（两次指定）一致。
- 「真实级联另由 getComputedStyle 取证」（`:16`）：证据在进度文件 `:10-13`（`.adl-about__links`=column；两行 row/gap=10px；GitHub/Gitee `top` 同为 440；问题反馈 `top=468`、按钮 797–845 居中于块 783–858）。该句为对既有取证的陈述，非「自动化覆盖」承诺，rev3 已核可，rev4 未改动。
- 用例内两条注释（`:30`、`:33`）与断言/浏览器默认值一致：flex 初始方向为 row；显式 `column` 会使两仓库按钮各占一行；单按钮行的居中依赖 `justify-content`。
- 用例标题与断言范围一致：`:21` column→独占一行（结构用例另证两行）；`:27` 「one centered row」的居中由 `:31-34` 三条声明断言支撑（`renders` 用词属既有「记录不修」，rev2/rev3 已按可接受处理，本轮不改判）。
- describe 名 `about settings link layout` 覆盖第三个文案用例，但 describe 不承诺排他范围，第三个 `it` 标题已自述文案职责，未超出 §5.9 判定。

## 新增发现

无。

## 记录不修

- 样式锁用 `join(process.cwd(), 'src/styles/...')` 而非 `new URL('./regions/x.css', import.meta.url)`：登记入口均以 `adlo/frontend` 为 cwd，且仓库既有同类写法；rev3 已记录，本轮不重复计。
- `aboutRepository` / `aboutGiteeRepository` 键名保留「Repository」而值为纯品牌名：键名不进 UI，改名牵动字典与测试；沿用 rev3 理由不修。
- 用例标题 `renders the repository links as one centered row` 用「renders」描述 CSS 文本锁：真实级联另有 getComputedStyle 读数，rev2/rev3 已按可接受处理，本轮不重复计。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）—— 本轮零问题
