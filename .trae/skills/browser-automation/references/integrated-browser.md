# integrated_browser 参考

Trae 内置浏览器自动化工具，直接操控 Trae IDE 中打开的内置浏览器。

## MCP 服务器

- **服务器名称**: `integrated_browser`
- **工具数量**: 16 个浏览器自动化工具
- **可用性**: 取决于当前会话的 MCP 配置。不同 Trae 会话/安装可能启用不同子集的工具。

> **如何确认可用性**：检查当前会话是否暴露 `browser_navigate` 等 MCP 工具。若不可用，请改用 [agent-browser](./agent-browser.md)（终端 CLI，功能更全）。

## 核心特性

| 特性 | 说明 |
|------|------|
| 无需安装 | Trae 内置，MCP 自动加载（会话配置启用时） |
| 完整功能 | 导航、点击、输入、截图、快照、JS 执行等 |
| ref 定位 | 通过页面快照中的 ref 定位元素 |
| JS 执行 | `browser_evaluate` 工具可在页面中执行任意 JavaScript |

## 工具列表（16 个）

### 导航类

| 工具 | 功能 | 关键参数 |
|------|------|---------|
| `browser_navigate` | 导航到 URL | `url`, `newTab`, `position`, `take_screenshot_afterwards` |
| `browser_navigate_back` | 后退一页 | - |
| `browser_tabs` | 标签页管理 | `action` (list/new/close/select), `index`, `position` |

### 交互类

| 工具 | 功能 | 关键参数 |
|------|------|---------|
| `browser_click` | 点击元素 | `ref`, `element`, `button` (left/right/middle), `doubleClick`, `modifiers`, `offsetX`, `offsetY`, `holdDurationMs` |
| `browser_hover` | 悬停元素 | `ref`, `element` |
| `browser_type` | 输入文本 | `ref`, `element`, `text`, `clear`, `submit`, `slowly` |
| `browser_press_key` | 按键 | - |
| `browser_select_option` | 选择选项 | - |

### 信息获取类

| 工具 | 功能 | 关键参数 |
|------|------|---------|
| `browser_snapshot` | 页面快照 | `interactive`, `compact`, `includeDiff`, `maxDepth`, `selector`, `take_screenshot_afterwards` |
| `browser_take_screenshot` | 截图 | - |
| `browser_get_attribute` | 获取属性 | - |
| `browser_console_messages` | 控制台消息 | - |
| `browser_network_requests` | 网络请求 | - |
| `browser_evaluate` | 执行 JavaScript | `script` — 在页面上下文中执行任意 JS |

### 辅助类

| 工具 | 功能 | 说明 |
|------|------|------|
| `browser_wait_for` | 等待条件 | - |
| `browser_scroll` | 滚动页面 | - |

> **注意**：`browser_lock` / `browser_unlock` / `browser_waiting_for_user_interaction` 在部分安装中存在但当前会话不一定启用。如需锁定浏览器，请确认当前会话是否暴露这些工具。

## 调用方式

`browser_*` 工具通过 **MCP tool call** 调用，**不是 PowerShell CLI 命令**。在 Agent 消息中直接使用对应 tool call：

```
# ❌ 错误：这不是 CLI 命令，在 PowerShell 中运行会报错
browser_navigate -url "http://localhost:5173/"

# ✅ 正确：通过 MCP tool call 调用（参数为 JSON 格式）
browser_navigate(url="http://localhost:5173/", take_screenshot_afterwards=true)
browser_snapshot(interactive=true)
browser_click(ref="e0", element="提交按钮")
browser_evaluate(script="document.title")
```

## 标准工作流程

```
# 1. 导航到目标页面
browser_navigate(url="http://localhost:5173/", take_screenshot_afterwards=true)

# 2. 获取页面快照（获取 ref）
browser_snapshot(interactive=true)

# 3. 执行操作
browser_click(ref="e0", element="提交按钮")
browser_type(ref="e1", element="搜索框", text="Hello World", submit=true)

# 4. 执行 JS 验证
browser_evaluate(script="document.querySelector('.adl-statusbar')?.textContent")
```

## 常用操作示例

### 导航

```
# 打开网页
browser_navigate(url="http://localhost:5173/")

# 在新标签页打开
browser_navigate(url="https://example.com", newTab=true)

# 在侧边栏打开（IDE 并排视图）
browser_navigate(url="https://example.com", position="side")

# 后退
browser_navigate_back()
```

### 页面快照

```
# 获取交互式元素快照（获取 ref）
browser_snapshot(interactive=true)

# 获取紧凑格式快照
browser_snapshot(compact=true)

# 获取快照并截图
browser_snapshot(interactive=true, take_screenshot_afterwards=true)

# 获取差异对比
browser_snapshot(includeDiff=true)
```

### 点击操作

