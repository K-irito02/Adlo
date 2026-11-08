---
name: learn
description: Analyzes codebase to discover patterns, conventions, and architecture decisions, then generates project rule files. Invoke when user asks to "learn from this project", "extract project rules", "discover patterns", or "auto-generate rules".
allowed-tools: Read, Write, Edit, RunCommand, Glob, Grep, LS, Task, AskUserQuestion
---

# 学习

自动分析项目代码库，发现开发模式、约定和架构决策，生成供 Agent 遵循的规则文件。

本技能采用双代理架构：编排者（你）收集上下文、委托分析、过滤结果、与用户交互并持久化规则；分析师（子代理）聚焦代码库取证扫描。

## 触发条件

用户要求"从项目学习"、"提取项目规则"、"分析约定"、"发现模式"、"生成项目规则"、"学习代码库"、"自动生成规则"，或加入新项目/开始大型功能开发前需要文档化现有约定时。

## 指令

### 阶段 1：项目上下文评估

委托分析前，收集高层上下文：

1. **验证项目根目录**：确认当前目录含 `package.json`、`pyproject.toml`、`go.mod`、`.git/` 等标记。若用户指定了子目录范围，以该目录为分析根。
2. **检查现有规则**：扫描 `.opencode/rules/`、`.trae/rules/`、`.agents/rules/` 及 `.opencode/AGENTS.md`（如存在），了解已记录内容。
3. **评估项目规模**：统计源文件数量，识别主要语言和框架。
4. **告知用户**：简述发现，格式：`"发现 [语言/框架] 项目，[N] 个源文件，[M] 条现有规则。开始深度分析..."`

### 阶段 2：委托分析

使用 **Task 工具**（`subagent_type: "general_purpose_task"`）委托分析。子代理接收以下提示：

```
你是代码库分析师。分析当前目录的代码库，发现开发模式、约定和架构决策。

流程：
1. **发现**：扫描目录结构、命名约定、错误处理、状态管理、API 设计、测试组织、导入/依赖、配置管理、类型定义、代码风格。
2. **模式提取**：每个模式须出现在 ≥2 个文件中，收集文件路径和代码片段为证据，排除已被现有规则文件覆盖的模式。
3. **评分**：按影响范围(1-10)、一致性(1-10)、可操作性(1-10)三维评分，综合为 impactScore。
4. **返回 JSON**：仅返回以下结构的 JSON，无其他文本：

{
  "projectSummary": {
    "language": "主要语言",
    "framework": "主要框架",
    "totalSourceFiles": 数字,
    "analyzedFiles": 数字
  },
  "findings": [
    {
      "title": "规则标题（中文，简洁）",
      "category": "organization|naming|error-handling|state|api|testing|imports|config|types|style",
      "impactScore": 数字(1-10),
      "evidence": [
        { "file": "相对路径", "description": "模式体现说明", "snippet": "关键代码片段(≤5行)" }
      ],
      "content": "完整规则 markdown（含规则描述、正确示例、错误示例、适用场景）。不含 frontmatter，直接为规则正文。"
    }
  ]
}

约束：impactScore ≥4 才纳入，最多 5 条，禁止编造模式，不返回与现有规则重复的发现。涉及数量的任何陈述（文件数、crate 数、切片数、行数等）必须给出实测命令与输出原文（如 Glob/ls/Grep 计数），并在陈述中显式声明计数口径（如「以 `export function create*Actions` 命中计为准」）；禁止估算。
```

**故障处理：**

| 故障 | 处理 |
|------|------|
| 子代理超时/无响应 | 等待 60s 后重试一次；仍失败则告知用户，询问是否缩小范围重试 |
| 返回非 JSON | 尝试提取 ```json 代码块；失败则展示原始输出，询问用户 |
| JSON 解析失败 | 展示错误和原始输出，询问用户是否手动处理 |
| 返回空 findings | 告知用户未发现值得记录的模式 |

### 阶段 3：审查与过滤

1. **解析 JSON**：尝试 `JSON.parse()`，失败则提取 ```json 代码块，仍失败则展示原始输出询问用户。
2. **验证 findings**：每条须有清晰标题、≥2 条 evidence、impactScore ≥4、格式良好的 content；涉及数量的陈述必须复核口径并附实测命令与输出（如 `Glob`/`Grep` 计数），禁止采信估算。
3. **去重**：读取所有现有规则文件内容，若 finding 的 title 或 content 所述核心约定已被现有规则覆盖，则跳过。
4. **选取 Top 3**：按 impactScore 降序取前 3 条；不足 3 条则展示全部。
5. **零条发现**：告知用户项目已充分文档化或未发现显著未记录模式。

### 阶段 4：展示与确认

结构化展示发现：

```
分析了代码库，发现 N 个值得记录的模式：

1. **[规则] <标题>**（影响：X/10，分类：<category>）
   <一行说明>

2. ...
```

使用 AskUserQuestion 请求确认，选项："保存全部 N 条" / "让我逐条选择" / "取消"。**切勿自动保存**。

### 阶段 5：持久化

对每条批准的规则：

1. **确定目标目录**（优先级）：`.opencode/rules/` → `.trae/rules/` → `.agents/rules/` → 创建 `.opencode/rules/`。
2. **确保目录存在**：PowerShell 用 `New-Item -ItemType Directory -Force -Path <path>`。
3. **生成文件名**：title 转 kebab-case（`"API 响应信封约定"` → `api-response-envelope-convention.md`），仅小写字母、数字、连字符。
4. **冲突检查**：同名文件已存在时，AskUserQuestion 展示差异，询问替换/合并/跳过。
5. **写入文件**：用 Write 工具写入，内容为 finding 的 `content` 字段。
6. **同步**：若存在多个规则目录，同步写入所有已存在的目录。
7. **确认**：列出所有创建的文件路径。

## 特殊场景

- **限定范围**：用户指定子目录时，以该目录为分析根，子代理提示中注明分析范围。
- **多根工作区**：如项目含多个独立包（如本项目的 `adlo/` + 根目录），逐包分析，规则标题注明作用域。
- **已有全面规则**：可能发现很少或零条新模式，这是预期行为。

## 最佳实践

- 项目早期运行，快速文档化约定
- 保存前审查，生成的规则可后续微调
- 随项目演进定期重新运行
- 规则文件纳入 Git 版本控制

## 约束

- 未确认不保存；仅写入项目本地规则目录
- 子代理只读分析，不得修改项目文件
- 每条规则 ≥2 个文件证据，禁止编造模式
- 未经批准不覆盖现有规则；每规则文件聚焦单一约定
- 本技能仅做静态代码分析，不捕获运行时行为