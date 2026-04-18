# 动画系统规范 (Animation System)

> 定义所有 UI 动画的时长、缓动曲线、状态过渡和运动规则

## 1. 核心原则

| 原则 | 说明 |
|------|------|
| **目的驱动** | 每个动画必须传达信息（状态变化、空间关系、因果关系），禁止纯装饰性动画 |
| **快速感知** | 用户操作后 100ms 内必须有视觉反馈，300ms 内完成状态过渡 |
| **性能优先** | 仅使用 `transform` 和 `opacity` 属性做动画（GPU 加速），避免 `width/height/top/left` |
| **可中断** | 所有动画必须可被用户操作打断（点击、悬停、导航离开） |
| **尊重偏好** | 响应 `prefers-reduced-motion` 系统设置 |

## 2. 动画时长令牌

详见 [Design Tokens → Duration](../tokens/00-design-tokens.md#6-动画时长-duration)，此处为使用指南。

### 时长选择决策树

```
用户触发操作？
├─ 是 → 需要反馈吗？
│      ├─ 是 → 微交互 (hover/color) → 75~150ms
│      │       ├─ 按钮 hover → 150ms
│      │       ├─ Focus ring → 150ms
│      │       └─ 颜色变化 → 75~150ms
│      │
│      └─ 否 → 状态切换？
│              ├─ 展开/收起 → 200~300ms
│              ├─ 进入视图(Modal) → 200~300ms
│              └─ 离开视图(退出) → 150~200ms（更快）
│
└─ 否 → 系统自动触发的？
           ├─ 循环动画(Spinner) → 800~1200ms per loop
           ├─ 页面路由切换 → 200~300ms
           └─ 数据加载骨架屏 → 1.5s pulse 循环
```

## 3. 缓动曲线令牌

详见 [Design Tokens → Easing](../tokens/00-design-tokens.md#7-缓动曲线-easing)，此处为场景映射。

### 缓动选择速查表

| 动画类型 | 推荐缓动 | 备选 | 说明 |
|----------|----------|------|------|
| **默认首选（80% 场景）** | `ease-default` | - | cubic-bezier(0.4,0,0.2,1) |
| 元素出现（进入） | `ease-enter` | `ease-default` | 先快后稳 |
| 元素消失（退出） | `ease-exit` | `ease-in` | 快速离开 |
| 按钮按压反馈 | `ease-spring` | `ease-snap` | 弹性回弹感 |
| 开关 Toggle 切换 | `ease-snap` | `ease-spring` | 快速到位+微弹 |
| 错误抖动提示 | `ease-bounce` | - | 吸引注意力 |
| Modal 进入 | `ease-enter` + scale | `ease-default` | 缩放+淡入 |
| Modal 退出 | `ease-exit` + scale | `ease-in` | 缩小+淡出 |
| Drawer 侧滑 | `ease-default` | - | 平滑滑动 |
| 下拉刷新释放 | `ease-spring` | - | 回弹效果 |
| Spinner 旋转 | `linear` | - | 匀速循环 |
| 数字滚动 | `ease-out` | - | 数字递增动画 |
| 进度条填充 | `ease-default` | `ease-out` | 流畅增长 |

## 4. 常用动画模式

### 4.1 Fade（淡入淡出）

**用途**: Toast、Alert Banner、Overlay 出现/消失

```css
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
```

| 属性 | 值 |
|------|-----|
| 进入 | `fade-in`, 200ms, `ease-enter` |
| 退出 | `fade-out`, 150ms, `ease-exit` |
| 适用 | Toast / Alert / Overlay / 简单显隐 |

### 4.2 Scale + Fade（缩放淡入）

**用途**: Modal、Dialog、Popover、Dropdown

```css
@keyframes scale-fade-in {
  from { 
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes scale-fade-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.98);
  }
}
```

| 属性 | 值 |
|------|-----|
| 进入 | `scale-fade-in`, 200ms, `ease-enter` |
| 退出 | `scale-fade-out`, 150ms, `ease-exit` |
| transform-origin | 根据方向设定（top=bottom center） |
| 适用 | Modal / Dialog / Popover / Tooltip |

### 4.3 Slide（滑入滑出）

**用途**: Drawer（侧滑）、Drawer（下抽）、Navigation 切换

```css
/* 从右侧滑入 */
@keyframes slide-in-right {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

@keyframes slide-out-right {
  from { transform: translateX(0); }
  to { transform: translateX(100%); }
}

/* 从底部滑入 */
@keyframes slide-in-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
```

| 属性 | 值 |
|------|-----|
| 进入 | `slide-in-{direction}`, 250~300ms, `ease-default` |
| 退出 | `slide-out-{direction}`, 200ms, `ease-exit` |
| 方向 | right / left / up / down |
| 适用 | Drawer / Off-canvas Nav / Bottom Sheet |

### 4.4 Expand/Collapse（展开收起）

**用途**: Accordion、Tree 节点展开、详情面板

```css
@keyframes expand-height {
  from { 
    height: 0;
    opacity: 0;
  }
  to {
    height: var(--target-height); /* JS 计算 */
    opacity: 1;
  }
}
```

| 属性 | 值 |
|------|-----|
| 展开 | height 0→auto, 200~300ms, `ease-default` |
| 收起 | height auto→0, 150~200ms, `ease-exit` |
| 注意 | 使用 `grid-template-rows: 0fr → 1fr` 替代 height 动画以避免 JS |
| 适用 | Accordion / Collapsible / Tree / Code Block 展开 |

### 4.5 Press（按压反馈）

**用途**: Button、Card 可点击元素

```css
@keyframes press-down {
  0% { transform: scale(1); }
  50% { transform: scale(0.97); }
  100% { transform: scale(1); }
}

/* 或更简单的即时变换 */
.pressed {
  transform: scale(0.97);
  transition: transform 100ms ease-snap;
}
```

| 属性 | 值 |
|------|-----|
| 触发 | active / mouse-down |
| 效果 | scale(0.96 ~ 0.98) |
| 时长 | 100ms ease-snap |
| 恢复 | mouse-up 时立即恢复 |
| 适用 | 所有可点击的 Button / Card / List Item |

### 4.6 Skeleton Pulse（骨架屏脉冲）

**用途**: 数据加载占位

```css
@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.skeleton {
  background: var(--color-bg-subtle);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  border-radius: var(--radius-md);
}
```

| 属性 | 值 |
|------|-----|
| 循环时长 | 1.5s |
| 透明度范围 | 1.0 ↔ 0.4 |
| 缓动 | ease-in-out |
| 适用 | 文本块 / 图片区 / 卡片加载态 |

### 4.7 Spin（旋转）

**用途**: Loading Spinner、刷新图标

```css
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinner {
  animation: spin 1s linear infinite;
}
```

| 属性 | 值 |
|------|-----|
| 一圈时长 | 800 ~ 1200ms |
| 缓动 | linear（匀速） |
| 方向 | 正常 clockwise |
| 适用 | 全局 loading / button loading / 图标刷新 |

### 4.8 Shake（抖动错误提示）

**用途**: 表单验证失败、登录错误、操作被拒

```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
  20%, 40%, 60%, 80% { transform: translateX(4px); }
}
```

| 属性 | 值 |
|------|-----|
| 时长 | 400~500ms |
| 抖幅 | ±4px |
| 抖动次数 | 5 次 |
| 触发 | 错误发生时一次性播放 |
| 适用 | Input 验证错误 / 登录失败 / 权限不足 |

## 5. 页面级转场动画

### 5.1 路由切换

| 场景 | 动画 | 时长 |
|------|------|------|
| 同级页面切换 | Crossfade（旧页淡出 + 新页淡入） | 200ms |
| 子页面进入 | Slide Right + Fade（从右侧滑入） | 250ms |
| 返回父页面 | Slide Left + Fade（向左滑出） | 200ms（比进入快） |
| 模态页面弹出 | Scale + Fade + Backdrop | 250ms |

### 5.2 布局变化响应

| 变化类型 | 动画策略 | 时长 |
|----------|----------|------|
| Sidebar 展开/折叠 | Width transition | 200ms |
| 窗口 resize | 无动画（直接重排） | 0 |
| 内容区宽度自适应 | Width transition（仅在用户主动触发时） | 200ms |
| 列表数据更新 | 仅新项有入场动画 | 150ms stagger |

## 6. Reduced Motion 支持

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  
  /* Skeleton 改为静态灰色 */
  .skeleton {
    animation: none !important;
    opacity: 0.6;
  }
  
  /* Spinner 改为静态指示器 */
  .spinner {
    animation: none !important;
    /* 显示 "Loading..." 文字或静态圆点 */
  }
}
```

### 各动画在 reduced motion 下的降级行为

| 动画 | 降级行为 |
|------|----------|
| Fade In/Out | 即时显示/隐藏（0ms） |
| Scale + Fade | 即时显示/隐藏 |
| Slide | 即时出现/消失（无滑动） |
| Expand/Collapse | 即时展开/折叠 |
| Press | 无缩放反馈（保留颜色变化） |
| Skeleton Pulse | 静态半透明灰块 |
| Spin | 静态 loading 文字或三个静止圆点 |
| Shake | 不播放（仅显示错误状态色） |
| Page Transition | 即时切换 |
