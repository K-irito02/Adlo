---
name: codegraph-knowledge-graph
description: 查询本地 CodeGraph 代码知识图谱以追踪符号、调用链和变更影响范围。需要理解代码结构、追踪调用关系或评估变更影响时优先使用，替代 grep/read 逐文件爬取。
---

# CodeGraph 代码知识图谱

## 概述

工作区包含 1 份预索引的本地 CodeGraph 代码知识图谱（`.codegraph/codegraph.db`，SQLite，100% 本地，文件变更自动同步）。

| 项目根 | 内容 |
|--------|------|
| `ai-digital-life/` | Rust + Tauri + TypeScript 主项目 |

`ai-digital-life/` 自动排除 `target/`、`node_modules/` 及 `.gitignore` 中的文件。

## 何时使用

- 回答 "X 是怎么工作的"、"X 如何到达 Y" 等架构问题
- 追踪符号的调用方/被调用方，评估变更影响范围
- 编辑前定位符号的定义和所有使用位置
- 任何原本需要多轮 grep/glob/read 爬取的任务

**优先查询图谱**，仅在图谱指向的具体文件上回退到文件读取。

## 查询方式

### 方式一：MCP 工具（推荐）

当会话工作目录在包含 `.codegraph/` 的项目根时，`codegraph` MCP server 自动激活。可用 `run_mcp` 调用以下工具：

| 工具 | 用途 | 优先级 |
|------|------|--------|
| `codegraph_explore` | 自然语言问题 → 源码 + 调用路径 + 影响范围 | 首选 |
| `codegraph_node` | 单个符号的源码 + 调用方/被调用方链路 | 次选 |
| `codegraph_search` | 按名称查找符号位置 | 辅助 |
| `codegraph_callers` | 谁调用了该符号 | 辅助 |
| `codegraph_callees` | 该符号调用了谁 | 辅助 |
| `codegraph_impact` | 修改该符号的变更影响范围 | 辅助 |
| `codegraph_files` | 已索引的文件结构 | 辅助 |
| `codegraph_status` | 图谱健康状态 / 待同步内容 | 诊断 |

**判断 MCP 是否可用**：检查当前会话是否配置了 `codegraph` MCP server。若不可用或 cwd 不在项目根，改用 CLI。

### 方式二：CLI 命令

在项目根目录下运行：

```bash
codegraph explore "<自然语言问题>"          # 首选
codegraph query <symbol> --kind <kind> --limit 10
codegraph callers <symbol>
codegraph callees <symbol>
codegraph impact <symbol> --depth 3
codegraph files
codegraph status
```

`query`/`callers`/`callees`/`impact`/`status` 支持 `--json` 输出机器可读结果。

## 典型工作流

1. **理解架构**：`codegraph_explore "前端如何调用 Tauri command"` → 获得完整调用链
2. **安全重构**：`codegraph_impact <要修改的符号> --depth 3` → 评估影响范围 → 再修改
3. **追踪调用链**：`codegraph_callers <符号>` → 找到调用方 → `codegraph_node <调用方>` 查看上下文
4. **定位符号**：`codegraph_search <符号名>` → 找到定义 → `codegraph_node` 读取源码

## 常见错误

- 在仓库根运行 CLI → 报 `[ERR] CodeGraph not initialized`。需先 `cd` 到含 `.codegraph/` 的项目根。
- 能用一次 `codegraph_explore` 解决却用多轮 grep/read 爬取。
- 修改代码前未执行 `codegraph_impact` 检查影响范围。
- 误以为 MCP 工具在所有会话都激活——它依赖 cwd 是否为项目根。

## 维护

- 图谱自动同步（原生文件监听器），无需手动操作。
- 大规模重构后可用 `codegraph index` 全量重建。
- `codegraph status` 查看健康状态与待同步内容。