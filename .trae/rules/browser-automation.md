---
description: Browser automation rules, tool selection, and lessons learned from testing
alwaysApply: true
---

# 浏览器自动化规则

## 工具选择导航

| 场景 | 推荐工具 | 说明 |
|------|----------|------|
| 交互式测试、表单填写、元素点击 | agent-browser | 全功能终端自动化 |
| 连接用户现有 Chrome、坐标点击 | Browser Harness | 基于 CDP，需 Chrome 调试模式 |
| 仅静态截图 | Playwright CLI | 轻量级，无交互能力 |

> 详细用法参见 [browser-automation 技能](../skills/browser-automation/SKILL.md)

## 核心经验教训

### 1. 工作区必须真正加载到应用上下文

`window.digitalLife.workspace.open()` 只是将路径添加到侧边栏列表，**不会**自动加载工作区到应用上下文。

**正确流程**：
1. 调用 `workspace.open(path)` 添加到侧边栏
2. **刷新页面**（`location.reload()` 或重新导航）
3. 确认底部状态栏显示 Git 分支信息（而非"非 Git 仓库"）
4. 确认左侧边栏显示工作区名称

**验证方法**：
```powershell
# 检查状态栏是否显示 Git 信息（而非"非 Git 仓库"）
agent-browser --session test eval "document.querySelector('.adl-statusbar')?.textContent"
```

### 2. 变更面板依赖工作区上下文

变更面板的数据源是**当前激活的工作区**，而非侧边栏列表。如果工作区未加载到上下文：
- 变更面板显示"当前没有检测到文件变更"
- 底部状态栏显示"非 Git 仓库"
- 即使 `git status` 确认有变更，UI 也不会显示

### 3. 原生对话框无法自动化

以下操作会触发原生 OS 对话框，必须使用 API 绕过：

| 操作 | 原生对话框 | 替代方案 |
|------|-----------|---------|
| 打开工作区 | 文件夹选择器 | `window.digitalLife.workspace.open(path)` |
| 选择目录 | 文件夹选择器 | Vite Preview API |

### 4. 操作后必须等待和验证

每次点击/操作后：
1. `wait 1000~3000` 等待 UI 响应
2. `snapshot -i` 获取最新状态
3. 确认操作生效后再继续下一步

### 5. 路径转义规则

| 工具 | 路径格式 | 说明 |
|------|----------|------|
| agent-browser `eval` | `E:\\path` | 反斜杠双转义 |
| Browser Harness `js()` | `E:/path` | 使用正斜杠 |
| PowerShell 参数 | `E:\path` | 单反斜杠 |

### 6. 不使用 `--headed` 参数

`--headed` 模式可能导致 daemon 死锁。使用默认 headless 模式。

### 7. daemon 操作间隔

`close --all` 后等待 2-3 秒再执行 `open`，避免超时。

## 测试产物存储

所有浏览器自动化测试产物统一保存到根目录 `test-artifacts/`（已加入 `.gitignore`）。

```
test-artifacts/
├── screenshots/    # 截图
├── videos/         # 录屏
└── documents/      # 测试报告等文档
```

### 命名规范

| 类型 | 格式 | 示例 |
|------|------|------|
| 截图 | `{功能名}-{时间戳}.png` | `changes-panel-20260516-132800.png` |
| 视频 | `{功能名}-{时间戳}.webm` | `file-tree-20260516-132800.webm` |
| 文档 | `{报告类型}-{时间戳}.md` | `dogfood-report-20260516-132800.md` |

时间戳格式：`yyyyMMdd-HHmmss`

```powershell
# 截图保存示例
agent-browser --session test screenshot "e:\Programs\Obsidian\notes\test-artifacts\screenshots\my-test-$(Get-Date -Format 'yyyyMMdd-HHmmss').png"
```

## 步骤清单规范

步骤清单是 Agent 逐步执行的测试流程文档，存放在 `scripts/` 目录下。

### 文件命名

| 规则 | 格式 | 示例 |
|------|------|------|
| 清单文件 | `{功能名}-test-checklist.md` | `changes-panel-test-checklist.md` |
| 模板文件 | `_template-checklist.md` | `_template-checklist.md` |
| 经验总结 | `lessons-learned.md` | `lessons-learned.md` |

功能名使用 kebab-case（小写 + 连字符）。

### 内容格式

```markdown
# {功能名称} 测试 — 步骤清单

> **执行方式**：Agent 按步骤逐步执行，每步后通过 `snapshot -i` 确认状态，动态调整。
> **前置条件**：应用已运行（`npm run dev:browser`），agent-browser 已安装。

---

## 步骤

### Step 1：{步骤标题}

```powershell
{命令}
```

{等待时间}。{验证标准（可选）}。

---

## 清理

```powershell
agent-browser --session {session-name} close --all
```
```

### 编写规则

1. **每步必须包含**：步骤标题、命令代码块、等待时间
2. **验证标准**：需要确认状态的步骤必须写明验证方法（如 `snapshot -i` 确认、`eval` 检查内容）
3. **ref 不硬编码**：步骤中用 `eXX` 占位，Agent 执行时从 `snapshot -i` 动态获取
4. **session 命名**：使用 `{功能名}-test`（如 `changes-test`、`file-tree-test`）
5. **不写经验教训**：问题和经验总结统一写入 `lessons-learned.md`
6. **新建清单时**：从 `_template-checklist.md` 复制，按格式填写

## 快速参考

```powershell
# agent-browser 标准流程
agent-browser --session test open http://127.0.0.1:5173
agent-browser --session test eval "window.digitalLife.workspace.open('E:\\path').then(() => location.reload())"
agent-browser --session test wait 3000
agent-browser --session test snapshot -i
# ... 执行操作 ...
agent-browser --session test close --all
```

## 相关文件

- [browser-automation 技能](../skills/browser-automation/SKILL.md)
- [desktop-ui-verification.md](./desktop-ui-verification.md)
- [commands.md](./commands.md)
- [步骤清单模板](../skills/browser-automation/scripts/_template-checklist.md)
- [经验教训总结](../skills/browser-automation/scripts/lessons-learned.md)
