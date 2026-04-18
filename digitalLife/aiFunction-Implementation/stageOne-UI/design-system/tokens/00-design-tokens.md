# 设计令牌 (Design Tokens)

> 定义 UI 系统中所有视觉和交互的基础原子值
>
> 所有组件必须引用令牌，禁止硬编码数值

## 1. 间距系统 (Spacing)

基于 **4px 基础网格**，所有间距值为 4 的倍数。

### 间距令牌表

| 令牌名 | 值 | CSS 变量 | 使用场景 |
|--------|-----|----------|----------|
| `space-0` | 0px | `--space-0` | 无间距 |
| `space-px` | 1px | `--space-px` | 细分割线、像素级微调 |
| `space-0.5` | 2px | `--space-0-5` | 紧凑元素内间距 |
| `space-1` | 4px | `--space-1` | 图标与文字间隙、紧凑组件 |
| `space-1.5` | 6px | `--space-1-5` | 小元素间间距 |
| `space-2` | 8px | `--space-2` | 相关联元素组内间距 |
| `space-2.5` | 10px | `--space-2-5` | 中等密度布局间距 |
| `space-3` | 12px | `--space-3` | 标准组件内边距 |
| `space-3.5` | 14px | `--space-3-5` | 表单行间距 |
| `space-4` | 16px | `--space-4` | 卡片内边距、标准区块间距 |
| `space-5` | 20px | `--space-5` | 区块之间间距 |
| `space-6` | 24px | `--space-6` | 大区块间距、Section 间距 |
| `space-8` | 32px | `--space-8` | 页面级区块间距 |
| `space-10` | 40px | `--space-10` | 大区域分隔 |
| `space-12` | 48px | `--space-12` | 页面主区域垂直节奏 |
| `space-16` | 64px | `--space-16` | 章节级大间距 |
| `space-20` | 80px | `--space-20` | Hero 区域内边距 |
| `space-24` | 96px | `--space-24` | 全屏容器超大边距 |

### 间距使用规范

| 场景 | 推荐令牌 | 说明 |
|------|----------|------|
| 按钮内 padding (小) | `space-2` × `space-3` | 横向 × 纵向 |
| 按钮内 padding (中) | `space-3` × `space-3` | 标准 Button |
| 按钮内 padding (大) | `space-4` × `space-4` | Primary / Large Button |
| 卡片内 padding | `space-4` ~ `space-6` | 根据内容密度选择 |
| 列表项间距 | `space-1` ~ `space-2` | 紧凑/宽松列表 |
| 表单字段间距 | `space-4` ~ `space-6` | 字段之间的垂直间距 |
| Section 标题与内容间距 | `space-3` ~ `space-4` | 标题下方 |
| 页面侧边距 (桌面) | `space-6` ~ `space-8` | 内容区左右 padding |
| Modal 内边距 | `space-6` | 对话框内容区 |

## 2. 字体系统 (Typography)

### 字体族 (Font Family)

| 令牌名 | 值 | 用途 |
|--------|-----|------|
| `font-sans` | `'Inter', -apple-system, 'Segoe UI', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif` | 界面正文（Sans-serif） |
| `font-mono` | `'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'Courier New', monospace` | 代码、路径、ID、终端输出 |
| `font-display` | 同 `font-sans` | 大标题展示（可后续替换为品牌字体） |

### 字体大小 (Font Size)

基于 **1.25 倍几何级数** 的类型缩放。

| 令牌名 | 值 | 行高 | CSS 变量 | 使用场景 |
|--------|-----|------|----------|----------|
| `text-xs` | 12px | 16px (1.333) | `--text-xs` | 辅助说明、脚注、时间戳 |
| `text-sm` | 14px | 20px (1.429) | `--text-sm` | 次要文字、标签、表格内容 |
| `text-base` | 16px | 24px (1.5) | `--text-base` | 正文默认字号 |
| `text-lg` | 18px | 28px (1.556) | `--text-lg` | 小标题、强调文字 |
| `text-xl` | 20px | 28px (1.4) | `--text-xl` | 卡片标题、Section 标题 |
| `text-2xl` | 24px | 32px (1.333) | `--text-2xl` | 页面标题、Modal 标题 |
| `text-3xl` | 30px | 36px (1.2) | `--text-3xl` | 大标题、Hero 文字 |
| `text-4xl` | 36px | 40px (1.111) | `--text-4xl` | 特大展示文字 |
| `text-5xl` | 48px | 1 | `--text-5xl` | 营业页主标题 |
| `text-6xl` | 60px | 1 | `--text-6xl` | 超大展示（极少使用） |

