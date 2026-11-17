# 事项 2「并排模式滚动抽搐/不同步」— 定向复核报告（rev7）

## 范围

只读 rev7 快照（`manifest-rev7.md` + `.review-diffs/*-rev7.diff`），未运行 `git`、未改源码、未跑测试套件、未启动 dev server（无端口占用、无残留进程）。核对对象（rev5 遗留 4 项）：

- `docs/superpowers/specs/2026-11-17-changes-panel-git-and-preview-design.md:26`（§2 目标）
- `docs/root-cause-to-close/2026-11/progress-2026-11-17-102757.md:68`（P5 台账）
- `adlo/frontend/src/app/features/diff-viewer/scrollSync.test.ts:171,180`（夹取用例注释）
- `adlo/frontend/src/app/features/diff-viewer/scrollSync.ts:19-20,51-52` 与 `progress:26`（顶端措辞）

快照事实：rev7 共 84 个快照，与 rev6 相比仅 4 个文件有变化（`git_helpers.rs`、`git_staging_all.rs`、`dev/previewWorkspaceService/git.ts`、`gitStagingAll.test.ts`），全在 Git 菜单范围；本 scope 的 4 个文件 rev7 与 rev6 **字节相同**（SHA256 一致），即 rev6 落地的修复在 rev7 原样保留。

## 上轮问题关闭情况

| # | rev5 项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | spec §2 仍用已废弃术语「意图锁」 | **已关闭** | `spec:26` 现为「并排滚动改为**滚动所有权** + rAF 合并 + 底部硬对齐，消除回环抖动与延迟」；rev7 全部快照 grep「意图锁」0 命中。§4 `:97-99` 仍完整描述程序写入识别/所有权/rAF/首尾对齐，§2 与 §4 无矛盾（§2 为目标摘要）。 |
| 2 | progress P5 仍称文档项「已在 rev2 前修正」 | **已关闭** | `progress:68` 现为「（R1 报告的文档项已在 **R1 复核轮** 按实现修正；P5 仍需逐类表态与三目录同步）」；「rev2 前」0 命中，术语与同文件 P4 的 R1/复核轮结构一致。 |
| 3 | 夹取用例注释「期望 300」错误 | **已关闭** | `test:180` 现为「回显值 100 ≠ 期望 **450**；按回读实际值归因才会吞掉，否则会把 A 拽走」。与几何一致：A `450/900`、B max `900` → 计算值 450，被 `maxTop: 100` 夹到 100；与已修正的 `:171`「目标侧几何声称能到 900」同源。「期望 300」0 命中。 |
| 4 | 顶端分支删除后模块注释/progress 仍称「顶部直接写 0」 | **已关闭** | `scrollSync.ts:19-20` 现为「首尾对齐：源侧在底部（含 1px 平台）时直接写目标最大值；顶部由比例映射自然得到 0，其余按比例换算」；`:51-52` 同义；`progress:26` 为「底部硬对齐（顶部由比例映射自然得 0）」；`spec:99-100` 一致。全快照 grep「顶部\|首尾」仅 7 处，均为新措辞，无「源在顶/底直接写 0」残留。 |

## 新增发现

无。补充核查（均不构成需修复）：

- **代码行为与 rev5 一致**（rev7 未改实现）：`computeAlignedScrollTop` 仍为「无溢出→0；源 ≥ max−1px → targetMax；否则 clamp 后比例」；`consumeOwnWrite` 先清 `pendingWrite` 再按 `SCROLL_EPSILON + 1`（2px）判归因；未命中即立即夺取 owner；rAF 回调内读 owner（同帧以最后一侧为准）；`detach` 取消帧并清 `pendingWrite`/`owner`。
- **删除性推演（回归保护仍有效）**：删 `scrollSync.ts:59-61` 底部平台分支 → `test:117-122`（899.5 期望 300，比例会得 299.83）变红；删 `consumeOwnWrite` → `test:168-185`（`a.writes.top` 必须 0）与 `test:203-229`（打断顺序后保持 345）变红；把 schedule 改成捕获当时侧别而非帧内读 owner → `test:187-201` 变红。
- **接线未变**：`SideBySideDiffViewer` rev7 仍 `createScrollSync(mv.a.scrollDOM, mv.b.scrollDOM)` + `attach()` / 清理时 `detach()`，旧 `syncing` 布尔锁已不存在；`cmScrollSync` 对 merge-view 对侧的横向直写仍为删除态（横向并入控制器），与 spec §4 `:100` 一致。
- **术语一致性**：spec/test 用「首尾硬对齐」、模块注释用「底部硬对齐」，指向同一机制（顶部由比例自然归零），不构成事实冲突。

## 记录不修

1. `progress:64`「R1 rev1–rev4 结论：四路审查共 3 轮完整派发 + 1 轮定向复核；rev4 定向复核遗留的 3 项…」—— rev5/rev6/rev7 的定向复核轮未计入此句。该句明确限定「rev1–rev4 结论」，而在 rev1–rev4 期间确为 3 轮完整派发 + 1 轮定向复核，故非错误陈述；若台账继续延长可再改「+ 后续定向复核」。
2. `spec:26` 目标句只列「滚动所有权 + rAF 合并 + 底部硬对齐」，未列 `§4:97` 的「程序写入识别」。§2 是目标摘要、§4 是机制真源，二者不矛盾，保留精简措辞。

## 结论

- rev5 的 4 项全部关闭，无未关闭子项。
- rev7 相对 rev6 在本 scope 无任何改动，未见新回归、新文档漂移或新注释错误；medium/high/critical 0，low 0。
- 本轮零问题。

需修复项：0
