# P4 R2 rev4 · 清理轮报告（scope: about-links）

## 范围

- 快照：manifest-rev4（base `ab91161741fc569c03281c5c7e23456f57289682`），只审本 scope 6 个 rev4 快照：
  - `adlo/frontend/src/app/features/about/AboutSettings.tsx`（@@ -240,29 +240,34 @@）
  - `adlo/frontend/src/app/features/about/AboutSettings.test.tsx`（@@ -115,9 +115,9 @@、@@ -332,12 +332,26 @@）
  - `adlo/frontend/src/app/i18n/zh-CN/about.ts`、`adlo/frontend/src/app/i18n/en-US/about.ts`（各 @@ -7,8 +7,8 @@）
  - `adlo/frontend/src/styles/regions/about-settings.css`（@@ -84,6 +84,15 @@）
  - `adlo/frontend/src/styles/about-settings.test.ts`（新增 43 行）
- 核查面：R2 关注项——死代码 / 冗余守卫 / 根因修复后多余防御 / 应删或降级的诊断日志；连带核查 R1 遗留（被结构断言取代的旧包裹、未使用 className、无引用 CSS 选择器/属性、重复覆盖或空断言、i18n 孤儿键、重复注释）。
- 只读手段：逐行读 rev4 快照 + 工作区源码；为核 i18n 孤儿键，运行仓库自带只读审计 `pnpm --dir adlo/frontend exec tsx scripts/check-i18n-orphans.ts`（报告模式、exit 0，无 `--changed`），输出重定向到 `$env:TEMP/i18n-orphans-slot2.txt`，未写入源码树。
- 未运行测试套件、未启动 dev server / 浏览器 / headless Chrome：无端口占用、无后台进程残留。测试有效性用「读用例 + 读实现 + 删除性推演」判断。

## 上轮问题关闭情况（逐条）

- **R1 rev4**：无待修复项（rev4 报告结论「本轮零问题」）；本轮未发现可推翻该结论的新证据。
- **R1 rev3 F1（样式锁头注「本文件只钉 CSS 声明」与第三个文案用例不符）**：仍为已关闭。rev4 `about-settings.test.ts:14-16` 已改为「本文件钉 CSS 声明，并直接断言中英真实字典的文案值（去「仓库」后缀）」，与 `:18-42` 的三条用例逐句相符；无回退。
- **R1 rev2 F1（结构用例标题承诺 centered）**：仍为已关闭。标题 `keeps GitHub and Gitee on one row and the issue tracker on its own row` 与 `:340-346` 断言同向；居中的责任注释（`:337`）指向样式锁 `:34` 的 `justify-content: center`，两处均会变红。
- **R1 rev1 F1（需求 ①②③ 缺可红断言）**：维持已关闭。结构 / CSS / 字典三层断言均存在（见 rev2/rev3 报告的删除性推演），本轮复核无新增缺口。

## 新增发现

无。

R2 清理面逐项核查结论（均未构成需修复项）：

1. **R1 遗留无用代码**：`AboutSettings.tsx:242-271` 的两层结构无残留——`<div className="adl-about__links">` 仍是两行的 column 容器（`about-settings.css:81-85`），两个 `.adl-about__links-row` 各有消费方（TSX 两处 + 结构断言），无被结构断言取代后遗留的旧包裹、无未使用 className。
2. **CSS 选择器/属性引用**：`about-settings.css` 全文选择器均能在 `AboutSettings.tsx` / `AboutSettings.test.tsx` / `CreditsPanel.tsx` / `ThirdPartyNoticesPanel.tsx` / `AboutTextDialog.tsx` 找到使用方；R1 新增的 `.adl-about__links-row`（:88）在 TSX 出现 2 次、样式锁引用 1 次，非死选择器。
3. **冗余守卫 / 多余防御**：`handleOpenIssues` 的 `if (issuesProbing) return`（:175-177）与按钮 `disabled` 并存属常规重入保护（预存代码，非 R1 产物），不计；R1 未新增防御分支。
4. **诊断日志**：6 个 scope 文件均无 `console.*` / debugLog 调用，无应删或降级的日志。
5. **测试重复覆盖 / 空断言**：`about-settings.test.ts` 锁「CSS 声明 + 真实字典值」，`AboutSettings.test.tsx:335-347` 锁「渲染后的两行结构 + 按钮归属」，两者覆盖不同层，非重复；`expect(body).toBeTruthy()` 是后续正则的前置存在性守卫，非空断言。
6. **i18n 孤儿键**：仓库只读审计对 `about` 命名空间零 Tier A（零引用）/ 零 Tier B（仅测试引用），中英字典 48 键均有生产引用；`aboutRepository` / `aboutGiteeRepository` 仍被 TSX 与结构用例消费。
7. **注释重复**：同一布局事实出现在 TSX 行内注释、CSS 规则注释、样式锁头注、组件用例注释四处，各自服务所在层（实现 / 样式 / 测试职责），无相互矛盾或事实漂移，按纯文档风格处理。

## 记录不修

- 同一布局事实在 `AboutSettings.tsx:243`、`about-settings.css:87`、`about-settings.test.ts:10-12`、`AboutSettings.test.tsx:336-337` 四处重复陈述：分层文档各有用途，删任一处不改变行为与事实；属纯风格，不修。
- `.adl-about__links-row` 的 `align-items: center`（`about-settings.css:91`）在该行按钮同字号、`padding: 0` 下无可观测效果：属常规 flex 行写法，非死属性、删之无收益，保留。
- 沿用 R1 记录不修项、本轮不重复计：`flex-wrap: wrap`（640px 最小宽度下不可达，保留保证同行）、行/父级 `display`/`gap` 的重复声明、`aboutRepository` 键名含「Repository」而值为品牌名、样式锁用例标题的 `renders` 措辞、样式锁 `join(process.cwd(), …)` 路径写法、docs 旧文案漂移（已在进度文件 P5-3/P5-4 台账）。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）—— 本轮零问题
