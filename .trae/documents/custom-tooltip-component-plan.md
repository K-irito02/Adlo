# 自定义 Tooltip 组件实现计划

## 一、现状分析

### 当前技术栈
| 层级 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript 5.8 |
| 构建 | Vite 6 |
| 样式 | CSS Custom Properties（Design Tokens）+ BEM 命名 |
| 主题 | `data-theme="light\|dark"` 属性切换，`ThemeController` 管理 |
| 测试 | Vitest 3 + React Testing Library |

### 现有 Tooltip 状况
- **CSS 基础样式**：[components.css#L577-L594](ai-digital-life/apps/desktop/renderer/src/styles/components.css#L577-L594) 已有基础 `.tooltip` 类（仅含 opacity 过渡，无定位引擎）
- **原生 title 属性使用**：全项目约 **84 处** 使用原生 `title` 属性（ActionButton、TitleBar、SessionManagement、ToolSidebar、ToolContextArea 等）
- **无定位库**：项目中未安装 `@floating-ui`/`react-popper` 等任何浮动定位库
- **无 Portal 使用**：项目中未发现 `createPortal` 的使用

### 设计系统约束（来自 `.trae/rules/design-system.md`）
- 颜色必须使用 `var(--…)` CSS 自定义属性，禁止硬编码
- 图标必须使用 SVG 格式并继承 `currentColor`
- 所有交互控件必须提供完整状态（default/hover/focus/active/disabled/loading）
- 组件采用 BEM 风格命名

---

## 二、技术方案决策

### 2.1 定位引擎选择：不引入外部依赖，手写轻量定位

**理由**：
- 项目当前零外部 UI 依赖（除 React），保持一致性
- Tooltip 定位逻辑相对简单（仅需 4 个方向 + 边界检测），无需 floating-ui 的完整能力
- Electron 桌面应用场景固定窗口尺寸，复杂度可控
- 避免增加 bundle 体积

### 2.2 渲染方式：React 组件 + Portal

**理由**：
- 项目所有交互组件均为 React 组件（`.tsx`）
- Portal 确保 Tooltip 不受父元素 `overflow: hidden` 影响
- 与现有 React 组件生态一致

### 2.3 架构设计

```
Tooltip（React 组件）
├── useTooltip（核心 Hook）— 状态管理、定时器、事件处理
├── TooltipPositioner（内部）— 定位计算与边界修正
├── TooltipContent（内部）— 内容渲染 + 动画
└── TooltipProvider（可选 Context）— 全局配置
```

---

## 三、文件变更清单

### 新增文件
| 文件路径 | 职责 |
|----------|------|
| `apps/desktop/renderer/src/app/components/Tooltip.tsx` | Tooltip React 组件主文件 |
| `apps/desktop/renderer/src/app/hooks/useTooltip.ts` | 核心 Hook：状态管理、定时器、事件处理 |
| `apps/desktop/renderer/src/app/utils/tooltipPosition.ts` | 纯函数：定位计算、边界检测、箭头位置 |
| `tests/unit/components/Tooltip.test.tsx` | 单元测试 |

### 修改文件
| 文件路径 | 变更内容 |
|----------|----------|
| `apps/desktop/renderer/src/styles/components.css` | 扩充 `.tooltip` 样式（动画、多行、箭头、主题适配） |
| `apps/desktop/renderer/src/design-system/index.ts` | 导出 Tooltip 相关类型和工具函数 |

---

## 四、详细实现步骤

### Step 1：实现定位工具函数 `tooltipPosition.ts`

**文件**: `apps/desktop/renderer/src/app/utils/tooltipPosition.ts`

**功能**:
- 计算触发元素相对于视窗的位置
- 支持 4 个方向：`top`、`bottom`、`left`、`right`
- 自动翻转：当空间不足时自动翻转到对侧
- 边界约束：确保 Tooltip 不超出视窗范围
- 箭头（arrow）位置计算
- 滚动容器感知：支持在滚动容器内正确定位

**导出接口**:
```typescript
type Placement = 'top' | 'bottom' | 'left' | 'right';
type Alignment = 'start' | 'center' | 'end';

interface PositionResult {
  x: number;
  y: number;
  placement: Placement; // 实际使用的 placement（可能经过翻转）
  arrowX?: number;      // 箭头偏移 x
  arrowY?: number;      // 箭头偏移 y
}

interface TooltipPositionOptions {
  triggerRect: DOMRect;
  tooltipRect: { width: number; height: number };
  placement: Placement;
  alignment?: Alignment;
  offset?: number;        // 触发元素与 Tooltip 的间距，默认 8px
  viewportPadding?: number; // 视窗边距，默认 8px
}

function computePosition(options: TooltipPositionOptions): PositionResult;
```

### Step 2：实现核心 Hook `useTooltip.ts`

**文件**: `apps/desktop/renderer/src/app/hooks/useTooltip.ts`

**功能**:
- 状态管理：`isOpen`、`position`、`placement`
- 触发方式支持：`hover`（默认）、`focus`、`click`、手动控制
- 延迟控制：`showDelay`（默认 300ms）、`hideDelay`（默认 150ms）
- 定时器管理：进入/离开防抖、鼠标从触发元素移动到 Tooltip 的过渡
- 生命周期清理：unmount 时清除所有定时器和事件监听
- 键盘可访问性：Escape 关闭
- 减弱动效偏好：`prefers-reduced-motion` 检测
- 触摸设备支持：长按显示（touch 设备用 focus 替代 hover）

**导出接口**:
```typescript
interface UseTooltipOptions {
  /** 触发方式 */
  trigger?: 'hover' | 'focus' | 'click' | 'manual';
  /** 默认方向 */
  defaultPlacement?: Placement;
  /** 显示延迟 (ms) */
  showDelay?: number;
  /** 隐藏延迟 (ms) */
  hideDelay?: number;
  /** 是否受控模式 */
  open?: boolean;
  /** 受控模式的 onChange */
  onOpenChange?: (open: boolean) => void;
  /** 手动关闭按钮是否可见 */
  showCloseButton?: boolean;
  /** 最大宽度 */
  maxWidth?: number;
}

interface UseTooltipReturn {
  ref: React.RefCallback<HTMLElement>;
  tooltipRef: React.RefCallback<HTMLElement>;
  isOpen: boolean;
  position: PositionResult | null;
  placement: Placement;
  getArrowProps: () => { style: React.CSSProperties };
  close: () => void;
  // 内部方法（供 TooltipContent 调用）
  handleTriggerEnter: () => void;
  handleTriggerLeave: () => void;
  handleTooltipEnter: () => void;
  handleTooltipLeave: () => void;
}
```

### Step 3：实现 Tooltip React 组件 `Tooltip.tsx`

**文件**: `apps/desktop/renderer/src/app/components/Tooltip.tsx`

**组件结构**:
```tsx
// 组合模式 API（类似 Radix UI）：
// <Tooltip><TooltipTrigger>...</TooltipTrigger><TooltipContent>...</TooltipContent></Tooltip>

interface TooltipProps {
  children: React.ReactNode;
  /** 默认方向 */
  defaultPlacement?: Placement;
  /** 触发方式 */
  trigger?: 'hover' | 'focus' | 'click';
  /** 显示延迟 */
  showDelay?: number;
  /** 隐藏延迟 */
  hideDelay?: number;
  /** 最大宽度 */
  maxWidth?: number;
  /** 是否显示关闭按钮（用于富内容场景） */
  dismissible?: boolean;
}

interface TooltipTriggerProps {
  children: React.ReactNode;
  asChild?: boolean; // 允许以 Slot 模式合并到子元素
}

interface TooltipContentProps {
  children: React.ReactNode;
  /** 覆盖方向 */
  side?: Placement;
  /** 对齐方式 */
  align?: Alignment;
  /** 偏移量 */
  sideOffset?: number;
  /** 是否显示箭头 */
  showArrow?: boolean;
  /** 额外类名 */
  className?: string;
}
```

**关键实现细节**:
1. 使用 `createPortal` 将 Tooltip 渲染到 `document.body`
2. 使用 `ResizeObserver` 监听触发元素和 Tooltip 尺寸变化
3. 使用 `requestAnimationFrame` 批量更新位置避免抖动
4. 支持受控和非受控两种模式
5. 动画使用 CSS transition（opacity + transform/scale），复用已有 token

### Step 4：扩展 CSS 样式 `components.css`

**在现有 `.tooltip` 基础上扩展**：

```css
/* ====== Tooltip 完整样式 ====== */

/* 基础容器 — 通过 Portal 渲染到 body */
.tooltip {
  position: absolute;
  z-index: var(--z-tooltip);
  /* --- 主题色（自动适配 light/dark）--- */
  background: var(--text-primary);
  color: var(--bg);
  /* --- 尺寸与间距 --- */
  padding: var(--space-1-5) var(--space-3);
  border-radius: var(--radius-lg);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
  max-width: 240px;
  word-wrap: break-word;
  overflow-wrap: break-word;
  pointer-events: auto; /* 支持交互（关闭按钮等） */
  /* --- 阴影与边框 --- */
  box-shadow: var(--shadow-lg);
  border: 1px solid transparent; /* 保留 border-space 用于高对比度模式 */
}

/* 高对比度模式边框 */
@media (prefers-contrast: more) {
  .tooltip {
    border-color: var(--border-strong);
  }
}

/* --- 箭头（伪元素）--- */
.tooltip__arrow {
  position: absolute;
  width: 8px;
  height: 8px;
  background: inherit;
  rotate: 45deg;
  z-index: -1;
}

.tooltip[data-side="top"] .tooltip__arrow { bottom: -4px; }
.tooltip[data-side="bottom"] .tooltip__arrow { top: -4px; }
.tooltip[data-side="left"] .tooltip__arrow { right: -4px; }
.tooltip[data-side="right"] .tooltip__arrow { left: -4px; }

/* --- 多行文本 --- */
.tooltip__content {
  white-space: pre-line; /* 保留换行 */
}

/* --- 富文本/HTML 内容 --- */
.tooltip__content :not(:last-child) {
  margin-bottom: var(--space-1);
}

/* --- 关闭按钮 --- */
.tooltip__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: var(--space-2);
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.15);
  color: inherit;
  border: none;
  cursor: pointer;
  font-size: 10px;
  line-height: 1;
}

.tooltip__close:hover {
  background: rgba(255,255,255,0.25);
}

/* --- 动画 --- */
.tooltip[data-state="open"] {
  animation: tooltip-in var(--duration-150) var(--ease-enter) forwards;
}

.tooltip[data-state="closed"] {
  animation: tooltip-out var(--duration-100) var(--ease-exit) forwards;
}

@keyframes tooltip-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(2px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes tooltip-out {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.96) translateY(2px);
  }
}

/* 减弱动效 */
@media (prefers-reduced-motion: reduce) {
  .tooltip,
  .tooltip[data-state="open"],
  .tooltip[data-state="closed"] {
    animation: none !important;
    transition: none !important;
  }
  .tooltip[data-state="open"] { opacity: 1; }
  .tooltip[data-state="closed"] { opacity: 0; }
}
```

### Step 5：编写单元测试 `Tooltip.test.tsx`

**测试覆盖范围**:

#### 基础渲染测试
- [ ] 单行文本正确渲染
- [ ] 多行文本正确换行
- [ ] HTML 内容安全渲染（dangerouslySetInnerHTML 或白名单标签）
- [ ] 空内容不渲染

#### 交互行为测试
- [ ] hover 触发显示/隐藏（使用 fireEvent.mouseEnter/mouseLeave）
- [ ] focus 触发显示/隐藏
- [ ] click 触发显示/隐藏
- [ ] showDelay 延迟生效
- [ ] hideDelay 延迟生效
- [ ] 从触发元素快速移入 Tooltip 不消失（"mouse bridge" 行为）
- [ ] Escape 键关闭
- [ ] 关闭按钮点击关闭（dismissible 模式）

#### 定位测试
- [ ] 默认 top 方向正确
- [ ] 各方向（top/bottom/left/right）正确
- [ ] 空间不足时自动翻转
- [ ] 边界约束（超出视窗时调整）

#### 主题测试
- [ ] light 主题下颜色正确
- [ ] dark 主题下颜色正确
- [ ] 高对比度模式下边框可见

#### 可访问性测试
- [ ] 正确的 role="tooltip" 属性
- [ ] 通过 aria-describedby 关联触发元素
- [ ] prefers-reduced-motion 下无动画

#### 边界情况测试
- [ ] 触发元素在视窗边缘
- [ ] 触发元素被滚动容器包裹
- [ ] 快速反复 hover 不出错
- [ ] 组件卸载时清理定时器和监听器
- [ ] 超长文本处理

### Step 6：更新设计系统导出

**修改文件**: `design-system/index.ts`

添加 Tooltip 相关导出（如果需要暴露给非 React 上下文使用的话；纯 React 组件可能不需要在此导出）。

---

## 五、API 使用示例

### 基础用法（替换原生 title）
```tsx
import { Tooltip, TooltipTrigger, TooltipContent } from './components/Tooltip';

// 替换 <button title="发送消息">
<Tooltip content="发送消息">
  <TooltipTrigger asChild>
    <button><Icon name="send" /></button>
  </TooltipTrigger>
</Tooltip>
```

### 多行文本
```tsx
<Tooltip content={'第一行说明\n第二行详细描述'}>
  <TooltipTrigger><Icon name="info" /></TooltipTrigger>
</Tooltip>
```

### 富内容 + 关闭按钮
```tsx
<Tooltip dismissible side="right" maxWidth={300}>
  <TooltipTrigger><button>详情</button></TooltipTrigger>
  <TooltipContent>
    <div>
      <strong>操作指南</strong>
      <p>这是多行详细说明内容...</p>
      <p>支持 HTML 格式的丰富内容展示。</p>
    </div>
  </TooltipContent>
</Tooltip>
```

### 受控模式
```tsx
const [open, setOpen] = useState(false);
<Tooltip open={open} onOpenChange={setOpen}>
  <TooltipTrigger>Hover me</TooltipTrigger>
  <TooltipContent>Controlled tooltip</TooltipContent>
</Tooltip>
```

---

## 六、性能优化策略

1. **定位计算节流**：使用 `requestAnimationFrame` 合并连续的位置更新
2. **懒加载 Portal**：仅在首次打开时创建 Portal 容器
3. **事件委托**：全局只监听一次 scroll/resize，通过 Map 管理多个 Tooltip 实例
4. **Memo 化**：内容不变时不重新渲染 Tooltip DOM
5. **虚拟化**：隐藏时将 Tooltip 移出视口而非仅 opacity:0（减少布局计算）

---

## 七、后续迁移计划（不在本次实现范围）

完成 Tooltip 组件后，可将现有的 84 处原生 `title` 属性逐步迁移到新组件。建议按优先级分批进行：

| 优先级 | 组件 | 理由 |
|--------|------|------|
| P0 | ActionButton | 核心交互按钮，用户高频使用 |
| P0 | QuickActions | 工具栏操作，需要一致体验 |
| P1 | TitleBar 按钮 | 窗口控制，用户常驻区域 |
| P1 | ToolSidebar / ToolContextArea | 工具面板，密集图标区 |
| P2 | SessionManagement | 会话列表，次要交互 |
| P2 | 其他组件 | 低频交互区域 |

---

## 八、风险与注意事项

1. **Electron 窗口特性**：桌面应用的窗口尺寸相对稳定，但仍需处理窗口 resize 和拖拽场景
2. **z-index 层级**：已定义 `--z-tooltip: 90`，确保高于所有常规内容但低于 toast/modal
3. **CSS 变量依赖**：Tooltip 背景色使用 `var(--text-primary)`，文字色使用 `var(--bg)`，确保双主题下都有足够对比度
4. **Portal 清理**：必须在组件 unmount 时移除 Portal 节点，防止内存泄漏
5. **触摸设备**：Electron 桌面端主要面向鼠标操作，但仍需处理触屏设备的 fallback
