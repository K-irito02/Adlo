# 技能系统精简与文档真源化（2026-10-24）

## 背景

仓库的技能体系在演进中出现了三类问题：

1. **技能职责重叠**：`closing-workflow`（收尾流程）与 `root-cause-resolution`（根因排查）在同一次会话中常常前后接力，阶段定义、进度文件、文档路径基准反复重复维护。
2. **技能目录三份拷贝**：`.agents/skills/`（真源）、`.opencode/skills/`、`.trae/skills/`，任何单目录改动都会造成漂移。
3. **技能说明散落**：技能来源、目录约定、同步规则分散在 `.agents/rules/README.md` 与多个技能文件里，没有单一真源。

## 处置

### 1. 退役三个技能

| 退役技能 | 去向 |
|----------|------|
| `closing-workflow` | 并入 `root-cause-to-close`（P4 审查 → P5 文档同步 → P6 清理总结） |
| `root-cause-resolution` | 并入 `root-cause-to-close`（P0 调查 → P3 验证） |
| `refactoring-insight` | 无替代技能（架构洞察按需走人工 + 外部调研） |

删除前先用「文件路径 + 内容」二级哈希确认三目录内容完全一致，再统一删除；三目录技能数 31 → 28。

### 2. 归档技能与产物目录

| 归档对象 | 备份位置（仓库外，不随仓库分发） |
|----------|----------------------------------|
| 三个技能的 `SKILL.md` | `E:\AI-DIGITAL-LIFE\Backup\skills\`（哈希校验一致） |
| `docs/closing-workflow/`（119 文件）、`docs/root-cause-resolution/`（169 文件）、`docs/refactoring-insight/`（40 文件） | `E:\AI-DIGITAL-LIFE\Backup\docs\`（整树哈希校验一致） |

### 3. 技能文档单一真源化

技能系统的全部说明集中到仓库根 `SKILLS.md`：来源分类（Superpowers 体系 / 其他社区 / 项目自建）、三目录与同步规则、28 个技能摘要。其它文档只保留索引：

- `.agents/rules/README.md`（同步另两目录）— 技能系统章节压缩为指向 `SKILLS.md` 的一行索引
- `AGENTS.md`、`README.md`、`.agents/rules/project-overview.md` — 增加 `SKILLS.md` 入口
- `docs/development/README.md` — 治理审计指向改为 `SKILLS.md` 中的 `governance-audit`

## 经验

1. **同源三拷贝必须机器校验**：`diff -r` 或「路径 + 哈希」二级哈希，肉眼比对不可靠；删除/同步前先确认一致，避免把分叉内容一起删掉。
2. **删目录前先扫引用**：删除后被引用 15 处，全部是历史文档里的相对链接。做法是**保留正文语义、去掉链接语法**（`` `文件名`（原文已归档） ``），既不改写历史，也不留死链。
3. **产物目录与技能解耦**：技能是流程，`docs/` 下按月归档的是流程产出。技能退役不代表产物必须删除；本次按用户要求一起归档，但两者是独立决策。
4. **索引类文档与历史记录分开处理**：索引/治理文档随真源同步更新；`docs/knowledge-base/`、进度归档等既定事实记录不改写。
5. **数量不写死**：技能数、文件数等统计值容易过期（本次 31 → 28），文档中以「以实际目录为准」表述，并在摘要表旁注明校验方式。
