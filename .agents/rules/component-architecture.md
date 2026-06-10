---
description: React component file size limits, splitting thresholds, and hook extraction rules
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
```
useBrowserPanel.ts → useBrowserNavigation.ts + useBrowserUrlState.ts + useBrowserMenus.ts
              └─→ useBrowserDragDrop.ts + useBrowserContextMenu.ts
```
拆分边界：每个 hook 处理一个关注点（导航、URL、菜单、拖拽、上下文菜单）

## 禁止项
- 禁止单文件包含多个不相关的组件（除非是简单的子组件）
- 禁止在 `App.tsx` 或根布局组件中内联业务逻辑（必须提取到 hook）
- 禁止创建仅 re-export 的 barrel 文件
- 禁止在 hook 中直接操作 DOM（除非该 hook 专门处理 DOM）