### 字重 (Font Weight)

| 令牌名 | 值 | CSS 变量 | 使用场景 |
|--------|-----|----------|----------|
| `font-thin` | 100 | `--font-thin` | 极细装饰文字（极少用） |
| `font-light` | 300 | `--font-light` | 轻量辅助文字 |
| `font-normal` | 400 | `--font-normal` | 正文默认字重 |
| `font-medium` | 500 | `--font-medium` | 标签、按钮文字、中等强调 |
| `font-semibold` | 600 | `--font-semibold` | 小标题、重要文字 |
| `font-bold` | 700 | `--font-bold` | 大标题、强强调 |
| `font-extrabold` | 800 | `--font-extrabold` | 展示型大标题 |
| `font-black` | 900 | `--font-black` | 超粗展示（极少用） |

### 行高 (Line Height)

| 令牌名 | 值 | 适用字号 |
|--------|-----|----------|
| `leading-none` | 1 | 单行紧凑文字、数据卡片 |
| `leading-tight` | 1.25 | 标题文字 |
| `leading-snug` | 1.375 | 小标题 |
| `leading-normal` | 1.5 | 正文默认行高 |
| `leading-relaxed` | 1.625 | 宽松阅读体验 |
| `leading-loose` | 2 | 特殊展示用途 |

### 字母间距 (Letter Spacing)

| 令牌名 | 值 | 使用场景 |
|--------|-----|----------|
| `tracking-tighter` | -0.05em | 大写标题紧缩 |
| `tracking-tight` | -0.025em | 中大号标题 |
| `tracking-normal` | 0em | 正文默认 |
| `tracking-wide` | 0.025em | 小字号文字增强可读性 |
| `tracking-wider` | 0.05em | 全大写文字（如标签、Badge） |
| `tracking-widest` | 0.1em | 特殊展示效果 |

## 3. 圆角系统 (Border Radius)

| 令牌名 | 值 | CSS 变量 | 使用场景 |
|--------|-----|----------|----------|
| `radius-none` | 0px | `--radius-none` | 直角元素、全屏覆盖层 |
| `radius-sm` | 2px | `--radius-sm` | 小型输入框、Tag、微小元素 |
| `radius-default` | 4px | `--radius` | 默认圆角、标准 Input |
| `radius-md` | 6px | `--radius-md` | 按钮、小型卡片 |
| `radius-lg` | 8px | `--radius-lg` | 标准卡片、Dropdown 面板 |
| `radius-xl` | 12px | `--radius-xl` | 大卡片、Modal 对话框 |
| `radius-2xl` | 16px | `--radius-2xl` | 大型面板、Popover |
| `radius-3xl` | 24px | `--radius-3xl` | Hero 区域容器 |
| `radius-full` | 9999px | `--radius-full` | 圆形 Avatar、Pill 形状按钮 |

### 圆角使用规范

| 元素类型 | 推荐圆角 | 说明 |
|----------|----------|------|
| Button (Small) | `radius-md` (6px) | 小按钮 |
| Button (Default) | `radius-lg` (8px) | 标准按钮 |
| Button (Large/Pill) | `radius-full` | 胶囊形按钮 |
| Input / Textarea | `radius-default` (4px) | 输入框 |
| Card | `radius-xl` (12px) | 标准卡片 |
| Card (Elevated) | `radius-lg` (8px) + shadow | 有阴影的卡片可用稍小圆角 |
| Modal / Dialog | `radius-2xl` (16px) | 弹窗 |
| Toast / Alert | `radius-lg` (8px) | 通知条 |
| Badge / Tag | `radius-sm` (2px) 或 `radius-full` | 小标签或 Pill 形状 |
| Dropdown Menu | `radius-lg` (8px) | 下拉菜单 |
| Tooltip | `radius-md` (6px) | 提示气泡 |
| Avatar | `radius-full` | 头像圆形 |
| Progress Bar | `radius-full` | 进度条两端圆形 |

## 4. 阴影系统 (Box Shadow)

阴影分为 **5 个层级**，从无到最强视觉提升。

