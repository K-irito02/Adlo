---
description: Project rules index — this directory holds the rule texts; the rules system overview, inventory and change protocol live in the repo-root RULES.md
alwaysApply: true
---

# 项目规则索引

本目录 `.agents/rules/` 是规则的**真源**，存放具体规则条文（每条规则一个文件，独立引用）。

规则系统的说明——分层定位与优先级、三目录同步、文件命名与 frontmatter 规范、加载机制、全部规则清单、新增 / 修改 / 删除流程、变更类型与规则文件对照——统一维护在仓库根 [RULES.md](../../RULES.md)，本索引不重复描述。

| 项目 | 说明 |
|------|------|
| 真源 | `.agents/rules/`（本目录，唯一编辑入口） |
| 同步备份 | `.opencode/rules/`、`.trae/rules/`（改完即同步，`diff -r` 校验） |
| 新增 / 修改 / 删除 | 按 [RULES.md](../../RULES.md)「新增 / 修改 / 删除规则」执行，并在其「规则清单」登记 |
| 加载方式 | 由各文件 frontmatter 的 `alwaysApply` / `globs` 决定，无需人工挑选 |

## 相关文件

- [RULES.md](../../RULES.md) — 规则系统说明与规则清单
- [AGENTS.md](../../AGENTS.md) — 治理总纲、禁止项摘要
- [SKILLS.md](../../SKILLS.md) — 技能系统