```
# 基本点击
browser_click(ref="e0", element="提交按钮")

# 双击
browser_click(ref="e1", element="列表项", doubleClick=true)

# 右键点击
browser_click(ref="e2", element="文件", button="right")

# 带偏移量点击
browser_click(ref="e3", element="按钮", offsetX=10, offsetY=20)

# 按住点击（长按）
browser_click(ref="e4", element="删除按钮", holdDurationMs=500)
```

### 文本输入

```
# 基本输入
browser_type(ref="e0", element="搜索框", text="Hello World")

# 清空后输入
browser_type(ref="e1", element="输入框", text="New Value", clear=true)

# 输入并提交
browser_type(ref="e2", element="搜索框", text="query", submit=true)

# 逐字输入（触发键盘事件）
browser_type(ref="e3", element="输入框", text="slow", slowly=true)
```

### JS 执行（browser_evaluate）

```
# 读取页面标题
browser_evaluate(script="document.title")

# 读取状态栏信息
browser_evaluate(script="document.querySelector('.adl-statusbar')?.textContent")

# 通过应用内 API 打开工作区（绕过原生对话框）
browser_evaluate(script="window.digitalLife.workspace.open('E:\\\\AI-DIGITAL-LIFE\\\\SourceWorkspace')")

# DOM 遍历
browser_evaluate(script="document.querySelectorAll('.adl-filetree__node--directory').length")
```

### 标签页管理

```
# 列出所有标签页
browser_tabs(action="list")

# 新建标签页
browser_tabs(action="new")

# 选择标签页
browser_tabs(action="select", index=1)

# 关闭标签页
browser_tabs(action="close", index=1)
```

### 辅助操作

```
# 等待元素出现
browser_wait_for(selector=".loaded", timeout=5000)

# 滚动页面
browser_scroll(selector=".target")   # 滚动到元素
browser_scroll(scrollY=500)          # 滚动 Y 轴

# 获取控制台消息
browser_console_messages()

# 获取网络请求
browser_network_requests()
```

## ref 定位系统

页面快照返回的 `ref` 是元素的唯一标识，用于后续操作：

```yaml
- role: button
  name: 提交
  ref: e0      # ← 用于 browser_click
- role: textbox
  name: 搜索
  ref: e1      # ← 用于 browser_type
```

### ref 使用规则

| 规则 | 说明 |
|------|------|
| ref 来自快照 | 每次页面变化后需重新 `snapshot` 获取新 ref |
| ref 唯一性 | 同一时间每个 ref 只对应一个元素 |
| ref 格式 | `e0`, `e1`, `e2` ... 数字递增 |
| ref 非永久 | 页面刷新/导航后 ref 会重新分配 |

## 与 agent-browser 对比

| 特性 | integrated_browser | agent-browser |
|------|-------------------|---------------|
| 运行环境 | Trae 内置浏览器 | 独立浏览器进程 |
| 调用方式 | MCP tool call（非 CLI） | 终端 CLI 命令 |
| 会话管理 | MCP 自动管理 | 手动指定 `--session` |
| JS 执行 | `browser_evaluate` | `eval` |
| 截图方式 | `snapshot` 可选带截图 / `browser_take_screenshot` | `screenshot` 独立命令 |
| 控制台检查 | `browser_console_messages` | `console` / `errors` |
| 视频录制 | 不支持 | `record start/stop` |
| 命令丰富度 | 16 个工具 | 30+ 命令（fill/press/drag/upload/pdf 等） |
| 依赖 | Trae 内置，无需安装 | 需要 npm 安装 |
| 适用场景 | Trae IDE 内交互 | 终端全功能自动化 |

## 项目应用：AI Digital Life

### 测试工作流

```
# 1. 打开应用
browser_navigate(url="http://localhost:5173/")

# 2. 快照获取 ref
browser_snapshot(interactive=true)

# 3. 通过 JS API 打开工作区（绕过原生对话框）
browser_evaluate(script="window.digitalLife.workspace.open('E:\\\\AI-DIGITAL-LIFE\\\\SourceWorkspace')")

# 4. 刷新页面并验证工作区加载
browser_navigate(url="http://localhost:5173/")
browser_evaluate(script="document.querySelector('.adl-statusbar')?.textContent")
# 确认状态栏显示 Git 信息（非"非 Git 仓库"）

# 5. 快照获取新 ref
browser_snapshot(interactive=true)

# 6. 截图保存
browser_take_screenshot()
```

## 常见问题

| 问题 | 解决 |
|------|------|
| 工具不可用（未暴露） | 检查会话 MCP 配置；改用 agent-browser |
| ref 失效 | 页面变化后重新 `browser_snapshot` |
| 操作失败 | 检查 `browser_snapshot` 确认元素存在 |
| 需要新标签页 | 使用 `browser_navigate(newTab=true)` |
| 需要 JS 求值 | 使用 `browser_evaluate(script=...)` |
| 在 PowerShell 运行 `browser_*` | ❌ 这些是 MCP 工具，不是 CLI 命令 |

## 相关文件

- [browser-automation 规则](../../rules/browser-automation.md)
- [browser-automation 技能](../SKILL.md)
- [agent-browser 参考](./agent-browser.md)
