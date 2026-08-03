# Browser Harness 参考

Browser Harness（v0.1.0）的完整命令参考与项目专属用法。通过 CDP 连接用户已运行的 Chrome。

## 安装

```powershell
# 已安装位置：
# 包：E:\dev-tools\browser-harness\（editable 模式）
# 二进制：E:\dev-tools\uv-bin\browser-harness

# 会话前环境配置
$env:PATH = "E:\dev-tools\uv-bin;$env:PATH"
$env:BU_CDP_URL = "http://127.0.0.1:9222"
```

## Chrome 调试模式（必需）

Browser Harness 通过 CDP 连接你正在运行的 Chrome。必须先以调试模式启动 Chrome：

```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=E:\dev-tools\chrome-debug-profile"
```

关键点：
- 端口 9222 必须与 `$env:BU_CDP_URL` 一致
- `--user-data-dir` 在会话间保留登录状态
- 启动调试模式前关闭所有 Chrome 实例
- Chrome 144+ 会显示 per-attach 弹窗 — 点击"允许"

## 核心用法

### 基本调用

```powershell
browser-harness -c '<python 代码>'
```

daemon 首次调用自动启动。所有辅助函数已预导入，无需手动 start/stop。

### 脚本模式（复杂工作流）

多步工作流建议写成 Python 脚本文件，通过 `exec(open(...).read())` 执行：

```powershell
browser-harness -c "exec(open('path/to/script.py').read())"
```

**示例脚本**（`file-tree-test.py`）：

```python
import time

new_tab('http://127.0.0.1:5173/')
wait_for_load()
print("Step 1: Navigated")

# 用 js() 辅助函数（而非 cdp()）保证可靠性 —— js() 自动处理会话附加
js('window.digitalLife.workspace.open("E:/AI-DIGITAL-LIFE/SourceWorkspace")')
time.sleep(2)
print("Step 2: Workspace opened")

# 用 js() + DOM querySelector + 可选链做点击
js('document.querySelector("#_r_0_-files-tab")?.click()')
time.sleep(1)
print("Step 3: Files tab clicked")

# 文件树操作通过 js() DOM 遍历
js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "docs") { x.querySelector(".adl-tree-node__toggle")?.click(); break; } } })()')
time.sleep(1)
print("Step 4: Directory expanded")

js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "docs") { const f = x.querySelector("ul")?.querySelectorAll("li"); if (f) for (const y of f) { if (!y.classList.contains("adl-filetree__node--directory")) { y.querySelector(".adl-tree-node__label")?.click(); break; } } break; } } })()')
time.sleep(1)
print("Step 5: File clicked")
```

**关键经验**：JS 求值使用 `js()` 而非 `cdp("Runtime.evaluate", ...)`。`js()` 自动处理 session ID 附加，而裸 `cdp()` 调用需要手动管理 `session_id` 参数，容易出错。

### 首次导航

首次导航总是用 `new_tab(url)`，**不要**用 `goto_url(url)` —— `goto` 会在用户的活跃标签页中运行，可能覆盖用户正在做的工作。

```powershell
browser-harness -c "new_tab('http://localhost:5173'); wait_for_load(); print(page_info())"
```

## 核心辅助函数

### 导航与页面信息

```python
new_tab("https://example.com")     # 用 URL 打开新标签页
goto_url("https://example.com")    # 导航当前标签页（new_tab 后使用）
wait_for_load()                     # 等待页面加载完成
page_info()                         # 返回 {url, title, ...}
ensure_real_tab()                   # 当前标签页过期时重新附加
```

### 截图工作流（主要方法）

Browser Harness 采用"先截图"方法。核心工作流：

```python
capture_screenshot()                # 截图了解页面
click_at_xy(x, y)                  # 按坐标点击
capture_screenshot()                # 验证点击生效
```

**为什么先截图？**
- `click_at_xy()` 在 Chrome 的 compositor 层运行
- 自动穿透 iframe、Shadow DOM 和跨域边界
- 可见元素无需寻找选择器
- 仅当目标无可见几何形状（隐藏 input、0x0 节点）时才降到 DOM

### 坐标点击

```python
click_at_xy(x, y)                  # 左键点击坐标
# 右键、双击等使用裸 CDP：
cdp("Input.dispatchMouseEvent", {
    "type": "mousePressed",
    "x": x, "y": y,
    "button": "right",
    "clickCount": 1
})
```

### DOM 操作

