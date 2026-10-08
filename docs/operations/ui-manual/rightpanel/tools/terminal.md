# 终端工具面板

> 交互式终端面板，基于 xterm.js 渲染，支持多会话与真实 Shell 进程。一个终端标签承载多个相互独立的终端窗格（每个窗格一个独立 PTY 会话），支持均分/自由布局、自定义布局卡片与按标签持久化。

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
- 该选择器同时决定「新建窗格」的默认 Shell

---

## 终端输入

> 通过 xterm.js 直接输入（无需单独输入框），输入作用于当前活动窗格

| 操作 | 说明 |
|------|------|
| 键盘输入 | 直接输入到 xterm.js，自动发送到 PTY stdin |
| 回车 | 发送 `\r` 到 PTY |
| 粘贴（Ctrl+V / Shift+Insert） | 剪贴板内容发送到 PTY stdin（经浏览器原生 paste 事件，无权限弹窗） |
| Ctrl+C（有选区） | 复制选区到剪贴板（不向 PTY 发中断信号） |
| Ctrl+C（无选区） | 由 PTY 进程处理（终止进程或取消） |
| Ctrl+Shift+C | 一律视为复制（无选区时吞掉，避免误中断） |

---

## 终端内容区（多窗格）

> 一个终端标签承载 N 个相互独立的终端窗格，每个窗格对应一个独立 PTY 会话。窗格网格支持两种布局：**均分**（CSS Grid 按比例铺排）与**自由**（绝对定位、像素拖拽）；窗格过多/显示区不足时按最小尺寸裁剪隐藏，由项目自定义滚动条滑动查看。

### 选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-tool-primary__scroll--terminal` | 内容区根容器 |
| `.adl-terminal-pane-grid-scroll-host` | 卷帘门滚动宿主（自定义 overlay 滚动条挂载点） |
| `.adl-terminal-pane-grid-scroll` | `overflow:auto` 滚动容器 |
| `.adl-terminal-pane-grid` | 窗格网格根（`is-equal` / `is-free` / `is-maximized`） |
| `.adl-terminal-pane` | 单个窗格（`is-active` 活动窗格、`is-maximized` 最大化窗格） |
| `.adl-terminal-canvas` | 单个窗格内的 xterm.js 挂载容器 |
| `.adl-terminal-col-divider` / `.adl-terminal-row-divider` | 均分模式列/行边界线（`role="separator"`，可拖拽） |
| `.adl-terminal-free-handle`（`--n` / `--e` / `--s` / `--w` / `--ne` / `--nw` / `--se` / `--sw` / `--move`） | 自由模式八向缩放 + 专用移动手柄 |
| `.adl-terminal-region-actions` | 单窗格右上角操作叠加层（仅悬停/聚焦对应窗格时显现） |
| `.adl-terminal-region-actions__btn` / `__btn--danger` | 叠加层按钮 / 「关闭窗口」危险色按钮 |
| `.adl-terminal-error-note` | Shell 启动失败的错误提示（仅活跃错误状态显示） |

### 工具栏（布局与窗格）

| 控件 | 选择器 | 行为 |
|------|--------|------|
| 布局模式分段选择器 | `.adl-tool-context__diff-view`（`role="group"`，`aria-label`=终端布局模式） | `均分` / `自由` 两键（`.adl-tool-context__toggle-btn`）切换布局模式 |
| 恢复自动布局 | `.adl-tool-context__iconbtn`（`aria-label`=恢复自动布局） | 回到均分自动布局（比例归一均分 + 清空自由 rect） |
| 增加终端 | `.adl-tool-context__iconbtn`（`aria-label`=增加终端） | 在当前标签追加一个独立 PTY 窗格，数量无上限 |
| 自定义布局 | `.adl-tool-context__iconbtn`（`aria-label`=自定义布局，`aria-haspopup="dialog"`） | 开合自定义布局卡片（仅均分模式显示入口） |
| 更多终端操作 | `.adl-tool-context__iconbtn`（`aria-label`=更多终端操作，`aria-haspopup="menu"`） | 开合下拉菜单：边界线 / 活动窗口高亮 / 增大字号 / 减小字号 / 杀死进程（见下） |

布局模式、窗格比例 / 自由 rect、窗格顺序 / 标注、边界线 / 活动高亮 / 字号按标签独立持久化（结构存 `adl:terminal.tabs`、布局存 `adl:terminal.paneLayout`、视图偏好存 `adl:terminal.showPaneBorders` / `showActiveHighlight` / `fontSize`），重启后恢复窗格结构/布局并逐窗格新建 shell。

> 中间部分终端视图工具栏排布不同：分段控制器、恢复自动布局、增加终端、自定义布局（含卡片锚点）全部靠左，右侧只留「更多终端操作」；右侧面板保持左侧导航 + 右侧操作组不变。

### 更多终端操作菜单

