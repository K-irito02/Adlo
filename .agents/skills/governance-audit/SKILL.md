---
name: governance-audit
description: Audit and sync governance docs (rules, AGENTS.md, READMEs, root docs, docs dirs, engineering baselines) and the three rules/skills dirs, report findings, fix after approval. Use when asked to review, inspect, clean up, or sync these. Do not use for code audits.
---

# 治理文档审计

审计项目治理文档，按 **三级范围（Tier）** 与 **七个维度** 检查，发现问题后修复 / 补充 / 重写 / 增删。

| Tier | 范围 | 深度 |
|------|------|------|
| Tier 1 | 规则文件、两份 AGENTS.md、两份 README.md、根治理文档 | 七维全量 |
| Tier 2 | `docs/` 内容目录 | 治理一致性 |
| Tier 3 | 工程基线（CI / Tauri / 构建配置） | 一致性校验 |

七个维度：一致性、真实性、规范性、合理性、清晰性、无冗余、必要性。

**核心原则：先同步，后审计；先报告，后修改。**

---

## 何时使用 / 不使用

**使用**：要求审视 / 检查 / 审阅 / 清理 / 规范化规则文件、AGENTS.md、README.md、根治理文档、docs 内容目录、工程基线；治理文档之间矛盾、过时或与代码库实际状态不符；要求保证三规则目录或三技能目录一致。

**不使用**：审计源码或其他非治理文档（源码审计走代码审查流程；文档整理改用 `documentation-organizer`）。

## 执行模式

| 模式 | 触发 | 终点 |
|------|------|------|
| 完整审计 + 修复（默认） | 默认 | 阶段 5 |
| 仅报告 | 用户明确"只看不改 / 先出报告" | 阶段 3 后停止 |

---

## 审计范围（固定清单）

| 类别 | 文件 | 路径 | 深度 |
|------|------|------|------|
| 规则文件 | 全部 `*.md` | `.agents/rules/`（真源，同步后仅审计此目录） | 七维全量 |
| AGENTS.md | 根 / 实现工作区 | `AGENTS.md`、`adlo/AGENTS.md` | 七维全量 |
| README.md | 根 / 实现工作区 | `README.md`、`adlo/README.md` | 七维全量 |
| 根治理文档（Tier 1） | `CONTEXT.md`、`CONTRIBUTING.md`、`adlo/CONTRIBUTING.md`、`SECURITY.md`、`FUTURE-ROADMAP.md`、`RULES.md`、`SKILLS.md`、`docs/development/project-engineering-constraints.md` | 见路径 | 七维全量 |
| 内容目录（Tier 2） | 全部 `*.md` | `docs/analysis/`、`docs/architecture/`、`docs/design-system/`、`docs/development/`、`docs/operations/` | 治理一致性（见阶段 2）；不要求 frontmatter |
| 工程基线（Tier 3） | `.githooks/pre-push`（本地门禁）；Tauri `adlo/src-tauri/capabilities/*.json`、`adlo/src-tauri/tauri.conf.json`；构建 `adlo/.cargo/config.toml`、`adlo/clippy.toml`、`adlo/rustfmt.toml`、根 `.editorconfig` | 见路径 | 仅核对被规则引用的关键字段 |

> 其他路径的同名 `AGENTS.md`/`README.md` 不在范围；用户指定路径以用户为准。**默认不纳入**：`docs/` 下未列出的子目录（含 `knowledge-base/`、`plans/`、`specs/`、`superpowers/`、`root-cause-to-close/` 等过程 / 工具产物）与 `references/`，用户点名才纳入。文件数、规则数、技能数等**以运行时统计为准，不写死**。

---

## 执行流程

> 总览：① 同步三目录 → ② 七维审计 → ③ 诊断报告（等确认）→ ④ 修复 → ⑤ 重新同步验证

### 阶段 1：三目录一致性检查与同步（先决条件）

读任何内容前，先确保三目录一致（真源 `.agents/` → 副本 `.opencode/`、`.trae/`）：

1. **清单比对**：比对三规则目录 `*.md` 与三技能目录子目录清单，标记缺失 / 多余 / 同名漂移
2. **哈希比对**：同名文件内容哈希，技能按子目录递归比对（脚本见"快速参考"）
3. **同步**：缺失 / 漂移 → 从真源复制到副本；副本多出真源 → 核对，正确则补入真源（规则须在根 `RULES.md` 的规则清单登记），否则删除（须确认）
4. **技能目录联动核对**：比对 README/AGENTS 声明的技能数与实际目录数，漂移记入报告，不擅自改动
5. **同步验证**：重算哈希确认三目录完全一致，**然后才进入阶段 2**

