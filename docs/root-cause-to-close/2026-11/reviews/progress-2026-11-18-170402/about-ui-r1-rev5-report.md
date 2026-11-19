# About UI / i18n / CSS / tests — R1 复审报告（rev5）

## 范围

- 仓库：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-2`；base `8fc3ee01a`；只看 rev5 快照（`manifest-rev5.md`，about 范围 28 个 frontend 文件）＋工作区源码只读上下文。
- 逐文件覆盖：`AboutSettings.tsx` / `.test.tsx`、`AboutTextDialog.tsx`、`CreditsPanel.tsx`、`ThirdPartyNoticesPanel.tsx`、`aboutContent.ts`、`issueTracker.ts` / `.test.ts`、`thirdPartyNoticeData.ts` / `.test.ts`、`thirdPartyNoticeSearch.ts` / `.test.ts`、`thirdPartyNotices.ts` / `.test.ts`、`thirdPartyNoticesTypes.ts`、`creditsNames.ts` / `.test.ts`、`thirdPartyNotices.generated.test.ts`、`creditsData.ts` / `.test.ts`（删除）、i18n `zh-CN/about.ts` / `en-US/about.ts`、`styles/regions/about-settings.css`、`adlo/frontend/.prettierignore`、`eslint.config.js`、`scripts/check-no-cjk-source.mjs`。
- 生成物 `thirdPartyNotices.generated.ts` / `thirdPartyNoticeNames.generated.ts` 按 manifest 继续排除逐行审查；只以工作区只读 grep 计数作为证据（如 4 个外部名称是否出现在名称索引）。
- 范围外：manifest 中 scripts / release / 技能文档属其他 scope；`docs/`（进度、ADR、设计规格）属 P5，不据此判需修复。
- 约束执行：未运行 `git diff/log/show`；未修改源码/配置/测试；未运行测试套件（有效性判断全部用删除性推演）；未启动 dev server / 浏览器。使用端口：无；无残留后台进程。只写本报告。
- `claims-ack-rev5.md` 两项均在 scripts 侧；本 scope 的绝对断言注释（`thirdPartyNotices.test.ts:7-9`）由本报告逐条人工核对（见下）。

## 上轮问题关闭情况（逐条）

**F1（rev4 low：`thirdPartyNotices.test.ts` 注释把回归覆盖说成绝对）— 已关闭。**

- 现状：`thirdPartyNotices.test.ts:7-9` 已收窄为「正文被替换、URL 退化，或 React Symbols / Untitled UI / Devicons 的版权行被改写，都不会被其他用例发现（bklit-ui 与 Lucide 的版权行另有面板用例覆盖）」。
- 逐项核对（删除性推演，不实跑）：
  - React Symbols / Untitled UI / Devicons 的版权行：全仓仅 `thirdPartyNotices.test.ts:56-58` 断言（`Pablo Hernández` / `Untitled UI` / `Devicons` 在测试中无第二处断言）；`AboutSettings.test.tsx` 已删除这三条，只保留 bklit-ui（`:427`）与 Lucide（`:429`）。
  - 括号里的例外成立：`AboutSettings.test.tsx:421` 用例只 mock `./thirdPartyNoticeData` 与 `./issueTracker`，`THIRD_PARTY_NOTICES` 是真实模块，`:426-429` 断言的是真实版权串。
  - 正文 / URL：面板用例不断言任何 curated 正文，也不点击 curated 名称（无 URL 断言）；`thirdPartyNotices.generated.test.ts` 只覆盖生成数据。故「正文被替换、URL 退化」仍只由本文件覆盖。
  - 反向验证：删掉本文件，把 `thirdPartyNotices.ts:116` 的 Untitled UI `url` 改成 `http://`、或把 `:117` 的正文换成任意 >500 字文本，`AboutSettings.test.tsx` 与生成物用例都保持绿；改 React Symbols / Untitled UI / Devicons 版权行同理。断言与措辞一致。

顺带项（rev4「记录不修」，本轮修正，供交叉核对）：

