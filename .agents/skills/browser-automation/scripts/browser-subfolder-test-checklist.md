# 浏览器子目录创建测试 — 步骤清单

> **执行方式**：Agent 按步骤逐步执行，每步后通过 `snapshot -i` 确认状态，动态调整。
> **前置条件**：应用已运行（`npm run dev:browser`），agent-browser 已安装。

---

## 步骤

### Step 1：打开应用并清除 localStorage

```powershell
agent-browser --session subfolder-test open http://127.0.0.1:5173
agent-browser --session subfolder-test wait --load networkidle
agent-browser --session subfolder-test wait 2000
agent-browser --session subfolder-test eval "localStorage.clear(); localStorage.setItem('adl-ui:locale','zh-CN'); location.reload()"
agent-browser --session subfolder-test wait 3000
agent-browser --session subfolder-test wait --load networkidle
```

清除 localStorage 确保没有残留数据干扰测试。

### Step 2：打开工作区

```powershell
agent-browser --session subfolder-test eval "window.digitalLife.workspace.open('E:\\PROJECT_PATH').then(() => setTimeout(() => location.reload(), 2000))"
agent-browser --session subfolder-test wait 3000
agent-browser --session subfolder-test wait --load networkidle
```

将 `E:\\PROJECT_PATH` 替换为实际工作区路径。

### Step 3：切换到浏览器面板

```powershell
agent-browser --session subfolder-test eval "document.querySelectorAll('[role=tab]')[2]?.click()"
agent-browser --session subfolder-test wait 1000
agent-browser --session subfolder-test snapshot -i
```

确认已切换到浏览器面板，能看到"工作区目录"分类和"展开"按钮。

### Step 4：打开工作区头部行更多操作菜单

```powershell
agent-browser --session subfolder-test eval "document.querySelectorAll('[data-menu-btn-id]')[0]?.click()"
agent-browser --session subfolder-test wait 500
agent-browser --session subfolder-test snapshot -i
```

确认菜单出现，包含"创建子目录"菜单项。

### Step 5：点击"创建子目录"

```powershell
agent-browser --session subfolder-test find role menuitem click --name "创建子目录"
agent-browser --session subfolder-test wait 500
```

菜单应关闭，目录已创建（无视觉变化）。

### Step 6：展开工作区查看子目录

```powershell
agent-browser --session subfolder-test find role button click --name "展开"
agent-browser --session subfolder-test wait 500
agent-browser --session subfolder-test snapshot -i
```

确认现在工作区已展开，包含"新建目录X"条目（`childFolders.map` 渲染的 `TabFolderTreeEntry`）。

### Step 7：验证 localStorage 中的 parentId

```powershell
agent-browser --session subfolder-test eval "JSON.stringify(JSON.parse(localStorage.getItem('adl-ui:browser-tab-folders') || '[]').map(f => ({ id: f.id, name: f.name, parentId: f.parentId })))"
```

确认 parentId 是 workspace 的 ID（以 `workspace_` 开头），而非 undefined 或空字符串。

### Step 8：验证不出现"自建目录"分类

```powershell
agent-browser --session subfolder-test snapshot -i
```

确认页面上没有"自建目录"分类标题。子目录应只出现在"工作区目录"下的对应 workspace 行中。

---

## 清理

```powershell
agent-browser --session subfolder-test close --all
```