### 阶段 2：内容审计

Tier 1 七维全量；Tier 2 治理一致性；Tier 3 一致性校验。

| 维度 | 检查点 | 判据 / 示例 |
|------|--------|-----------|
| 一致性 | 交叉引用 | 引用文件 / 目录 / 章节锚点存在，相对路径正确 |
| 一致性 | 与真实状态 | 文件数、技能数、阶段、工具链版本与代码库一致（Grep/Read 验证） |
| 一致性 | 与索引表 | 每个规则文件都在根 `RULES.md` 规则清单登记，无遗漏、无多登记 |
| 真实性 | 数字与事实 | 路径、数量、版本、日期可验证且准确，禁止编造 |
| 规范性 | frontmatter | 规则文件必有 `description`；触发二选一：`alwaysApply: true` 或 `globs: <pattern>`（+ `alwaysApply: false`） |
| 规范性 | 命名 / Markdown | 文件名 kebab-case 英文；链接、表格、代码块、标题层级规范 |
| 合理性 | 内容 / 边界 | 可执行、无歧义、不自相矛盾；不同规则职责不重叠 |
| 清晰性 | 表述 / 结构 | 术语与 CONTEXT.md 一致；标题组织合理、信息易定位 |
| 无冗余 | 重复内容 | 同一信息不多处重复；与 AGENTS.md/README.md 重复的段落留一处并交叉引用；`project-engineering-constraints.md` 与规则重叠处以规则为准，另一处交叉引用 |
| 必要性 | 存在价值 | 每份文件 / 段落都有必要存在：有引用 / 索引登记、有明确读者、解决实际问题，而非历史遗留或空泛套话 |

**Tier 2 检查点**：各目录 `README.md` 定位句与实际内容相符；各级索引登记无遗漏、无多登记；内部相对链接可解析；阶段表述、数字（切片 / action / crate / i18n / 测试计数）、术语与 Tier 1 真源一致；与 rules/AGENTS 重叠处以 rules 为准、另一处交叉引用；同名异体文件互相注体裁差异。

**Tier 3 检查点**：`.githooks/pre-push` 与 `quality-gates.md`/`commands.md`/`adlo/CONTRIBUTING.md` 登记一致；`capabilities/*.json` 无 `"all"`/`"**"` 通配且新增 Command 已登记；`tauri.conf.json` 显式声明 `app.security.csp` 且 `withGlobalTauri` 关闭；构建基线（`.cargo/config.toml` 白名单 / alias、clippy / rustfmt / editorconfig）与 `adlo/AGENTS.md` 描述一致。

**典型缺陷模式**：索引缺登记 · 内容错位（复制粘贴）· 目录缺文件 · 数字过时 / 计数不一致 · 断链 · 职责重叠 · 无必要内容（无引用、无读者、空泛过时）。

### 阶段 3：诊断报告（等用户确认）

以表格输出全部发现：`问题文件 | 问题描述 | 严重程度 | 建议操作`。

| 严重程度 | 定义 | 示例 |
|----------|------|------|
| 严重 | 事实错误、目录不一致、断链、索引缺登记 | 规则内容错位；副本缺文件 |
| 中 | 数字过时、表述矛盾、职责重叠 | 技能数过时；跨文件计数不一致 |
| 低 | 格式、措辞、结构可优化 | 表格不规范；小段冗余 |

建议操作用：修改 / 补充 / 重写 / 删除 / 新增。**等待用户确认后再进入阶段 4；仅报告模式到此停止。** 判断"删除"前须核对：未被索引表、其他文件或 AGENTS.md/README.md 引用（被引用则先消除引用），且无当前读者。

### 阶段 4：修复执行

1. 先确认 git 状态，有未提交变更则提醒用户；**不自动 commit**
2. 按严重程度从高到低修复，遵循**最小变更**（不引入无关改动）：
   - **修改**：直接改错误内容
   - **补充**：补齐缺失的索引登记 / frontmatter / 章节
   - **重写**：内容错位或严重冗余的文件重写为准确版本
   - **删除**：内容无必要存在（无引用、无读者、过时空泛），先消除所有引用再删；**须用户明确确认**
   - **新增**：拆分过大规则文件时创建并在索引登记；**须用户明确确认**
3. **改动落点**：规则改 `.agents/rules/`；AGENTS.md / README.md / 根治理文档改各自文件；技能改 `.agents/skills/`（真源）。Tier 3 基线文件仅当与规则引用不一致且经确认时可改，限被引用关键字段；`references/` 与业务源码不改（交叉引用修复除外）
4. 修复后更新受影响的交叉引用与索引表；删除文件后同步移除副本与索引登记；Tier 3 改动后回验规则引用仍成立

