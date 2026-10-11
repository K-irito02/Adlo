---
name: run-project-surfaces
description: 启动 AI Digital Life 的三种运行模式（浏览器预览、Tauri 桌面、双端并行），自动选择空闲端口，统一管理子进程生命周期。当用户要求运行、启动或预览应用时使用。
---

# 启动项目界面

通过 `ai-digital-life/scripts/run-project-surface.mjs` 启动 AI Digital Life，该脚本自动探测空闲端口、启动 Vite 开发服务器，并按需启动 Tauri 桌面应用。

## 三种模式

| 模式 | 命令 | 行为 |
|------|------|------|
| **browser** | `pnpm run dev:browser` | 仅启动 Vite 开发服务器，在浏览器中预览（适合 Agent 快速迭代测试） |
| **tauri** | `pnpm run dev:tauri`（或 `pnpm run dev`） | 启动 Vite + Tauri 原生桌面窗口（`dev` 为默认命令，等同于 `dev:tauri`） |
| **both** | `pnpm run dev:both` | 同时启动 Vite + Tauri 桌面窗口，浏览器预览保持可用（适合双端一致性验证） |

模式参数别名：`app`、`external` 均等价于 `tauri`。

所有命令从 `ai-digital-life/` 目录执行（仓库根目录：`E:\AI-DIGITAL-LIFE\SourceWorkspace`）。

## 端口选择

- 从 `5173` 开始向上探测（最多 20 个端口），无可再用时回退到操作系统分配的空闲端口。
- 解析到的端口同时用于 Vite 和 Tauri 的 `devUrl`，确保两端一致。
- 可通过环境变量显式指定：`ADL_PORT`（或 `PORT`）、`ADL_HOST`（默认 `127.0.0.1`）。
- `frontend/vite.config.ts` 同样读取 `ADL_PORT` / `PORT`，因此直接运行 `pnpm run frontend:dev` 也能避开被占用的端口。

## 启动与停止

- **启动**：Vite 启动后脚本会等待 HTTP 就绪（最多 30 秒），就绪后输出 `[adl-run] frontend ready at <url>`。
- **停止**：按 `Ctrl+C` 终止。脚本会通过 `taskkill /T`（Windows）或 `SIGTERM`（Unix）清理所有子进程（Vite、Tauri 及其进程树）。
- **Tauri 模式前置条件**：Rust 工具链已安装（`cargo` 可用），执行前需设置 `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`。

## 规则

- 优先采用用户明确要求的模式；除非用户明确要求或验证需要，否则不要同时启动两个界面。
- 将输出中 `[adl-run]` 显示的本地 URL **以纯文本**形式报告给用户，不要用反引号包裹，以便 IDE 内置浏览器点击打开。
- 启动后**不要**使用 agent-browser 或其他工具去打开该 URL，由用户自行点击。
- 若 Trae IDE 内置浏览器功能因本地环境问题不可用，明确告知用户，并保持本地预览服务器继续运行。
- 验证 Tauri 桌面模式时，确认 Tauri 进程确实在运行（可通过 `[adl-run]` 日志输出确认），不要仅凭命令退出就认为启动成功。

## 常见错误

| 错误 | 修正 |
|------|------|
| 从错误路径运行（如其他项目目录） | 切换到 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life` 后执行 |
| 使用 `npm run` 而非 `pnpm run` | 本项目使用 pnpm 作为包管理器 |
| 直接调用 `cargo tauri dev` | 使用包装脚本，以便端口被正确探测和共享 |
| 用反引号包裹 URL | 以纯文本输出，使 IDE 可点击 |
| 启动后用 agent-browser 打开 URL | 不要这样做，由用户自己点击纯文本 URL |
| Tauri 模式下 Rust 工具链不可用 | 先设置 PATH：`$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"` |
| 仅凭命令退出就认为桌面模式已启动 | 验证 `[adl-run]` 日志确认 Tauri 进程实际运行 |
| Tauri 窗口空白、标题栏拖拽失效 | 参见下方「ad-server 二进制缺失排查」 |

## 故障排查：ad-server 二进制缺失（桌面窗口空白）

### 症状

Tauri 桌面窗口启动后界面完全空白（仅剩一个空壳容器），且标题栏无法用鼠标拖拽移动窗口。终端日志出现：

```
[adl-shell] ad-server binary not found; desktop runs system-only (business over HTTP unavailable). Build it with `cargo build -p ad-server`.
```

### 根因

`target/<profile>/ad-server.exe`（浏览器/桌面共用业务引擎二进制）不存在。常见诱因：

- 近期执行过 `cargo clean` / `cargo prune` / `clean-target.ps1 -Full`，清掉了全部构建产物（含 `ad-server.exe`）。
- 首次全量构建尚未完成该二进制。

桌面壳启动时 `AdServerHandle::spawn` 找不到二进制 → 进入 system-only 模式（`base_url: None`）。前端 `main.tsx` 回退到默认地址 `http://127.0.0.1:61234` 创建 httpBridge，而该端口无服务监听 → 所有业务 HTTP 调用 `Failed to fetch` → `bootstrap()` 中途抛异常，`appInfo` 永不写入 store → i18n `t` 永不加载 → 渲染停在 `!t` 空白壳分支，TitleBar 未渲染故无拖拽区。

`debug-logs.txt`（项目根 `.adl-logs/`）中典型残留：单条 `[UnhandledRejection] Failed to fetch`。

### 修复

```powershell
cargo build -p ad-server
```

然后重启应用。这是 `cargo clean` 的预期副作用，**不是应用代码回归**，无需改动任何源码。

### 预防

- 磁盘清理用 `cargo prune`（`cargo clean` 别名）后，若需继续桌面开发，先重建 `ad-server` 再启动。
- 启动后确认日志中出现 `[adl-shell] spawning ad-server: ... --port 0` 与 `[adl-shell] ad-server bound at http://127.0.0.1:<port>`，说明引擎已就绪；仅出现 not-found 警告即为二进制缺失。

## 相关

- 包装脚本实现：`ai-digital-life/scripts/run-project-surface.mjs`
- 常用命令速查：[commands.md](../../rules/commands.md)