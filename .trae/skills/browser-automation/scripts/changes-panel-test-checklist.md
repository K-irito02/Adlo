# 变更面板测试 — 步骤清单

> **执行方式**：Agent 按步骤逐步执行，每步后通过 `snapshot -i` 确认状态，动态调整。
> **前置条件**：应用已运行（`npm run dev:browser`），agent-browser 已安装。

---

## 步骤

### Step 1：打开应用

```powershell
agent-browser --session changes-test open http://127.0.0.1:5173
```

等待 2-3 秒，确认页面加载完成。

### Step 2：打开工作区

```powershell
agent-browser --session changes-test eval "window.digitalLife.workspace.open('E:\\Programs\\Obsidian\\notes').then(() => location.reload())"
```

等待 3-5 秒，然后验证：

```powershell
agent-browser --session changes-test eval "document.querySelector('.adl-statusbar')?.textContent"
```

**验证标准**：状态栏应显示 Git 分支信息（如"有未提交 notes main ..."），而非"非 Git 仓库"。如果仍显示"非 Git 仓库"，再等待 3 秒后重试，最多重试 5 次。

### Step 3：收起左侧边栏

获取快照找到按钮 ref：

```powershell
agent-browser --session changes-test snapshot -i
```

在快照中找到 `button "切换左侧边栏" [ref=eXX]`，然后点击：

```powershell
agent-browser --session changes-test click eXX
```

等待 1 秒。再次 `snapshot -i` 确认左侧边栏的"工作空间"/"临时会话"区域已消失。

### Step 4：扩大右侧面板

在快照中找到 `button "扩大右侧边栏" [ref=eXX]`，点击：

```powershell
agent-browser --session changes-test click eXX
```

等待 1 秒。确认按钮文本变为"还原右侧边栏"。

### Step 5：点击"变更"标签

在快照中找到 `tab "变更" [ref=eXX]`，点击：

```powershell
agent-browser --session changes-test click eXX
```

等待 2 秒。

### Step 6：点击"文件列表"

在快照中找到 `button "文件列表" [ref=eXX]`，点击：

```powershell
agent-browser --session changes-test click eXX
```

等待 2 秒。

### Step 7：点击"已修改"

在快照中找到 `button "已修改" [ref=eXX]`，点击：

```powershell
agent-browser --session changes-test click eXX
```

等待 2 秒。验证变更文件数量：

```powershell
agent-browser --session changes-test eval "document.querySelectorAll('.adl-change-item').length"
```

### Step 8：点击第一个变更文件

```powershell
agent-browser --session changes-test eval "document.querySelector('.adl-change-item')?.click()"
```

等待 2 秒。确认右侧面板显示 diff 内容。

### Step 9：取消自动换行

在快照中找到 `button "更多 Git 操作" [ref=eXX]`，点击展开菜单：

```powershell
agent-browser --session changes-test click eXX
```

等待 1 秒。在快照中找到 `menuitemcheckbox "自动换行" [ref=eXX]`，点击取消勾选：

```powershell
agent-browser --session changes-test click eXX
```

### Step 10：关闭菜单

```powershell
agent-browser --session changes-test keyboard type Escape
```

等待 0.5 秒。如果菜单仍在，点击页面空白区域（如 `ref=e1`）关闭。确认菜单已消失。

### Step 11：截图保存

```powershell
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
agent-browser --session changes-test screenshot "e:\Programs\Obsidian\notes\test-artifacts\screenshots\changes-panel-$timestamp.png"
```

### Step 12：清理

```powershell
agent-browser --session changes-test close --all
```
