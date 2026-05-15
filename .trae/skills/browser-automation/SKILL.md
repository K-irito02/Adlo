---
name: browser-automation
description: Browser automation for AI Digital Life. Primary tool: agent-browser (dogfood) — full-featured terminal automation with JS eval, snapshot, console checks. Backup: Browser Harness (CDP) for AI-driven exploration and coordinate clicks. Auxiliary: Playwright CLI for static screenshots. Includes project-specific UI selectors, element state definitions, and wait condition templates. Triggers include "open a website", "test the UI", "take a screenshot", "fill a form", "click a button", "scrape data", "automate browser", "verify UI", "dogfood", "QA", or any task requiring programmatic web interaction with the AI Digital Life app.
---

# Browser Automation

浏览器自动化技能，采用渐进式披露设计。

---

## 第一层：快速选择

| 你的任务 | 选择 |
|---------|------|
| 打开网页、点击按钮、填写表单 | agent-browser |
| 执行 JS、获取页面信息、检查控制台 | agent-browser |
| 截图、录屏、自动化测试 | agent-browser |
| 连接用户已打开的 Chrome | Browser Harness |
| 坐标点击、复杂 Python 脚本 | Browser Harness |
| 仅截一张图 | Playwright CLI |

---

## 第二层：快速开始

### agent-browser（推荐）

```powershell
# 标准流程：打开 → 加载工作区 → 操作 → 清理
agent-browser --session test open http://127.0.0.1:5173
agent-browser --session test eval "window.digitalLife.workspace.open('E:\\path').then(() => location.reload())"
agent-browser --session test wait 3000
agent-browser --session test snapshot -i
# ... 执行操作 ...
agent-browser --session test close --all
```

### Browser Harness（备用）

```powershell
$env:PATH = "E:\dev-tools\uv-bin;$env:PATH"
$env:BU_CDP_URL = "http://127.0.0.1:9222"
Start-Process "chrome.exe" -ArgumentList "--remote-debugging-port=9222"
browser-harness -c "new_tab('http://localhost:5173'); wait_for_load()"
```

### Playwright CLI（仅截图）

```powershell
playwright screenshot http://localhost:5173 screenshot.png
```

---

## 第三层：详细参考

| 文件 | 内容 |
|------|------|
| [references/agent-browser.md](./references/agent-browser.md) | 完整命令参考、会话管理、工作流示例 |
| [references/browser-harness.md](./references/browser-harness.md) | CDP 命令、Python 脚本模式、辅助函数 |
| [references/playwright-cli.md](./references/playwright-cli.md) | 静态截图命令参考 |
| [references/adl-project-selectors.md](./references/adl-project-selectors.md) | 项目专属 UI 选择器、元素状态定义 |
| [scripts/changes-panel-test-checklist.md](./scripts/changes-panel-test-checklist.md) | 变更面板测试步骤清单（Agent 逐步执行） |
| [scripts/lessons-learned.md](./scripts/lessons-learned.md) | 脚本方案经验教训总结 |
| [scripts/_template-checklist.md](./scripts/_template-checklist.md) | 步骤清单模板（新建清单时从此复制） |

---

## 测试产物存储

所有测试产物（截图、视频、文档）统一保存到根目录 `test-artifacts/`（已加入 `.gitignore`）。

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
| 工作区必须真正加载 | `workspace.open()` 后需刷新页面，确认状态栏显示 Git 信息 |
| 原生对话框需绕过 | 使用 `window.digitalLife.workspace.open(path)` 替代点击菜单 |
| 操作后等待验证 | 每次操作后 `wait` + `snapshot -i` 确认生效 |
| 路径转义 | agent-browser 用 `E:\\path`，Browser Harness 用 `E:/path` |
| 不使用 `--headed` | 可能导致 daemon 死锁，使用默认 headless 模式 |
| ref 不硬编码 | 页面刷新后 ref 编号变化，每次操作前重新 `snapshot -i` |

---

## 相关技能

- **dogfood**: 系统性探索测试，发现 Bug 和 UX 问题
- **run-project-surfaces**: 启动应用的不同模式
