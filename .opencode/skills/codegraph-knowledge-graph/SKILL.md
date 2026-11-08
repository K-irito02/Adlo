---
name: codegraph-knowledge-graph
description: 查询本地 CodeGraph 代码知识图谱以追踪符号、调用链和变更影响范围。需要理解代码结构、追踪调用关系或评估变更影响时优先使用，替代 grep/read 逐文件爬取。
---

# CodeGraph 代码知识图谱

## 概述

`adlo/` 下有 1 份预索引的本地 CodeGraph 图谱（`.codegraph/codegraph.db`，SQLite，100% 本地，原生文件监听自动增量同步），覆盖 Rust + Tauri + TypeScript/TSX，自动排除 `target/`、`node_modules/` 与 `.gitignore` 命中项。

| 项目根 | 内容 |
|--------|------|
| `adlo/` | Rust + Tauri + TypeScript 主项目 |

## 何时使用

- 回答 "X 是怎么工作的"、"X 如何到达 Y" 等架构问题
- 追踪符号的调用方/被调用方，评估变更影响范围
- 编辑前定位符号的定义和所有使用位置
- 任何原本需要多轮 grep/glob/read 爬取的任务

**优先查询图谱**，仅在图谱指向的具体文件上回退到文件读取。

## 查询方式

### 方式一：MCP 工具（推荐）

OpenCode 通过项目配置 `.opencode/opencode.json` 接入 `codegraph` MCP server（V2 形状，服务器名必须在 `mcp.servers` 下）：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "codegraph": {
        "type": "local",
        "command": ["cmd", "/c", "codegraph", "serve", "--mcp"],
        "cwd": "adlo"
      }
    }
  }
}
```

配置要点（踩过的坑，勿改错）：

| 项 | 说明 |
|----|------|
| `mcp.servers.<name>` | V2 要求；`codegraph install` 打印的 V1 片段（服务器名直接位于 `mcp` 下）在 V2 不生效 |
| `cmd /c` 前缀 | Windows 上 `codegraph` 只有 `.cmd`/`.ps1` 垫片，Node 的 `spawn` 不走 shell 会 `ENOENT` |
| `cwd: "adlo"` | 指向含 `.codegraph/` 的项目根；相对路径按会话工作目录解析，主工作树与各分支工作树各自命中自己那份索引 |
| 工作目录已在 `adlo/` | 删掉 `cwd`，否则会解析成 `adlo/adlo` 而无法启动 |

默认只暴露 **1 个** MCP 工具（官方刻意收敛，其余能力是它的子集，列出来反而诱导误选）：

| 工具 | 用途 |
|------|------|
| `codegraph_explore` | 自然语言问题/符号名 → 相关符号源码 + 调用路径 + 影响范围（Read 等价，首选） |

调用签名：`codegraph_explore({ query, maxFiles?, projectPath? })`。`cwd` 已绑定默认项目，通常只传 `query`；查询其它项目时传绝对路径 `projectPath`。OpenCode 的 Code Mode 下通过 `execute` 调用 `tools.codegraph.codegraph_explore({ query })`。

**控制返回体积**：问"某个符号怎么实现/谁调用它"时，把查询写成精确符号名并传 `maxFiles: 3`；宽泛的自然语言查询（如"设置面板版本来源与代理…"）会一次带出多个大组件，单次可达数万字符、挤占上下文。先窄后宽，不够再追加一次精确查询。

**中文 UI 描述会按词法命中无关文件**：例如查"右侧面板导航栏…"会带出图表组件与 Rust handler，而真正的 `ToolSwitcher.tsx` / `RightPanel.tsx` 一个都不在结果里。先用英文符号名/文件名查询（`ToolSwitcher`、`RightPanel`、`right-panel`），中文描述只作补充；`maxFiles` 保持 3–6。

验证与重连：

```powershell
opencode mcp list        # 期望 codegraph  connected
```

改配置会热加载；升级 codegraph 版本后需让 MCP 重连（`/mcps` 断开再连接，或重开会话）才会用上新内核。

### 方式二：CLI 命令

在项目根（`adlo/`）下运行：

```bash
codegraph explore "<自然语言问题>"       # 首选，与 codegraph_explore 同输出
codegraph context "<任务描述>"           # 任务上下文：相关符号 + 关系 + 代码块
codegraph query <关键词> --kind <kind> --limit 10
codegraph node <symbol>                  # 单符号源码 + 调用方/被调用方
codegraph callers <symbol>
codegraph callees <symbol>
codegraph impact <symbol> --depth 3
codegraph affected <files...>            # 受影响测试文件
codegraph files                          # 已索引文件结构
codegraph status                         # 健康状态 / 引擎版本 / 待同步
```

多数命令支持 `--json` 输出机器可读结果，`-p/--path` 指定项目路径。

## 典型工作流

1. **理解架构**：`codegraph_explore "前端如何调用 Tauri command"` → 一次拿到相关源码与调用链
2. **安全重构**：`codegraph_explore` 看 blast radius，必要时 `codegraph impact <符号> --depth 3`
3. **追踪调用链**：`codegraph_explore` 命名链路两端的符号（如 `submitAddress navigateTab`）
4. **定位符号**：`codegraph query <符号名>` → `codegraph node <符号>` 读上下文

## 常见错误

- 在仓库根运行 CLI → `[ERR] CodeGraph not initialized`。需先 `cd` 到含 `.codegraph/` 的项目根。
- 抄 `codegraph install` 生成的 V1 配置（`mcp: { codegraph: … }`）→ `opencode mcp list` 里根本没有该 server。
- Windows 上把命令写成 `["codegraph", "serve", "--mcp"]` → spawn `ENOENT`（缺 `cmd /c`）。
- `cwd` 留在仓库根且未配置 → 服务器进入"无默认项目"模式，`codegraph_explore` 的 `projectPath` 变成必填。
- 能用一次 `codegraph_explore` 解决却用多轮 grep/read 爬取。
- 修改代码前未查影响范围（`codegraph_explore` 的 blast radius 或 `codegraph impact`）。

## 维护

- 自动增量同步（原生文件监听），无需手动操作；索引滞后写入约 1 秒。
- 大规模重构后 `codegraph index` 全量重建（1.6.x 实测约 1.6k 文件 / 7 秒）。
- **升级版本**：`codegraph upgrade` → `codegraph index` 重建（否则 `status` 一直提示 "Index was built by vX; re-index"）→ 让 MCP 重连。
- 升级后 `codegraph --version` 仍显示旧版 → `where codegraph` 查 PATH 上是否有旧 npm 前缀的残留安装，删掉旧的那份（两份并存会让旧版一直遮蔽新版）。
- 索引不入库（`.codegraph/` 已 gitignore），每个工作树各建一份：`pnpm --dir adlo run setup:worktree`。
- 需要恢复被收敛的 MCP 工具时，可在 MCP 配置里加 `"environment": { "CODEGRAPH_MCP_TOOLS": "explore,node,search,callers,callees,impact,files,status" }`；默认不建议。