```python
js("document.title")                                    # 求值 JS
js("document.querySelector('.adl-titlebar').textContent")  # 读取元素
js("el => el.textContent", element_ref)                 # 带元素引用
```

### 裸 CDP（逃生通道）

辅助函数覆盖不了的场景：

```python
cdp("Domain.method", params_dict)    # 直接 CDP 协议调用
```

## 交互技能

Browser Harness 提供常见 UI 机制的指导文件。遇到困难时参考：

| 技能 | 文件 | 覆盖 |
|------|------|------|
| 连接 | `interaction-skills/connection.md` | CDP 连接故障排查 |
| Cookies | `interaction-skills/cookies.md` | Cookie 管理 |
| 跨域 iframe | `interaction-skills/cross-origin-iframes.md` | Iframe 处理 |
| 对话框 | `interaction-skills/dialogs.md` | Alert/confirm/prompt |
| 下载 | `interaction-skills/downloads.md` | 文件下载 |
| 拖放 | `interaction-skills/drag-and-drop.md` | 拖拽操作 |
| 下拉框 | `interaction-skills/dropdowns.md` | Select/combobox |
| iframe | `interaction-skills/iframes.md` | 常规 iframe 工作 |
| 网络请求 | `interaction-skills/network-requests.md` | HTTP 拦截 |
| 打印为 PDF | `interaction-skills/print-as-pdf.md` | PDF 生成 |
| 配置同步 | `interaction-skills/profile-sync.md` | 云配置管理 |
| 截图 | `interaction-skills/screenshots.md` | 高级截图用法 |
| 滚动 | `interaction-skills/scrolling.md` | 滚动操作 |
| Shadow DOM | `interaction-skills/shadow-dom.md` | Shadow DOM 遍历 |
| 标签页 | `interaction-skills/tabs.md` | 标签页管理 |
| 上传 | `interaction-skills/uploads.md` | 文件上传 |
| 视口 | `interaction-skills/viewport.md` | 视口控制 |

## 自愈机制

Browser Harness 最强大的特性。当 agent 发现缺少辅助函数时：

```
● agent: 想上传文件
│
● agent-workspace/agent_helpers.py → 缺少辅助函数
│
● agent 写入它                    agent_helpers.py
│                                                    + 自定义辅助函数
✓ 文件已上传
```

Agent 编辑 `agent-workspace/agent_helpers.py` 添加缺失函数后继续。随时间推移辅助函数有机增长。

**重要**：任务专属辅助函数放 `agent-workspace/agent_helpers.py`。核心辅助函数保持在 `src/browser_harness/helpers.py`（受保护）。

## 领域技能（可选）

社区贡献的按站点 playbook。默认禁用。

```powershell
$env:BH_DOMAIN_SKILLS = "1"    # 启用领域技能
```

启用后，`goto_url` 为导航的 host 返回最多 10 个技能文件名。可用技能包括 GitHub、LinkedIn、Amazon 等。

## 远程浏览器（Browser Use Cloud）

用于并行子代理或 headless 部署。需要 `BROWSER_USE_API_KEY`。

```python
start_remote_daemon("work")                                          # 干净浏览器
start_remote_daemon("work", profileName="my-work")                   # 复用云配置
start_remote_daemon("work", proxyCountryCode="de", timeout=120)      # DE 代理，2 小时超时
start_remote_daemon("work", proxyCountryCode=None)                   # 禁用代理
```

配合命名会话使用：

```powershell
$env:BU_NAME = "work"
browser-harness -c "new_tab('https://example.com'); print(page_info())"
```

## 批量 HTTP（静态页面）

不需要浏览器渲染时：

```python
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor() as pool:
    results = list(pool.map(http_get, urls))
```

249 页约 2.8 秒完成，相比浏览器导航的分钟级。

## 设计约束

- **坐标点击默认**：`Input.dispatchMouseEvent` 在 compositor 层穿透 iframe/shadow/cross-origin
- **连接用户 Chrome**：不要启动自己的浏览器
- **无管理器层**：无重试框架、会话管理器、daemon 监督器、配置系统或日志框架
- **保持 run.py 精简**：无 argparse、子命令或额外控制层

## 实战坑（Field-Tested）

- Omnibox 弹窗是伪造的 page target — 需要真实标签页时过滤 `chrome://omnibox-popup...`
- CDP target 顺序 ≠ Chrome 可见标签页顺序
- 默认 daemon 会话会过期 — 用 `ensure_real_tab()` 重新附加
- 每次有意义操作后，先重新截图再假设它生效
- 优先 compositor 层操作而非框架 hack
- 认证墙：重定向到登录页就停止并询问用户 — 不要从截图输入凭据

