---
name: governance-audit
description: Audits project governance docs (rules, AGENTS.md, README.md, root governance docs, engineering baseline, docs content dirs); reports findings, fixes after user approval. Invoke when asked to review, inspect, check, clean up, or improve these files.
---

# 治理文档审计

系统化审计项目治理文档——**规则文件**、**AGENTS.md**、**README.md**、**根治理文档（Tier 1）**、**内容目录（Tier 2，治理一致性）**、**工程基线（Tier 3，一致性校验）**——按**一致性、真实性、规范性、合理性、清晰性、无冗余、必要性**七个维度检查，发现问题后修改、补充、重写，必要时创建或删除。

**核心原则：先同步，后审计；先报告，后修改。** 三目录未一致前，任何结论都可能基于错误副本；修复前须经用户确认。

---

## 何时使用 / 不使用

**使用**：
- 要求审视 / 检查 / 审阅 / 清理 / 规范化规则文件、AGENTS.md、README.md、根治理文档、内容目录、工程基线
- 发现治理文档间内容矛盾、过时，或与代码库实际状态不符
- 要求保证三规则目录（`.agents/rules/`、`.opencode/rules/`、`.trae/rules/`）一致
- 要求保证三技能目录（`.agents/skills/`、`.opencode/skills/`、`.trae/skills/`）一致（技能真源 `.agents/skills/`）

**不使用**：审计代码或其他文档（改用 `refactoring-insight` / `documentation-organizer`）；用户明确要求只看不改（仅出报告，不修复）。

---

## 审计范围（固定清单）

| 类别 | 文件 | 路径 | 审计深度 |
|------|------|------|----------|
| 规则文件 | 全部 `*.md` | `.agents/rules/`（真源，同步后仅审计此目录） | 七维全量 |
| AGENTS.md | 根目录 / 实现工作区 | `AGENTS.md`、`ai-digital-life/AGENTS.md` | 七维全量 |
| README.md | 根目录 / 实现工作区 | `README.md`、`ai-digital-life/README.md` | 七维全量 |
| 根治理文档（Tier 1） | `CONTEXT.md`、`CONTRIBUTING.md`、`ai-digital-life/CONTRIBUTING.md`、`SECURITY.md`、`FUTURE-ROADMAP.md`、`docs/development/project-engineering-constraints.md` | 见路径 | 七维全量 |
| 内容目录（Tier 2） | 全部 `*.md`（共约 81 个） | `docs/analysis/`、`docs/architecture/`、`docs/design-system/`、`docs/development/`、`docs/operations/` | 治理一致性：目录定位句 + 索引完整 + 内部链接有效 + 阶段表述/数字/术语与治理真源一致 + 跨目录去重（重叠处以 rules 为准交叉引用）；不要求 frontmatter，不做逐文件全文七维 |
| 工程基线（Tier 3） | CI 门禁 `quality-gates.yml`；Tauri 基线 `capabilities/*.json`、`tauri.conf.json`；构建基线 `.cargo/config.toml`、`clippy.toml`、`rustfmt.toml`、`.editorconfig` | `.github/workflows/quality-gates.yml`、`ai-digital-life/src-tauri/capabilities/`、`ai-digital-life/src-tauri/tauri.conf.json`、`ai-digital-life/.cargo/config.toml` 及同级 lint/格式配置 | 一致性校验：只核对被规则引用的关键字段（命令清单、 capability 通配、CSP/`withGlobalTauri`、lint 基线），不做全文七维 |

> 其他路径的同名 `AGENTS.md`/`README.md` 不在审计范围；用户指定路径以用户为准。`docs/knowledge-base/` 索引及 `docs/plans/`、`docs/specs/`、`docs/superpowers/`、`docs/closing-workflow/` 等时序产物目录暂不纳入。

---

## 执行流程

> 总览：① 同步三目录 → ② 七维审计 → ③ 诊断报告（等确认）→ ④ 修复 → ⑤ 重新同步验证

### 阶段 1：三目录一致性检查与同步（先决条件）

阅读任何规则内容前，先确保三规则目录一致：

1. **清单比对**：对比三目录 `*.md` 清单（Glob/LS），检查**缺失** / **多余** / **同名漂移**
2. **哈希比对**：对同名文件计算哈希，定位内容漂移（见"快速参考"）
3. **同步方向**：

   | 目录 | 角色 |
   |------|------|
   | `.agents/rules/` | 真源（修改入口） |
   | `.opencode/rules/`、`.trae/rules/` | 同步副本 |

   - 缺失/漂移 → 从真源复制到副本
   - 副本多出真源没有的文件 → 人工核对：正确则补入真源并在 `.agents/rules/README.md` 登记，否则删除（须确认）
   - 一切修改在真源进行，再同步副本
