# 布局系统与栅格 (Layout System)

> 定义页面级布局结构、栅格系统和容器规范

## 1. 整体页面布局

### 1.1 标准应用布局

```
┌──────────────────────────────────────────────────────┐
│  Title Bar (28~34px, OS-native)                     │
├──────────┬─────────────────────────────────────────┤
│          │  Breadcrumb / Page Header               │
│ Sidebar  ├─────────────────────────────────────────┤
│ (240px) │                                         │
│          │          Content Area                   │
│ [可折叠] │        (flex-1, overflow-y: auto)       │
│          │                                         │
│          │                                         │
│          │                                         │
├──────────┴─────────────────────────────────────────┤
│  Status Bar (24~28px)                             │
└──────────────────────────────────────────────────────┘
```

### 1.2 布局区域定义

| 区域 | CSS 选择器 | 高度 | 说明 |
|------|-----------|------|------|
| Title Bar | `.app-titlebar` | 28~34px | 由 Electron frame 或自定义 |
| Header | `.app-header` | 48~56px | 面包屑 + 页面操作栏 |
| Sidebar | `.app-sidebar` | calc(100vh - title - status) | 左侧导航 |
| Content | `.app-content` | flex-1 | 主内容滚动区 |
| Status Bar | `.app-statusbar` | 24~28px | 底部状态信息 |

## 2. 栅格系统

### 2.1 容器宽度

| 容器类 | 最大宽度 | 使用场景 |
|--------|----------|----------|
| `.container-fluid` | 100% | 全宽容器（设置页等） |
| `.container` | `max-width: 1280px` | 标准内容区 |
| `.container-narrow` | `max-width: 960px` | 窄内容（表单、文档） |
| `.container-wide` | `max-width: 1440px` | 宽内容（Dashboard） |

### 2.2 列系统（12 列栅格）

```css
.grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(12, 1fr);
}

/* 预设列宽 */
.col-span-1 { grid-column: span 1; }
.col-span-2 { grid-column: span 2; }
.col-span-3 { grid-column: span 3; }
.col-span-4 { grid-column: span 4; }
.col-span-5 { grid-column: span 5; }
.col-span-6 { grid-column: span 6; }
.col-span-7 { grid-column: span 7; }
.col-span-8 { grid-column: span 8; }
.col-span-9 { grid-column: span 9; }
.col-span-10 { grid-column: span 10; }
.col-span-11 { grid-column: span 11; }
.col-span-12 { grid-column: span 12; }
.col-span-full { grid-column: 1 / -1; }

/* 响应式列宽 */
@media (max-width: 1023px) {
  .md-col-span-6 { grid-column: span 6; }
}
@media (max-width: 767px) {
  .sm-col-span-12 { grid-column: span 12; }
}
```

### 2.3 常用栅格布局预设

| 名称 | 列分布 | 使用场景 |
|------|--------|----------|
| `grid-4col` | 4 等分 | Dashboard 统计卡片 |
| `grid-3col` | 3 等分 | 功能介绍卡片 |
| `grid-2col` | 2 等分 (6+6) | 设置页双列表单 |
| `grid-main-aside` | 9 + 3 | 主内容 + 侧边面板 |
| `grid-sidebar-main` | 3 + 9 | 侧边导航 + 内容 |
| `grid-auto-fit` | 自动填充 | Tag/Badge 列表 |

## 3. Z-Index 层级管理

详见 [Design Tokens → Z-Index](../tokens/00-design-tokens.md#8-z-index-层级-management)，此处为布局相关补充。

### 3.1 布局层级分配

| 层级 | z-index | 包含元素 |
|------|---------|----------|
| Background | 0 | 页面背景、静态内容 |
| Content | 10 | 正文、卡片、表格 |
| Sticky Header | 30 | 固定顶栏、吸附标题 |
| Dropdown | 20 | 下拉菜单、Select 面板 |
| Overlay | 40 | Tooltip、Popover |
| Modal Backdrop | 50 | 半透明遮罩层 |
| Modal Content | 60 | 对话框主体 |
| Toast | 80 | 通知提示条 |
| Tooltip | 90 | 最高优先提示 |
| Debug | 9999 | 开发者调试工具 |

## 4. 安全区域与间距

### 4.1 内容区内边距

| 区域 | padding | 说明 |
|------|--------|------|
| 页面左右边距 | `var(--space-6)` ~ `var(--space-8)` | Content 区左右 padding |
| Section 上下间距 | `var(--space-8)` | 大区块之间垂直间距 |
| Card 组内间距 | `var(--space-4)` | 同组卡片之间的 gap |
| 表单字段间距 | `var(--space-5)` ~ `var(--space-6)` | 字段间垂直距离 |
| 列表项间距 | `var(--space-2)` | 列表行之间的间隔 |
| 按钮组内间距 | `var(--space-2)` | Button Group 内按钮间隙 |

### 4.2 最大内容宽度限制

```css
.app-content {
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 var(--space-8);
  
  @media (max-width: 1535px) {
    padding: 0 var(--space-6);
  }
  
  @media (max-width: 1023px) {
    padding: 0 var(--space-5);
  }
}
```

## 5. 典型页面布局模式

### 5.1 Dashboard 页面

```
┌─ [Header: 页面标题 + 操作按钮] ──────────────────┐
│                                                    │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐              │
│ │Stat 1│ │Stat 2│ │Stat 3│ │Stat 4│ ← 4列网格     │
│ └──────┘ └──────┘ └──────┘ └──────┘              │
│                                                    │
│ ┌──────────────────────┐ ┌──────────────────────┐  │
│ │ 最近活动时间线         │ │ 待处理任务           │  │
│ │ (flex-1)             │ │ (flex-1)             │  │
│ └──────────────────────┘ └──────────────────────┘  │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 5.2 设置页

```
┌─ [Header: 设置] ──────────────────────────────────┐
│                                                    │
│ ┌──────────┬────────────────────────────────────┐  │
│ │ 通用      │                                    │  │
│ │ 外观      │   配置内容区                         │  │
│ │ 工作区    │   (form fields / toggles / ...)    │  │
│ │ 模型      │                                    │  │
│ │ 安全      │                                    │  │
│ │ 索引      │                                    │  │
│ │ 高级      │                                    │  │
│ │ 关于      │                                    │  │
│ └──────────┴────────────────────────────────────┘  │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 5.3 日志查看器页

```
┌─ [Header: 日志查看器] [级别] [模块] [搜索] [实时] ──┐
│                                                      │
│ ┌──────────────────────┬──────────────────────────┐  │
│ │ 工具栏               │ 日志列表                    │  │
│ │ [级别选择] [模块筛选] │ [时间] [Level] [Module]   │  │
│ │ [时间范围] [搜索]    │ [消息内容...]            │  │
│ │                      │ [时间] [Level] [Module]   │  │
│ │                      │ [消息内容...]            │  │
│ │                      │         ...               │  │
│ ├──────────────────────┤                            │  │
│ │ 详情面板(可折叠)     │                            │  │
│ │ [完整 JSON 数据]     │                            │  │
│ └──────────────────────┴──────────────────────────┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
```
