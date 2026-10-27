# CodeGraph 代码知识图谱搭建设计

日期：2026-08-05
最后更新：2026-10-27（codegraph 1.6.2：MCP 收敛为单一 `codegraph_explore`；OpenCode 改用 V2 `mcp.servers` 配置）
状态：已批准
关联：AI 数字生命项目治理工作区

## 背景与目标

开发过程中需要快速理解代码库的符号关系、调用路径与影响范围。引入 [codegraph](https://github.com/colbymchenry/codegraph)（MIT，64.6k star）构建**本地、自动增量同步**的代码知识图谱，供 AI agent 通过 MCP 工具与 CLI 双通道查询。

## 范围

构建 **1 份图谱**：

| 图谱 | 项目根 | 内容 |
|------|--------|------|
| 自己的项目 | `ai-digital-life/` | Rust + Tauri + 前端（`target/`、`node_modules/` 自动跳过） |

SourceWorkspace 根目录**不**建图。

## 技术要点

- Rust 原生内核，支持 20+ 语言（含 Rust/TS/TSX/JS/Python）
- 数据存各项目根 `.codegraph/codegraph.db`（SQLite），100% 本地
- 原生文件监听器（Windows: ReadDirectoryChangesW）+ 2s debounce，自动增量同步
- 默认跳过 `node_modules`/`dist`/`target` 等依赖/构建目录、`.gitignore` 内容、>1MB 文件
- MCP server（`codegraph serve --mcp`）**按当前工作目录**定位 `.codegraph/`；接入方在配置里把 `cwd` 固定到 `ai-digital-life`，因此在仓库根打开会话也能用，无索引时可传 `projectPath` 指定项目

## 实施步骤

1. **安装**：`npm i -g @colbymchenry/codegraph`，验证 `codegraph version`；若 `where codegraph` 出现多份，删掉旧的一份（旧版会遮蔽新版）
2. **接入 opencode MCP**：在 `.opencode/opencode.json` 写 V2 形状（`mcp.servers.codegraph`，`command` 为 `["cmd", "/c", "codegraph", "serve", "--mcp"]`，`cwd` 为 `ai-digital-life`）。`codegraph install` 输出的是 V1 片段，不能直接用于 V2
3. **建图**：项目根 `codegraph init`（工作树用 `pnpm --dir ai-digital-life run setup:worktree`）
4. **验证**：`codegraph status` 检查图谱；`opencode mcp list` 应显示 `codegraph connected`；抽样 `codegraph explore` 验证可查询

## 双通道查询对应

| 需求 | MCP 工具 | CLI |
|------|----------|-----|
| 综合源码+调用路径+影响范围 | `codegraph_explore` | `codegraph explore <query>` / `codegraph context <task>` |
| 找符号 | — | `codegraph query <sym>` |
| 谁调用我 | — | `codegraph callers <sym>` |
| 我调用谁 | — | `codegraph callees <sym>` |
| 影响范围 | — | `codegraph impact <sym>` |
| 受影响测试 | — | `codegraph affected <files...>` |
| 符号源码 | — | `codegraph node <sym>` |
| 文件结构/状态 | — | `codegraph files` / `status` |

> 1.5 起 MCP 默认只暴露 `codegraph_explore`（其余工具是它的子集，列出来会诱导误选）。确需恢复时在 MCP 配置加 `CODEGRAPH_MCP_TOOLS` 环境变量白名单。

## 维护与注意事项

- 自动增量同步，无需手动 `sync`；大改动用 `codegraph index` 全量重建
- **升级**：`codegraph upgrade` → `codegraph index` 重建（否则 `status` 提示旧引擎）→ 让 MCP 重连；`codegraph status` 检查健康
- MCP 的 `cwd` 固定在 `ai-digital-life` → 在 SourceWorkspace 根打开会话也可直接查询；无索引的其它项目需传 `projectPath`
- 与现有 `docs/analysis/` 渐进式源码地图体系互补共存（codegraph 管实时可查询图谱，docs/analysis 管深度解读）

## 验收标准

- 图谱 `codegraph status` 正常显示 node/edge/file 计数
- 抽样查询返回真实源码、调用路径与影响范围
