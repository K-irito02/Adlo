# 左侧边栏区域

> 左侧边栏当前包含剪切看板和系统资源查看两个模块。

## 布局结构

```
┌──────────────┐
│ 剪切看板      │
│ Clipboard    │
│ HistoryList  │
├──────────────┤
│ 系统资源查看  │
│ SystemMonitor│
│  Panel       │
├──────────────┤
│ [Resize]     │
│   Handle     │
└──────────────┘
```

## 元素索引

| 模块 | 文档 | 说明 |
| ---- | ---- | ---- |
| 剪切看板 | [clipboard-history.md](./clipboard-history.md) | `ClipboardHistoryList`（`.adl-clipboard`，搜索/筛选/放大查看） |
| 系统资源查看 | （专文待补） | `SystemMonitorPanel`（`.adl-sysmon`），系统资源监控 |
| Resize Handle | - | 宽度调整手柄（180–260px 钳制，见 `uiSliceTypes.ts`） |

> 注：历史版本的"工作区列表 / 会话列表 / 独立对话列表"已随左侧边栏改版移除（会话与工作区管理迁移至顶部标题栏「添加工作区」与右侧面板工作区多树）。原 `workspaces.md` / `sessions.md` / `conversations.md` 不再适用。

## 容器选择器

| 选择器                    | 说明               |
| ------------------------- | ------------------ |
| `.adl-leftbar`            | 左侧边栏容器       |
| `.adl-leftbar__content`   | 内容区域（可滚动） |
| `.adl-leftbar--collapsed` | 折叠状态           |

## 状态

### 折叠状态

| 状态 | CSS 类名                  | aria 属性             | 说明     |
| ---- | ------------------------- | --------------------- | -------- |
| 展开 | -                         | `aria-hidden="false"` | 默认状态 |
| 折叠 | `.adl-leftbar--collapsed` | `aria-hidden="true"`  | 隐藏内容 |

### 宽度限制

| 属性     | CSS 变量 / 常量       | 默认值 |
| -------- | --------------------- | ------ |
| 最小宽度 | `--leftbar-width-min`（`regions/center.css`） | 180px |
| 默认宽度 | `--leftbar-width` | 180px |
| 最大宽度 | `--leftbar-width-max`（`regions/center.css`） | 260px |

> 钳制常量另见 `stores/slices/uiSliceTypes.ts`（`LEFT_PANEL_WIDTH_MIN/MAX`）。

### 持久化状态（中心登记表 `adl:ui.*`，见 `stores/persisted/registry.ts`）

| 状态 | 键名 | 说明 |
| ---- | ---- | ---- |
| 左栏宽度 | `adl:ui.leftPanelWidth` | 拖拽释放时提交，180–260px 钳制 |
| 系统监控展开/收起 | `adl:ui.sysmonCollapsed` | 切换时同步写入 |
| 剪贴板历史滚动位置 | `adl:ui.clipboardScrollTop` | 滚动停止去抖写入 |
| 系统监控滚动位置 | `adl:ui.sysmonScrollTop` | 同上，收起即卸载落盘 |

## 注意事项

1. **折叠状态**：折叠时内容不可见，但 DOM 仍存在
2. **宽度调整**：拖拽手柄调整左侧边栏宽度