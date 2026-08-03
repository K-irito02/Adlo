---
name: browser-automation
description: Use when 需要对 AI Digital Life 应用执行浏览器自动化（打开网页、点击按钮、填写表单、执行 JS、截图、验证 UI、检查控制台、QA 探索测试），或不确定该用 agent-browser、integrated_browser、Browser Harness 还是 Playwright 工具。
allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*), Bash(browser-harness:*), Bash(playwright:*)
---

# Browser Automation

浏览器自动化技能，采用渐进式披露设计：**第一层**快速选择工具 → **第二层**快速开始 → **第三层**详细参考。

> **⚠️ 前置提示**：调试日志收起器是最高优先级的调试手段。遇到 UI/交互问题时，**先通过调试日志定位问题**（页面"复制调试日志"按钮 / 项目根目录 `debug-logs.txt`），再根据结果决定是否需要进行浏览器自动化。详见 [AGENTS.md](../../../AGENTS.md#调试工具) 和 [dev-rules.md](../../../.agents/rules/dev-rules.md#问题排查规范)。

---

## 第一层：快速选择

| 你的任务 | 选择 |
|---------|------|
| Trae 内置浏览器交互（导航、点击、输入、截图） | integrated_browser（MCP 工具，非 CLI 命令） |
| 执行 JS、获取控制台、检查网络请求 | integrated_browser（`browser_evaluate` / `browser_console_messages`） |
| 让用户在内置浏览器中打开 URL | 纯文本 URL（不包裹），用户点击即可跳转 |
| 打开网页、点击按钮、填写表单、录屏 | agent-browser（注意：打开的是**独立 Chrome 实例**） |
| 执行 JS、无障碍快照、检查控制台错误 | agent-browser |
| 需要 `fill`/`press`/`drag`/`upload`/`pdf` 等丰富命令 | agent-browser |
| 连接用户已打开的 Chrome、坐标点击 | Browser Harness |
| 仅截一张图 / 保存 PDF | Playwright CLI |

**选型要点**：

- **agent-browser**（v0.26.0）是首选 CLI：功能最全（`eval` / `find role` / `snapshot` / `screenshot` / `console` / `errors` / `record` 录屏 / `fill` / `press` / `drag` / `upload` / `pdf` 等 30+ 命令）。
- **integrated_browser** 是 Trae 内置 MCP 工具（16 个工具，含 `browser_evaluate` 执行 JS）：在 Trae IDE 内可用，但**不可在终端运行**，且可用性取决于会话 MCP 配置。
- **Browser Harness** 连接用户真实 Chrome，坐标点击可穿透 iframe / Shadow DOM。
- **Playwright CLI**（v1.49.0）本地仅支持 `open`、`screenshot`、`pdf`，无交互命令。

---

## 第二层：快速开始

### agent-browser（终端全功能自动化，独立 Chrome 实例）

```powershell
# 标准流程：打开 → 加载工作区 → 操作 → 清理
agent-browser --session test open http://127.0.0.1:5173
agent-browser --session test eval "window.digitalLife.workspace.open('E:\\AI-DIGITAL-LIFE\\SourceWorkspace').then(() => location.reload())"
agent-browser --session test wait 3000
agent-browser --session test snapshot -i
# ... 执行操作 ...
agent-browser --session test close --all
```

> 不使用 `--headed` 参数（可能导致 daemon 死锁），使用默认 headless 模式。
>
> **提示**：运行 `agent-browser skills get core --full` 可查看 CLI 自带的完整用法指南与工作流模板。

### integrated_browser（Trae 内置浏览器 - MCP 工具）

`browser_*` 系列工具通过 MCP 协议暴露，通过 Agent 的 tool call 直接调用，**不可在终端 CLI 中运行**。

```
# 通过 MCP tool call 调用（非 PowerShell 命令）：
browser_navigate(url="http://localhost:5173/", take_screenshot_afterwards=true)
browser_snapshot(interactive=true)
browser_click(ref="e0", element="提交按钮")
browser_evaluate(script="document.title")
```

> **可用性**：integrated_browser 是否可用取决于当前会话的 MCP 配置。若当前会话未启用该 MCP 服务器，请改用 agent-browser。
>
> 对于 Trae 内置浏览器，更简单的做法是直接输出纯文本 URL 让用户点击跳转。

### Browser Harness（备用，连接用户 Chrome）

```powershell
$env:PATH = "E:\dev-tools\uv-bin;$env:PATH"
$env:BU_CDP_URL = "http://127.0.0.1:9222"
Start-Process "chrome.exe" -ArgumentList "--remote-debugging-port=9222"
browser-harness -c "new_tab('http://localhost:5173'); wait_for_load()"
```

### Playwright CLI（仅截图 / PDF）

```powershell
playwright screenshot http://localhost:5173 screenshot.png
playwright pdf http://localhost:5173 page.pdf
```

---

## 第三层：详细参考

| 文件 | 内容 |
|------|------|
| [references/agent-browser.md](./references/agent-browser.md) | agent-browser 完整命令参考、会话管理、工作流示例 |
| [references/integrated-browser.md](./references/integrated-browser.md) | Trae 内置浏览器自动化工具完整参考（16 个 MCP 工具） |
| [references/browser-harness.md](./references/browser-harness.md) | CDP 命令、Python 脚本模式、辅助函数 |
| [references/playwright-cli.md](./references/playwright-cli.md) | Playwright CLI（本地 v1.49.0 仅 open/screenshot/pdf） |
| [references/mcp-playwright.md](./references/mcp-playwright.md) | MCP Playwright 工具（当前环境不可用，参考用） |
| [references/adl-project-selectors.md](./references/adl-project-selectors.md) | 项目专属 UI 选择器、元素状态定义 |
| [scripts/changes-panel-test-checklist.md](./scripts/changes-panel-test-checklist.md) | 变更面板测试步骤清单（Agent 逐步执行） |
| [scripts/browser-subfolder-test-checklist.md](./scripts/browser-subfolder-test-checklist.md) | 浏览器子目录测试步骤清单 |
| [scripts/_template-checklist.md](./scripts/_template-checklist.md) | 步骤清单模板（新建清单时从此复制） |
| [经验教训总结](../../../docs/knowledge-base/browser-automation/lessons.md) | 脚本方案经验教训（跨平台路径、daemon、localStorage 等） |

---

## 测试产物存储

所有测试产物（截图、视频、文档）统一保存到仓库根目录 `test-artifacts/`（已加入 `.gitignore`）。

```
test-artifacts/
├── screenshots/    # 截图：{功能名}-{yyyyMMdd-HHmmss}.png
├── videos/         # 录屏：{功能名}-{yyyyMMdd-HHmmss}.webm
└── documents/      # 文档：{报告类型}-{yyyyMMdd-HHmmss}.md
```

---

## 关键经验

> 完整经验总结参见 [browser-automation 规则](../../rules/browser-automation.md)

| 经验 | 说明 |
|------|------|
| integrated_browser 是 MCP 工具 | `browser_*` 通过 MCP 协议调用，**不可在 PowerShell 中运行**；可用性取决于会话 MCP 配置 |
| integrated_browser 支持 JS 执行 | `browser_evaluate` 工具可在页面中执行任意 JS |
| 纯文本 URL 即可打开内置浏览器 | Trae IDE 自动使纯文本 URL 可点击，不要用 `` 包裹 |
| agent-browser 打开独立 Chrome | agent-browser 启动的是自己的 Chromium 进程，非 IDE 内置浏览器 |
| 不使用 `--headed` | agent-browser 可能导致 daemon 死锁，使用默认 headless 模式 |
| ref 来自快照 | 每次页面变化后需重新 `snapshot -i` 获取新 ref，**不能硬编码 ref** |
| 工作区必须真正加载 | `workspace.open()` 后需刷新页面，确认状态栏显示 Git 信息 |
| 原生对话框需绕过 | 使用 `window.digitalLife.workspace.open(path)` 替代点击菜单 |
| 操作后等待验证 | 每次操作后 `wait 1000~3000` + `snapshot` 确认生效 |
| 路径转义 | agent-browser `eval` 用 `E:\\path`，Browser Harness `js()` 用 `E:/path` |
| 变更面板依赖工作区上下文 | 工作区未加载时显示"无变更"、状态栏显示"非 Git 仓库" |
| daemon 操作间隔 | `close --all` 后等待 2-3 秒再执行 `open`，避免超时 |

---

## 常见错误（Common Mistakes）

| 错误 | 正确做法 |
|------|----------|
| 在 PowerShell 中运行 `browser_navigate` | 通过 MCP tool call 调用 integrated_browser |
| 使用 `--headed` 启动 agent-browser | 使用默认 headless 模式 |
| 硬编码 ref（如 `click e0`） | 每次操作前重新 `snapshot -i` 获取最新 ref |
| 尝试自动化原生 OS 对话框 | 用 `window.digitalLife.workspace.open(path)` 绕过 |
| 认为 `workspace.open()` 即加载完成 | 刷新页面并确认状态栏显示 Git 信息 |
| 用 Playwright CLI 做交互（click/fill/eval） | 本地 v1.49.0 仅支持 open/screenshot/pdf，交互用 agent-browser |
| 把 `ref=eXX` 当 CSS 选择器 | `ref` 是虚拟引用，不是 HTML 属性；DOM 定位用 `eval` |
| 连续命令间不加等待 | 操作间 `wait 1000~3000`，`close --all` 后等 2-3 秒再 `open` |
| 以为 integrated_browser 不支持 JS | 使用 `browser_evaluate` 工具执行任意 JS |

---

## 相关技能

- **dogfood**: 系统性探索测试，发现 Bug 和 UX 问题（使用 agent-browser 录屏 + 截图）
- **run-project-surfaces**: 启动应用的不同模式（浏览器预览 / Tauri 桌面）
