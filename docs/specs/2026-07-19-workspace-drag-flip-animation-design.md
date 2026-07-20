# 工作区顶级条目拖拽排序动画 — FLIP 让位方案设计

| 字段 | 值 |
|---|---|
| 日期 | 2026-07-19 |
| 主题 | `workspace-drag-flip-animation` |
| 范围 | 左侧面板工作区顶级条目拖拽排序的视觉反馈层 |
| 当前状态 | 设计稿待评审 |
| 目标阶段 | Phase 2 增强（视觉/交互优化） |

## 1. 背景与现状

### 1.1 现状描述

左侧面板的工作区顶级条目（`.adl-workspace-item`）当前拖拽排序实现：

- **拖拽骨架**：原生 Mouse 事件（`mousedown` → `document.mousemove` → `document.mouseup`），4px 阈值防抖
- **拖拽库**：无（未使用 `@dnd-kit` / `react-dnd` / `framer-motion Reorder`）
- **视觉反馈**：
  - 被拖条目 `opacity: 0.4`（`transition: opacity 150ms`）
  - 目标条目上下边线指示器（`box-shadow: inset 0 ±2px 0 0 var(--accent)`）
- **缺失**：**没有位移动画**，松手后列表瞬间跳变到新顺序

### 1.2 现状问题

用户反馈"不好看、不直观"。核心原因：

1. 拖拽过程中其他条目**完全不动**，仅靠静态边线指示目标位置
2. 松手瞬间列表顺序"跳变"，缺乏过渡感
3. 缺少物理性的"让位"反馈，操作结果不直观

### 1.3 关键文件

| 角色 | 路径 |
|---|---|
| 主组件 | [ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx) |
| 拖拽数组工具 | [ai-digital-life/frontend/src/app/utils/dragUtils.ts](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/utils/dragUtils.ts) |
| 样式 | [ai-digital-life/frontend/src/styles/regions/leftbar-workspace.css](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/styles/regions/leftbar-workspace.css) |
| Store Action | [ai-digital-life/frontend/src/app/stores/actions/workspaceActions.ts](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/stores/actions/workspaceActions.ts)（`reorderWorkspaces`） |
| 容器注入 | [ai-digital-life/frontend/src/app/regions/LeftSidebar.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/regions/LeftSidebar.tsx) |

## 2. 设计目标

| 目标 | 描述 |
|---|---|
| **直观的让位反馈** | 拖拽过程中其他条目用 `transform` 平滑滑动让出位置 |
| **松手无跳变** | 松手时列表已在目标顺序，无视觉跳变 |
| **保留现有骨架** | 不引入第三方库，沿用原生 Mouse 事件实现 |
| **删除冗余指示器** | 删除现有 `box-shadow` 边线指示器，让位动画本身即反馈 |
| **保留 bucket 隔离** | pinned / unpinned 之间不允许互相拖拽 |
| **双端一致** | Tauri 桌面和浏览器模式效果完全一致 |

## 3. 已选方案 — 方案 B：FLIP 让位

### 3.1 方案对比（已评估）

| 方案 | 视觉特征 | 评估结论 |
|---|---|---|
| **A · 当前基线** | 被拖半透明 + 静态边线，其他条目不动 | 现状，已否决 |
| **B · FLIP 让位** ✅ | 被拖半透明占位，其他条目平滑滑动让位 | **已选** |
| C · 抬起跟随 | 被拖条目 scale + 阴影 + 跟随光标 | 实现复杂度高，未选 |
| D · 占位条 | 被拖消失 + 高亮插入线 | 被拖不可见丢失上下文，未选 |
| E · 弹性 Spring | C + 弹簧曲线 + overshoot | 动画过长，未选 |

### 3.2 已确认的设计参数

| 参数 | 值 | 决策依据 |
|---|---|---|
| 实现路径 | 保持原生 Mouse + 自实现 FLIP | 改动小、风险低、零新依赖 |
| 动画时长 | `200ms` | 与项目 `--duration-200` 设计令牌一致 |
| 缓动曲线 | `cubic-bezier(0.2, 0.8, 0.2, 1)` | 轻快不拖沓 |
| 跨 bucket 行为 | pinned / unpinned 保持隔离 | 沿用现状，避免后端 IPC 逻辑变更 |
| 插入指示器 | **删除**现有 `box-shadow` 边线 | 让位动画本身即反馈 |
| 被拖条目状态 | `opacity: 0.4`，跟随让位动画移动 | 沿用现有半透明度 |

