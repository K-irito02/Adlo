---
description: Common commands quick reference, scripts entry points
alwaysApply: true
---

# 常用命令

## 开发命令（`ai-digital-life/`）

| 命令 | 用途 |
|------|------|
| `npm run dev` | 启动 Tauri 开发模式 |
| `npm run dev:browser` | 浏览器预览模式（用于快速开发和 Agent 测试） |
| `npm run dev:tauri` | Tauri 桌面应用 |
| `npm run dev:both` | 同时启动浏览器 + Tauri（推荐用于双端一致性验证） |
| `npm run build` | 构建所有包 |
| `npm run start` | 启动已构建应用 |

## 双端验证命令

| 命令 | 用途 |
|------|------|
| `npm run dev:both` | 同时启动两种模式，方便并排对比功能一致性 |

**推荐工作流：**
1. 开发阶段：先用 `npm run dev:browser` 在浏览器中快速迭代（方便 Agent 测试）
2. 验证阶段：用 `npm run dev:both` 同时验证两种模式的一致性

## 浏览器自动化命令

### agent-browser（推荐 — 全功能终端自动化）

| 命令 | 用途 |
|------|------|
| `agent-browser --session <name> open <url>` | 打开浏览器并导航 |
| `agent-browser --session <name> eval <js>` | 执行 JavaScript（可调用 window.digitalLife.* API） |
| `agent-browser --session <name> click <sel\|ref>` | 点击元素 |
| `agent-browser --session <name> find role <role> <action> --name <name>` | 按 ARIA 角色定位元素 |
| `agent-browser --session <name> screenshot <path>` | 截图 |
| `agent-browser --session <name> snapshot -i` | 获取可访问性快照 |
| `agent-browser --session <name> console` | 查看控制台日志 |
| `agent-browser --session <name> errors` | 查看页面错误 |
| `agent-browser --session <name> record start/stop` | 录制视频 |
| `agent-browser --session <name> close --all` | 关闭浏览器及会话 |

### Playwright CLI（仅支持静态截图，无交互命令）

| 命令 | 用途 |
|------|------|
| `$env:PATH = "D:\Program Files\nodejs;E:\dev-tools\npm-global;$env:PATH"; $env:PLAYWRIGHT_BROWSERS_PATH = "E:\dev-tools\playwright-browsers"` | 环境设置 |
| `playwright open <url>` | 打开浏览器 |
| `playwright screenshot <url> <file>` | 截取页面截图 |

> ⚠️ 本地安装的 Playwright CLI v1.59.1 **不支持** `click`、`fill`、`eval`、`snapshot` 等交互式命令。交互测试请使用 `agent-browser`。

### Browser Harness

| 命令 | 用途 |
|------|------|
| `$env:PATH = "E:\dev-tools\uv-bin;$env:PATH"; $env:BU_CDP_URL = "http://127.0.0.1:9222"` | 环境设置 |
| `Start-Process "chrome.exe" -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=E:\dev-tools\chrome-debug-profile"` | 启动 Chrome 调试模式 |
| `browser-harness -c "new_tab('url'); wait_for_load()"` | 打开新标签页 |
| `browser-harness -c "capture_screenshot()"` | 截图理解页面 |
| `browser-harness -c "click_at_xy(x, y)"` | 坐标点击 |
| `browser-harness -c "print(page_info())"` | 获取页面信息 |
| `browser-harness -c "exec(open('script.py').read())"` | 执行脚本文件（推荐用于复杂流程） |

## 测试命令

| 命令 | 用途 |
|------|------|
| `npm test` | 单元测试（Vitest） |
| `npm run test:e2e` | E2E 测试（Playwright） |
| `npm run typecheck` | 类型检查 |
| `npx vitest run` | 直接运行 Vitest |

## 包管理

| 命令 | 用途 |
|------|------|
| `pnpm install` | 安装依赖 |
| `pnpm add <pkg> -w <ws>` | 添加依赖 |
| `pnpm list --depth 0` | 列出顶层依赖 |

## 相关文件

- [ai-digital-life/package.json](/E:/Programs/Obsidian/notes/ai-digital-life/package.json)
- [ai-digital-life/vitest.config.ts](/E:/Programs/Obsidian/notes/ai-digital-life/vitest.config.ts)
