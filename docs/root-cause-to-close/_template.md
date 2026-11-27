# 进度 — YYYY-MM-DD HH:mm:ss

> 用法：复制本文件到 `docs/root-cause-to-close/YYYY-MM/progress-YYYY-MM-DD-HHmmss.md`。
> 数字只从命令输出复制；手算 / 记忆都不算来源。每轮结论原地替换旧文案，只保留一份当前状态。
> 状态值：`待处理 → 进行中 → 待用户确认 → 已完成`；`已完成` 只在用户确认已解决后标记。
> 每轮 grilling 的已定决策写进对应事项的「决策」行（含理由）。

- P3→P4 用户批准：<是（YYYY-MM-DD）| 不需要（用户已明确授权直接收尾）>

## [ ] 事项 1：<简述>

- 状态：待处理 | 类型：解决 / 优化 / 调整 | 流程：本技能 P0–P6
- 决策（grilling 已定）：
- 根因：
- 修复：
- 验证：
  - 触发方式：A（自动化）/ B（用户当手）
  - 命令：
  - 输出汇总行（原样粘贴，勿改写）：
  - 时间：
- 失败迭代：0
- 审查报告（P6 归档到 `reviews/<progress-stem>/`）：
  - R1 rev1：`<scope>-r1-rev1-report.md`（需修复 N：critical / high / medium / low）
  - R1 rev2：…
  - R2 revN：…
  - 记录不修：…

## [ ] 事项 2：<简述>

- 状态：待处理 | 类型：解决 / 优化 / 调整 | 流程：本技能 P0–P6
- 决策（grilling 已定）：
- 根因：
- 修复：
- 验证：
  - 触发方式：A（自动化）/ B（用户当手）
  - 命令：
  - 输出汇总行（原样粘贴，勿改写）：
  - 时间：
- 失败迭代：0
- 审查报告（P6 归档到 `reviews/<progress-stem>/`）：
  - R1 rev1：…
  - R2 revN：…
  - 记录不修：…

## P4 审查

- rev 快照：`.review-diffs/manifest-rev<N>.md`（files / commits / base）
- R1：`<scope>` rev<N>（需修复 N）→ 修复 → 复审 rev<N+1> …；全部 scope 零问题
- R2：`<scope>` rev<N>（需修复 N）→ 修复 → 复审 rev<N+1> …；全部 scope 零问题
- `check-review-gate --phase exit`：OK / 阻塞原因
- 最终门禁：`check:changed`（files / tests）＋ Rust fmt/clippy/lib

## P5 文档同步（10 类表态）

| 类别 | 表态 | 落点 |
| --- | --- | --- |
| 规则 | 需要 / 无需 | |
| 技能 | 需要 / 无需 | |
| 治理 | 需要 / 无需 | |
| 领域模型 | 需要 / 无需 | |
| 根文档 | 需要 / 无需 | |
| 架构 / 开发 / 分析 | 需要 / 无需 | |
| 设计 / 运维 | 需要 / 无需 | |
| 沉淀 | 需要 / 无需 | |
| 工程基线 | 需要 / 无需 | |
| 本技能归档 | 需要 / 无需 | |

## P5 待办台账（P4 发现、留待 P5）

| 来源 | 文件:行 | 修法 | 状态   |
| ---- | ------- | ---- | ------ |
| F1   |         |      | 待处理 |

## P6 清理与提交

- 审查报告归档：`node adlo/scripts/archive-review-reports.mjs --progress <progress.md>`；`check-review-gate --phase p6` OK
- 快照 / 临时日志 / 探针产物：已清理项与保留项
- 提交：`<subject>`（本地未推送；最终 hash 只在会话总结中报告）