- `CreditsPanel.tsx:10-11` 已补「未随包分发的字体与外部工具只出现在名称索引里，不在该清单内」。核对：`creditsNames.ts:10` 的 4 个名称只进 `THIRD_PARTY_NAMES`；`thirdPartyNoticeNames.generated.ts` 中 `Inter` / `JetBrains Mono` / `DSH` / `OpenCode CLI` 均为 0 次，`THIRD_PARTY_NOTICES` 也不含这 4 条 → 成立。
- canonical 文案三方同步：zh `about.ts:62`「上游未随包提供许可正文，以下为标准许可正文。」；en `about.ts:67-68`；混源 zh `:63` / en `:69-70`（「该许可证的正文」/「this license's text」）。`AboutSettings.test.tsx:200` mock、`:504`（delta，整包无正文 → 走 canonical 单条说明）、`:517-519`（epsilon 混源：仅 Apache-2.0 块有说明，LICENSE-MIT 块为 `null`）一致。全仓 grep「上游未」只剩新文案与 `thirdPartyNotices.ts:9`「上游未提供时保持为空」（语义不同，非文案），无旧措辞残留。

## 新增发现

无（需修复级）。rev5 三处修复均未引入注释/文案与实现的新漂移：

- `ThirdPartyNoticesPanel.tsx:96-102` 的「该许可证的正文缺失时改用标准许可正文并在正文上方注明来源」与 `NoticeTextBlocks`（`:36-38`，仅 `textSource==='package'` 且 `isCanonicalRef` 的 ref 加混源说明）及 `DependencyNotice`（`:84-86`，`canonical` 在正文块上方加说明）逐句相符。
- `aboutThirdPartyNoticesScope`/subtitle 的「全部 npm / Cargo 依赖」「未随包分发的字体与外部工具不在本清单内」与生成物（1833 条来自 Cargo.lock + pnpm-lock.yaml）及名称索引实际内容一致。

## 记录不修

- `AboutSettings.test.tsx:204` 的 `aboutThirdPartyNoticesScope` mock 仍是简写（生产含 `Cargo.lock` / `pnpm-lock.yaml`），`:432-434` 只断言 footer 前缀；`:439` 的 subtitle+totals 断言同样走 mock（生产文案无直接断言）。测试替身，沿用。
- `AboutSettings.test.tsx:437`（`not.toContain('依赖清单')`）与 `:430`（`not.toContain('随包素材与移植代码')`）是负断言，当前恒真，只防旧文案回潮。
- `AboutSettings.test.tsx:517-519` 只断言混源说明的存在/文案片段；把组件换回 `aboutNoticesCanonicalText` 仍全绿（i18n 文案测试缺口，非行为分支缺失）。
- `thirdPartyNotices.test.ts:32` 标题「keeps the full MIT text…」实际只断言三句关键短语（与旧用例命名一致，P5 可改标题措辞）。
- `CreditsPanel.tsx:10` 的「依赖与随包素材的逐项许可与版本」按分配读法接受：依赖条目确有版本，随包素材条目无版本字段；若要更严可写「依赖的版本、依赖与随包素材的许可」。不影响用户可见事实。
- `AboutSettings.test.tsx:427/429` 的版权串也能由许可正文命中（bklit-ui 的正文内嵌同一版权行），字段级一致性仍只由 `thirdPartyNotices.test.ts` 锁；注释括号只声称渲染覆盖，接受。
- `AboutTextDialog.tsx:40-83` effect 依赖 `[onClose]`、父级每次渲染传新箭头函数导致重渲染时焦点回到关闭键（rev2/rev3 预存，沿用；建议 P2 用 ref 收口）。
- `ThirdPartyNoticesPanel.tsx:47-49` `isCanonicalRef` 仍为 `spdx:` + `label===id` 启发式（rev3 已核对 1833 条零冲突，沿用）。
- CSS：派发摘要的三处修复不涉及 CSS，本轮未重采 `getComputedStyle`（沿用前几轮证据）；已按源码核对其自洽性：`.adl-about-dialog` 为 flex column（`about-settings.css:142-146`）、body `min-height:0` + `overflow-y:auto`（`:204-207`）、`__foot` `flex-shrink:0`（`:213-217`），footer 不随正文滚动成立。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；本轮零问题。
