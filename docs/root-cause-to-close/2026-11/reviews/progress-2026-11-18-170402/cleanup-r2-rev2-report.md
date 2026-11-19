# 清理审查（R2）报告 — rev2

## 范围

- 仓库：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-2`；base `8fc3ee01a`；只看 `manifest-rev6.md`（49 文件）中的 47 个 reviewed 文件，`thirdPartyNotices.generated.ts` / `thirdPartyNoticeNames.generated.ts` 按 manifest 排除、不计 diff 缺失。
- 逐组覆盖（与 R2 rev1 相同）：
  - scripts：`generate-third-party-notices.mjs`、`third-party-notices-lib.mjs`、`third-party-notices.test.mjs`、`review-snapshot.mjs` / `.test.mjs`、`release.mjs`、`dev-tools.test.mjs`、`package.json`。
  - about：`AboutSettings(.test).tsx`、`AboutTextDialog.tsx`、`ThirdPartyNoticesPanel.tsx`、`CreditsPanel.tsx`、`aboutContent.ts`、`issueTracker(.test).ts`、`thirdPartyNoticeData(.test).ts`、`thirdPartyNoticeSearch(.test).ts`、`thirdPartyNotices(.test).ts`、`thirdPartyNoticesTypes.ts`、`thirdPartyNotices.generated.test.ts`、`creditsNames(.test).ts`、`creditsData(.test).ts`（后两者删除）。
  - i18n / 样式 / 文案：`zh-CN/about.ts`、`en-US/about.ts`、`styles/regions/about-settings.css`、`eslint.config.js`、`.prettierignore`、`check-no-cjk-source.mjs`。
  - 文本类：`.agents` / `.opencode` / `.trae` 的 `adlo-release` 技能与 `references/local-signature-verification.md`、`RELEASE-CHECKLIST.md`、`SKILLS.md`。
- 排除：`docs/**`（进度 / ADR / 设计规格）按 P5，不据此判需修复；两个生成物只作为只读输入复算。
- 快照范围核对（非 git）：用 SHA256 比对 rev5/rev6 快照，49 个文件里仅 4 个代码文件（`generate-third-party-notices.mjs`、`third-party-notices-lib.mjs`、`third-party-notices.test.mjs`、`thirdPartyNotices.generated.test.ts`）与 1 个 P5 进度文件有新内容；其余 44 个文件快照逐字节相同，本轮仍按 rev6 全文复核（未复用 rev5 结论做判定）。
- 约束执行：未运行 `git diff/log/show`；未修改源码 / 配置 / 测试；未跑 `check:changed` / 全量 vitest / `cargo test`；未启动 dev server / 浏览器，无端口占用，无后台进程。只读检查如下（未写任何临时脚本）：
  - `node --test adlo/scripts/third-party-notices.test.mjs` → 25 pass / 0 fail（含新增 `generated notices data` 用例）。
  - `prettier --check` 三个脚本文件 → 全部符合（`scripts:format:check` 覆盖范围）。
  - grep 引用：`allowPartial` 仅 `generate:83/818/843` 与 `refusePartialMetadata` 形参；`licenseSimilarity` 仅 `lib.mjs` 内部定义 + `isSameLicenseBody` 调用；`.normalized` 无任何字段读取残留；`isSameLicenseBody` / `normalizedLicenseBody` 的消费方 = `coversLicenseText` + 分解测试。
  - 三份技能镜像 SHA256 一致（`SKILL.md` 三份同哈希；`local-signature-verification.md` 三份同哈希）。
  - 空正文分支推演：`addFileTexts` 在 `refs.push` 前必写 `store[key]`（正文来自 `stripLeadingCopyright(...).body`，源文本 ≥ 20 字符，剥离后为空时回退整段 normalized 正文，必非空）；`addCanonicalTexts` 以 `if (!entry?.text) continue;` 跳过空正文后才写 store 并 push。故 `dedupeRefs` 的 `body.length === 0` 分支在现有调用路径不可达，注释与实现相符。

## 上轮问题关闭情况

- **F1（脚本层死参数与无消费方导出）— 已关闭**
  1. `partialNpmFailure` 已删 `allowPartial` 形参与短路分支（`lib.mjs:327-338` 现只有「缺 0 / offline / registry 不足 / 完整」四条路径）；唯一生产调用点 `generate.mjs:812-815` 同步；JSDoc `lib.mjs:321-326` 改为「是否放行由调用方 `refusePartialMetadata(reason, allowPartial)` 统一决定，这里只负责判定」，与 `generate:817` 的真实放行门一致。测试改为「完整元数据 / 离线 / 部分解析」三条（`test.mjs:246-262`）。
  2. `licenseSimilarity` 已去 `export`（`lib.mjs:350`），仍被 `isSameLicenseBody:400` 调用；全仓无其他引用。
  3. `parseLicenseExpression` 不再返回 `normalized`（`lib.mjs:81-122` 只返回 `ids`/`exceptions`）；四处 `deepEqual` 已同步为完整对象断言（`test.mjs` 的 `parseLicenseExpression` 用例）。因使用 `node:assert/strict` 的严格深比较，字段回潮会直接变红，属有效回归断言。
- **F2（`dedupeRefs` 与 `coversLicenseText` 两份判重实现）— 已关闭**
  - `generate.mjs:561-575` 现为 `kept.some((other) => coversLicenseText(store[other.key] ?? "", body))`，并以显式 `if (body.length === 0) continue;` 取代原 `includes("")` 隐式语义；同段注释说明空正文为不可达防御（推演见上）。
  - 生成器导入表（`generate.mjs:34-51`）已无 `isSameLicenseBody` / `normalizedLicenseBody`，仅保留 `coversLicenseText`。
  - `isSameLicenseBody` 的 JSDoc（`lib.mjs:378-386`）注明「导出供 `coversLicenseText` 的分解测试使用（`normalizedLicenseBody` 同理），生产路径只经 `coversLicenseText`」；核对生产调用图成立（`normalizedLicenseBody` 只被 `isSameLicenseBody` 与 `coversLicenseText` 调用）。rev1 记录的「726 对同包正文、内联式与 `coversLicenseText` 差异 0」仍作为行为等价证据。
- **F3（生成物用例复刻生产算法）— 已关闭**
  - `thirdPartyNotices.generated.test.ts` 内复刻的 `flat` / `words` / `similarity` / `sameBody` 已整段删除，现只剩对生成物的结构与索引断言（1-77 行，无第二份 Dice/阈值实现）。
  - 新增 `test.mjs:9-26,371-390` 的 `generated notices data` 用例：读取提交的生成物（按单行 `export const …` 解析），用生产 `coversLicenseText` 断言「同一包任一前一条正文不覆盖后一条」；标题与断言方向一致，且不再持有独立阈值/归一化副本。

## 新增发现

无。三个修复均按摘要落地，未引入死代码、冗余守卫、调试日志或多余导出面；4 个变更文件的相邻注释与最终实现逐句相符（含 `dedupeRefs` 两处绝对断言，均可由调用路径证明）。

## 记录不修

- `ThirdPartyNoticesPanel.tsx:56` 的 `adl-about-notice--dependency` 在全仓 CSS 中无对应规则，仅作分组/测试选择器（`AboutSettings.test.tsx` 两处 `querySelector`）。删改需同步测试且不影响行为，保留。
- `aboutContent.ts:9` 的 `ABOUT_URLS.website` 仍无消费方，而 `RELEASE-CHECKLIST.md` 第 2 节仍要求核对「关于」页网站链接（页面实际只有 GitHub / Gitee / 问题反馈）。预存不一致，rev1 已记，建议 P2 二选一。
- rev1 记录的可选收窄仍保持原状、本轮不改：`IssueTrackerCandidate` 单字段类型、`creditsNames.ts:10` 仅为测试遍历的 `export`、`thirdPartyNoticeSearch.ts:4/6` 与 `thirdPartyNoticesTypes.ts:39`、`thirdPartyNotices.ts:85` 的契约类型导出、`creditsNames.test.ts:24-28` 的蕴含用例、`AboutTextDialog.tsx:60` 恒真的 `summary:not([aria-disabled="true"])`。
- `generate.mjs:835` 的 `pkg.licenseIds ?? []` 恒不触发（`buildPackageRecord` 必写 `licenseIds`），属边界防御，维持不修。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题。