### 阶段 5：重新同步与验证

1. 规则 / 技能改动后，按真源 → 副本重新同步（`.opencode/`、`.trae/`）
2. 全部通过才结束：
   - [ ] 三规则目录清单 + 哈希一致
   - [ ] 三技能目录清单 + 哈希一致
   - [ ] 根 `RULES.md` 规则清单登记全部规则文件
   - [ ] 内部链接 / 锚点全部可解析
   - [ ] 数字与当前项目状态一致
   - [ ] AGENTS.md 与 README.md 无重复段落、交叉引用正确
   - [ ] Tier 2 定位 / 索引 / 链接 / 阶段表述 / 数字一致，无跨目录冗余
   - [ ] Tier 3 关键字段与规则引用一致（CI 命令、capability 登记、CSP、构建基线）
   - [ ] 无被引用文件遗留、无多余文件（含副本）
3. 输出验证报告（通过项 + 剩余问题）

---

## 快速参考

**比对三规则目录**（真源 `.agents/rules/`，列出缺失 / 漂移 / 多余）：

```powershell
$ref = '.agents/rules'; $copies = '.opencode/rules', '.trae/rules'
$names = Get-ChildItem $ref -Filter *.md | ForEach-Object Name
foreach ($c in $copies) {
  foreach ($n in $names) {
    $p = Join-Path $c $n
    if (-not (Test-Path $p)) { "MISSING $c/$n" }
    elseif ((Get-FileHash $p).Hash -ne (Get-FileHash (Join-Path $ref $n)).Hash) { "DRIFT $c/$n" }
  }
  Get-ChildItem $c -Filter *.md | Where-Object Name -notin $names | ForEach-Object { "EXTRA $c/$($_.Name)" }
}
```

**比对三技能目录**（真源 `.agents/skills/`，按技能子目录递归）：

```powershell
$ref = '.agents/skills'; $copies = '.opencode/skills', '.trae/skills'
foreach ($s in Get-ChildItem $ref -Directory) {
  $base = $s.FullName
  foreach ($f in Get-ChildItem $base -Recurse -File) {
    $rel = $f.FullName.Replace($base, '')
    foreach ($c in $copies) {
      $p = Join-Path $c "$($s.Name)$rel"
      if (-not (Test-Path $p)) { "MISSING $c/$($s.Name)$rel" }
      elseif ((Get-FileHash $p).Hash -ne (Get-FileHash $f.FullName).Hash) { "DRIFT $c/$($s.Name)$rel" }
    }
  }
}
```

**同步**（真源 → 副本）：

```powershell
Copy-Item ".agents/rules/*.md" ".opencode/rules/" -Force
Copy-Item ".agents/rules/*.md" ".trae/rules/"  -Force
Copy-Item ".agents/skills/*"    ".opencode/skills/" -Recurse -Force
Copy-Item ".agents/skills/*"    ".trae/skills/"     -Recurse -Force
```

**七维审计顺序**：一致性 → 真实性 → 规范性 → 合理性 → 清晰性 → 无冗余 → 必要性。

---

## 常见错误与禁止行为

| 错误 / 禁止项 | 正确做法 |
|------|------|
| 跳过阶段 1 直接读文件下结论 | 一致性是审计前提，必须先同步 |
| 在 `.opencode/` 或 `.trae/` 直接改规则 / 技能 | 真源是 `.agents/`，改后必须回同步 |
| 用 `.agents/skills/*.md` 同步技能 | 技能是子目录，须递归复制技能文件夹 |
| 未经确认删除 / 新增文件 | 删除、新增须显式确认；删除前先消除所有引用 |
| 只改规则不更新索引表 | 增删规则必须同步根 `RULES.md` 规则清单 |
| 编造或臆测数字（技能数、文件数等） | 用 Grep/Read 统计真实状态再下结论 |
| 写死易变数字（如内容目录文件数） | 以运行时统计为准 |
| 修复后忘记重新同步副本 | 阶段 5 必须重新哈希验证 |
| 删除后遗留引用（断链）或残留副本 | 删除前 Grep 确认无引用，删除后移除副本与索引登记 |
| 修改范围外文件 | 不改 `references/` 与业务源码；Tier 3 仅改被引用关键字段且经确认 |

---

## 维护说明

- 目录结构 / 同步机制变化 → 更新"审计范围"表与"快速参考"
- 新增审计文件类型 → 更新"审计范围"清单
- 修改本技能后同步到 `.opencode/skills/`、`.trae/skills/`（真源 `.agents/skills/`）