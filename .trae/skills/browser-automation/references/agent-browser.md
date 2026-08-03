# agent-browser 参考

面向 AI 代理的快速浏览器自动化 CLI（v0.26.0）。这是 **dogfood** 技能进行系统性探索测试时使用的工具。

## 安装

```powershell
# 已全局安装（v0.26.0）：
# 二进制：C:\Users\31432\AppData\Roaming\npm\agent-browser

# 无需额外 PATH 配置 — 通过 npm 全局可用
agent-browser --version
```

> **性能提示**：直接使用 `agent-browser`，**不要**使用 `npx agent-browser`。直接二进制使用 Rust 快速客户端，`npx` 走 Node.js 链路，显著更慢。
>
> **自带技能系统**：运行 `agent-browser skills get core --full` 可查看 CLI 自带的完整用法指南、工作流模板与选择器参考。优先使用此命令获取最新用法，而非凭记忆猜测。

## 核心能力（已实测验证）

以下能力已通过对 AI Digital Life 的实际测试验证：

| 能力 | 命令 | 已验证 |
|------|------|--------|
| 打开页面 | `agent-browser open <url>` | ✅ |
| JS 求值 | `agent-browser eval "<js>"` | ✅ |
| 按 role+name 点击 | `agent-browser find role <role> click --name <name>` | ✅ |
| 按 ref/选择器点击 | `agent-browser click <sel\|@ref>` | ✅ |
| 双击 | `agent-browser dblclick <sel>` | ✅ |
| 清空并填充 | `agent-browser fill <sel> <text>` | ✅ |
| 输入文本 | `agent-browser type <sel> <text>` | ✅ |
| 按键 | `agent-browser press <key>` | ✅ |
| 键盘输入 | `agent-browser keyboard type <text>` | ✅ |
| 悬停 | `agent-browser hover <sel>` | ✅ |
| 勾选/取消 | `agent-browser check\|uncheck <sel>` | ✅ |
| 下拉选择 | `agent-browser select <sel> <val...>` | ✅ |
| 拖放 | `agent-browser drag <src> <dst>` | ✅ |
| 上传文件 | `agent-browser upload <sel> <files...>` | ✅ |
| 下载文件 | `agent-browser download <sel> <path>` | ✅ |
| 滚动 | `agent-browser scroll <dir> [px]` | ✅ |
| 截图 | `agent-browser screenshot [path]` | ✅ |
| 保存 PDF | `agent-browser pdf <path>` | ✅ |
| 无障碍快照 | `agent-browser snapshot` / `snapshot -i` | ✅ |
| 控制台日志 | `agent-browser console` | ✅ |
| 页面错误 | `agent-browser errors` | ✅ |
| 等待 | `agent-browser wait <sel\|ms>` | ✅ |
| 导航 | `agent-browser back\|forward\|reload` | ✅ |
| 会话管理 | `agent-browser --session <name>` | ✅ |
| 关闭会话 | `agent-browser close [--all]` | ✅ |
| 视频录制 | `agent-browser record start/stop` | ✅ |
| 连接 CDP | `agent-browser connect <port\|url>` | ✅ |

### 获取信息（get 子命令）

```powershell
agent-browser get text <sel>       # 获取元素文本
agent-browser get html <sel>       # 获取元素 HTML
agent-browser get value <sel>      # 获取输入框值
agent-browser get attr <name> <sel> # 获取属性
agent-browser get title            # 获取页面标题
agent-browser get url              # 获取当前 URL
agent-browser get count <sel>      # 统计匹配元素数量
agent-browser get box <sel>        # 获取元素边界框
```

### 检查状态（is 子命令）

```powershell
agent-browser is visible <sel>     # 元素是否可见
agent-browser is enabled <sel>     # 元素是否启用
agent-browser is checked <sel>     # 复选框是否勾选
```

### 查找元素（find 子命令）

```powershell
agent-browser find role <role> <action> [--name <name>]   # 按 role 定位
agent-browser find text <text> <action>                   # 按文本定位
agent-browser find label <label> <action>                 # 按 label 定位
agent-browser find placeholder <text> <action>            # 按 placeholder 定位
agent-browser find testid <id> <action>                   # 按 data-testid 定位
agent-browser find first\|last\|nth <sel> <action>        # 按位置定位
```

## 何时使用

| 场景 | 为什么选 agent-browser |
|------|------------------------|
| 终端全功能浏览器自动化 | 支持 `eval`、`click`、`fill`、`find role`、`snapshot`、`screenshot`、`console` —— 最完整的 CLI 工具 |
| Dogfood/探索性测试 | dogfood 技能使用；支持 `record start/stop` 录制视频 |
| 需要无障碍树 | `snapshot -i` 返回带 ref 编号的结构化无障碍树，便于定位 |
| 需要控制台错误检查 | `console` 和 `errors` 命令无需手动检查即可发现 JS 错误 |
| 复杂多步工作流 | `--session` 会话管理 + 命令链 |

