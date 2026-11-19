# notices / release-integration R1 复审报告 — rev5

## 范围

- 快照：`.review-diffs/*-rev5.diff`（base `8fc3ee01a`，rev5）＋工作区源码只读；未运行 `git diff/log/show`，未修改源码/配置/测试，只写本报告与 `.review-diffs/tmp/rev5-recompute.mjs`。
- 逐行审查：`adlo/scripts/generate-third-party-notices.mjs`、`third-party-notices-lib.mjs`、`third-party-notices.test.mjs`、`adlo/frontend/src/app/features/about/thirdPartyNotices.generated.test.ts`、`thirdPartyNotices.test.ts`、`thirdPartyNoticeData(.test).ts`、`thirdPartyNoticeSearch(.test).ts`、`thirdPartyNoticesTypes.ts`、`ThirdPartyNoticesPanel.tsx`、`AboutSettings(.test).tsx`、`CreditsPanel.tsx`、`creditsNames(.test).ts`、`i18n/{en-US,zh-CN}/about.ts`、`adlo/package.json`、`release.mjs`、`review-snapshot(.test).mjs`、`dev-tools.test.mjs`、`data/{spdx-license-texts,npm-license-cache}.json`、`eslint.config.js` / `.prettierignore` / `check-no-cjk-source.mjs`。
- 生成物 `thirdPartyNotices.generated.ts` / `thirdPartyNoticeNames.generated.ts` 按 manifest 不审 diff；用只读脚本对磁盘生成物复算。
- 实跑（非测试套件）：`node scripts/generate-third-party-notices.mjs --check --offline` → `notices are up to date`；`node --test scripts/third-party-notices.test.mjs` → 24 pass；`pnpm run scripts:format:check` → `All matched files use Prettier code style!`。未启动 dev server / 浏览器，未占用端口，无后台进程。
- `claims-ack-rev5.md` 两条绝对断言（锁文件是包清单唯一真源）逐条核对：`buildCargoPackages(cargoLock, …)` / `buildNpmPackages(npmLock, …)` 只遍历锁文件数组，metadata/store 仅补 license/repository/homepage，不新增条目；成立。
- 复算（`.review-diffs/tmp/rev5-recompute.mjs`）：1833 包（npm 1146 / cargo 687），218 份正文，悬空 ref 0、`texts` 空但 `textSource≠none` 0；当前数据按新 `sameBody` 的重复对 **0**。

## 上轮问题关闭情况

- **F1（canonical-only 文案写成「没有许可文件」）— 已关闭。** zh 改为「上游未随包提供许可正文，以下为标准许可正文。」、en 改为 `Upstream does not bundle the license text; the standard license text is shown below.`；`AboutSettings.test.tsx:200` mock 与 `:504` 断言同步。全仓 grep 旧文案「未随包提供许可文件 / does not bundle a license file」已无残留；对 `LICENSE.spdx` 被当元数据跳过、只有正文缺失的 `@tauri-apps/plugin-log|plugin-shell` 场景，新文案与事实一致。删除性推演：把文案改回旧句，`:504` 必红。
- **F2（回归保护缺口）— 已关闭。**
  - 合集用例（`third-party-notices.test.mjs:312-329`）：复算 `normalizedLicenseBody(body)/collection = 0.4912 < 0.85`、`isSameLicenseBody(collection, body) = false`（Dice 0.6667）、`coversLicenseText(collection, body) = true`；删掉 `coversLicenseText` 的 `source.includes(canonical)` 分支后回退到 `isSameLicenseBody` 为 false，用例必红。
  - 生成物用例（`thirdPartyNotices.generated.test.ts:103-114`）：`sameBody` 改为按 refs 顺序的「左侧无条件包含右侧，或 Dice ≥ 0.95」，与 `dedupeRefs` 的「前一条包含后一条」同向。当前数据 0 对重复；模拟「同时删掉 `coversLicenseText` 与 `dedupeRefs` 的包含分支」后，按实际生成数据可多出 7 条 canonical ref（`aws-lc-sys` Apache-2.0/BSD-3-Clause、`dom_query` MIT、`fs.realpath` ISC、`pathe` MIT、`ring` Apache-2.0、`rolldown` MIT），新 `sameBody` **7/7 判红**。与 rev4 的 8 组相比少 `crossbeam-channel`：其 `LICENSE-APACHE` 正文指纹已命中标准正文，ref key 直接是 `spdx:Apache-2.0`，不会追加第二条，保护没有缺口。该用例锁的是已提交生成物，`notices:check`/`release:build` 负责生成物与生成器一致，二者组合可覆盖「改了生成器但忘重新生成」和「重新生成后留下重复」两种情况。
  - 混源 note（`AboutSettings.test.tsx:518`）：断言 `mixedNote.textContent` 含「该许可证的正文」；把面板改回 canonical-only 键时该串不出现，必红。反向也成立：canonical-only 断言串不在 mixed 文案内，两个分支不会互相冒充。
- **F3（注释按旧「等价」口径）— 已关闭。** `gen:584`「完整正文出现在随包文件里即算覆盖」、`gen:657-659`「覆盖判定允许标题/附加说明（完整正文被包含即可）」、`lib:385-390`「近似等长包含（短者 ≥ 长者 85%）或词袋相似度 ≥ 0.95；合集由 `coversLicenseText` 显式包含覆盖」、`lib:402-403`「完整正文被包含（可带附加说明/出处注记），或同一份正文」均与 `lib:391-421` 实现逐句相符；覆盖路径已无旧「等价」措辞残留（`gen:598` 的「等价」指指纹完全相等，属实）。

## 新增发现

无。

## 记录不修

- 来源说明的分支互斥只有部分断言：现有用例覆盖「随包原文无 note」（`LICENSE-MIT`）与「混源 ref 有 mixed note」，但没有断言「canonical-only 包不得再出现混源说明」。移除 `NoticeTextBlocks` 的 `pkg.textSource === 'package'` 守卫时，`delta` 会同时出现两条说明，而 `AboutSettings.test.tsx` 仍全绿（canonical 断言只查文案存在）。当前实现正确，属可选加固（在 canonical 用例里断言 `delta` 的 `.adl-about-notices__note` 数量/文案即可）；不阻塞本轮。
- rev4 已记录的既有保留项（生成物用例自复刻 Dice 且未做 `stripLeadingCopyright`；`dedupeRefs` 注释在指纹命中标准正文时不严格；`siphasher` 的 COPYING 指针照录；`--refresh-spdx` 部分失败先写盘再抛错；生成依赖本机 `node_modules`/cargo registry）本轮未变化，沿用不重开。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题
