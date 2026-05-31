# integrated_browser Reference

Trae 内置浏览器自动化工具，直接操控 Trae IDE 中打开的内置浏览器。

## MCP 服务器

- **服务器名称**: `integrated_browser`
- **服务器路径**: `c:\Users\31432\.trae-cn\mcps\s_notes-df2a1686\solo_agent_lite\integrated_browser\`
- **工具列表**: 18 个浏览器自动化工具

## 核心特性

| 特性 | 说明 |
|------|------|
| 自动锁定 | 每次操作自动锁定浏览器，完成后需手动解锁 |
| 无需安装 | Trae 内置，MCP 自动加载 |
| 完整功能 | 导航、点击、输入、截图、快照等 |
| ref 定位 | 通过页面快照中的 ref 定位元素 |
| 权限提示 | 操作前显示元素描述，需确认权限 |

## 工具列表

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

### 辅助类

| 工具 | 功能 | 说明 |
|------|------|------|
| `browser_lock` | 锁定浏览器 | 防止用户干扰 |
| `browser_unlock` | 解锁浏览器 | 必须操作完成后调用 |
| `browser_wait_for` | 等待条件 | - |
| `browser_scroll` | 滚动页面 | - |
| `browser_waiting_for_user_interaction` | 等待用户交互 | - |

## 标准工作流程

```powershell
# 1. 导航到目标页面
browser_navigate -url "http://localhost:5173/" -take_screenshot_afterwards true

# 2. 获取页面快照（自动锁定）
browser_snapshot -interactive true

# 3. 执行操作
browser_click -ref "e0" -element "提交按钮"
browser_type -ref "e1" -element "搜索框" -text "Hello World" -submit true

# 4. 解锁浏览器
browser_unlock
```

## 常用命令示例

### 基本导航

```powershell
# 打开网页
browser_navigate -url "http://localhost:5173/"

# 在新标签页打开
browser_navigate -url "https://example.com" -newTab true

# 在侧边栏打开（IDE 并排视图）
browser_navigate -url "https://example.com" -position "side"

# 后退
browser_navigate_back
```

### 页面快照

```powershell
# 获取交互式元素快照
browser_snapshot -interactive true

# 获取紧凑格式快照
browser_snapshot -compact true

# 获取快照并截图
browser_snapshot -interactive true -take_screenshot_afterwards true

# 获取差异对比
browser_snapshot -includeDiff true
```

### 点击操作

```powershell
# 基本点击
browser_click -ref "e0" -element "提交按钮"

# 双击
browser_click -ref "e1" -element "列表项" -doubleClick true

# 右键点击
browser_click -ref "e2" -element "文件" -button "right"

# 带偏移量点击
browser_click -ref "e3" -element "按钮" -offsetX 10 -offsetY 20

# 按住点击（长按）
browser_click -ref "e4" -element "删除按钮" -holdDurationMs 500

# 带修饰键点击
browser_click -ref "e5" -element "链接" -modifiers ["Control"]
```

### 文本输入

```powershell
# 基本输入
browser_type -ref "e0" -element "搜索框" -text "Hello World"

# 清空后输入
browser_type -ref "e1" -element "输入框" -text "New Value" -clear true

# 输入并提交
browser_type -ref "e2" -element "搜索框" -text "query" -submit true

# 逐字输入（触发键盘事件）
browser_type -ref "e3" -element "输入框" -text "slow" -slowly true
```

### 标签页管理

```powershell
# 列出所有标签页
browser_tabs -action "list"

# 新建标签页
browser_tabs -action "new"

# 在侧边新建标签页
browser_tabs -action "new" -position "side"

# 选择标签页
browser_tabs -action "select" -index 1

# 关闭标签页
browser_tabs -action "close" -index 1
```

### 浏览器锁定

```powershell
# 锁定浏览器
browser_lock

# 解锁浏览器（必须调用）
browser_unlock
```

### 辅助操作

```powershell
# 等待元素出现
browser_wait_for -selector ".loaded" -timeout 5000

# 滚动页面
browser_scroll -selector ".target" # 滚动到元素
browser_scroll -scrollY 500      # 滚动 Y 轴

# 获取控制台消息
browser_console_messages

# 获取网络请求
browser_network_requests
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

## 权限提示

操作某些元素时会显示权限提示：

```
提示: 将执行操作"点击提交按钮"于元素 ref=e0
是否允许?
```

这是正常的内置安全机制，确保用户知道自动化操作。

## 与 agent-browser 对比

| 特性 | integrated_browser | agent-browser |
|------|-------------------|---------------|
| 运行环境 | Trae 内置浏览器 | 独立浏览器进程 |
| 会话管理 | MCP 自动管理 | 手动指定 `--session` |
| 截图方式 | `snapshot` 可选带截图 | `screenshot` 独立命令 |
| JS 执行 | 不支持直接执行 JS | `eval` 支持 |
| 依赖 | 无需安装 | 需要 npm 安装 |
| 适用场景 | Trae IDE 内交互 | 终端全功能自动化 |

## 项目应用：AI Digital Life

### 测试工作流

```powershell
# 1. 打开应用
browser_navigate -url "http://localhost:5173/"

# 2. 快照获取 ref
browser_snapshot -interactive true

# 3. 打开工作区
browser_click -ref "e20" -element "打开工作空间"
browser_type -ref "e22" -element "路径输入框" -text "E:\\path\\to\\workspace" -submit true

# 4. 验证工作区加载
browser_snapshot -interactive true
# 确认状态栏显示 Git 信息（非"非 Git 仓库"）

# 5. 测试文件树
browser_click -ref "e39" -element "文件树"
browser_snapshot -interactive true

# 6. 截图保存
browser_take_screenshot

# 7. 解锁
browser_unlock
```

## 常见问题

| 问题 | 解决 |
|------|------|
| 浏览器被锁定 | 调用 `browser_unlock` |
| ref 失效 | 页面变化后重新 `snapshot` |
| 操作失败 | 检查 `browser_snapshot` 确认元素存在 |
| 需要新标签页 | 使用 `browser_navigate -newTab true` |
| 权限提示过多 | 使用 `browser_snapshot` 获取完整 ref |

## 相关文件

- [browser-automation 规则](../../rules/browser-automation.md)
- [browser-automation 技能](../SKILL.md)
- [agent-browser 参考](./agent-browser.md)
