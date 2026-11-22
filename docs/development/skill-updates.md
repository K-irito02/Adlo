# 技能更新与三目录同步（skills-sync）

> 入口：`pnpm --dir adlo run skills:<command> -- [options]`
> 脚本：`adlo/scripts/skills-sync.mjs`
> 真源：`.agents/skills/`；镜像：`.opencode/skills/`、`.trae/skills/`
> Manifest：`.agents/.skill-lock.json`（每个第三方技能的上游仓库、路径与 tree hash）
> 本地补丁：`adlo/skills-overlays/<skill>/*.overlay`

## 命令

| 命令 | 作用 |
|------|------|
| `skills:audit` | 浅克隆上游到临时缓存，逐技能比较文件差异与 overlay 状态 |
| `skills:apply -- --all` | 从上游刷新技能，应用本地 overlay，然后依次 mirror / lock / docs / verify |
| `skills:mirror -- --all` | 把 `.agents/skills` 同步到两个镜像；`--check` 只比对 |
| `skills:lock` | 用上游 `git rev-parse HEAD:<skillPath>` 刷新 lock 哈希；`--check` 只报告漂移 |
| `skills:docs` | 刷新 `SKILLS.md` 的计数、§4 标题、调用名与缺失行；`--check` 只报告 |
| `skills:verify` | 跑 `check-agent-dirs` 与 `git diff --check` |
| `skills:update` | `apply --all` 的快捷入口（含 mirror / lock / docs / verify） |

通用选项：`--skill <name>`（可重复/逗号分隔）、`--all`、`--dry-run`、`--check`、`--prune`、`--batch-size <n>`、`--pause-ms <n>`、`--skip-mirror/lock/docs/verify`。

## 典型流程

1. `pnpm --dir adlo run skills:audit`，确认哪些技能有上游变化、哪些本地 overlay 已应用。
2. 需要更新时跑 `skills:apply -- --all`（或 `--skill <name>`）；先用 `--dry-run` 可只看计划。
3. `skills:verify` 必须通过；`check-agent-dirs` 仍是三目录一致性的最终门禁。
4. `SKILLS.md` 的计数/调用名/缺失行由 `skills:docs` 维护；中文摘要仍按 `writing-for-agents` 的措辞人工打磨。

## 大目录与分批

- 复制按 `--batch-size`（默认 100 文件）与 `--pause-ms`（默认 10ms）分批，避免一次写入 1600+ 文件导致 watcher / server 重启。
- 上游 clone 默认在操作系统临时目录（`adlo-skills-cache`），**不要**放进 `adlo/`；需要固定位置时用 `ADL_SKILLS_CACHE` 指向仓库外路径。
- `taste-skill` 含 1600+ 个资源文件；更新后优先跑 `skills:mirror -- --all --check`，再正式同步。

## 本地 overlay

每个 overlay 是纯文本，格式：

```
target: SKILL.md
note: 为什么需要这条本地补丁
---FIND---
上游文件中的唯一锚点
---REPLACE---
替换后的内容（包含锚点）
---END---
```

`skills:apply` 在复制上游后按文件名顺序应用；如果 `REPLACE` 已在文件中则跳过（幂等），锚点命中数不为 1 时直接失败。新增本地补丁时同时写 overlay，避免下次更新丢失。

## 边界

- 第三方技能的注释/兼容措辞不参与产品代码门禁；判定见 `adlo/scripts/third-party-skills.mjs`，技能一致性仍由 `check-agent-dirs` 与 `check-context-budget` 治理。
- `.agents/.skill-lock.json` 只登记第三方技能；项目自建技能是目录中不在 lock 里的那些。
