# Tooltip 悬停提示组件规范

> 统一的悬停交互样式、动画效果和信息展示格式

## 1. 组件概述

| 属性 | 值 |
|------|-----|
| 组件名 | Tooltip |
| 触发方式 | Hover（默认）/ Focus / Click / Manual |
| 定位方式 | 自动智能定位（10 个方向） |
| 动画时长 | 100ms enter / 75ms exit |
| z-index | `--z-tooltip` (90) |

## 2. 触发方式

### 2.1 触发类型

| 触发方式 | 行为 | 适用场景 |
|----------|------|----------|
| **Hover** (默认) | 鼠标悬停 500ms 后显示，移开后隐藏 | 按钮、图标、文字说明 |
| **Focus** | 键盘聚焦时显示，失焦后隐藏 | 表单字段、无障碍访问 |
| **Click** | 点击触发显示，再次点击或点击外部关闭 | 移动端、需要用户主动查看的信息 |
| **Manual** | 通过 API 手动控制显隐 | 复杂联动场景 |

### 2.2 触发延迟

| 场景 | 延迟时间 | 说明 |
|------|----------|------|
| 首次 Hover | **500ms** | 避免鼠标划过时频繁弹出 |
| 后续快速 Hover | **100ms** | 用户已表达意图后快速响应 |
| Focus 触发 | **0ms** | 即时显示 |
| Click 触发 | **0ms** | 即时显示 |
| 隐藏延迟 | **100ms** | 给用户移到 Tooltip 上查看的时间 |
| 长按（移动端） | **500ms** | 等同于 hover 的移动端替代 |

### 2.3 显示持续时间

| 场景 | 行为 |
|------|------|
| 默认 | 只要鼠标在 trigger 或 tooltip 内就保持显示 |
| 超时自动关闭 | 可选：最长显示 5s（适用于提示性信息） |
| 保持打开 | 点击内容区可锁定 tooltip 不消失 |

## 3. 方向与定位

### 3.1 支持的 10 个方向

```
         ┌─────────┐
         │  top    │
    ┌────┼─────────┼────┐
    │top-left│     │top-right│
    ├────┼────[●]──┼────┤
    │left │         │right │
    ├────┼─────────┼────┘
    │btm-left│   │btm-right│
    └────┼─────────┼────┘
         │ bottom  │
         └─────────┘
```

### 3.2 方向优先级

自动模式下的优先选择顺序：

1. **Top** — 默认首选（符合阅读习惯，从上到下）
2. **Bottom** — Top 空间不足时
3. **Left/Right** — 上下均不足时
4. **带 offset 变体** (top-left 等) — 需要避开特定元素时

### 3.3 边界处理

| 场景 | 处理策略 |
|------|----------|
| 超出视窗顶部 | 翻转到 Bottom |
| 超出视窗底部 | 翻转到 Top |
| 超出视窗左侧 | 翻转到 Right |
| 超出视窗右侧 | 翻转到 Left |
| 多方向均不足 | 缩小内容宽度 + 文本换行 + 截断省略号 |

### 3.4 与 Trigger 的偏移距离

| 方向 | 偏移值 | 说明 |
|------|--------|------|
| Top / Bottom | **6px** | Tooltip 与 Trigger 之间的间隙 |
| Left / Right | **6px** | 同上 |
| 对齐偏移 | 居中对齐 | Tooltip 中心对齐 Trigger 中心 |

## 4. 视觉规格

### 4.1 尺寸

| 属性 | 值 |
|------|-----|
| 最大宽度 | `280px` |
| 最小宽度 | 无限制（由内容决定） |
| 内边距 | `space-2(8px)` × `space-2(8px)` （紧凑） / `space-3(12px)` × `space-3(12px)` （标准） |
| 圆角 | `radius-md` (6px) |

### 4.2 样式变体

#### 变体 A: Default（默认）