## 4. 架构设计

### 4.1 FLIP 算法概述

FLIP = **F**irst, **L**ast, **I**nvert, **P**lay。核心思路：

1. **First**：记录每个条目当前的位置（`getBoundingClientRect().top`）
2. **Last**：DOM 更新到新顺序后，记录每个条目新位置
3. **Invert**：用 `transform: translateY(oldTop - newTop)` 把每个条目"拉回"旧位置（视觉上没动）
4. **Play**：清除 `transform`，让其过渡到 0，触发平滑滑动动画

### 4.2 时序流程

```
拖拽开始（mousedown + 4px 阈值触发）
  ↓
鼠标移动到新位置（mousemove）
  ↓
计算新顺序（dragUtils.moveIdBeforeTarget / moveIdAfterTarget）
  ↓
顺序是否变化？
  ├─ 否 → 仅更新被拖元素半透明状态，等待下次 mousemove
  └─ 是 → 执行 FLIP：
        1. First：记录所有 li[data-ws-id] 的当前 top
        2. 更新 React state（newOrder）→ React 重渲染
        3. Last + Invert：DOM 更新后，对每个 li 计算 dy = oldTop - newTop，设置 transform: translateY(dy)，禁用 transition
        4. 强制 reflow（读取 offsetHeight）
        5. Play：清除 transform，启用 transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)
  ↓
被拖元素标记 .is-dragging（opacity: 0.4）
  ↓
继续 mousemove → 重复 FLIP
  ↓
mouseup → 清理状态：
  - 移除 .is-dragging 类
  - 移除所有 inline transform/transition
  - 调用 onReorderWorkspaces 持久化（仅一次，最终顺序）
```

### 4.3 关键技术决策

#### 4.3.1 状态管理 — 仅在被拖入新目标时触发 FLIP

当前实现每帧 `mousemove` 都会调用 `setDragTargetId` / `setDragTargetPosition`。在 FLIP 方案下：

- **拖拽目标不变时**：不触发 FLIP（避免无谓的重渲染与重排）
- **拖拽目标变化时**：才执行 FLIP 重排

实现上需要一个本地 `localOrderRef` 维护"当前显示顺序"，与 `workspaceItemsRef.current` 分离：

```ts
const localOrderRef = useRef<string[]>(workspaceItems.map(w => w.workspace.id));
```

每次 FLIP 后更新 `localOrderRef.current = newOrder`。

`mouseup` 时只在 `localOrderRef.current` 与 `sessionStartOrderRef.current`（mousedown 时刻的顺序快照）不同时调用 `onReorder`。`sessionStartOrderRef` 在 `handleRowMouseDown` 中赋值：

```ts
const sessionStartOrderRef = useRef<string[]>([]);

const handleRowMouseDown = useCallback((event, wsId, isPinned) => {
  if (event.button !== 0) return;
  event.preventDefault();
  event.currentTarget.blur();
  sessionStartOrderRef.current = [...localOrderRef.current]; // 快照
  dragSessionRef.current = { draggedId: wsId, startY: event.clientY, isDragging: false, isPinned };
}, []);
```

#### 4.3.2 跨 bucket 检测 — 复用现有逻辑

