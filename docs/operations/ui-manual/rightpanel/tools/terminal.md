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
| `.adl-terminal-canvas` | xterm.js 挂载容器（padding:4px, bg: var(--bg)）|
| `.adl-multitree--terminal` | 终端树状列表根容器 |
| `.adl-tool-navigator__resize-handle` | 终端导航器右侧拖拽手柄（鼠标拖拽可调整导航器宽度）|

---

## 工作区终端列表

终端会话按工作区分组展示，采用与文件树一致的树状层级视觉语言。

### 层级结构

```
.adl-multitree--terminal
├── .adl-multitree-entry                                     # 工作区节点（类似目录）
│   ├── .adl-multitree-entry__header                         # 头部行（hover 全宽灰色背景）
│   │   ├── .adl-multitree-entry__expand                     # 折叠/展开按钮
│   │   ├── .adl-multitree-entry__namezone                   # 名称区域（flex:1）
│   │   │   ├── .adl-multitree-entry__name                   # 工作区名称
│   │   │   ├── .adl-multitree-entry__count                  # 标签计数
│   │   │   └── .adl-multitree-entry__actions                # 悬浮按钮组
│   │   └── .adl-multitree-entry__tree                       # 子节点容器（含竖连接线）
│   │       ├── .adl-tool-list__item--terminal-tab           # 终端标签（类似文件节点）
│   │       └── .adl-multitree-entry__empty-btn              # 空状态"新建终端"按钮
```

### 终端标签项

| 选择器 | 说明 |
|--------|------|
| `.adl-tool-list__item--terminal-tab` | 单个终端标签（14px 缩进，flex row，24px 高） |
| `.adl-tool-list__item-btn.is-active` | 激活标签 |
| `.adl-tool-list__item--pinned` | 置顶标签（左侧黄色 pin 标记） |

### 交互功能

#### 新建终端

```javascript
// 从工作区头部行点击新建按钮
await page.click('.adl-multitree-entry__actions button[aria-label="新建终端"]');
// 从 Shell 选择器下拉
await page.click('button[aria-label="新建终端"]');
```

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
await page.click('button[aria-label="清空全部终端"]');
```

#### 双击重命名

双击标签进入重命名模式，输入新名称后按回车或点击外部确认。

```javascript
await page.dblclick('.adl-tool-list__item-btn');
await page.keyboard.type('我的终端');
await page.keyboard.press('Enter');
```

#### 右键菜单

右键标签显示操作菜单，包含置顶/取消置顶、重命名、删除等选项。

```javascript
await page.click('.adl-tool-list__item-btn', { button: 'right' });
await page.click('.adl-sidebar-menu button[aria-label="置顶"]');
```

#### 拖拽排序

```javascript
const source = await page.$('.adl-tool-list__item--terminal-tab:nth-child(2)');
const target = await page.$('.adl-tool-list__item--terminal-tab:nth-child(4)');
await source.dragTo(target);
```

### 样式说明

- 工作区头部行 hover 显示灰色背景，从导航器左边缘到右边缘全宽
- 终端标签采用 14px 左缩进，hover/激活时灰色背景覆盖缩进区域
- 空状态"新建终端"按钮同样 14px 缩进，hover 全宽灰色背景
- 标签间距紧凑（1px），无 border-bottom 分隔线
- 树连接线（`::before`，通过 `--adl-trunk-height` 变量溢出实现动态高度）从工作区头部延伸至最后一个标签

---

## Shell 选择器

> 终端 Shell 类型选择下拉菜单

### 定位选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-terminal-shell-dropdown` | Shell 类型下拉菜单容器 |

### 支持 Shell 类型

| Shell | 说明 |
|-------|------|
| `powershell` | PowerShell（默认，带 `-NoLogo -NoProfile`） |
| `cmd` | 命令提示符 |
| `bash` | WSL Bash |

---

## 终端输入

> 通过 xterm.js 直接输入（无需单独输入框）

| 操作 | 说明 |
|------|------|
| 键盘输入 | 直接输入到 xterm.js，自动发送到 PTY stdin |
| 回车 | 发送 `\r` 到 PTY |
| 粘贴 | 剪贴板内容发送到 PTY stdin |
| Ctrl+C | 由 PTY 进程处理（终止进程或取消） |

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 终端面板 | `.adl-tool-panel--terminal` | 终端面板容器 |
| 树状列表 | `.adl-multitree--terminal` | 终端树状列表根容器 |
| 终端标签 | `.adl-tool-list__item--terminal-tab` | 单个终端会话标签 |
| xterm 容器 | `.adl-terminal-canvas` | xterm.js 挂载容器 |
| 关闭全部 | `button[aria-label="清空全部终端"]` | 一键关闭所有终端 |

## 注意事项

1. **独立终端常驻**：独立终端工作区始终显示在列表顶部，删除所有标签后头部行不消失
2. **多标签独立会话**：每个标签对应独立 Shell 进程，切换标签不中断运行
3. **xterm.js 不做 local echo**：字符由后端 PTY 进程回显
4. **主题同步**：xterm 主题色跟随 CSS 变量 `--bg`、`--text-primary`、`--selection`