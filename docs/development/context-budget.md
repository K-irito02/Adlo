# 上下文预算治理（Context Budget）

> 本文档记录本仓库「agent 启动时自动注入的上下文」的构成、实测体积、瘦身后的预算上限，以及防止再次膨胀的门禁（`check:context-budget`）。
> 相关：[RULES.md](../../RULES.md)、[SKILLS.md](../../SKILLS.md)、[adlo/scripts/check-context-budget.mjs](../../adlo/scripts/check-context-budget.mjs)。

## 1. 两种注入机制（谁为哪些内容买单）

| 端 | 自动注入内容 | 说明 |
|----|--------------|------|
| OpenCode | 根 `AGENTS.md` + 子目录最近一层 `AGENTS.md`（`adlo/AGENTS.md`）+ skills 索引（skill 名 + description，约 9.5K 字符） | `.agents/rules/*.md` **不进入** OpenCode 上下文；`alwaysApply` 对 OpenCode 无效 |
| Trae | 同上 + **所有 `alwaysApply: true` 规则** + 命中 `globs` 的规则 | `alwaysApply: true` 每次会话常驻注入 |

因此治理分两层：`AGENTS.md` 双文件体积（所有端），`alwaysApply` 规则总量（Trae）。

## 2. 瘦身前后实测（2026-11-09，单位字节）

| 项 | 瘦身前 | 瘦身后 | 说明 |
|----|--------|--------|------|
| 根 `AGENTS.md` | 14,095 | **9,184** | §磁盘空间去重、禁止项分「自动校验/判断」两组、编码规范表移走、相关文档压缩 |
| `adlo/AGENTS.md` | 19,642 | **9,229** | 存储实现细节迁出至 [storage-locations.md](../architecture/core/storage-locations.md)；Stores 树删为摘要；磁盘章节压缩 |
| alwaysApply 规则 | 9 条 / 65,860 | **7 条 / 42,845** | `commands.md` 与 `multi-dimensional-architecture-design.md` 改为 `globs: adlo/**` 命中才注入；`mandatory-testing.md` 去重压缩 |
| 项目自建技能 SKILL.md（8 个） | 150,445 | **150,445**（未改动） | 纳入门禁约束 |

> 存储实现细节迁出后，`adlo/AGENTS.md` 不再承载 Plan A/B/C 的机制说明；引用处已改为指向 storage-locations.md。

## 3. 预算与只降不升纪律

`check:context-budget`（`adlo/scripts/check-context-budget.mjs`）在 `check:repo` 中执行，fail 即阻断合并门禁：

| 预算项 | 上限 | 说明 |
|--------|------|------|
| 根 `AGENTS.md` | 9 KB | OpenCode 每会话注入 |
| `adlo/AGENTS.md` | 13 KB | 实现工作区会话注入 |
| alwaysApply 单文件 | 16 KB | Trae 常驻注入 |
| alwaysApply **总量** | 46 KB | Trae 会话总成本（当前 42.9 KB） |
| 自建技能 SKILL.md 单文件 | 60 KB | 当前最大 52.7 KB（root-cause-to-close） |
| 自建技能 SKILL.md **总量** | 165 KB | 当前 150.4 KB |
| 自建技能 description | 600 字符 | frontmatter 描述（影响 skills 索引体积） |

**只降不升**：预算只许降低。需要提高某项预算时，单独开 PR，在本节说明理由并更新本文档的测量表。

**必需锚点**（门禁同时检查存在性，防止瘦身误删被引用锚点）：根 — `## 禁止项` `## 双端一致性` `## 项目形态` `## 问题排查与调试`；`adlo/AGENTS.md` — `## 调试工具` `## 磁盘空间管理` `## 双端一致性`。

## 4. 「项目自建技能」的判定

判定以 **`SKILLS.md` §4.3 摘要表为唯一真源**（`check-agent-dirs.test.mjs` 已校验该表与 `.agents/skills/` 目录一致）。门禁脚本解析 §4.3 的行，不硬编码技能名单；新增自建技能时更新 §4.3 即自动纳入门禁。第三方技能（Superpowers / Matt Pocock / 其他社区）不检查体积。

## 5. 校验与门禁位置

- `pnpm --dir adlo run check:context-budget` — 直接运行；
- `pnpm --dir adlo run check:repo` — 合并门禁与 pre-push 共用聚合，含本检查；
- `node --test scripts/check-context-budget.test.mjs` — 单元测试（解析逻辑）；本文件纳入 pre-commit 的 `node --test "scripts/*.test.mjs"`；
- 规则/技能目录一致性（三目录镜像）：`node --test scripts/check-agent-dirs.test.mjs`（与本检查正交）。

## 6. 变更记录

| 日期 | 事件 |
|------|------|
| 2026-11-09 | 首次建立本文档与门禁；双根 AGENTS.md 瘦身（14.1/19.6 KB → 9.2/9.2 KB）；`commands.md`、`multi-dimensional-architecture-design.md` 改为 `adlo/**` globs 注入；`mandatory-testing.md` 去重；存储实现迁出至 `docs/architecture/core/storage-locations.md` |
