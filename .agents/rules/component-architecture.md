---
description: React component file size limits, splitting thresholds, and hook extraction rules
globs: ai-digital-life/frontend/**/*.tsx,ai-digital-life/frontend/**/*.ts
alwaysApply: false
---

# 组件架构规范

## 文件大小阈值
- 单个 React 组件 > 300 行：必须评估拆分
- 单个自定义 Hook > 200 行：必须按关注点拆分子 hook
- 单个纯函数/工具文件 > 500 行：必须按领域拆分
- 单个 CSS 文件 > 1000 行：必须按区域/组件拆分

## 组件拆分原则
| 信号 | 操作 |
|------|------|
| 组件含 3+ 个 `useState` + 3+ 个 `useEffect` + 3+ 个 `useCallback` | 提取自定义 hook |
| 多个组件共享同一组 state + callbacks | 提取共享 hook |
| 组件内出现明显的关注点边界（如拖拽、菜单、生命周期） | 每个关注点一个子组件或 hook |
| 函数体 > 40 行 | 拆分为更小的纯函数 |

## Hook 设计
- 每个 hook 单一职责，函数名清晰表达其用途
- hook 之间通过参数传递依赖，避免隐式耦合
- 提取 hook 时保持返回接口向后兼容（如 useTerminalPanel 的 UseTerminalPanelReturn 类型不变）
- 公共 hook 放在 `app/hooks/`，功能专属 hook 放在功能目录下（如 `features/terminal/`）

## 目录组织
```
features/{domain}/
├── index.ts              # 公共 API 导出
├── {Component}.tsx       # 主组件
├── use{Domain}Hook.ts    # 领域 hook（可多个）
└── sub-components/       # 子组件（>3 个时创建）
```

## Barrel 文件策略
- 禁止在功能目录下创建仅 re-export 的 barrel 文件（`export { X } from './sub/X'`）
- 目录 `index.ts` 仅导出该目录的公共 API，不导出内部实现
- 消费方直接引用源文件路径，如 `from './features/terminal/useTerminalPtyLifecycle'`

## 多面板容器模式
- 多面板容器组件使用条件渲染（`{activeTool === "x" ? <PanelX /> : null}`）而非 `hidden` 属性
- 结合 `React.memo` 避免同时挂载所有面板
- 每个面板通过独立 hook 从 Store 选择所需字段，禁止透传大 props 对象

## Context + Portal + Hook 组合模式

Tooltip、ContextMenu 等复杂 UI 组件采用三层分离架构：

```
Hook（状态逻辑） → Context（跨组件通信） → Portal（渲染到 body）
```

### 三层职责

| 层 | 职责 | 示例 |
|----|------|------|
| Hook | 管理 open/close、延迟定时器、位置计算、ref 回调 | `useTooltip()` |
| Context | 跨组件传递状态，避免 props drilling | `TooltipContext.Provider` |
| Portal | 通过 `createPortal` 渲染到 `document.body`，避免 z-index 问题 | `TooltipContent` |

### 约束

- 全局事件监听（`mousedown`/`keydown`）必须在 `useEffect` cleanup 中移除
- 弹出层使用 `position: fixed`，定位计算在 Hook 中完成
- 状态逻辑不依赖组件渲染，Hook 可独立测试
- 禁止在 SVG 子元素上使用 `backdrop-filter`（Chromium 支持不一致，失败时无填充兜底）；模糊/滤镜覆盖层使用 HTML div 门户 overlay：渲染到容器（`position: relative` + `inset: 0` + `pointer-events: none`），按 scale 绘图区原点与尺寸定位，配 `mounted` 守卫与 `WebkitBackdropFilter` 前缀（先例：ChartBrush 暗淡区，见 `docs/knowledge-base/code-quality/2026-08/chart-brush-portal-overlay-2026-08-02.md`）

### 示例结构

