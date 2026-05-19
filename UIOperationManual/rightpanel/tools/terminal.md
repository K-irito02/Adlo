# 终端工具面板

> 交互式终端面板，基于 xterm.js 渲染，支持多会话与真实 Shell 进程。

## 架构说明

| 模式 | 后端实现 | 通信方式 |
|------|----------|----------|
| Tauri 桌面 | Rust PTY (`pty_create` / `pty_input` / `pty_kill` / `pty_resize` / `pty_list`) | Tauri Event `digital-life://pty-output` |
| 浏览器预览 | Node.js `child_process.spawn` (`previewTerminalService.ts`) | SSE (`/__adl_preview_api__/pty/output`) |

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-tool-panel--terminal` | 终端面板容器 |
| `.adl-terminal-canvas` | xterm.js 挂载容器 |

---

## 标签栏

> 终端多会话标签栏

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-tool-list` (`[data-tool="terminal"]` 上下文内) |

### 标签项

| 选择器 | 说明 |
|--------|------|
| `.adl-tool-list__item--terminal-tab` | 单个标签容器（flex row） |
| `.adl-tool-list__item-btn.is-active` | 激活标签 |

### 标签内操作

| 选择器 | 说明 |
|--------|------|
| `.adl-tool-list__item-btn` | 标签选择按钮（点击切换） |
| `.adl-tool-list__item-close` | 标签关闭按钮（`IconClose`） |

### 操作

#### 切换标签

```javascript
await page.click('.adl-tool-list__item-btn:not(.is-active)');
```

#### 关闭单个标签

```javascript
await page.click('.adl-tool-list__item-close');
```

#### 关闭所有标签

```javascript
await page.click('button[aria-label="关闭所有终端"]');
```

#### 新建终端标签

```javascript
// 点击 Shell 选择按钮
await page.click('button[aria-label="新建终端"]');
```

---

## Shell 选择器

> 终端 Shell 类型选择下拉菜单

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-terminal-shell-dropdown` |

### 支持 Shell 类型

| Shell | 说明 |
|-------|------|
| `powershell` | PowerShell（默认，带 `-NoLogo -NoProfile`） |
| `cmd` | 命令提示符 |
| `bash` | WSL Bash |

### 空状态

当没有终端标签时，Shell 选择按钮组居中显示在面板中央：

```javascript
const emptyButtons = await page.$$('.adl-tool-primary--terminal-empty .adl-tool-context__group--terminal-actions button');
```

---

## 终端输入

> 通过 xterm.js 直接输入（无需单独输入框）

### 交互方式

| 操作 | 说明 |
|------|------|
| 键盘输入 | 直接输入到 xterm.js，自动发送到 PTY stdin |
| 回车 | 发送 `\r` 到 PTY，Shell 进程处理 |
| 粘贴 | 剪贴板内容发送到 PTY stdin |
| Ctrl+C | 由 PTY 进程处理（终止进程或取消） |

---

## 终端输出

> xterm.js 实时渲染 PTY 输出

### 特性

- 所有输出由后端真实 Shell 进程产生（非模拟）
- 输出通过 SSE（浏览器模式）/ Tauri Event（Tauri 模式）实时推送
- xterm.js 自动处理 ANSI 转义序列（颜色、光标控制等）
- 主题自动跟随应用主题切换（亮色/暗色）

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 终端面板 | `.adl-tool-panel--terminal` | 终端面板容器 |
| xterm 容器 | `.adl-terminal-canvas` | xterm.js 挂载容器 |
| 标签栏 | `.adl-tool-list` | 终端会话标签列表 |
| Shell 下拉 | `.adl-terminal-shell-dropdown` | Shell 类型选择 |
| 关闭全部 | `button[aria-label="关闭所有终端"]` | 一键关闭所有终端 |

## 注意事项

1. **xterm.js 不做 local echo**：字符由后端 PTY 进程回显，网络延迟可能导致短暂显示延迟
2. **多标签独立会话**：每个标签对应独立 Shell 进程，切换标签不中断运行
3. **主题同步**：xterm 主题色跟随 CSS 变量 `--bg`、`--text-primary`、`--selection`
4. **路径真实**：CWD 为当前工作区路径（浏览器模式）或进程启动路径