## 项目应用：AI Digital Life

### 启动应用并测试

```powershell
# 1. 启动 Chrome 调试模式
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=E:\dev-tools\chrome-debug-profile"

# 2. 启动应用
cd E:\AI-DIGITAL-LIFE\SourceWorkspace
npm run dev:browser

# 3. 设置环境
$env:PATH = "E:\dev-tools\uv-bin;$env:PATH"
$env:BU_CDP_URL = "http://127.0.0.1:9222"

# 4. 打开并测试
browser-harness -c "new_tab('http://localhost:5173'); wait_for_load(); print(page_info())"
browser-harness -c "capture_screenshot()"
```

### 完整文件树测试工作流（脚本模式）

保存为 `file-tree-test.py`，用 `browser-harness -c "exec(open('file-tree-test.py').read())"` 执行：

```python
import time

# 第 1 步：导航到应用
new_tab('http://127.0.0.1:5173/')
wait_for_load()
print("Step 1: Navigated")

# 第 2 步：通过应用内 API 打开工作区（绕过原生对话框）
js('window.digitalLife.workspace.open("E:/AI-DIGITAL-LIFE/SourceWorkspace")')
time.sleep(2)
print("Step 2: Workspace opened")

# 第 3 步：点击"文件"标签页
js('document.querySelector("#_r_0_-files-tab")?.click()')
time.sleep(1)
print("Step 3: Files tab clicked")

# 第 4 步：点击刷新按钮触发文件树加载
js('document.querySelector("[aria-label=刷新]")?.click()')
time.sleep(3)
print("Step 4: File tree refreshed")

# 第 5 步：展开 "docs" 目录
js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "docs") { x.querySelector(".adl-tree-node__toggle")?.click(); break; } } })()')
time.sleep(1)
print("Step 5: docs expanded")

# 第 6 步：点击 docs 中第一个文件
js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "docs") { const f = x.querySelector("ul")?.querySelectorAll("li"); if (f) for (const y of f) { if (!y.classList.contains("adl-filetree__node--directory")) { y.querySelector(".adl-tree-node__label")?.click(); break; } } break; } } })()')
time.sleep(1)
print("Step 6: File clicked")

# 第 7 步：切换到"变更"标签页
js('document.querySelector("#_r_0_-changes-tab")?.click()')
time.sleep(1)
print("Step 7: Changes tab clicked")

# 第 8 步：切回"文件"标签页
js('document.querySelector("#_r_0_-files-tab")?.click()')
time.sleep(1)
print("Step 8: Files tab back")

# 第 9 步：展开 "UIOperationManual" 并点击 README.md
js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "UIOperationManual") { x.querySelector(".adl-tree-node__toggle")?.click(); break; } } })()')
time.sleep(1)

js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "UIOperationManual") { const f = x.querySelector("ul")?.querySelectorAll("li"); if (f) for (const y of f) { const t = y.querySelector(".adl-tree-node__label-text")?.textContent; if (t === "README.md") { y.querySelector(".adl-tree-node__label")?.click(); break; } } break; } } })()')
time.sleep(1)
print("Step 9: README.md clicked - ALL DONE!")
```

### Browser Harness 专属坑

- **用 `js()` 而非 `cdp()`** 做点击和 DOM 操作。`js()` 自动管理 session ID；`cdp()` 可能报 `'code': -32600, 'message': "Message may have string 'sessionId' property"`。
- **反斜杠转义**：`js()` 接收 Python 字符串。路径用正斜杠：`js('window.digitalLife.workspace.open("E:/AI-DIGITAL-LIFE/SourceWorkspace")')`。
- **脚本模式**（`exec(open(...).read())`）比内联 `-c` 更可靠 — 避免引号转义问题。
- **文件树可能需要刷新**：打开工作区后文件树可能不显示。先点击"刷新"按钮（`[aria-label=刷新]`）。

### 常用操作

```powershell
# 导航到应用
browser-harness -c "new_tab('http://localhost:5173'); wait_for_load()"

# 截图
browser-harness -c "capture_screenshot()"

# 获取页面信息
browser-harness -c "print(page_info())"

# 按坐标点击（截图确定位置后）
browser-harness -c "click_at_xy(100, 200)"

# 读取 DOM
browser-harness -c "js('document.querySelector(\".adl-titlebar\").textContent')"
```
