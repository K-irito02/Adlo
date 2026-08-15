# CodeGraph 代码知识图谱搭建设计

日期：2026-08-05
状态：已批准
关联：AI 数字生命项目治理工作区

## 背景与目标

开发过程中需要快速理解代码库的符号关系、调用路径与影响范围。引入 [codegraph](https://github.com/colbymchenry/codegraph)（MIT，64.6k star）构建**本地、自动增量同步**的代码知识图谱，供 AI agent 通过 MCP 工具与 CLI 双通道查询。

## 范围

构建 **3 份独立图谱**：

| 图谱 | 项目根 | 内容 |
|------|--------|------|
| 自己的项目 | `ai-digital-life/` | Rust + Tauri + 前端（`target/`、`node_modules/` 自动跳过） |
| pi 参考 | `references/pi` | 全量索引 |
| opencode 参考 | `references/opencode` | 全量索引 |

SourceWorkspace 根目录**不**建图。

## 技术要点

- Rust 原生内核，支持 20+ 语言（含 Rust/TS/TSX/JS/Python）
- 数据存各项目根 `.codegraph/codegraph.db`（SQLite），100% 本地
- 原生文件监听器（Windows: ReadDirectoryChangesW）+ 2s debounce，自动增量同步
- 默认跳过 `node_modules`/`dist`/`target` 等依赖/构建目录、`.gitignore` 内容、>1MB 文件
- MCP server（`codegraph serve --mcp`）**按当前工作目录**定位 `.codegraph/`：在对应项目根打开 agent 时自动激活；无索引的目录下工具不激活（正常行为）

## 实施步骤

1. **安装**：`npm i -g @colbymchenry/codegraph`，验证 `codegraph version`
2. **接入 opencode MCP**：`codegraph install`（先 `--print-config opencode` 预览），必要时手动补 `CODEGRAPH_MCP_TOOLS=explore,node,search,callers,callees,impact,files,status` 全量启用 8 个工具
3. **建图**：三个项目根分别 `codegraph init`
4. **验证**：`codegraph status` 检查三份图谱；抽样 `codegraph explore`/`impact` 验证可查询

## 双通道查询对应

| 需求 | MCP 工具 | CLI |
|------|----------|-----|
| 综合源码+调用路径 | `codegraph_explore` | `codegraph explore <query>` |
| 找符号 | `codegraph_search` | `codegraph query <sym>` |
| 谁调用我 | `codegraph_callers` | `codegraph callers <sym>` |
| 我调用谁 | `codegraph_callees` | `codegraph callees <sym>` |
| 影响范围 | `codegraph_impact` | `codegraph impact <sym>` |
| 文件结构/状态 | `codegraph_files`/`codegraph_status` | `codegraph files`/`status` |

## 维护与注意事项

- 自动增量同步，无需手动 `sync`；大改动用 `codegraph index` 全量重建
- `codegraph upgrade` 升级；`codegraph status` 检查健康
- MCP 按 cwd 定位 → 在 SourceWorkspace 根打开 agent 时三份图谱均不激活（正常）；使用某图谱需切工作目录或用 CLI
- pi/opencode 克隆会被写入 `.codegraph/` 与 `.gitignore` 一行（本地改动，不影响后续 git pull）
- 与现有 `docs/analysis/` 渐进式源码地图体系互补共存（codegraph 管实时可查询图谱，docs/analysis 管深度解读）

## 验收标准

- 三份图谱 `codegraph status` 均正常显示 node/edge/file 计数
- 抽样查询返回真实源码、调用路径与影响范围
