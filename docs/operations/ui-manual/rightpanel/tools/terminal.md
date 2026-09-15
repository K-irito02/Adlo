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

### 复合按钮交互（新建终端 + 绑定/类型菜单）

- 左半为新建终端按钮（按当前类型 + 绑定工作区建 tab）；右半悬停 120ms 即展开菜单（点击同样可开关，仅悬停设备启用，触屏保持纯点击）
- 菜单含工作区绑定子卡片与终端类型；三区（右半按钮/菜单卡片/子卡片）各自 2s 无悬停计时，超时自动关闭（悬停子卡片时主菜单不关）
- 工作区绑定与终端类型选择持久化，重启应用后保持；绑定指向已删除/隐藏/不可用工作区时回退为独立

---

## 终端输入

> 通过 xterm.js 直接输入（无需单独输入框）

| 操作 | 说明 |
|------|------|
| 键盘输入 | 直接输入到 xterm.js，自动发送到 PTY stdin |
| 回车 | 发送 `\r` 到 PTY |
| 粘贴（Ctrl+V / Shift+Insert） | 剪贴板内容发送到 PTY stdin（经浏览器原生 paste 事件，无权限弹窗） |
| Ctrl+C（有选区） | 复制选区到剪贴板（不向 PTY 发中断信号） |
| Ctrl+C（无选区） | 由 PTY 进程处理（终止进程或取消） |
| Ctrl+Shift+C | 一律视为复制（无选区时吞掉，避免误中断） |
| 只读历史区 Ctrl+C | 有选区时复制（只读区不可粘贴） |

---

## 终端内容区（历史 / 实时）

> 终端画布分为上下（单列）或左右（双列）两区：上方为**只读历史区**（重启前会话的回放，独立滚动，不可输入），下方为**实时终端**（当前 PTY 会话，全功能）。两区之间由 1px 分界线隔开。

### 选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-tool-primary__scroll--terminal` | 内容区根容器（flex，方向随视图模式） |
| `.adl-terminal-history` | 只读历史区容器（独立滚动） |
| `.adl-terminal-history-list` | 只读历史虚拟列表滚动容器（懒加载视口附近块） |
| `.adl-terminal-history-row` | 历史单个显示行（钉格行含 `.adl-terminal-history-cell`） |
| `.adl-terminal-history-divider` | 历史日期分隔符（左右各留 `space-2`） |
| `.adl-terminal-live` | 实时终端容器 |
| `.adl-terminal-divider` | 历史/实时分界线（`role="separator"`，可拖拽） |
| `.adl-terminal-error-note` | Shell 启动失败的错误提示（仅活跃错误状态显示） |

### 视图模式与位置交换

| 控件 | 位置 | 行为 |
|------|------|------|
| 单列/双列分段控件 | 工具栏「更多终端操作」左侧 | 单列 = 上下布局；双列 = 左右布局（复用变更面板 `adl-tool-context__diff-view` 样式） |
| 双三角形按钮（`IconAreaSwap`） | 分段控件右侧 | 实心三角形标记「只读历史区」所在侧（单列=上/双列=左）；点击交换两区位置并交换实心/空心 |

视图模式、是否交换、历史区占比三项均持久化（localStorage `adl-terminal:view-prefs`），重启后保持。

### 分界线拖拽

```javascript
// 按住分界线拖拽可调整历史区大小（单列调高度、双列调宽度）
const divider = await page.$('.adl-terminal-divider');
const box = await divider.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x, box.y - 100, { steps: 5 });
await page.mouse.up();
```

- 历史区占比钳制：0.12–0.8，且历史 ≥64px、实时 ≥120px（面板极短时取包络区间）
- 拖拽期间仅写 CSS 变量 `--adl-terminal-history-ratio`，松手才提交并持久化
- 分界线悬停/激活高亮为中性提示色 `--text-secondary`（禁用 `--accent` 蓝，详见提示色规范）；只读历史底色跟随主题（与实时终端一致）

### 会话归档与重启恢复行为

1. 会话结束（PTY 退出 / 关闭应用的落盘）即把该会话归档为「只读历史段」（末尾带 `─── HH:MM:SS DD-MM-YYYY ───` 时间分隔条，格式固定、不随语言变化）；应用重启时对残留的进行中段兜底定稿
2. 关闭应用时先拦截关闭 → 窗口立即隐藏 → 后台把未定稿会话全部落盘 → 再彻底退出（超时兜底）
3. 实时终端是全新 Shell，历史**绝不注入**实时缓冲区（ConPTY 坐标系对齐是硬性不变量）
4. 历史按标签累积并跨重启保留；磁盘超预算时按最旧优先淘汰整段，且始终保留最近 20 段（`TERMINAL_HISTORY_MIN_SEGMENTS_KEPT`，无固定段数上限）

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