## 项目应用：AI Digital Life

### 完整测试工作流

在真实测试会话中验证过的文件树完整测试工作流：

```powershell
# 第 1 步：以命名会话打开应用（注意：不使用 --headed，避免 daemon 死锁）
agent-browser --session dogfood-test open http://127.0.0.1:5173/

# 第 2 步：通过应用内 API 打开工作区（绕过原生 OS 对话框）
agent-browser --session dogfood-test eval "window.digitalLife.workspace.open('E:\\AI-DIGITAL-LIFE\\SourceWorkspace').then(r => JSON.stringify(r))"

# 第 3 步：按 role 点击"文件"标签页
agent-browser --session dogfood-test find role tab click --name "文件"

# 第 4 步：刷新文件树以触发加载
agent-browser --session dogfood-test click <ref-from-snapshot>
# 或直接用 CSS 选择器：
agent-browser --session dogfood-test eval "document.querySelector('[aria-label=刷新]')?.click()"

# 第 5 步：等待文件树加载
agent-browser --session dogfood-test wait 2000

# 第 6 步：按名称展开 "docs" 目录（DOM 遍历）
agent-browser --session dogfood-test eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'docs') { item.querySelector('.adl-tree-node__toggle')?.click(); break; } } })()"

# 第 7 步：点击展开目录内的文件
agent-browser --session dogfood-test eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'docs') { const files = item.querySelector('ul')?.querySelectorAll('li'); if (files) for (const f of files) { if (!f.classList.contains('adl-filetree__node--directory')) { f.querySelector('.adl-tree-node__label')?.click(); break; } } break; } } })()"

# 第 8 步：截图验证
agent-browser --session dogfood-test screenshot E:\path\to\screenshots\result.png

# 第 9 步：切换到"变更"标签页
agent-browser --session dogfood-test find role tab click --name "变更"

# 第 10 步：切回并点击另一个文件
agent-browser --session dogfood-test find role tab click --name "文件"
agent-browser --session dogfood-test eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'UIOperationManual') { item.querySelector('.adl-tree-node__toggle')?.click(); break; } } })()"
agent-browser --session dogfood-test eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'UIOperationManual') { const files = item.querySelector('ul')?.querySelectorAll('li'); if (files) for (const f of files) { const t = f.querySelector('.adl-tree-node__label-text')?.textContent; if (t === 'README.md') { f.querySelector('.adl-tree-node__label')?.click(); break; } } break; } } })()"

# 第 11 步：验证无控制台错误
agent-browser --session dogfood-test console
agent-browser --session dogfood-test errors

# 第 12 步：清理
agent-browser --session dogfood-test close --all
```

### 关键模式

#### 打开工作区（绕过原生对话框）

```powershell
# "打开文件夹"菜单会触发原生 OS 对话框 — 直接调用应用内 API
agent-browser eval "window.digitalLife.workspace.open('E:\\AI-DIGITAL-LIFE\\SourceWorkspace').then(r => JSON.stringify(r))"
```

> 注意：`workspace.open()` 只把工作区加入侧边栏列表，**不会**自动加载到上下文。需 `location.reload()` 刷新，并确认状态栏显示 Git 分支信息（而非"非 Git 仓库"）。

#### 按 role 定位元素（最稳定）

```powershell
# 按 role 和 name 点击 — 不受 DOM 结构变化影响
agent-browser find role tab click --name "文件"
agent-browser find role button click --name "主题"

# 列出所有可交互元素以获取 ref
agent-browser snapshot -i
```

#### 动态内容 DOM 遍历

```powershell
# 对复杂 DOM 导航求值任意 JS
agent-browser eval "document.querySelector('.adl-filetree-scroll')?.querySelectorAll('li')?.length"
```

#### 状态验证

```powershell
# 检查 JS 错误
agent-browser errors

# 检查控制台输出
agent-browser console

# 获取无障碍快照（限深度）
agent-browser snapshot -i --depth 2
```

## 常见坑

| 问题 | 解决 |
|------|------|
| `find role` 可能匹配不上本地化名称 | 改用 `eval` 做 DOM 遍历 |
| `eval` 中反斜杠需要双重转义 | 用 `E:\\path`（双反斜杠），或用 `E:/path`（正斜杠）—— 两者均可 |
| 打开工作区后文件树不显示 | 先点击刷新按钮（`[aria-label=刷新]`） |
| 会话 daemon 关闭后仍在运行 | 用 `close --all` 终止 |
| 使用 `--headed` 后命令卡死 | daemon 死锁；改用默认 headless 模式 |
| 关闭后立即重新打开报超时 | `close --all` 后等待 2-3 秒再执行 `open` |