| 属性 | Light 模式 | Dark 模式 |
|------|-----------|-----------|
| 背景 | `--color-bg-elevated` (#FFFFFF 或等效) | `--color-bg-elevated` |
| 文字色 | `--color-text-primary` | `--color-text-primary` |
| 阴影 | `shadow-lg` | `shadow-lg` |
| 边框 | `--color-border-default` | `--color-border-default` |
| 字号 | `text-sm` (14px) | `text-sm` (14px) |
| 字重 | `font-normal` (400) | `font-normal` (400) |
| 行高 | `leading-normal` (1.5) | `leading-normal` (1.5) |

#### 变体 B: Info（信息提示）

| 属性 | 说明 |
|------|------|
| 左侧图标 | ℹ️ 图标（SVG `info` icon），使用 `--color-info` 色 |
| 图标间距 | `space-2` (8px) |
| 背景 | 带 info 色极淡底色 `rgba(info-color, 0.05)` |
| 用途 | 补充说明、帮助性提示 |

#### 变体 C: Warning/Danger（警告）

| 属性 | 说明 |
|------|------|
| 左侧图标 | ⚠️ SVG `alert-triangle` icon，使用 `--color-warning/danger` 色 |
| 背景 | 带对应状态色极淡底色 |
| 文字色 | 使用对应的语义文字色 |
| 用途 | 操作风险警告、不可逆操作提示 |

### 4.3 箭头指示器

Tooltip 与 Trigger 之间的小三角形箭头：

| 属性 | 值 |
|------|-----|
| 尺寸 | 6px × 6px（等边三角形） |
| 颜色 | 与 Tooltip 背景色一致 |
| 位置 | 居中于 Trigger 边缘 |
| 偏移 | 紧贴 Tooltip 边缘，无缝衔接 |

## 5. 动画效果

### 5.1 进入动画

```css
@keyframes tooltip-enter {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.tooltip-entering {
  animation: tooltip-enter 100ms ease-out forwards;
}
```

| 属性 | 值 |
|------|-----|
| 时长 | **100ms** |
| 缓动 | `ease-out` |
| 效果 | 淡入 + 微缩放（从 0.96 到 1.0） |
| 变换原点 | 箭头指向的方向（如 top 方向则 origin-bottom） |

### 5.2 退出动画

```css
@keyframes tooltip-exit {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.98);
  }
}

.tooltip-exiting {
  animation: tooltip-exit 75ms ease-in forwards;
}
```

| 属性 | 值 |
|------|-----|
| 时长 | **75ms**（比进入快 ~25%） |
| 缓动 | `ease-in` |
| 效果 | 淡出 + 微缩小（从 1.0 到 0.98） |

### 5.3 Reduced Motion 支持

```css
@media (prefers-reduced-motion: reduce) {
  .tooltip-entering,
  .tooltip-exiting {
    animation: none;
  }
  
  .tooltip-entering { opacity: 1; }
  .tooltip-exiting { opacity: 0; display: none; }
}
```

## 6. 内容格式

### 6.1 纯文本 Tooltip

最常见的形式，单行或多行纯文本：

```
┌──────────────────────────┐
│ 保存工作区配置            │
└──────────────────────────┘
```

规则：
- 单行文本不截断（自动换行）
- 最大宽度 280px
- 推荐长度 ≤ 50 个字符
- 不使用富文本格式

### 6.2 带快捷键提示

操作类按钮的 Tooltip 在描述后附加快捷键：

```
┌──────────────────────────────┐
│ 刷新索引          F5        │
│                    ─────    │ ← 快捷键右对齐，等宽字体
└──────────────────────────────┘
```

| 元素 | 样式 |
|------|------|
| 描述文字 | `text-sm`, `font-normal`, `color: text-primary` |
| 分隔符 | 不少于 `space-4`(16px) 间距 |
| 快捷键 | `text-xs`, `font-mono`, `color: text-muted`, 加灰色背景 badge |

### 6.3 富内容 Tooltip（特殊场景）

仅用于复杂场景（如图表数据点、表格单元格详情）：

```
┌──────────────────────────────┐
│ 📄 src/index.tsx           │
│ ─────────────────────────  │
│ 大小: 12.4 KB              │
│ 修改: 2 小时前             │
│ 类型: TypeScript React      │
│ [在编辑器中打开 →]          │
└──────────────────────────────┘
```

规则：
- 包含标题行（加粗）
- 结构化信息用 key-value 格式
- 底部可选操作链接
- 最大宽度可到 `360px`
- 此变体需通过 `click` 触发而非 hover

## 7. 交互行为细节

### 7.1 鼠标轨迹跟随（可选）

对于较长的文本 Tooltip，支持鼠标向 Tooltip 方向移动时不隐藏：

```
Trigger ──[hover]──▶ Tooltip 出现
                │
                ▼ 鼠标移向 Tooltip
              [在 Tooltip 范围内] → 保持显示
              [离开 Tooltip 范围] → 100ms 后隐藏
```

### 7.2 嵌套 Tooltip

Tooltip 内部包含可交互元素时（如链接），内部元素的 Tooltip 可以正常弹出（层级正确叠加）。

### 7.3 与其他 Popover 共存

当页面上同时存在 Tooltip 和 Dropdown/Popover 时：

| 规则 | 说明 |
|------|------|
| Tooltip z-index 高于 Dropdown | Tooltip = 90, Dropdown = 20~70 |
| 打开 Dropdown 时关闭相关 Tooltip | 避免遮挡 |
| Tooltip 不捕获焦点 | Focus 保留在原元素上 |

## 8. 无障碍设计

### 8.1 ARIA 属性

| 元素 | ARIA 属性 | 说明 |
|------|-----------|------|
| Trigger | `aria-describedby="{tooltip-id}"` | 关联 Tooltip 内容 |
| Tooltip 容器 | `role="tooltip"` | 语义角色 |
| Tooltip 容器 | `id="{unique-id}" | 供 aria-describedby 引用 |
| Tooltip 容器 | `aria-live="polite"` | 动态内容的实时通知 |

### 8.2 键盘支持

| 操作 | 行为 |
|------|------|
| Tab 到 Trigger | Focus 触发 Tooltip 显示 |
| Trigger 上 Enter/Space | 不触发 Tooltip（仅执行默认操作） |
| Escape | 关闭当前所有 Tooltip |
| Tooltip 内有可聚焦元素 | Tab 可进入 Tooltip 内部导航 |

### 8.3 屏幕阅读器

| 场景 | 朗读内容 |
|------|----------|
| 纯文字 Tooltip | "按钮：刷新索引。提示：重新构建工作区的文件索引" |
| 带快捷键 Tooltip | "按钮：刷新索引。提示：重新构建文件索引。快捷键 F5" |
| 装饰性 Tooltip | 不朗读（`aria-hidden` 或仅作为 visual enhancement） |

## 9. 使用示例

### 基础用法

```tsx
// 纯文字提示
<Tooltip content="保存工作区配置">
  <Button><Icon name="save" /> 保存</Button>
</Tooltip>

// 带快捷键
<Tooltip content="刷新索引" shortcut="F5">
  <Button variant="ghost"><Icon name="refresh-cw" /></Button>
</Tooltip>

// Warning 变体
<Tooltip content="此操作将永久删除数据且无法恢复" variant="danger">
  <Button variant="danger">删除</Button>
</Tooltip>

// Info 变体
<Tooltip content="索引版本号用于判断是否需要重建索引" variant="info">
  <Text as="span" underline dashed>v3.2.1</Text>
</Tooltip>

// 富内容
<Tooltip rich>
  <TooltipTitle>src/index.tsx</TooltipTitle>
  <TooltipContent>
    <div>大小: 12.4 KB</div>
    <div>修改: 2 小时前</div>
    <Link href="#">在编辑器中打开 →</Link>
  </TooltipContent>
  <Trigger>文件路径文本</Trigger>
</Tooltip>
```