4. **技能目录一致性（联动核对）**：README/AGENTS 引用技能数，顺带校验 `.agents/skills/`（真源）→ `.opencode/skills/`、`.trae/skills/`；发现漂移记入报告，不擅自改动
5. **同步验证**：重新计算哈希，确认三目录完全一致，**然后才进入阶段 2**

### 阶段 2：内容审计（七维检查表）

Tier 1（规则文件 + 两份 AGENTS.md + 两份 README.md + 根治理文档）做七维全量审计；Tier 2（内容目录）做治理一致性审计（见 Tier 2 检查点）；Tier 3（工程基线）只做一致性校验：

| 维度 | 检查点 | 判据 / 示例 |
|------|--------|-----------|
| 一致性 | 交叉引用 | 引用文件、目录、章节锚点必须存在，相对路径正确 |
| 一致性 | 与真实状态 | 文件数、技能数、阶段、工具链版本与代码库一致（用 Grep/Read 验证） |
| 一致性 | 与索引表 | 每个规则文件都在 `.agents/rules/README.md` 登记，无遗漏、无多登记 |
| 真实性 | 数字与事实 | 路径、数量、版本、日期可验证且准确，禁止编造 |
| 规范性 | frontmatter | 规则文件必有 `description`；触发二选一：`alwaysApply: true` 或 `globs: <pattern>`（+ `alwaysApply: false`） |
| 规范性 | 命名 / Markdown | 文件名 kebab-case 英文；链接、表格、代码块、标题层级规范 |
| 合理性 | 内容 / 边界 | 可执行、无歧义、不自相矛盾；不同规则职责不重叠 |
| 清晰性 | 表述 / 结构 | 术语与 CONTEXT.md 一致；标题组织合理、信息易定位 |
| 无冗余 | 重复内容 | 同一信息不多处重复；与 AGENTS.md/README.md 重复的段落保留一处并交叉引用；`project-engineering-constraints.md` 与规则文件重叠的约束以规则文件为准，另一处交叉引用 |
| 必要性 | 存在价值 | 每份文件、每段内容都有必要存在：文件有引用/索引登记、有明确读者；内容解决了实际问题，而非历史遗留或空泛套话 |

**Tier 2 治理一致性检查点**：各目录 `README.md` 有一句话定位且与实际内容相符；各级索引登记无遗漏、无多登记；内部相对链接全部可解析；阶段表述（禁残留 "Phase 0/1/2" 除历史注记外）、数字（切片/action/crate/i18n/测试计数）、术语与 Tier 1 真源一致；与 rules/AGENTS 重叠处以 rules 为准、另一处交叉引用；同名异体文件（如两份 builtin-browser）互相注体裁差异。

**Tier 3 一致性校验点**：`quality-gates.yml` 实际命令与 `quality-gates.md`/`commands.md`/`ai-digital-life/CONTRIBUTING.md` 登记一致；`capabilities/*.json` 无 `"all"`/`"**"` 通配且新增 Command 已登记；`tauri.conf.json` 显式声明 `app.security.csp` 且 `withGlobalTauri` 默认关闭；构建基线（`.cargo/config.toml` 白名单/alias、clippy/rustfmt/editorconfig）与 `ai-digital-life/AGENTS.md` 描述一致。

**典型缺陷模式**：索引表缺登记 · 内容错位（复制粘贴错误）· 目录缺文件 · 数字过时（技能数/定制数）· 计数不一致 · 断链 · 职责重叠 · 无必要内容（无引用、无读者、空泛过时的文件或段落）。

### 阶段 3：诊断报告（等用户确认）

以表格输出全部发现，标注严重程度与建议操作：

| 严重程度 | 定义 | 示例 |
|----------|------|------|
| 严重 | 事实错误、目录不一致、断链、索引缺登记 | 规则内容错位；副本缺文件 |
| 中 | 数字过时、表述矛盾、职责重叠 | 技能数过时；跨文件计数不一致 |
| 低 | 格式、措辞、结构可优化 | 表格不规范；小段冗余 |

报告行格式：`问题文件 | 问题描述 | 严重程度 | 建议操作（修改/补充/重写/删除/新增）`。**等待用户确认后再进入阶段 4。** 判断"删除"前须先核对：文件/段落未被索引表、其他文件或 AGENTS.md/README.md 引用（若被引用先消除引用），且无当前读者。

### 阶段 4：修复执行

