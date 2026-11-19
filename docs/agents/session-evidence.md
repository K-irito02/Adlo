# 会话证据来源（Retro / 收尾排查）

> 供 `retro` 与 `root-cause-to-close` 使用。本机 harness 不保证保留可检索的消息转录，结论必须能由磁盘证据复核；**找不到转录不是阻塞项**。

## 可用来源（按可信度）

| 来源 | 路径 | 内容 | 生命周期 |
| --- | --- | --- | --- |
| 进度文件 | `docs/root-cause-to-close/YYYY-MM/progress-*.md` | 决策、根因、命令与验证计数、P5/P6 结论 | 永久（入库） |
| 审查报告 | `docs/root-cause-to-close/YYYY-MM/reviews/<progress-stem>/` | R1/R2 最终轮结论与「需修复项」 | 永久（入库） |
| Shell 工具输出 | `~/.local/share/opencode/shell/<project-hash>/*.out` | 每次命令的原样输出（门禁计数、失败堆栈、探针 JSON） | 本机；被杀掉/中止的命令可能不落盘 |
| 门禁日志 | `$env:TEMP\adl-*.log`（本仓约定） | 长门禁的完整输出（`> log 2>&1` 后读 tail） | 临时 |
| 应用日志 | `<repo>/.adl-logs/`、`adlo/.adl-logs/`、`adlo/.run-logs/` | 运行时 ERROR / WARN（见日志协议） | 7 天内 |
| 审查快照 | `.review-diffs/` | 当轮 diff / manifest / claims | P6 删除（报告已归档） |

## 工作方式

1. 先读进度文件：事项、状态、根因、验证块、P5 台账、清理与提交记录都在那里。
2. 需要复核计数、失败原因或工具行为时，读对应的 shell 输出 / 门禁日志 / 应用日志，**不要凭记忆**。
3. 消息转录缺失时，用「进度文件 + 审查报告 + 命令输出」重建时间线；只存在于对话里的关键决定，补写进进度文件（唯一真源）。
4. 引用日志/抓包前按脱敏红线处理（密钥、token → `<REDACTED>`），只摘承载信号的行。

## 相关

- [domain.md](./domain.md) — 领域词表与 ADR 的读取约定
- [commands.md](../../.agents/rules/commands.md#测试命令) — 长门禁的正确执行方式（落盘后读 tail）
- 技能 `retro`、`root-cause-to-close`