现有 `handleMouseUp` 中的 bucket 隔离逻辑（[WorkspaceList.tsx:180-198](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx#L180-L198)）保持不变：

- 鼠标位置的目标条目若不属于当前拖拽条目所在 bucket → 不更新 target
- 仅在 mouseup 时调用 `onReorderWorkspaces({ pinnedIds, unpinnedIds })`

在 FLIP 方案下，bucket 隔离逻辑前移到 `mousemove` 阶段：

```ts
// mousemove 中计算 foundId 后：
const draggedBucket = session.isPinned;
const targetItem = workspaceItemsRef.current.find(w => w.workspace.id === foundId);
if (!targetItem || targetItem.workspace.isPinned !== draggedBucket) {
  // 跨 bucket：不更新 target，不触发 FLIP
  return;
}
```

**跨 bucket 拖拽时的视觉行为**：被拖条目保持半透明状态跟随鼠标，但其他条目不发生让位（不触发 FLIP）。松手时无 `onReorder` 调用，被拖条目回到原位置（无动画过渡，瞬间恢复）。这是有意为之的"拒绝"反馈 —— 让位动画缺失本身即"无操作"的暗示。

**全列表重建**：`localOrderRef.current` 是包含所有工作区（pinned + unpinned）的完整顺序。拖拽时只在单一 bucket 内重排，全列表重建逻辑：

```ts
// mousemove 内，bucket 隔离检查通过后：
const items = workspaceItemsRef.current;
const isPinnedBucket = session.isPinned;
const currentOrder = localOrderRef.current;

const bucketIds = currentOrder.filter(id =>
  items.find(w => w.workspace.id === id)?.workspace.isPinned === isPinnedBucket
);
const otherIds = currentOrder.filter(id =>
  items.find(w => w.workspace.id === id)?.workspace.isPinned !== isPinnedBucket
);

const nextBucket = targetPosRef.current === 'after'
  ? moveIdAfterTarget(bucketIds, session.draggedId, targetId)
  : moveIdBeforeTarget(bucketIds, session.draggedId, targetId);

// pinned 始终在 unpinned 之前（由 workspaceItems 顺序保证）
const newOrder = isPinnedBucket
  ? [...nextBucket, ...otherIds]
  : [...otherIds, ...nextBucket];

// 检查是否真的变化
const changed = newOrder.some((id, i) => id !== currentOrder[i]);
if (!changed) return;

// 触发 FLIP（见 4.3.3）
localOrderRef.current = newOrder;
setLocalOrder(newOrder);
```

#### 4.3.3 FLIP 执行位置 — 在 useEffect 内、直接操作 DOM

FLIP 必须在 React 重渲染后立即执行，否则会看到"瞬间跳到新位置再回来"的闪烁。实现方式：

```ts
// 在 mousemove 处理函数内：
const oldRects = new Map<string, number>();
ul.querySelectorAll('li[data-ws-id]').forEach(el => {
  oldRects.set(el.dataset.wsId!, el.getBoundingClientRect().top);
});

// 触发 React 重渲染（更新 localOrder state）
setLocalOrder(newOrder);

// 使用 requestAnimationFrame 等待 React commit 到 DOM
requestAnimationFrame(() => {
  ul.querySelectorAll('li[data-ws-id]').forEach(el => {
    const oldTop = oldRects.get(el.dataset.wsId!);
    if (oldTop === undefined) return;
    const newTop = el.getBoundingClientRect().top;
    const dy = oldTop - newTop;
    if (Math.abs(dy) > 0.5) {
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
    }
  });
  // 强制 reflow
  ul.offsetHeight;
  // Play
  ul.querySelectorAll('li[data-ws-id]').forEach(el => {
    el.style.transition = 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)';
    el.style.transform = '';
  });
});
```

> **React 19 兼容性提示**：`requestAnimationFrame` 通常能在 React 同步提交后下一帧捕获到 DOM 更新。但若实测出现闪烁（React 19 并发渲染下 DOM 提交时序不确定），可改用 `flushSync` 强制同步提交：
>
> ```ts
> import { flushSync } from 'react-dom';
> flushSync(() => setLocalOrder(newOrder));
> // 此时 DOM 已更新，立即执行 Invert + Play
> ```
>
> 实现阶段应优先尝试 `requestAnimationFrame`，仅在出现闪烁时降级到 `flushSync`。后者会绕过并发渲染优化，不应作为默认选择。

#### 4.3.4 渲染顺序 — 用 `localOrder` 排序 `workspaceItems`

当前 `WorkspaceList` 直接 `workspaceItems.map(...)` 渲染。FLIP 方案下需要按 `localOrder` 排序：

```tsx
const orderedItems = localOrder
  .map(id => workspaceItems.find(w => w.workspace.id === id))
  .filter((x): x is SidebarWorkspaceItem => x != null);

return (
  <ul className="adl-workspace-list" role="tree">
    {orderedItems.map(item => /* ... */)}
  </ul>
);
```

`workspaceItems` 变化时（外部 pin/unpin/新增/删除工作区）需要同步更新 `localOrder`：

```ts
useEffect(() => {
  const externalIds = workspaceItems.map(w => w.workspace.id);
  const currentIds = localOrderRef.current;
  // 合并：保留当前顺序中仍存在的项 + 追加新项
  const merged = [
    ...currentIds.filter(id => externalIds.includes(id)),
    ...externalIds.filter(id => !currentIds.includes(id)),
  ];
  localOrderRef.current = merged;
  setLocalOrder(merged);
}, [workspaceItems]);
```

#### 4.3.5 mouseup 清理 — 移除所有 inline 样式

```ts
const handleMouseUp = () => {
  const session = dragSessionRef.current;
  if (!session) return;

  ul.querySelectorAll('li[data-ws-id]').forEach(el => {
    el.classList.remove('is-dragging');
    el.style.transform = '';
    el.style.transition = '';
  });

  // 持久化：仅当本次拖拽确实改变了顺序时
  const startOrder = sessionStartOrderRef.current;
  const currentOrder = localOrderRef.current;
  const orderChanged =
    startOrder.length !== currentOrder.length ||
    startOrder.some((id, i) => id !== currentOrder[i]);

  if (session.isDragging && orderChanged) {
    const items = workspaceItemsRef.current;
    const pinnedIds = currentOrder.filter(id =>
      items.find(w => w.workspace.id === id)?.workspace.isPinned
    );
    const unpinnedIds = currentOrder.filter(id =>
      !items.find(w => w.workspace.id === id)?.workspace.isPinned
    );
    onReorderRef.current({ pinnedIds, unpinnedIds });
  }

  // 重置状态
  dragSessionRef.current = null;
  targetIdRef.current = null;
  targetPosRef.current = 'after';
  setDragActiveId(null);
};
```

> **注**：`onReorder` 的 `pinnedIds` / `unpinnedIds` 拆分逻辑基于 `workspaceItems` 中各项的 `isPinned` 字段，与现有 [WorkspaceList.tsx:191-198](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx#L191-L198) 保持一致。

### 4.4 样式变更

[leftbar-workspace.css](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/styles/regions/leftbar-workspace.css) 修改：

```diff
 .adl-workspace-item {
   margin-bottom: var(--space-0-5);
-  transition: opacity var(--duration-150) var(--ease-default);
+  transition:
+    opacity var(--duration-150) var(--ease-default),
+    transform var(--duration-200) cubic-bezier(0.2, 0.8, 0.2, 1);
+  will-change: transform, opacity;
 }

 .adl-workspace-item.is-dragging {
   opacity: 0.4;
 }

-.adl-workspace-item.is-drag-target-before {
-  box-shadow: inset 0 2px 0 0 var(--accent);
-}
-
-.adl-workspace-item.is-drag-target-after {
-  box-shadow: inset 0 -2px 0 0 var(--accent);
-}
```

> **注**：FLIP 过程中会临时用 inline `style.transition = 'none'` 覆盖 CSS 的 transition，然后切换到 `'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)'` 触发动画。CSS 中的 `transition` 声明仅用于非拖拽场景下的属性过渡（如未来扩展）。

### 4.5 React 状态简化

当前 `WorkspaceList` 维护 4 个 drag state：

```ts
const [dragActiveId, setDragActiveId] = useState<string | null>(null);
const [dragTargetId, setDragTargetId] = useState<string | null>(null);     // ← 删除
const [dragTargetPosition, setDragTargetPosition] = useState<'before' | 'after'>('after');  // ← 删除
const targetIdRef = useRef<string | null>(null);                            // 保留（内部使用）
const targetPosRef = useRef<'before' | 'after'>('after');                   // 保留（内部使用）
```

FLIP 方案下，目标位置不再驱动视觉指示器（已删除 `is-drag-target-before/after` 类），因此 `dragTargetId` / `dragTargetPosition` 两个 state 可以删除。`targetIdRef` / `targetPosRef` 保留，仅在 mousemove 内部计算使用。

新增状态：

```ts
const [localOrder, setLocalOrder] = useState<string[]>(
  workspaceItems.map(w => w.workspace.id)
);
const localOrderRef = useRef<string[]>(localOrder);
```

### 4.6 bucket 分组渲染

当前 `WorkspaceList` 假设 `workspaceItems` 已按 pinned 优先排序。FLIP 方案下需保留这个假设 —— `localOrder` 在 bucket 内部排序，pinned 与 unpinned 之间相对顺序由 `workspaceItems` 决定。

具体实现：

- `localOrder` 仅在单一 bucket 内重排（拖拽时鼠标目标必须与被拖条目同 bucket）
- pinned 与 unpinned 的相对顺序由 `workspaceItems` 决定（外部传入）
- 渲染时按 `localOrder` 排序所有条目，但 pinned 始终在 unpinned 之前（由 `workspaceItems` 顺序保证）

## 5. 组件结构

### 5.1 WorkspaceList.tsx 改动

| 改动点 | 内容 |
|---|---|
| 删除 state | `dragTargetId`, `dragTargetPosition` |
| 新增 state | `localOrder`, `localOrderRef` |
| 删除渲染逻辑 | `targetCls` 计算与拼接 |
| 新增渲染逻辑 | 按 `localOrder` 排序 `workspaceItems` |
| 改 useEffect | mousemove 内：bucket 隔离前移 + FLIP 执行 |
| 改 useEffect | mouseup 内：清理 inline 样式 + 持久化 |
| 新增 useEffect | `workspaceItems` 变化时同步 `localOrder` |

### 5.2 工具函数复用

`dragUtils.ts` 中的 `moveIdBeforeTarget` / `moveIdAfterTarget` / `moveIdToBucketEnd` 完全复用，无需修改。

### 5.3 不引入新文件

改动集中在 `WorkspaceList.tsx` 和 `leftbar-workspace.css` 两个文件，不新建 hook 或工具函数。FLIP 逻辑内联在 `useEffect` 内（与现有拖拽逻辑一体）。

> **不提取为独立 hook 的原因**：FLIP 与现有 mousemove/mouseup 监听器强耦合，提取为 hook 会增加 ref 传递复杂度，且只有此一处使用。遵循 YAGNI 原则。

## 6. 数据流

```
用户拖拽
  ↓
WorkspaceList (mousemove)
  ├─ 计算新顺序（dragUtils.moveId*）
  ├─ bucket 隔离检查
  ├─ FLIP 重排（直接操作 DOM + setLocalOrder）
  └─ localOrderRef.current = newOrder
  ↓
松手 (mouseup)
  ├─ 清理 inline 样式
  ├─ 比较 localOrderRef 与初始顺序
  ├─ 不同 → onReorderWorkspaces({ pinnedIds, unpinnedIds })
  └─ 相同 → 无 IPC 调用
  ↓
LeftSidebar 注入的 actions.reorderWorkspaces
  ↓
window.digitalLife.workspace.reorder(input)  ← IPC 桥接
  ↓
后端持久化（Tauri / Preview / Mock 三端）
  ↓
返回 WorkspaceSummary[]
  ↓
store.recentWorkspaces 更新
  ↓
React 重渲染（外部数据源变化）
  ↓
workspaceItems prop 变化 → useEffect 同步 localOrder
```

## 7. 错误处理

### 7.1 拖拽中断

| 场景 | 处理 |
|---|---|
| `pointercancel` 事件 | `handleBlur` 清理状态（已有逻辑），移除 inline 样式 |
| 窗口失焦（`blur`） | 同上 |
| `mouseup` 在浏览器窗口外 | document 级 `mouseup` 监听器已捕获 |
| React 组件卸载 | `useEffect` cleanup 移除所有监听器，inline 样式随 DOM 卸载消失 |

### 7.2 异常顺序

| 场景 | 处理 |
|---|---|
| `localOrder` 中包含已删除的工作区 id | 渲染时 `find` 返回 undefined，被 `filter` 过滤 |
| `workspaceItems` 新增工作区 | `useEffect` 合并逻辑追加到 `localOrder` 末尾 |
| `workspaceItems` 删除工作区 | `useEffect` 合并逻辑过滤掉 |

### 7.3 IPC 失败

`actions.reorderWorkspaces` 内部已通过 `captureError` 处理 IPC 失败（见 [error-handling.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/.trae/rules/error-handling.md)）。失败时 store 不更新 `recentWorkspaces`，下次 `workspaceItems` 变化时 `useEffect` 会同步 `localOrder` 回真实顺序。

## 8. 测试策略

### 8.1 单元测试

| 测试点 | 工具 | 描述 |
|---|---|---|
| `moveIdBeforeTarget` / `moveIdAfterTarget` | Vitest + jsdom | 已有测试，确认无回归 |
| `localOrder` 合并逻辑 | Vitest + jsdom | 模拟 `workspaceItems` 新增/删除，验证合并结果 |
| bucket 隔离 | Vitest + jsdom | 模拟跨 bucket 拖拽，验证 FLIP 不触发 |

### 8.2 集成测试

| 测试点 | 工具 | 描述 |
|---|---|---|
| 拖拽排序完整流程 | Playwright（E2E） | mousedown → mousemove → mouseup，验证最终顺序正确 |
| FLIP 动画触发 | Playwright + 性能 trace | 验证 mousemove 期间 `transform` inline 样式被设置过 |
| 松手后 inline 样式清理 | Playwright | 验证 mouseup 后 `li` 元素无 inline `transform`/`transition` |

### 8.3 手动验证清单

按 [desktop-ui-verification.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/.trae/rules/desktop-ui-verification.md) 要求，需在双端验证：

- [ ] Tauri 桌面：拖拽排序动画顺滑，松手无跳变
- [ ] 浏览器模式：同上，效果一致
- [ ] pinned 内部拖拽：FLIP 正常
- [ ] unpinned 内部拖拽：FLIP 正常
- [ ] 跨 bucket 拖拽：不响应（无 FLIP、无 IPC 调用）
- [ ] 拖拽中关闭窗口/切换标签：状态正确清理
- [ ] 拖拽中外接数据变化（其他面板新增工作区）：`localOrder` 正确合并

## 9. 性能考虑

### 9.1 FLIP 成本

- **First**：`querySelectorAll` + `getBoundingClientRect` × N（N = 工作区数量，通常 < 20）
- **Last**：同上
- **Invert**：N 个 `style.transform` 赋值
- **Play**：N 个 `style.transition` + `style.transform` 赋值

N 较小（< 20）时成本可忽略。`will-change: transform, opacity` 提示浏览器预合成。

### 9.2 重渲染频率

`mousemove` 期间仅在目标变化时调用 `setLocalOrder`（每秒最多 ~5-10 次），不会高频触发 React 重渲染。

### 9.3 内存

`localOrderRef` 与 `oldRects`（Map）均在 mousemove 处理函数结束时释放，无累积。

## 10. 双端一致性

FLIP 完全在前端实现，与 Tauri/浏览器模式无关。`actions.reorderWorkspaces` 三端桥接（Tauri / Preview / Mock）已有，无需修改。

## 11. 不在范围内

| 不做的事 | 原因 |
|---|---|
| 引入 `@dnd-kit` / `framer-motion` | 用户选择保持原生实现 |
| 跨 bucket 拖拽 | 用户选择保持隔离 |
| 抬起跟随光标效果 | 用户选择方案 B 而非方案 C |
| 弹簧曲线 / overshoot | 用户选择 200ms 标准曲线 |
| 触屏支持 | 项目当前不支持触屏，不在范围 |
| 键盘排序（无障碍） | 当前实现不支持，不在本次范围 |
| 会话级条目（SessionList）的拖拽动画 | 本次仅改工作区顶级条目 |

## 12. 验收标准

- [ ] 拖拽过程中其他条目平滑滑动让位（200ms 过渡）
- [ ] 松手后列表顺序无跳变
- [ ] 删除了 `is-drag-target-before` / `is-drag-target-after` CSS 类与对应 state
- [ ] pinned / unpinned 之间拖拽不响应
- [ ] Tauri 桌面与浏览器模式效果一致
- [ ] `pnpm --dir frontend run typecheck` 通过
- [ ] `pnpm --dir frontend run lint` 通过
- [ ] `pnpm --dir frontend run test` 通过（含新增 localOrder 合并逻辑测试）
- [ ] 现有工作区拖拽相关测试无回归

## 13. 后续可能的演进

> 仅记录，不在本次实现范围

- 若后续需要触屏支持，可在此方案基础上增加 `touchstart`/`touchmove`/`touchend` 监听
- 若后续需要无障碍键盘排序，可增加 `tabindex` + 方向键处理
- 若后续希望统一会话级与工作区级拖拽体验，可将会话级 `useSessionDragDrop.ts` 也迁移到 FLIP 方案
