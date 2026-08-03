# Playwright CLI 参考

> **⚠️ 重要限制**：本地安装的 Playwright CLI v1.59.1 **仅支持** `open` 和 `screenshot` 命令。交互式命令（`click`、`fill`、`eval` 等）**不可用**。
>
> **建议**：交互式自动化请使用 [agent-browser](./agent-browser.md)。

## 定位

Playwright CLI 是**辅助工具**，仅用于静态截图场景。所有交互式操作请使用 agent-browser。

## 安装与环境

```powershell
# 已安装位置：
# 二进制：E:\dev-tools\npm-global\playwright
# 浏览器：E:\dev-tools\playwright-browsers\

# 会话前环境配置
$env:PATH = "D:\Program Files\nodejs;E:\dev-tools\npm-global;$env:PATH"
$env:PLAYWRIGHT_BROWSERS_PATH = "E:\dev-tools\playwright-browsers"
```

## 可用命令（本地 v1.59.1 实测）

| 操作 | 状态 | 命令 |
|------|------|------|
| 打开浏览器 | ✅ 可用 | `playwright open http://localhost:5173` |
| 静态截图 | ✅ 可用 | `playwright screenshot <url> <file>` |
| 点击元素 | ❌ 不可用 | 用 agent-browser `find role` / `click` |
| JS 求值 | ❌ 不可用 | 用 agent-browser `eval` |
| 文件树导航 | ❌ 不可用 | 用 agent-browser `eval` + DOM 遍历 |
| 无障碍快照 | ❌ 不可用 | 用 agent-browser `snapshot -i` |
| 控制台/错误检查 | ❌ 不可用 | 用 agent-browser `console` / `errors` |
| 视频录制 | ❌ 不可用 | 用 agent-browser `record start/stop` |

## 项目应用：AI Digital Life

### 启动应用并截图（本地唯一可用的能力）

```powershell
# 1. 启动应用
cd E:\AI-DIGITAL-LIFE\SourceWorkspace
npm run dev:browser

# 2. 设置环境
$env:PATH = "D:\Program Files\nodejs;E:\dev-tools\npm-global;$env:PATH"
$env:PLAYWRIGHT_BROWSERS_PATH = "E:\dev-tools\playwright-browsers"

# 3. 静态截图（这是唯一可用的交互式命令）
playwright screenshot http://localhost:5173 screenshot.png
```

## 参考（按 Playwright CLI 1.52+ 规范整理，本地不可用）

> 以下命令来自 Playwright CLI 1.52+ 规范文档，**本地 v1.59.1 不可用**。列出仅作参考；如需等价能力请使用 **agent-browser**（JS 脚本完全一致）。

### 文件树操作（等价 agent-browser 脚本）

```bash
# 按名称展开目录
playwright eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'docs') { item.querySelector('.adl-tree-node__toggle')?.click(); break; } } })()"

# 点击展开目录内的文件
playwright eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'docs') { const files = item.querySelector('ul')?.querySelectorAll('li'); if (files) for (const f of files) { if (!f.classList.contains('adl-filetree__node--directory')) { f.querySelector('.adl-tree-node__label')?.click(); break; } } break; } } })()"

# 列出文件树根节点
playwright eval "(() => { return JSON.stringify(Array.from(document.querySelectorAll('.adl-filetree__item')).map(el => ({ name: el.querySelector('.adl-tree-node__label-text')?.textContent, isDir: el.classList.contains('adl-filetree__node--directory'), expanded: el.getAttribute('aria-expanded') }))); })()"
```

### 标题栏 / 输入区（等价 agent-browser 命令）

```bash
# 标题栏
playwright click "button[aria-label='主题']"
playwright click "button[aria-label='设置']"

# 输入区
playwright fill "[data-testid='composer-input']" "Hello"
playwright click "[data-testid='composer-send']"

# 面板
playwright click "button[aria-label='切换左侧边栏']"
playwright click "button[aria-label='切换右侧面板']"
```

### 切换工具标签页

```bash
# 按 role+name 点击（最稳定）
playwright click "getByRole('tab', { name: '文件' })"
playwright click "getByRole('tab', { name: '变更' })"

# 或按 CSS 选择器
playwright click "#_r_0_-files-tab"
playwright click "#_r_0_-changes-tab"
```

### 打开工作区（浏览器模式 — 绕过原生对话框）

在浏览器模式下，从文件菜单点击"打开文件夹"会触发**原生 OS 对话框**（Windows 上是 PowerShell `FolderBrowserDialog`），Playwright CLI 无法交互。请通过 `eval` 调用应用内 API：

```bash
playwright eval "window.digitalLife.workspace.open('E:\\AI-DIGITAL-LIFE\\SourceWorkspace').then(r => JSON.stringify(r))"
```

Vite Preview API 等价形式：

```
POST /__adl_preview_api__/workspace/open
Body: {"workspacePath": "E:\\AI-DIGITAL-LIFE\\SourceWorkspace"}
```

### 运行 Playwright 测试

```powershell
cd E:\AI-DIGITAL-LIFE\SourceWorkspace
$env:PATH = "D:\Program Files\nodejs;$env:PATH"
$env:PLAYWRIGHT_BROWSERS_PATH = "E:\dev-tools\playwright-browsers"
npx playwright test --headed
```

## 何时改用 agent-browser

涉及 JS 密集 DOM 导航（文件树）、应用内 API 调用（打开工作区）或复杂 evaluate 模式的工作流，请改用 **agent-browser**。它提供 `eval`、`find role`、`snapshot -i`、`console`、`errors` 等完整能力。详见 [agent-browser 参考](./agent-browser.md)。
