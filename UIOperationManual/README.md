# UI 操作手册

> 本手册为 Agent 自动化浏览器测试提供 UI 元素定位和操作指导。

## 布局概览

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [1] Brand   [2] App Menus    [3] Cmd    │  Drag Region  │[4][5][6] [7][8][9]│
├──────────┬───────────────────────────────────────────────┬────────────────────┤
│          │                                               │ [14] Tool Switcher │
│  [10]    │                                               ├────────────────────┤
│  Quick   │              [15] Message Stream              │                    │
│  Actions │                                               │   [17] Tool Panel  │
│          │                                               │       Content      │
├──────────┤                                               │                    │
│  [11]    │                                               │   (files/changes/  │
│  Workspaces&Sessions                           │   browser/terminal│
│          │                                               │   /audit/models/   │
│          │                                               │   settings)        │
├──────────┤                                               │                    │
│  [12]    │  [16] Composer                                │                    │
│  Conversations                                 │                    │
│          │  ┌────────────────────────────────────────┐  │                    │
│          │  │ [16a] Context Chips                    │  │                    │
│          │  ├────────────────────────────────────────┤  │                    │
│          │  │ [16b] Input Area         │ [16c] Actions│  │                    │
│          │  └────────────────────────────────────────┘  │                    │
│          │  │ [16d] Status Bar (inline)               │  │                    │
└──────────┴───────────────────────────────────────────────┴────────────────────┘
```

## 区域索引

| 区域 | 文档路径 | 说明 |
|------|----------|------|
| 标题栏 | [titlebar/](./titlebar/README.md) | 品牌、菜单、窗口控制 |
| 左侧边栏 | [leftbar/](./leftbar/README.md) | 快捷操作、工作区、会话 |
| 中心面板 | [center/](./center/README.md) | 消息流、输入区、状态栏 |
| 右侧面板 | [rightpanel/](./rightpanel/README.md) | 工具切换、工具面板 |

## 共享定义

| 文件 | 说明 |
|------|------|
| [_shared/selectors.md](./_shared/selectors.md) | 选择器定位策略 |
| [_shared/states.md](./_shared/states.md) | 通用元素状态定义 |
| [_shared/wait-conditions.md](./_shared/wait-conditions.md) | 通用等待条件模板 |

## 使用方式

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
- 是否需要先创建会话
- 是否需要等待某个状态

### 4. 执行操作并验证

按照文档中的操作说明执行，并检查预期结果和状态变化。

## 快速参考

### 常用操作入口

| 操作 | 入口位置 | 文档 |
|------|----------|------|
| 打开工作区 | 标题栏 → 文件菜单 → 打开文件夹 | [titlebar/menus/file-menu.md](./titlebar/menus/file-menu.md) |
| 新建会话 | 左侧边栏 → 工作区旁的 + 按钮 | [leftbar/workspaces.md](./leftbar/workspaces.md) |
| 发送消息 | 中心面板 → Composer → 发送按钮 | [center/composer.md](./center/composer.md) |
| 切换工具 | 右侧面板 → 工具切换器 | [rightpanel/tool-switcher.md](./rightpanel/tool-switcher.md) |
| 切换主题 | 标题栏 → 主题按钮 | [titlebar/actions.md](./titlebar/actions.md) |

### 全局快捷键

| 快捷键 | 功能 | 测试方式 |
|--------|------|----------|
| `Ctrl+O` | 打开工作区 | 模拟键盘输入 |
| `Ctrl+N` | 新建工作区 | 模拟键盘输入 |
| `Ctrl+,` | 打开设置 | 模拟键盘输入 |
| `Ctrl+Shift+P` | 命令面板 | 模拟键盘输入 |
| `Enter` | 发送消息（输入框聚焦时） | 模拟键盘输入 |
| `Escape` | 停止生成 | 模拟键盘输入 |

## 注意事项

1. **等待策略**：大多数操作需要等待 UI 更新，请参考 [_shared/wait-conditions.md](./_shared/wait-conditions.md)
2. **状态检查**：操作前检查元素是否可交互（非 disabled、非 loading）
3. **错误处理**：网络错误、权限错误等可能导致 UI 状态异常，需要检查错误提示
4. **异步加载**：部分内容（如会话列表、文件树）需要等待异步加载完成
