# UI 操作手册

> 本手册为 Agent 自动化浏览器测试提供 UI 元素定位和操作指导。

## 布局概览

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [1] Brand   [2] App Menus (Hamburger)  │  Drag Region  │[4][5][6] [7][8][9]│
│                        [CenterTabStrip: dsh/浏览器/终端标签]                │
├──────────┬───────────────────────────────────────────────┬────────────────────┤
│          │                                               │ [14] Tool Switcher │
│  [10]    │         [15] Center Tab Host                  │ (files/changes/   │
│  Left    │         (CenterEntryPage: dsh / 浏览器 / 终端)  │  browser/terminal/ │
│  Sidebar │                                               │  settings/         │
│ (剪切看板 │                                               │  communicate)      │
│ +系统监控)│                                               │                    │
│          │                                               │   [17] Tool Panel  │
│          │                                               │       Content      │
└──────────┴───────────────────────────────────────────────┴────────────────────┘
```

## 区域索引

| 区域 | 文档路径 | 说明 |
|------|----------|------|
| 标题栏 | [titlebar/](./titlebar/README.md) | 汉堡菜单、操作按钮、中间区标签条、窗口控制 |
| 左侧边栏 | [leftbar/](./leftbar/README.md) | 剪切看板、系统监控 |
| 中心面板 | [center/](./center/README.md) | 中间区多标签宿主（dsh/浏览器/终端） |
| 右侧面板 | [rightpanel/](./rightpanel/README.md) | 工具切换（6 工具）、工具面板、浏览器、通信面板 |

## 共享定义

| 文件 | 说明 |
|------|------|
| [shared/selectors.md](./shared/selectors.md) | 选择器定位策略 |
| [shared/states.md](./shared/states.md) | 通用元素状态定义 |
| [shared/wait-conditions.md](./shared/wait-conditions.md) | 通用等待条件模板 |

## 使用方式

### 0. 建立测试会话上下文

对于独立 Playwright 浏览器会话，如果测试依赖真实工作区内容，不要假设页面已经带着某个 workspace 状态启动。手工测试则先执行"打开工作区"操作，再进入具体区域断言。

### 1. 确定测试目标区域

根据测试场景，确定涉及的布局区域，只读取相关区域文档。

### 2. 查找元素定位信息

在区域文档中查找目标元素的定位选择器，按优先级使用：
1. `aria-label` 属性（最稳定）
2. `data-testid` 属性（测试专用）
3. CSS 类名（最后备选）

### 3. 确认前置条件

检查操作前需要满足的条件，如：
- 是否需要先打开工作区
- 是否需要等待某个状态（加载/索引/后端可达）

### 4. 执行操作并验证

按照文档中的操作说明执行，并检查预期结果和状态变化。

## 快速参考

### 常用操作入口

| 操作 | 入口位置 | 文档 |
|------|----------|------|
| 打开工作区 | 标题栏 → 文件菜单 → 打开文件夹 | [titlebar/menus/file-menu.md](./titlebar/menus/file-menu.md) |
| 切换工具 | 右侧面板 → 工具切换器 | [rightpanel/tool-switcher.md](./rightpanel/tool-switcher.md) |
| 切换主题 | 标题栏 → 主题按钮 | [titlebar/actions.md](./titlebar/actions.md) |
| 打开设置 | `Ctrl+Shift+Comma` 或标题栏 → 设置按钮 | [titlebar/actions.md](./titlebar/actions.md) |

### 全局快捷键

| 快捷键 | 功能 | 测试方式 |
|--------|------|----------|
| `Ctrl+O` | 打开工作区 | 模拟键盘输入 |
| `Ctrl+N` | 新建工作区 | 模拟键盘输入 |
| `Ctrl+Shift+Comma` | 打开设置 | 模拟键盘输入 |

## 注意事项

1. **等待策略**：大多数操作需要等待 UI 更新，请参考 [shared/wait-conditions.md](./shared/wait-conditions.md)
2. **状态检查**：操作前检查元素是否可交互（非 disabled、非 loading）
3. **错误处理**：网络错误、权限错误等可能导致 UI 状态异常，需要检查错误提示
4. **异步加载**：部分内容（如文件树）需要等待异步加载完成
