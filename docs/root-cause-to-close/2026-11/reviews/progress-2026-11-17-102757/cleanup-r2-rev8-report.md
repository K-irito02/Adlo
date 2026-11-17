# R2「清理」定向复核 — rev8 报告

> 只读审查：未运行 `git`、未改源码/配置、未跑测试套件、未启动 dev server（无端口、无残留进程）。
> 依据：`.review-diffs/manifest-rev8.md`（base `afd628c1`，85 files）、rev8 快照，以及工作区当前源码（`read`/`grep`）。
> 本轮只复核 rev7 R2 遗留的 4 项，并回扫 rev8 全量快照的死代码/文档漂移。

## 范围

- 定向项：`workspace_git.rs` 必填 `workspacePath` 三份实现、`previewMediaWiring.test.ts` 两条弱断言、`diffTierForPreview` 无外部消费且表述不准、术语未登记。
- rev8 相对 rev7 的实质变更（按快照内容比对）：`workspace_git.rs`、`heavyPreviewLimits.ts`、`previewMediaWiring.test.ts`、spec §3.2、progress、knowledge-base 文案，新增 `GLOSSARY.md`；其余快照未变（`workspace_git_all.rs` 等仅内容相同、尺寸一致）。
- 未实跑测试；有效性判断用「删除该修复后哪条断言/分支会变红」的删除性推演。

## 上轮问题关闭情况

| # | rev7 R2 项 | 状态 | 复核证据 |
| --- | --- | --- | --- |
| F1 | medium：`workspacePath` 必填约束三份实现且空白串语义分歧 | **已关闭** | `handlers/workspace_git.rs:59-64` 抽出私有 `require_workspace_path`（`trim().is_empty()` → `InvalidInput("workspacePath is required")`）；初始化 `:78`、全量/远程批量 `run_git_repo_op:329`、提交 `git_commit:393` 三处共用。全文件仅剩 1 处 `"workspacePath is required"`（`:63`），无第二份解析。回归：`tests/workspace_git_all.rs:74-91`（init 缺 path→400 且不动活动工作区）、`:504-541`（5 个批量端点 + commit 缺 path 全 400，untracked 未被 discard-all 误删）。空白串由 helper 同一 `trim` 分支保证 400。 |
| F2 | low：`previewMediaWiring.test.ts` 两条无行为价值断言 | **已关闭** | rev7 的 34 行文件降为 18 行：删除 `filePreview.not.toContain('PreviewExternalActions')` 与 `generalActions.toContain('clearedChangePreviewState()')` 两个 `it` 块（rev7 `:31-33`、`:37-39`），同时去掉对应的 `readFileSync` 常量。保留的用例只断言重试落点（`resolvePreviewOwner(...)`/`openChangePreviewForWorkspace(owner.root, previewPath)`）与 `selectedChangePreviewWorkspaceId === undefined` 守卫；导入无残留。`cacheHelpers.test.ts:11-21` 仍以 `toEqual` 锁清空字段，无覆盖缺口。 |
| F3 | low：`diffTierForPreview` 无外部消费且文档表述不准 | **已关闭** | 全仓 `grep diffTierForPreview` **0 命中**；`heavyPreviewLimits.ts:65-68` 的 `shouldSkipChangeOutline` 直接 `classifyDiffTier(profileDiffCost(...)) === 'heavy'`，面板仍走 `DiffEditorSection.tsx:110` 的 `classifyDiffTier(costProfile)`，两侧同源同一对纯函数。消费方：`useChangesFilters.ts:100`；三元语义由 `diffCost.test.ts:34-42` 锁定。文档同步到位：`docs/knowledge-base/multi-workspace/large-file-diff-degradation-2026-10-14.md:54`、`progress-2026-11-17-102757.md:49`、spec §3.2 `:54-56` 均只写 `classifyDiffTier`/`shouldSkipChangeOutline`，无旧名残留。 |
| F4 | low：术语「代价分档」未登记 `GLOSSARY.md` | **已关闭** | `GLOSSARY.md:277-279` 新增 `**差异代价分档 (Diff Cost Tier)**`，正文与实现一致（light 全功能 / degraded 关行内高亮与 fold 轮询 / heavy 确认门 + plain 双栏并跳过 ranges/大纲）；`_Avoid_` 词（大文件阈值、体积门指代三档、重型标记）在 i18n、`docs/operations`、`docs/architecture` 均无使用，不触发 `check:glossary` 反例。 |

## 新增发现

- **需修复：无。** 4 项均按建议关闭，且未引入新导出、新状态或新分支：`require_workspace_path` 为私有且 3 处调用；删除 `diffTierForPreview` 后无悬空引用；rev8 未新增未消费的运行时符号。
- rev8 全量快照回扫：`grep diffTierForPreview` 0 命中；`isHeavyDiffContent` 仅存在于 2026-10 的历史段落与旧进度归档（rev7 已记录为历史保留），不构成本轮漂移。

## 记录不修（可选/风格/已记录）

1. `GLOSSARY.md:277` 的「差异代价分档」放在 `### 区域与标签` 段（紧邻「标签溢出」），概念归属更接近「文件预览」或「工作区与变更」；纯组织问题，术语内容准确，不影响检索与 `check:glossary`。
2. spec §9 `:172` 仍写着「`GLOSSARY.md` 新增『代价分档』『浏览器兜底入口』等术语（若确为稳定概念）」——这是文档同步清单的计划语气，不是「未完成」事实断言；其中「代价分档」已完成，「浏览器兜底入口」未登记属既有范围（非本轮 F4 要求）。
3. 空白串 `workspacePath` 无独立用例（现有用例只覆盖缺键）；行为由 `require_workspace_path` 的同一 `trim` 分支保证，建议后续补一条 `"   "` 的 400 用例即可。
4. `DiffCostTier` 类型导出无外部 import（仅作 `classifyDiffTier` 返回类型）；无运行时体积，且 spec §3.2 将其列为公开 API，属有意导出，非本轮新增。
5. `docs/operations/ui-manual/rightpanel/tools/changes.md` 代码块后仍有 1 个多余空行（rev7 记录项 12，本轮未触碰）。
6. `heavyDegradation.test.ts` 的 `costTier === 'heavy'` 出现次数断言（rev4/rev5/rev7 已记录的脆性计数）未变化，仍属已接受项。

## 结论

- 上轮 4 项全部关闭（1 medium + 3 low），无新死代码；rev8 快照无需要修复的文档漂移。
- 本轮零问题。

需修复项：0
