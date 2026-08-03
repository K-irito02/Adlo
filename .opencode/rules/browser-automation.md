---
description: Browser automation rules, tool selection, and lessons learned
globs: ai-digital-life/frontend/**,docs/**,tests/**
alwaysApply: false
---

# 浏览器自动化规则

## 调试工具（优先使用）

调试日志收起器是最高优先级的调试手段，遇到 UI/交互问题时**先使用调试日志定位**，再决定是否需要浏览器自动化：

- 页面右上角"复制调试日志"按钮
- 项目根目录 `debug-logs.txt`
- 详见 [ai-digital-life/AGENTS.md](../../ai-digital-life/AGENTS.md#调试工具) 和 [dev-rules.md](./dev-rules.md#问题排查规范)

## 工具选择导航

| 场景 | 推荐工具 | 说明 |
|------|----------|------|
| Trae 内置浏览器交互 | integrated_browser（MCP 工具） | Trae 内置浏览器，通过 MCP 工具调用（非 CLI），支持导航、点击、输入、截图等全功能 |
| 让用户在内置浏览器中打开 URL | 纯文本 URL（不包裹） | Trae IDE 自动检测纯文本 URL 使其可点击，点击后在内置浏览器中跳转 |
| 交互式测试、表单填写、元素点击 | agent-browser | 全功能终端自动化，**打开的是独立 Chrome 实例**，非 IDE 内置浏览器 |
| 连接用户现有 Chrome、坐标点击 | Browser Harness | 基于 CDP，需 Chrome 调试模式 |
| 仅静态截图 | Playwright CLI | 轻量级，无交互能力 |

> 详细用法参见 [browser-automation 技能](../../.opencode/skills/browser-automation/SKILL.md)

## 核心经验教训

### 1. integrated_browser 是 MCP 工具，不是 CLI 命令

`browser_*` 系列工具（`browser_navigate`、`browser_snapshot`、`browser_click` 等）是 MCP 协议暴露的工具，**不是 PowerShell CLI 命令**。

**错误做法**（会报错）：
```powershell
# ❌ 这会被识别为未知命令
browser_navigate -url "http://localhost:5173/" -take_screenshot_afterwards true
```

**正确做法**：通过 MCP 工具接口调用（在 Agent 消息中直接使用对应 tool call）。

### 2. 纯文本 URL 即可在 Trae 内置浏览器中打开

Trae IDE 会自动检测消息中的纯文本 URL 并使其可点击。用户点击后即在内置浏览器中跳转。

**最佳实践**：
- 输出 URL 时使用纯文本，如：http://localhost:5173/
- 不要用 `` 包裹 URL，否则会失去可点击性
- 不需要额外调用任何工具来"打开内置浏览器"

### 3. agent-browser 打开的是独立 Chrome 实例

agent-browser 通过 CDP 启动自己的 Chromium 进程，与 Trae IDE 内置浏览器无关。当需要用户在 IDE 内置浏览器中查看页面时，输出纯文本 URL 让用户点击即可。

### 4. 工作区必须真正加载到应用上下文

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

### 5. 变更面板依赖工作区上下文

变更面板的数据源是**当前激活的工作区**，而非侧边栏列表。如果工作区未加载到上下文：
- 变更面板显示"当前没有检测到文件变更"
- 底部状态栏显示"非 Git 仓库"
- 即使 `git status` 确认有变更，UI 也不会显示

### 6. 原生对话框无法自动化

以下操作会触发原生 OS 对话框，必须使用 API 绕过：

| 操作 | 原生对话框 | 替代方案 |
|------|-----------|---------|
| 打开工作区 | 文件夹选择器 | `window.digitalLife.workspace.open(path)` |
| 选择目录 | 文件夹选择器 | Vite Preview API |

### 7. 操作后必须等待和验证

每次点击/操作后：
1. `wait 1000~3000` 等待 UI 响应
2. `snapshot -i` 获取最新状态
3. 确认操作生效后再继续下一步

### 8. 路径转义规则

| 工具 | 路径格式 | 说明 |
|------|----------|------|
| agent-browser `eval` | `E:\\path` | 反斜杠双转义 |
| Browser Harness `js()` | `E:/path` | 使用正斜杠 |
| PowerShell 参数 | `E:\path` | 单反斜杠 |

### 9. 不使用 `--headed` 参数

`--headed` 模式可能导致 daemon 死锁。使用默认 headless 模式。

### 10. daemon 操作间隔

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
agent-browser --session test screenshot "E:\AI-DIGITAL-LIFE\SourceWorkspace\test-artifacts\screenshots\my-test-$(Get-Date -Format 'yyyyMMdd-HHmmss').png"
```

## 相关文件

- [browser-automation 技能](../../.opencode/skills/browser-automation/SKILL.md) — 完整用法与步骤清单模板
- [desktop-ui-verification.md](./desktop-ui-verification.md) — 桌面端 UI 验证
- [commands.md](./commands.md) — 常用命令
- [dev-rules.md](./dev-rules.md) — 代理开发规则（含问题排查规范）