| 令牌名 | 值 | CSS 变量 | 使用场景 |
|--------|-----|----------|----------|
| `shadow-none` | none | `--shadow-none` | 无阴影、Flat 元素 |
| `shadow-sm` | `0 1px 2px 0 rgba(0,0,0,0.05)` | `--shadow-sm` | 微弱悬浮、Subtle 卡片 |
| `shadow-default` | `0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.06)` | `--shadow` | 标准卡片悬浮态 |
| `shadow-md` | `0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.06)` | `--shadow-md` | Modal 底层、下拉菜单 |
| `shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.06)` | `--shadow-lg` | 重要弹窗、Popover |
| `shadow-xl` | `0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.06)` | `--shadow-xl` | 全屏 Modal、警告对话框 |
| `shadow-2xl` | `0 25px 50px -12px rgba(0,0,0,0.25)` | `--shadow-2xl` | 最高层级（慎用） |
| `shadow-inner` | `inset 0 2px 4px 0 rgba(0,0,0,0.05)` | `--shadow-inner` | 内凹效果（按下态、Inset 面板） |

### 阴影使用规范

| 元素状态 | 阴影级别 | 说明 |
|----------|----------|------|
| 默认态 (Card) | `shadow-sm` 或 `none` | 静态卡片可无阴影或极弱阴影 |
| Hover 态 (Card) | `shadow-md` | 鼠标悬停时提升 |
| Focus 态 (Input) | `shadow-sm` + ring | 聚焦时的外发光替代强阴影 |
| Active/Pressed 态 | `shadow-inner` | 按下时内凹效果 |
| Dropdown / Popover | `shadow-lg` | 浮层元素需要更强阴影以脱离背景 |
| Modal Dialog | `shadow-xl` 或 `shadow-2xl` | 最顶层遮盖 |
| Dragging 态 | `shadow-xl` | 拖拽中的元素最高层级 |

## 5. 模糊与透明度 (Blur & Opacity)

### 模糊半径 (Blur)

| 令牌名 | 值 | 使用场景 |
|--------|-----|----------|
| `blur-none` | 0px | 无模糊 |
| `blur-sm` | 4px | 轻微毛玻璃效果 |
| `blur-default` | 8px | 标准 backdrop-blur |
| `blur-md` | 12px | 强毛玻璃（Modal scrim） |
| `blur-lg` | 16px | 重模糊效果 |
| `blur-xl` | 24px | 特殊视觉效果 |
| `blur-2xl` | 40px | 极致模糊（慎用） |
| `blur-3xl` | 64px | 最大模糊值 |

### 不透明度 (Opacity)

| 令牌名 | 值 | 使用场景 |
|--------|-----|----------|
| `opacity-0` | 0 | 完全透明（隐藏但占位） |
| `opacity-5` | 0.05 | 极淡装饰 |
| `opacity-10` | 0.1 | disabled 元素底色、divider |
| `opacity-20` | 0.20 | placeholder 文字、次要 divider |
| `opacity-25` | 0.25 | 浅色背景变体 |
| `opacity-30` | 0.30 | 次要文字在深色背景上 |
| `opacity-40` | 0.40 | muted 文字 |
| `opacity-50` | 0.50 | 半透明遮罩、中间态 |
| `opacity-60` | 0.60 | hover 前的过渡态 |
| `opacity-70` | 0.70 | 次要图标/文字 |
| `opacity-75` | 0.75 | 辅助说明文字 |
| `opacity-80` | 0.80 | 近乎可见的禁用态文字 |
| `opacity-90` | 0.90 | 几乎不透明的浅色覆盖 |
| `opacity-95` | 0.95 | 极近不透明 |
| `opacity-100` | 1 | 完全不透明 |

### 常用 opacity 组合预设

| 预设名 | 背景 opacity | 文字 opacity | 场景 |
|--------|-------------|-------------|------|
| `disabled` | bg: 50% | text: 50% | 禁用态组件 |
| `hover-subtle` | bg: 50% | text: 100% | Subtle hover 效果 |
| `overlay-light` | bg: 30% (white) | - | 浅色遮罩层 |
| `overlay-dark` | bg: 50% (black) | - | 深色遮罩层 / Modal scrim |
| `scrim` | bg: 60% (black) | - | Modal 背景遮罩 |
| `skeleton` | bg: 10%~20% | - | 骨架屏闪烁 |