```tsx
// 1. Hook — 纯状态逻辑
function useTooltip(options) {
  const [isOpen, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  // 定时器、位置计算、ResizeObserver...
  return { triggerRef, isOpen, position };
}

// 2. Context Provider — 跨组件共享
function Tooltip({ children, ...props }) {
  const tooltip = useTooltip(props);
  return <TooltipContext.Provider value={tooltip}>{children}</TooltipContext.Provider>;
}

// 3. Portal — 渲染到 body
function TooltipContent({ children }) {
  const ctx = useTooltipContext();
  if (!ctx.isOpen) return null;
  return createPortal(<div style={{ position: 'fixed', ...ctx.position }}>{children}</div>, document.body);
}
```

## 虚拟化与列表性能

### 列表项数量阈值
- N < 50：普通渲染（无需优化）
- 50 ≤ N < 500：`React.memo` + `useCallback`
- N ≥ 500：虚拟化（`useVirtualList` 或同等方案）

### useVirtualList 规范
- 容器引用使用 `useRef<HTMLDivElement>`
- 初始渲染使用完整列表（SSR/测试环境 `viewportHeight === 0` 时）
- itemHeight 使用固定值（推荐 28px），禁止动态高度
- 滚动监听使用 `requestAnimationFrame` 节流
- `ResizeObserver` 监听容器尺寸变化

### React.memo 使用规则
- 列表项组件（行组件）默认包裹 `React.memo`
- props 仅包含原语或稳定引用（避免内联对象/函数）
- 事件处理函数使用 `useCallback` 包装并依赖稳定值
- 字符串 key 必须稳定（使用 id 而非数组索引）
- 禁止对非列表项过度包裹（增加比较开销）

### 子 Hook 拆分示例

#### 渐进式拆分（推荐）
```
useBrowserPanel.ts (1042 行)
  → 阶段 1: useBrowserNavigation.ts + useBrowserUrlState.ts （提前拆出独立功能）
  → 阶段 2: useBrowserTabs.ts + useBrowserWebView.ts + useBrowserSearch.ts + useBrowserTreeActions.ts
  → 最终: useBrowserPanel.ts 整体删除，browserpanel.tsx 直接 import 各独立 Hook
```

#### 拆分边界
每个 hook 处理一个关注点：标签页、WebView、搜索、树操作、导航、URL、菜单、拖拽、上下文菜单

#### 拆散 vs 保留统一入口
- **拆散**（彻底模式）：删除原超大型 Hook，每个子 Hook 导出独立接口，消费者各自 import。适用于原 Hook 返回对象过大（>30 字段）且消费方只有一个的场景
- **保留统一入口**（渐进模式）：原 Hook 内部组合各子 Hook，对外暴露统一接口。适用于原 Hook 有多个消费方或不宜一次变更的场景

## DOM 生命周期管理
- 手动 `appendChild` 到 `document.body` 的动态 DOM 元素必须绑定到组件生命周期（通过 `useEffect` 清理函数移除），禁止仅依赖事件驱动移除
- 使用 `useRef<HTMLElement[]>`（而非 DOM 自定义属性）存储动态元素引用，确保组件卸载时安全清理所有元素
- 每次创建新元素前先清空引用数组再 push，防止数组累积已清除的历史元素，同时避免丢失未清理引用

## 禁止项
- 禁止单文件包含多个不相关的组件（除非是简单的子组件）
- 禁止在 `App.tsx` 或根布局组件中内联业务逻辑（必须提取到 hook）
- 禁止创建仅 re-export 的 barrel 文件
- 禁止在 hook 中直接操作 DOM（除非该 hook 专门处理 DOM）
- 禁止模块级辅助函数（模块顶层非组件内联函数）超过 3 个而不提取到独立文件
- 禁止同一组件多次渲染同一对话框组件用于不同模式（如新建/编辑），应通过状态区分合并为单次渲染

## 对话框状态管理模式
- 当组件包含 5+ 组独立对话框状态时，应提取到 `use{Component}Dialogs` Hook 中
- Toast 消息管理独立提取为 `use{Component}Toast` Hook
- 同一对话框的创建/编辑模式应合并为单次渲染，通过不同 state 的 open 状态区分：
  ```tsx
  <SomeDialog
    open={createState.open || editState.open}
    initialValue={editState.open ? editState.value : undefined}
    onConfirm={createState.open ? handleCreate : handleEdit}
  />
  ```