1. 先确认 git 状态，有未提交变更则提醒用户；**不自动 commit**
2. 按严重程度从高到低修复，遵循**最小变更**（不引入无关改动）：
   - **修改**：直接编辑错误内容
   - **补充**：补齐缺失的索引登记、frontmatter、章节
   - **重写**：内容错位 / 严重冗余的文件重写为准确版本
   - **删除**：内容无必要存在（无引用、无读者、过时空泛），先消除所有引用再删；**必须经用户明确确认（询问机制）**
   - **新增**：若需拆分过大的规则文件，创建新文件并在索引登记；**须经用户明确确认**
3. 规则文件在 `.agents/rules/` 操作；AGENTS.md/README.md/根治理文档直接编辑各自文件；技能文件在 `.agents/skills/` 操作
4. 修复后更新所有受影响的交叉引用与索引表；删除文件后同步移除副本与索引登记；Tier 3 基线文件修改后同步验证规则引用是否仍成立

### 阶段 5：重新同步与验证

1. 修改规则文件后，重新同步到 `.opencode/rules/`、`.trae/rules/`；修改技能文件后，重新同步到 `.opencode/skills/`、`.trae/skills/`（技能真源 `.agents/skills/`）
2. 验证清单（全部通过才结束）：
   - [ ] 三规则目录文件清单 + 内容哈希完全一致
   - [ ] 三技能目录文件清单 + 内容哈希完全一致
   - [ ] `.agents/rules/README.md` 登记全部规则文件
   - [ ] 内部链接 / 锚点全部可解析
   - [ ] 数字与当前项目状态一致
   - [ ] AGENTS.md 与 README.md 无重复段落、交叉引用正确
   - [ ] Tier 2 内容目录定位/索引/链接/阶段表述/数字一致，无跨目录冗余
   - [ ] Tier 3 基线关键字段与规则引用一致（CI 命令、capability 登记、CSP、构建基线）
   - [ ] 所有文件 / 段落均"有必要存在"，无被引用文件遗留、无多余文件（含副本）
3. 输出验证报告（通过项 + 剩余问题）

---

## 快速参考

**同步三规则目录**（PowerShell）：

```powershell
# 比对同名文件哈希，仅列出漂移项
Get-ChildItem .agents/rules/*.md | ForEach-Object {
  $h = (Get-FileHash $_.FullName).Hash
  $o = (Get-FileHash ".opencode/rules/$($_.Name)").Hash
  $t = (Get-FileHash ".trae/rules/$($_.Name)").Hash
  [PSCustomObject]@{ File=$_.Name; Agents=$h; OpenCode=$o; Trae=$t }
} | Where-Object { $_.Agents -ne $_.OpenCode -or $_.Agents -ne $_.Trae }

# 真源 -> 副本
Copy-Item ".agents/rules/*.md" ".opencode/rules/" -Force
Copy-Item ".agents/rules/*.md" ".trae/rules/" -Force
```

**同步技能目录**：将上述命令中的 `rules` 换成 `skills`，源改为 `.agents/skills/*.md`（技能真源为 `.agents/skills/`）。

**七维审计顺序**：一致性 → 真实性 → 规范性 → 合理性 → 清晰性 → 无冗余 → 必要性（见阶段 2）。

---

## 常见错误与禁止行为

| 错误 / 禁止项 | 正确做法 |
|------|------|
| 跳过阶段 1 直接读规则文件下结论 | 一致性是审计前提，必须先同步 |
| 在 `.opencode/rules/` 或 `.trae/rules/` 直接改规则 | 真源是 `.agents/rules/`，改后必须回同步 |
| 在 `.opencode/skills/` 或 `.trae/skills/` 直接改技能 | 真源是 `.agents/skills/`，改后必须回同步 |
| 未经用户确认删除 / 新增文件 | 删除、新增必须显式确认（询问机制）；删除前先消除所有引用 |
| 只改规则文件不更新索引表 | 增删规则必须同步更新 `.agents/rules/README.md` |
| 编造或臆测数字（技能数、文件数等） | 用 Grep/Read 验证真实状态再下结论 |
| 修复后忘记重新同步副本 | 阶段 5 必须重新哈希验证 |
| 删除后遗留引用（断链）或残留副本 | 删除前用 Grep 确认无引用，删除后同步移除副本与索引登记 |
| 修改范围外文件 | 不改 `references/` 与 `ai-digital-life/` 源码（交叉引用修复除外） |

---

## 维护说明

- 规则目录结构 / 同步机制变化 → 更新"同步方向"表
- 新增审计文件类型 → 更新"审计范围"清单
- 修改本技能后同步到 `.opencode/skills/`、`.trae/skills/`（技能真源 `.agents/skills/`）
