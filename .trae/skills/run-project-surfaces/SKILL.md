---
name: run-project-surfaces
description: 当用户要求以应用内置浏览器预览、外部 Tauri 桌面应用或两者同时方式启动 AI Digital Life，且开发服务器端口需要自动选择而不再依赖固定端口时使用。
---

# 启动项目界面

通过 `ai-digital-life/scripts/run-project-surface.mjs` 在指定的运行界面启动 AI Digital Life，该脚本会选择一个空闲端口、启动 Vite，并将解析后的 `devUrl` 传入 Tauri。

## 使用时机

- 用户要求以应用内置浏览器预览方式运行应用
- 用户要求启动外部 Tauri 桌面应用
- 用户要求同时启动两个界面（例如用于验证）
- 默认端口（5173）被占用，需要自动选择一个空闲端口

请直接使用包装脚本，而不是 `cargo tauri dev` —— 包装脚本会在 Vite 与 Tauri 之间解析并共享同一个空闲端口，同时负责清理子进程。

## 快速参考

所有命令都从 `ai-digital-life/` 工作区运行（仓库根目录：`E:\AI-DIGITAL-LIFE\SourceWorkspace`）：

| 目标 | 命令 | 模式参数 |
|------|---------|----------|
| 仅应用内置浏览器预览 | `pnpm run dev:browser` | `browser` |
| 仅外部桌面应用 | `pnpm run dev:tauri`（别名 `pnpm run dev`） | `tauri`（别名：`app`、`external`） |
| 同时启动两个界面 | `pnpm run dev:both` | `both` |

模式参数接受 `browser | tauri | both | app | external`。

## 端口选择

- 从 `5173` 开始探测，向上扫描（最多 20 个端口），然后回退到操作系统分配的临时端口。
- 同一个解析端口同时用于 Vite 预览与 Tauri 的 `devUrl`。
- 可通过环境变量显式覆盖：`ADL_PORT`（或 `PORT`）与 `ADL_HOST`（默认 `127.0.0.1`）。
- `frontend/vite.config.ts` 也会读取 `ADL_PORT` / `PORT`，因此直接运行前端也能避开被占用的端口。

## 规则

- 优先采用用户明确要求的模式；除非用户要求或验证需要，否则不要同时启动两个界面。
- 将输出中（`[adl-run]`）显示的本地 URL **以纯文本**形式报告给用户 —— 不要用反引号包裹 —— 以便在 IDE 的内置浏览器中点击打开。
- 启动后**不要**使用 agent-browser 或其他任何工具去打开该 URL。
- 如果内置浏览器插件因本地运行环境问题而被阻塞，请明确说明，并保持本地预览服务器继续运行。
- 验证桌面模式时，确认 Tauri 进程确实在运行，而不是想当然地认为启动成功。
- 使用 `Ctrl+C` 停止；包装脚本会通过 Windows 上的 `taskkill /T` 终止其子进程（Vite 与 Tauri，及其进程树）。

## 常见错误

| 错误 | 修正 |
|---------|-----|
| 从过期路径运行（例如 `E:\Programs\Obsidian\notes\ai-digital-life`） | 从 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life` 运行 |
| 使用 `npm run` 而不是 `pnpm run` | 本项目使用 pnpm |
| 直接调用 `cargo tauri dev` | 使用包装脚本，以便端口被共享且空闲 |
| 用反引号包裹 URL | 以纯文本输出，使 IDE 可点击 |
| 启动后用 agent-browser 打开 URL | 不要这样做 —— 由用户自己点击纯文本 URL |
| 因命令退出就认为桌面模式已启动 | 验证 Tauri 进程确实在运行 |

## 相关

- 启动后的浏览器交互：使用 [browser-automation](./browser-automation) 技能
- 包装脚本实现：`ai-digital-life/scripts/run-project-surface.mjs`