## 6. 动画时长 (Duration)

| 令牌名 | 值 | 使用场景 |
|--------|-----|----------|
| `duration-75` | 75ms | 微交互（hover 颜色变化） |
| `duration-100` | 100ms | 图标状态切换、Tooltip 出现 |
| `duration-150` | 150ms | **默认微交互时长**、Button hover、Focus ring |
| `duration-200` | 200ms | 标准过渡、Accordion 展开、Tab 切换 |
| `duration-300` | 300ms | **默认动画时长**、Modal 进入/退出、页面切换 |
| `duration-500` | 500ms | 复杂动画、Drawer 侧滑 |
| `duration-700` | 700ms | 重型动画（慎用） |
| `duration-1000` | 1000ms | 特殊展示动画（极少用） |

### 动画时长选择指南

| 操作类型 | 推荐时长 | 说明 |
|----------|----------|------|
| 颜色/透明度变化 | 75~150ms | 用户感知为"即时响应" |
| 尺寸/位置微调 | 150~200ms | 可感知但不拖沓 |
| 展开/收起 | 200~300ms | 给用户跟随感 |
| 进入/退出视图 | 200~300ms | Modal / Popover |
| 页面路由切换 | 200~300ms | 不能让用户等待太久 |
| 复杂序列动画 | 300~500ms | 分阶段动画总和 |
| 加载旋转 | 800~1200ms 循环 | Spinner 一圈时长 |

## 7. 缓动曲线 (Easing)

| 令牌名 | CSS 值 | 曲线特征 | 使用场景 |
|--------|--------|----------|----------|
| `ease-linear` | linear | 匀速 | 仅用于循环动画（spinner） |
| `ease-in` | ease-in | 先慢后快 | **避免单独使用** |
| `ease-out` | ease-out | 先快后慢 | 退出动画、展开完成态 |
| `ease-in-out` | ease-in-out | 两端慢中间快 | 往复运动、简单振荡 |
| `ease-default` | cubic-bezier(0.4, 0, 0.2, 1) | **标准缓动**（类似 ease-out 但更自然） | **大多数场景的默认选择** |
| `ease-enter` | cubic-bezier(0, 0, 0.2, 1) | 进入曲线（ease-out 变体） | 元素进入视窗、Modal 出现 |
| `ease-exit` | cubic-bezier(0.4, 0, 1, 1) | 退出曲线（ease-in 变体） | 元素离开视窗、Modal 消失 |
| `ease-spring` | cubic-bezier(0.34, 1.56, 0.64, 1) | 弹性过冲 | 弹性按钮反馈、Spring 动效 |
| `ease-bounce` | cubic-bezier(0.68, -0.55, 0.265, 1.55) | 回弹效果 | 注意力引导动画、错误抖动 |
| `ease-snap` | cubic-bezier(0, 0.8, 0.2, 1) | 快速到位+轻微回弹 | 开关切换、Checkbox |

### 缓动曲线选择指南

| 场景 | 推荐曲线 | 说明 |
|------|----------|------|
| **默认首选** | `ease-default` | 80% 场景的首选 |
| 元素出现 | `ease-enter` | 从无到有，先快后稳 |
| 元素消失 | `ease-exit` | 从有到无，快速离开 |
| 按压反馈 | `ease-spring` | 按下有弹性感 |
| 弹性吸引 | `ease-bounce` | 引导用户注意 |
| 开关切换 | `ease-snap` | 快速切换带轻微弹性 |
| 循环动画 | `ease-linear` | spinner、loading bar |

## 8. Z-Index 层级管理

严格分层，禁止随意使用 z-index。

| 令牌名 | 值 | CSS 变量 | 层级 | 使用场景 |
|--------|-----|----------|------|----------|
| `z-base` | 0 | `--z-base` | 基础层 | 默认文档流内容 |
| `z-raised` | 10 | `--z-raised` | 轻浮层 | Hover 时轻微提升的 Card |
| `z-dropdown` | 20 | `--z-dropdown` | 下拉层 | DropdownMenu、Select、Autocomplete |
| `z-sticky` | 30 | `--z-sticky` | 吸附层 | Sticky Header、固定 Sidebar |
| `z-overlay` | 40 | `--z-overlay` | 覆盖层 | Tooltip、Popover（非模态覆盖） |
| `z-modal-backdrop` | 50 | `--z-modal-backdrop` | 模态背景 | Modal/Dialog 的半透明背景 |
| `z-modal` | 60 | `--z-modal` | 模态层 | Modal/Dialog 内容 |
| `z-popover` | 70 | `--z-popover` | 弹出层 | 高优先 Popover、通知中心 |
| `z-toast` | 80 | `--z-toast` | 通知层 | Toast 通知、Alert Banner |
| `z-tooltip` | 90 | `--z-tooltip` | 提示层 | 最高优先 Tooltip |
| `z-max` | 9999 | `--z-max` | 最高层 | 紧急/调试覆盖（极少使用） |