| 选项 | `role` | 行为 |
|------|--------|------|
| 边界线 | `menuitemcheckbox`（打勾 state） | 总开关：开=均分分割线可见、自由窗格描边；关=两者都不显示 |
| 活动窗口高亮 | `menuitemcheckbox`（打勾 state） | 总开关：活动窗格独立覆盖层描边（中性色）；关即无描边 |
| 增大字号 / 减小字号 | `menuitem`（到界禁用） | 终端字号 10–24 步进，即时生效并持久化 |
| 杀死进程 | `menuitem` + 最右侧 `!` 提示标记 | 只结束当前活动窗格的 shell 进程，随后自动起新会话并清空显示；悬停/聚焦 `!` 出提示卡（`HintCard`，`#标题` + `·分点` 排版）；点 `!` 本身不触发动作；无会话时禁用 |

### 边界线拖拽（均分模式）

```javascript
const divider = await page.$('.adl-terminal-col-divider');
const box = await divider.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x - 80, box.y + box.height / 2, { steps: 5 });
await page.mouse.up();
```

- 拖拽相邻列/行边界线调整比例（总和守恒，各设最小像素下限）；拖拽期间直接写 CSS 变量，松手提交并落盘
- 边界线悬停高亮，提示可拖拽位置
- 自由模式：拖拽窗格边缘/角改变尺寸，拖拽专用移动手柄改变位置；各边设有最小像素

### 窗格动作（每窗格右上角叠加层）

| 按钮 | `aria-label` / `title` | 行为 |
|------|------------------------|------|
| 清空内容 | `terminalPaneClearLabel` | `xterm.clear()` + 滚到底部（等同 clear 命令） |
| 最大化 / 还原 | `terminalPaneMaximize` / `terminalPaneRestore` | 该窗格独占显示区 / 回到布局；临时 UI 态，不持久化，增删窗格/重启/切模式即复位 |
| 关闭窗口 | `terminalPaneClose`（危险色） | 关闭该窗格并终止其 PTY 会话 |

### 自定义布局卡片

点击工具栏「自定义布局」按钮弹出锚定卡片（`role="dialog"`），点击外部 / Esc / 卡片关闭按钮关闭。

| 选择器 | 说明 |
|--------|------|
| `.adl-layout-card` | 卡片容器（`role="dialog"`，`aria-label`=自定义布局） |
| `.adl-layout-card__header` / `__title` / `__header-actions` / `__close` | 头部 / 标题 / 右侧动作（交换图标 + 关闭按钮） |
| `.adl-layout-card__grid` | 方块网格 |
| `.adl-layout-card__square` | 单个窗格方块（背景 = `paneColor(colorIndex)`；`is-selected` 交换选中、`is-dragging` 拖拽提起） |
| `.adl-layout-card__label-input` | 标注输入框（不限长，提交时按首个码点截断） |
| `.adl-layout-card__hint` | 双击标注提示（限 1 字符；交换模式下切换为选块提示） |
| `.adl-layout-card__actions--swap` | 交换模式底部三按钮（`adl-btn adl-btn--ghost adl-btn--square`，与重命名对话框同款：全直角、无边框、常驻底色悬停灰） |

- **拖拽排序**：按住方块拖动（指针事件，B 缝隙滑动：拖拽中本地重排 + FLIP 滑动，松手一次提交；取消/失焦/滚动即丢弃），交换模式下禁用拖拽
- **交换位置**：点头部交换图标进入交换模式，点选两个方块后点「交换」应用（保留模式可连续交换）；「撤回」撤销上次交换，「取消」退出并清空历史；拖拽提交会清空撤回栈
- **双击标注**：双击方块进入内联编辑（编辑态方块无额外描边，输入框即焦点），限 1 字符（一个简体中文字计 1 字符），回车/失焦提交；超出按首个码点截断

### 持久化与重启恢复

1. 窗格为**内存会话**：不产生历史归档文件，也没有磁盘预算/淘汰逻辑
2. 每个窗格对应独立 PTY：关闭窗格只终止其自身会话，关闭标签终止该标签全部窗格
3. 关闭应用前未关闭的终端标签，重启后恢复窗格数量/顺序/标注与布局，并逐窗格新建 shell
4. 布局模式、比例 / 自由 rect、窗格结构按标签独立持久化，标签之间互不影响

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 终端面板 | `.adl-tool-panel--terminal` | 终端面板容器 |
| 树状列表 | `.adl-multitree--terminal` | 终端树状列表根容器 |
| 终端标签 | `.adl-tool-list__item--terminal-tab` | 单个终端会话标签 |
| 窗格网格 | `.adl-terminal-pane-grid` | 一个标签内的多窗格显示区 |
| 单个窗格 | `.adl-terminal-pane` | 独立 PTY 窗格 |
| xterm 容器 | `.adl-terminal-canvas` | xterm.js 挂载容器 |
| 关闭全部 | `button[aria-label="清空全部终端"]` | 一键关闭所有终端 |

## 注意事项

1. **独立终端常驻**：独立终端工作区始终显示在列表顶部，删除所有标签后头部行不消失
2. **多标签独立会话**：每个标签对应独立 Shell 进程，切换标签不中断运行
3. **一个标签多窗格**：一个标签内的每个窗格也是独立 PTY；窗格数量无上限，按标签独立持久化布局与标注
4. **xterm.js 不做 local echo**：字符由后端 PTY 进程回显
5. **主题同步**：xterm 主题色跟随 CSS 变量 `--bg`、`--text-primary`、`--selection`