### Z-Index 使用规则

1. **只使用预定义令牌**，禁止自定义 z-index 值
2. **同层内元素按 DOM 顺序堆叠**，不依赖 z-index
3. **Modal 类组件** 必须成对使用 backdrop + content 两层
4. **Toast 和 Tooltip** 在最上层，不被任何其他元素遮挡
5. **Portal 渲染的内容** 必须指定正确的 z-index 令牌

## 9. 断点系统 (Breakpoints)

详见 [layout/01-responsive-spec.md](../layout/01-responsive-spec.md)，此处列出速查。

| 令牌名 | 值 | 设备类型 |
|--------|-----|----------|
| `bp-xs` | 0px | 最小屏幕（手机横屏极限） |
| `bp-sm` | 640px |小平板 / 窗口极窄 |
| `bp-md` | 768px | 平板竖屏 |
| `bp-lg` | 1024px | 平板横屏 / 小笔记本 |
| `bp-xl` | 1280px | 标准桌面显示器 |
| `bp-2xl` | 1536px | 大桌面显示器 |
| `bp-max` | 1920px+ | 超宽屏 |

## 10. 过渡属性预设 (Transition)

常用组合预设，减少重复定义。

| 令牌名 | 值 | 使用场景 |
|--------|-----|----------|
| `transition-none` | all 0s ease 0s | 无过渡 |
| `transition-all` | all 150ms ease-default 0s | 所有属性统一过渡 |
| `transition-colors` | color 150ms ease-default 0s, background-color 150ms ease-default 0s, border-color 150ms ease-default 0s | 仅颜色过渡（高性能） |
| `transition-opacity` | opacity 150ms ease-default 0s | 仅透明度过渡 |
| `transition-shadow` | box-shadow 150ms ease-default 0s | 仅阴影过渡 |
| `transition-transform` | transform 200ms ease-default 0s | 仅变换过渡（GPU 加速） |
| `transition-layout` | all 200ms ease-default 0s | 布局尺寸变化 |
| `transition-modal` | opacity 200ms ease-enter 0s, transform 200ms ease-enter 0s | Modal 进入 |
| `transition-modal-exit` | opacity 150ms ease-exit 0s, transform 150ms ease-exit 0s | Modal 退出（退出更快） |
| `transition-focus` | box-shadow 150ms ease-default 0s, outline-offset 100ms linear 0s | Focus ring 动画 |

## 11. CSS 变量映射总表

所有设计令牌最终映射为 CSS 自定义属性，供全局使用：

```css
:root {
  /* === Spacing === */
  --space-0: 0px;
  --space-px: 1px;
  --space-0-5: 2px;
  --space-1: 4px;
  /* ... 完整间距体系 ... */
  
  /* === Typography === */
  --font-sans: 'Inter', ...;
  --font-mono: 'JetBrains Mono', ...;
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  /* ... 完整字体体系 ... */
  
  /* === Radius === */
  --radius-none: 0px;
  --radius-sm: 2px;
  --radius: 4px;
  /* ... 完整圆角体系 ... */
  
  /* === Shadow === */
  --shadow-none: none;
  --shadow-sm: 0 1px 2px 0 rgba(0,0,0,0.05);
  /* ... 完整阴影体系 ... */
  
  /* === Duration === */
  --duration-75: 75ms;
  --duration-100: 100ms;
  --duration-150: 150ms;
  /* ... 完整时长体系 ... */
  
  /* === Easing === */
  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-enter: cubic-bezier(0, 0, 0.2, 1);
  /* ... 完整缓动体系 ... */
  
  /* === Z-Index === */
  --z-base: 0;
  --z-raised: 10;
  /* ... 完整层级体系 ... */
}
```
