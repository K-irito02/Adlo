# 工作区加载列表设计 (Workspace Loading Lists Design)

- **日期**: 2026-07-19
- **状态**: Draft
- **作者**: Brainstorming Session
- **关联文档**: `docs/specs/2026-07-18-workspace-concurrency-design.md`（前作设计，存在持久化缺陷，本设计修正并扩展）

## 1. 背景与问题

### 1.1 用户反馈的问题

设置面板 → 工作区页面下有三个列表区域：

1. "优先加载列表"
2. "延迟加载列表"
3. 显示"未出现在以上列表中的工作区按侧边栏顺序加载"文字下的工作区标签列表

**当前问题**：

- 第三个列表中的工作区标签**无法拖拽**放入"优先加载列表"和"延迟加载列表"中
- 实际上由于空列表占位符未注册为 `useDroppable`，三个列表之间的互相拖拽都存在缺陷
- 提示说明文字不符合实际加载行为
- 配置无法持久化（Rust 后端结构体未包含相关字段，详见 1.2）

### 1.2 已发现的底层 Bug

#### 1.2.1 持久化失效（致命）

Rust 后端 `AppPreferencePatch` 与 `ConfigSnapshot` 结构体（`crates/types/src/types/config.rs`）**从未包含** `max_concurrent_workspaces`、`workspace_priority_ids`、`workspace_deferred_ids` 三个字段。

`app_update_preferences` 命令在 serde 反序列化时**静默丢弃**这些未知字段，导致用户在设置面板中所做的修改仅停留在前端 `useState` 中，应用重载后全部丢失。

代码中 `as Record<string, unknown>` 强制类型转换（`WorkspaceSettings.tsx:129`、`generalActions.ts:174`）是开发者已知类型不匹配的代码异味。

#### 1.2.2 拖拽失效根因

`WorkspaceSettings.tsx` 中三个列表的空占位符 `<div className="adl-sortable-empty">` 未通过 `useDroppable` 注册为放置目标。当 priority 或 deferred 列表为空时，`@dnd-kit` 的 `closestCorners` 碰撞检测无法识别 drop 位置，导致从 natural 列表拖出后无处可放。

#### 1.2.3 加载逻辑与需求不符

`generalActions.ts:162-243` 当前实现将 priority + natural 合并为"immediate"批次，deferred 批次 fire-and-forget。这与需求 5 的"层层递进"语义不符。

#### 1.2.4 其他问题

- `WorkspaceSettingsState` 类型为死代码
- `findContainer` 函数未 memoize，导致 `handleDragEnd` 的 `useCallback` 优化失效
- `loadBatch` 在 `Promise.allSettled` 失败时不记录日志（违反 `error-handling.md`）
- `accumulateBatch` 失败时不重置 loading 状态，导致 `workspaceTreeLoading[id]` 永久为 `true`
- `generalActions.test.ts:167-174` 存在 `expect(true).toBe(true)` 占位测试

## 2. 用户需求

1. 将"未出现在以上列表中的工作区按侧边栏顺序加载"文字改为"工作区标签列表"，下面显示所有未出现在优先/延迟列表中的工作区标签
2. 三个列表中的工作区标签都能拖拽，且能相互拖拽放入
3. 三个列表的自定义顺序**独立于**应用程序左侧面板的工作区标签顺序，互不影响。仅三个列表的顺序起到"工作区加载"的功能作用
4. "工作区标签列表"默认按工作区添加时间排序（早添加的在下方，新添加的在上方），用户可自定义
5. 加载行为：
   - priority 列表 → 应用程序启动时同步加载
   - deferred 列表 → 应用程序完全启动后再异步加载
   - natural 列表 → 等 priority 和 deferred 完成后再加载
   - 空层级自动递进：priority 空 + deferred 非空 → deferred 升为高优先级；priority 与 deferred 都空 → natural 升为高优先级；priority 非空 + deferred 空 → natural 升为中优先级
6. 在相关地方添加"!"提示符号，悬停显示详细解释，全面清晰讲解每个列表的加载情况与特殊情况递进处理

## 3. 设计方案

采用**方案 B：精准修复 + 提取可复用 Hook 与组件**。

### 3.1 文件结构总览

```
workspace-settings/
├── WorkspaceSettings.tsx           (主组件, ~200 行)
├── WorkspaceSettingsTypes.ts       (类型, 清理后)
├── SortableWorkspaceList.tsx       (新, 可复用列表组件)
├── useWorkspaceDnd.ts              (新, DnD hook)
├── useWorkspaceDnd.test.ts         (新)
└── SortableWorkspaceList.test.tsx  (新)

stores/actions/
├── generalActions.ts               (修改加载段)
├── workspaceLoadOrder.ts           (新, 纯函数)
└── workspaceLoadOrder.test.ts      (新)
```

### 3.2 修改文件清单

#### Rust 后端

- `crates/types/src/types/config.rs`：`AppPreferencePatch` 与 `ConfigSnapshot` 各新增 4 个字段
- `src-tauri/src/commands/app.rs`：`app_update_preferences` 命令处理 4 个新字段；`build_app_info` 构造时填入

#### 前端 - 类型与配置

- `frontend/src/shared/ipc-types.generated.ts`：4 个字段加入 `AppPreferencePatch` 与 `ConfigSnapshot`
- `frontend/src/shared/defaultPreferences.ts`：新增 `DEFAULT_WORKSPACE_NATURAL_ORDER = []`
- `frontend/src/shared/preferencesMerger.ts`：`applyPreferencePatch` 处理 `workspaceNaturalOrder`

#### 前端 - 三桥同步

- `frontend/src/preview-bridge/preview-model.ts`：config 新增 4 字段；偏好持久化到 localStorage
- `frontend/src/mock/mock-shared-workspace.ts`：config 新增 4 字段
- tauri-bridge 无需改（参数由 IPC 类型保证）

#### 前端 - 设置面板组件

- 新增 `frontend/src/app/features/workspace-settings/useWorkspaceDnd.ts`
- 新增 `frontend/src/app/features/workspace-settings/SortableWorkspaceList.tsx`
- 修改 `frontend/src/app/features/workspace-settings/WorkspaceSettings.tsx`（简化至约 200 行）
- 修改 `frontend/src/app/features/workspace-settings/WorkspaceSettingsTypes.ts`（移除死代码）
- 新增对应测试文件

#### 前端 - 加载逻辑

- 修改 `frontend/src/app/stores/actions/generalActions.ts`（重写 162-243 行加载段）
- 新增 `frontend/src/app/stores/actions/workspaceLoadOrder.ts`（纯函数）
- 新增 `frontend/src/app/stores/actions/workspaceLoadOrder.test.ts`
- 修改 `frontend/src/app/stores/actions/generalActions.test.ts`（替换占位测试）

#### 前端 - i18n

- 修改 `frontend/src/app/i18n/zh-CN/workspace.ts`
- 修改 `frontend/src/app/i18n/en-US/workspace.ts`

#### 样式

- 修改 `frontend/src/styles/components/settings.css`：补全 `.adl-drag-overlay`、`.adl-draggable-item` 样式；调整标题区 flex 布局

## 4. 数据模型与持久化

### 4.1 Rust 后端字段新增

#### `AppPreferencePatch` 新增（全部 optional）

```rust
#[ts(optional)] pub max_concurrent_workspaces: Option<usize>,
#[ts(optional)] pub workspace_priority_ids: Option<Vec<String>>,
#[ts(optional)] pub workspace_deferred_ids: Option<Vec<String>>,
#[ts(optional)] pub workspace_natural_order: Option<Vec<String>>,
```

#### `ConfigSnapshot` 新增（全部 required）

```rust
#[serde(default)] pub max_concurrent_workspaces: usize,
#[serde(default)] pub workspace_priority_ids: Vec<String>,
#[serde(default)] pub workspace_deferred_ids: Vec<String>,
#[serde(default)] pub workspace_natural_order: Vec<String>,
```

`#[serde(default)]` 确保旧配置文件反序列化时兜底为空数组/默认值。

`Default for ConfigSnapshot` 填入：
```rust
max_concurrent_workspaces: 6,
workspace_priority_ids: vec![],
workspace_deferred_ids: vec![],
workspace_natural_order: vec![],
```

### 4.2 Tauri 命令处理

`src-tauri/src/commands/app.rs` — `app_update_preferences` 按现有模式追加：

```rust
if let Some(v) = patch.max_concurrent_workspaces {
    config.max_concurrent_workspaces = v.clamp(1, 20);
}
if let Some(v) = patch.workspace_priority_ids {
    config.workspace_priority_ids = v;
}
if let Some(v) = patch.workspace_deferred_ids {
    config.workspace_deferred_ids = v;
}
if let Some(v) = patch.workspace_natural_order {
    config.workspace_natural_order = v;
}
```

`build_app_info` 在构造 `ConfigSnapshot` 时从 `config` 读取这 4 个字段填入。

### 4.3 前端类型同步

`frontend/src/shared/ipc-types.generated.ts` 按 camelCase 规范追加：

```ts
// AppPreferencePatch (all optional)
maxConcurrentWorkspaces?: number;
workspacePriorityIds?: string[];
workspaceDeferredIds?: string[];
workspaceNaturalOrder?: string[];

// ConfigSnapshot (all required)
maxConcurrentWorkspaces: number;
workspacePriorityIds: string[];
workspaceDeferredIds: string[];
workspaceNaturalOrder: string[];
```

### 4.4 默认值与合并逻辑

`frontend/src/shared/defaultPreferences.ts`：

```ts
export const DEFAULT_MAX_CONCURRENT_WORKSPACES = 6;
export const DEFAULT_WORKSPACE_PRIORITY_IDS: string[] = [];
export const DEFAULT_WORKSPACE_DEFERRED_IDS: string[] = [];
export const DEFAULT_WORKSPACE_NATURAL_ORDER: string[] = [];
```

`frontend/src/shared/preferencesMerger.ts` — `applyPreferencePatch` 追加：

```ts
if (patch.workspaceNaturalOrder !== undefined) {
    target.workspaceNaturalOrder = patch.workspaceNaturalOrder;
}
```

### 4.5 三桥同步

| 桥 | 改动 |
|----|------|
| `tauri-bridge` | 无需改（参数由类型保证；返回值通过 `app.getInfo` 自动包含新字段） |
| `preview-bridge/preview-model.ts` | `config` 对象追加 4 字段（默认值）；用户修改时持久化到 localStorage |
| `mock/mock-shared-workspace.ts` | `config` 对象追加 4 字段（默认值）；mock 不持久化 |

### 4.6 数据完整性约束

1. **去重与互斥**：`workspacePriorityIds`、`workspaceDeferredIds`、`workspaceNaturalOrder` 三个数组中任意工作区 ID 应唯一出现在其中一个数组中。前端在 `persistChanges` 前做去重与互斥校验：从 A 移到 B 时必须从 A 移除。

2. **孤儿 ID 容错**：ID 可能指向已被移除的工作区。加载与渲染时统一用 `.filter((w): w is RecentWorkspaceEntry => w !== undefined)` 过滤。

3. **新工作区入列**：当用户在应用其他位置新增工作区（非通过设置面板）时，前端在 `fetchRecentWorkspaces` 完成后检测：新 ID 不在三个数组任一中 → 插入 `workspaceNaturalOrder` 数组**头部**（实现"新添加的在上方"）。

4. **侧边栏移除工作区**：工作区被 `removedFromSidebar=true` 时，从三个数组中移除该 ID；重新添加时不自动恢复（用户需重新拖拽）。

## 5. UI 组件与拖拽交互

### 5.1 组件层次

```
WorkspaceSettings (主组件, ~200 行)
├── SettingsHeader (现有)
├── 最大并行加载输入 + "!" 提示 (现有, 保留)
└── DndContext
    ├── SortableWorkspaceList kind="priority"
    ├── SortableWorkspaceList kind="deferred"
    └── SortableWorkspaceList kind="natural"
```

### 5.2 `SortableWorkspaceList.tsx` — 可复用列表组件

**Props**：

```ts
interface SortableWorkspaceListProps {
  kind: 'priority' | 'deferred' | 'natural';
  title: string;
  desc: string;
  tooltipContent: string;
  items: DraggableWorkspace[];
  emptyText: string;
  onRemove?: (id: string) => void;   // natural 列表无此按钮
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
}
```

**关键修复**：列表容器 `<div>` 通过 `useDroppable({ id: \`list-${kind}\` })` 注册为放置目标，**即使列表为空也能接收拖入**。这是当前代码拖拽失效的核心原因。

### 5.3 `SortableItem` 调整

- 新增 `showActions: boolean` prop（natural 列表设为 `false`，隐藏 ↑/↓/× 按钮）
- natural 列表中的项仍用 `useSortable`（不再用 `useDraggable`），以支持内部重排
- 拖拽手柄保持 `<button>` + `IconMenu`

### 5.4 `useWorkspaceDnd.ts` — DnD Hook

**签名**：

```ts
interface UseWorkspaceDndArgs {
  priorityIds: string[];
  deferredIds: string[];
  naturalOrder: string[];
  onChange: (next: { priority: string[]; deferred: string[]; natural: string[] }) => void;
}

interface UseWorkspaceDndResult {
  sensors: ReturnType<typeof useSensors>;
  activeId: string | null;
  activeItem: DraggableWorkspace | null;
  handleDragStart: (e: DragStartEvent) => void;
  handleDragEnd: (e: DragEndEvent) => void;
}

function useWorkspaceDnd(args: UseWorkspaceDndArgs): UseWorkspaceDndResult
```

**`findContainer` 修复**：移入 hook 内部，通过 `useMemo` 缓存基于三个数组的查找映射（`Map<id, ContainerId>`），避免每次渲染重建，也修复 `handleDragEnd` 的 `useCallback` 失效问题。

**`handleDragEnd` 完整逻辑**：

```ts
const handleDragEnd = (e: DragEndEvent) => {
  const { active, over } = e;
  setActiveId(null);
  if (!over) return;

  const itemId = String(active.id);
  const fromContainer = findContainer(itemId);

  // 判断 drop 目标：可能是某个排序项（over.id = workspaceId），
  // 也可能是空列表占位符（over.id = `list-${kind}`）
  const overId = String(over.id);
  const toContainer = overId.startsWith('list-')
    ? (overId.slice(5) as ContainerId)
    : findContainer(overId);

  if (fromContainer === toContainer) {
    // 同列表内重排（含 natural 列表，需求 2）
    reorderWithin(itemId, overId, toContainer);
  } else {
    // 跨列表移动：从 source 移除，按 drop 位置插入 target
    moveAcross(itemId, fromContainer, toContainer, overId);
  }

  onChange({ priority: newPriority, deferred: newDeferred, natural: newNatural });
};
```

**跨列表插入位置**：

- 若 `over.id` 是工作区 ID → 插入到该工作区**之前**（保持视觉直觉：拖到 A 上方，落下后在 A 上方）
- 若 `over.id` 是 `list-${kind}`（空列表占位符）→ 追加到末尾

**去重与互斥**：跨列表移动时，先从 source 数组移除 itemId，再插入 target 数组；保证三数组无重复 ID。

### 5.5 视觉一致性

- 三个列表使用相同 `.adl-sortable-section` 样式
- `.adl-sortable-section--natural` 类保留（仅用于内部测试与可能的细微差异化），视觉上与其他 section 一致
- 补全缺失样式：
  - `.adl-drag-overlay`：浮层样式（半透明背景、阴影、圆角、padding）
  - `.adl-draggable-item`：与 `.adl-sortable-item` 视觉一致但无操作按钮区

### 5.6 键盘可访问性（可选增强）

为 `PointerSensor` 之外补充 `KeyboardSensor`，允许键盘用户用 Space 拾取、方向键移动、Space 放下。此项作为可选项，若实现成本高可推后。

## 6. 加载顺序与级联逻辑

### 6.1 纯函数 `workspaceLoadOrder.ts`

**位置**：`frontend/src/app/stores/actions/workspaceLoadOrder.ts`

**签名**：

```ts
export interface LoadPhases {
  /** 高优先级：与启动同步加载 */
  priority: RecentWorkspaceEntry[];
  /** 中优先级：启动完成后异步加载 */
  deferred: RecentWorkspaceEntry[];
  /** 低优先级：前两级完成后加载 */
  natural: RecentWorkspaceEntry[];
}

/**
 * 计算工作区分级加载顺序。
 *
 * 规则：
 * - priorityIds / deferredIds / naturalOrder 中的 ID 按各自数组顺序保留
 * - 三数组中均未出现的"游离"工作区追加到 natural 末尾（按 visibleWorkspaces 顺序）
 * - 已被移除/隐藏的工作区 ID 被过滤掉
 */
export function computeLoadPhases(
  priorityIds: string[],
  deferredIds: string[],
  naturalOrder: string[],
  visibleWorkspaces: RecentWorkspaceEntry[]
): LoadPhases
```

**实现要点**：

```ts
const lookup = new Map(visibleWorkspaces.map(w => [w.id, w]));
const configured = new Set([...priorityIds, ...deferredIds, ...naturalOrder]);

const resolve = (ids: string[]): RecentWorkspaceEntry[] =>
  ids.map(id => lookup.get(id)).filter((w): w is RecentWorkspaceEntry => w !== undefined);

return {
  priority: resolve(priorityIds),
  deferred: resolve(deferredIds),
  natural: [
    ...resolve(naturalOrder),
    // 游离工作区（三数组都没收录的）追加到 natural 末尾
    ...visibleWorkspaces.filter(w => !configured.has(w.id)),
  ],
};
```

### 6.2 级联加载执行（重写 `generalActions.ts` 162-243 行）

**两段执行**：priority 阻塞首屏 → ready → deferred → natural。

```ts
const config = appInfo_?.config;  // 类型化访问，不再用 as Record<string, unknown>
const priorityIds = config?.workspacePriorityIds ?? [];
const deferredIds = config?.workspaceDeferredIds ?? [];
const naturalOrder = config?.workspaceNaturalOrder ?? [];
const maxConcurrent = config?.maxConcurrentWorkspaces ?? 6;

const visibleWorkspaces = recentWorkspaces.filter(
  (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels
);

const phases = computeLoadPhases(priorityIds, deferredIds, naturalOrder, visibleWorkspaces);

// === 首屏前：仅 priority 阻塞 ===
if (phases.priority.length > 0) {
  const results = await loadBatch(phases.priority, maxConcurrent);
  logRejected(results, 'priority');
}

// === 首屏 ready ===
await completeStartup();

// === 首屏后：deferred → natural 级联（不阻塞首屏） ===
void (async () => {
  try {
    if (phases.deferred.length > 0) {
      const deferredConcurrency = Math.min(2, maxConcurrent);
      const results = await loadBatch(phases.deferred, deferredConcurrency);
      logRejected(results, 'deferred');
    }

    if (phases.natural.length > 0) {
      const naturalConcurrency = Math.min(2, maxConcurrent);
      const results = await loadBatch(phases.natural, naturalConcurrency);
      logRejected(results, 'natural');
    }
  } catch (err) {
    console.warn('[workspace load] background cascade failed', err);
  }
})();
```

### 6.3 关键设计决策

**1. `completeStartup()` 时机**：在 priority 完成后调用，deferred 与 natural 在"完全启动后"执行。满足需求 5 原文（priority 同步、deferred 完全启动后异步、natural 等 priority 和 deferred 完成后）。

**2. 空层级自动跳级**（需求 5 的核心）：由于使用 `if (phases.X.length > 0)` 显式判断，空层级直接跳过，无需特殊"递进"代码。

| 场景 | 首屏阻塞 | 首屏后执行 | 满足级联 |
|------|---------|-----------|---------|
| priority 非空 + deferred 非空 + natural 非空 | priority | deferred → natural | ✅ |
| priority 空 + deferred 非空 + natural 非空 | 无（立即 ready） | deferred → natural | ✅ deferred 升为高优先级 |
| priority 空 + deferred 空 + natural 非空 | 无（立即 ready） | natural | ✅ natural 升为高优先级 |
| priority 非空 + deferred 空 + natural 非空 | priority | natural | ✅ natural 升为中优先级 |
| 三者皆空 | 无（立即 ready） | 无 | ✅ |

**3. 并发上限**：

- priority：`maxConcurrent`（用户配置，首屏阶段允许高并发以缩短等待）
- deferred：`min(2, maxConcurrent)`（后台阶段降低负载，避免影响用户操作）
- natural：`min(2, maxConcurrent)`（同 deferred）

**4. 错误处理修复**：

- 新增 `logRejected(results, phase)` helper：遍历 `Promise.allSettled` 结果，对 rejected 项 `console.warn` 输出 phase + reason（遵守 `error-handling.md`）
- `loadBatch` 内部 `accumulateBatch` 修复：失败时设置 `workspaceTreeLoading[id] = false` 与 `workspaceChangesTreeLoading[id] = false`，避免 loading 状态卡死

**5. 级联中断策略**：某阶段全部失败仍继续下一阶段（容错优先），仅记录日志。避免单点故障阻塞全部工作区。

**6. 后台级联的取消机制**：若用户在 deferred/natural 加载期间关闭应用，未完成的批次自然中止（Promise 随进程退出）。无需显式取消逻辑（YAGNI）。

## 7. i18n 与"!"提示卡片

### 7.1 当前提示文字问题

| 现有 key | 现有文案（zh-CN） | 问题 |
|---------|------------------|------|
| `priorityListDesc` | "排在此处的工作区会在启动时优先完成初始化。" | 未说明"会阻塞首屏" |
| `deferredListDesc` | "排在此处的工作区会在其他工作区之后加载。" | 错误——按新设计，deferred 在 priority 之后、natural 之前加载 |
| `defaultOrderHint` | "未出现在以上列表中的工作区按侧边栏顺序加载。" | 错误——natural 列表顺序独立于侧边栏；未说明加载时机 |
| `defaultOrderAllConfigured` | "所有工作区已配置" | 含义模糊 |

### 7.2 新 i18n key 方案

#### 列表标题与描述（标题旁的灰色短文）

| key | zh-CN | en-US |
|-----|-------|-------|
| `priorityList` | "优先加载（可选）" | "Priority (optional)" |
| `priorityListDesc` | "应用程序启动时同步加载，会阻塞首屏直到全部完成。" | "Loaded synchronously at app startup; blocks first screen until all complete." |
| `deferredList` | "延迟加载（可选）" | "Deferred (optional)" |
| `deferredListDesc` | "首屏就绪后异步加载，不阻塞界面响应。" | "Loaded asynchronously after first screen is ready; does not block UI." |
| `workspaceTagList`（新, 替换 `defaultOrderHint`） | "工作区标签列表" | "Workspace Tag List" |
| `workspaceTagListDesc`（新） | "前两个列表都完成后异步加载。默认按添加时间倒序排列（新添加的在上方）。" | "Loaded asynchronously after both lists above complete. Default order: by add time descending (newest on top)." |
| `priorityListEmpty` | "将工作区拖入此处设置优先加载" | "Drag a workspace here to prioritize it" |
| `deferredListEmpty` | "将工作区拖入此处设置延迟加载" | "Drag a workspace here to defer it" |
| `workspaceTagListEmpty`（新, 替换 `defaultOrderAllConfigured`） | "所有工作区都已分到优先或延迟列表" | "All workspaces are assigned to priority or deferred lists" |

#### "!" 提示卡片内容（详尽解释，maxWidth=320）

每个列表标题旁新增"!"图标，悬停显示详细说明，覆盖加载行为与级联规则。

| key | zh-CN |
|-----|-------|
| `priorityListTooltip` | "【优先加载列表】\n\n加载时机：应用程序启动时同步加载，会阻塞首屏渲染。所有 priority 工作区加载完成后，应用程序才会标记为就绪 (appReady)。\n\n并发上限：maxConcurrent（用户配置，默认 6）。\n\n注意：放入此列表的工作区越多，首屏等待时间越长。建议只放当前最常用的工作区。\n\n特殊情况：若此列表为空，则跳过此阶段，直接进入下一阶段。" |
| `deferredListTooltip` | "【延迟加载列表】\n\n加载时机：首屏就绪 (appReady) 后异步加载，不阻塞界面响应。用户可以在 deferred 加载期间正常操作应用。\n\n并发上限：min(2, maxConcurrent)，限制后台负载。\n\n执行顺序：在 priority 阶段完成后开始；本阶段完成后才进入工作区标签列表阶段。\n\n特殊情况：若此列表为空，则跳过此阶段，直接进入工作区标签列表阶段。" |
| `workspaceTagListTooltip` | "【工作区标签列表】\n\n加载时机：priority 和 deferred 两个列表都完成后异步加载，是最低优先级批次。\n\n并发上限：min(2, maxConcurrent)，限制后台负载。\n\n默认顺序：按工作区添加时间倒序排列（新添加的在上方，早添加的在下方）。用户可通过拖拽自定义顺序。\n\n独立性：此列表的顺序独立于应用程序左侧面板的工作区标签顺序，互不影响。仅此三个列表的顺序决定工作区加载次序。\n\n特殊情况：\n• 若 priority 为空且 deferred 非空，则 deferred 升级为高优先级，本列表仍为低优先级\n• 若 priority 和 deferred 都为空，则本列表升级为高优先级（首屏阻塞）\n• 若 priority 非空且 deferred 为空，则本列表升级为中优先级（首屏后立即执行）\n• 游离工作区（未在任一列表中）会自动追加到本列表末尾" |

en-US 版本同步翻译，保持结构一致。

#### maxConcurrentWorkspacesDesc 优化

| key | zh-CN |
|-----|-------|
| `maxConcurrentWorkspacesDesc` | "较高的数值会加快 priority 阶段加载速度，但会增加 CPU/内存压力。每个工作区同时发起 2 个请求（文件树 + Git 状态）。建议值：4-8。注意：deferred 与工作区标签列表阶段固定使用 min(2, 此值) 作为并发上限，以降低后台负载。" |

### 7.3 i18n 文件修改清单

**`frontend/src/app/i18n/zh-CN/workspace.ts`**（94-109 行附近）：

- 修改 `priorityListDesc` 文案
- 修改 `deferredListDesc` 文案
- 修改 `maxConcurrentWorkspacesDesc` 文案
- 新增 `workspaceTagList`（替换 `defaultOrderHint` 的引用）
- 新增 `workspaceTagListDesc`
- 新增 `workspaceTagListEmpty`（替换 `defaultOrderAllConfigured` 的引用）
- 新增 `priorityListTooltip`
- 新增 `deferredListTooltip`
- 新增 `workspaceTagListTooltip`
- 移除 `defaultOrderHint`、`defaultOrderAllConfigured`（无其他引用）

**`frontend/src/app/i18n/en-US/workspace.ts`**（97-112 行附近）：同步上述改动。

### 7.4 "!" 提示卡片 UI 集成

`SortableWorkspaceList.tsx` 中标题区结构：

```tsx
<h4 className="adl-sortable-section-title">
  <span className="adl-sortable-section-title-text">{title}</span>
  <TooltipSimple content={tooltipContent} sideOffset={4} dismissible maxWidth={320}>
    <button type="button" className="adl-icon-button adl-icon-button--info" tabIndex={-1}>
      <IconAlertTriangle size={16} />
    </button>
  </TooltipSimple>
  <span className="adl-sortable-section-desc">{desc}</span>
</h4>
```

**视觉布局**：标题文字 → "!"图标 → 灰色短描述（换行或同行，沿用现有 `.adl-sortable-section-desc` 样式）。`maxWidth=320` 确保长提示卡片可读。

**CSS 调整**：

- `.adl-sortable-section-title` 调整为 flex 布局，使图标与标题对齐
- `.adl-icon-button--info` hover 状态保持现有样式
- 提示卡片内多行文本（含换行符 `\n`）需 `white-space: pre-line` 渲染

### 7.5 主组件传参示例

```tsx
<SortableWorkspaceList
  kind="priority"
  title={t.priorityList}
  desc={t.priorityListDesc}
  tooltipContent={t.priorityListTooltip}
  items={priorityWorkspaces}
  emptyText={t.priorityListEmpty}
  onRemove={(id) => handleRemove(id, 'priority')}
  onMoveUp={(id) => handleMoveUp(id, 'priority')}
  onMoveDown={(id) => handleMoveDown(id, 'priority')}
/>
<SortableWorkspaceList
  kind="deferred"
  title={t.deferredList}
  desc={t.deferredListDesc}
  tooltipContent={t.deferredListTooltip}
  items={deferredWorkspaces}
  emptyText={t.deferredListEmpty}
  onRemove={(id) => handleRemove(id, 'deferred')}
  onMoveUp={(id) => handleMoveUp(id, 'deferred')}
  onMoveDown={(id) => handleMoveDown(id, 'deferred')}
/>
<SortableWorkspaceList
  kind="natural"
  title={t.workspaceTagList}
  desc={t.workspaceTagListDesc}
  tooltipContent={t.workspaceTagListTooltip}
  items={naturalWorkspaces}
  emptyText={t.workspaceTagListEmpty}
  // natural 列表无 onRemove/onMoveUp/onMoveDown（用户可拖拽跨列表移走，但无需按钮）
/>
```

## 8. 测试策略

### 8.1 测试文件清单

| 文件 | 类型 | 覆盖范围 |
|------|------|---------|
| `frontend/src/app/features/workspace-settings/useWorkspaceDnd.test.ts` | 新增单测 | DnD hook 逻辑 |
| `frontend/src/app/features/workspace-settings/SortableWorkspaceList.test.tsx` | 新增单测 | 列表组件渲染 |
| `frontend/src/app/stores/actions/workspaceLoadOrder.test.ts` | 新增单测 | 级联顺序纯函数 |
| `frontend/src/app/stores/actions/generalActions.test.ts` | 修改 | 替换占位测试，验证执行顺序 |
| Rust 后端测试 | 现有测试扩展 | `app_update_preferences` 字段处理 |

### 8.2 `useWorkspaceDnd.test.ts` — DnD 逻辑测试

**测试策略**：mock `@dnd-kit/core` 的 `DragEndEvent`，直接调用 hook 返回的 `handleDragEnd`，断言 `onChange` 回调收到的三数组状态。

**测试用例**：

| 用例 | 操作 | 期望 |
|------|------|------|
| 同列表内重排 | priority: [A,B,C] 拖 A 到 B 上方 | priority: [B,A,C] |
| 同列表内重排（natural） | natural: [X,Y,Z] 拖 Z 到 X 上方 | natural: [Z,X,Y] |
| 跨列表：priority → deferred | priority: [A], deferred: [] 拖 A 到 deferred 空占位 | priority: [], deferred: [A] |
| 跨列表：deferred → priority | deferred: [B], priority: [A] 拖 B 到 A 上方 | priority: [B,A], deferred: [] |
| 跨列表：natural → priority | natural: [X], priority: [A] 拖 X 到 A 上方 | priority: [X,A], natural: [] |
| 跨列表：priority → natural | priority: [A], natural: [X] 拖 A 到 X 上方 | priority: [], natural: [A,X] |
| 拖到空列表占位符 | priority: [], 拖 natural 中的 Y 到 `list-priority` | priority: [Y], natural: [] |
| 无 over（拖出区域） | over = null | 状态不变 |
| active.id === over.id | 同一元素 | 状态不变 |
| 去重保护 | 手动构造异常状态（A 同时在 priority 与 deferred） | 移动后 A 仅出现在 target |

### 8.3 `SortableWorkspaceList.test.tsx` — 渲染测试

**测试策略**：用 `@testing-library/react` 渲染，断言 DOM 结构。

**测试用例**：

| 用例 | 验证点 |
|------|--------|
| 非空列表渲染 | 显示所有 items 名称 |
| 空列表渲染 | 显示 emptyText；空占位 div 仍有 `data-droppable` 属性 |
| priority/deferred 列表显示操作按钮 | ↑/↓/× 按钮存在 |
| natural 列表隐藏操作按钮 | 无 ↑/↓/× 按钮 |
| "!" 提示卡片存在 | 标题区有 `.adl-icon-button--info` 按钮 |
| "!" 提示卡片悬停 | 悬停后 TooltipSimple 内容可见 |
| 标题与描述文案 | 渲染传入的 title / desc 文本 |

### 8.4 `workspaceLoadOrder.test.ts` — 纯函数测试

| 测试用例 | 验证点 |
|---------|--------|
| 全部工作区在 priority | natural 与 deferred 为空 |
| 全部工作区在 deferred | priority 与 natural 为空 |
| 全部工作区在 natural | priority 与 deferred 为空 |
| 三列表混合 | 各阶段顺序与数组顺序一致 |
| ID 孤儿（指向已删除工作区） | 被过滤掉，不抛错 |
| 游离工作区（三数组都没收录） | 追加到 natural 末尾 |
| 三数组都为空 | 三个阶段都为空 |
| 数组顺序保留 | `priorityIds` 顺序 = `phases.priority` 顺序 |

### 8.5 `generalActions.test.ts` — 执行顺序测试

**测试策略**：mock `loadBatch`、`completeStartup`、`computeLoadPhases`，验证调用顺序。

**测试用例**：

| 用例 | 验证点 |
|------|--------|
| priority 非空 | `loadBatch(priority)` → `completeStartup()` → `loadBatch(deferred)` → `loadBatch(natural)` |
| priority 空 + deferred 非空 | `completeStartup()` 立即调用 → `loadBatch(deferred)` → `loadBatch(natural)` |
| priority + deferred 都空 | `completeStartup()` → 仅 `loadBatch(natural)` |
| 三者皆空 | 仅 `completeStartup()`，无 `loadBatch` 调用 |
| priority 失败 | `loadBatch(priority)` rejected → 仍调用 `completeStartup()` → 仍执行后续阶段 |
| deferred 失败 | `loadBatch(deferred)` rejected → 仍执行 natural 阶段 |
| rejection 日志 | mock `console.warn`，验证 `logRejected` 调用 |

### 8.6 Rust 后端测试

**位置**：`src-tauri/src/commands/app.rs` 现有测试模块

**新增用例**：

- `app_update_preferences` 接受包含 4 个新字段的 patch，正确写入 config
- `app_update_preferences` 接受不含新字段的 patch（向后兼容），不影响现有字段
- `build_app_info` 返回的 `ConfigSnapshot` 包含 4 个新字段
- 旧配置文件（无新字段）反序列化时，4 个新字段使用 `#[serde(default)]` 兜底

### 8.7 测试材料管理（遵守 `mandatory-testing.md`）

- 所有 mock 数据基于真实 `RecentWorkspaceEntry` 类型生成
- 覆盖常规路径（正常拖拽）+ 边界路径（空列表、孤儿 ID、并发异常）
- 不为通过测试裁剪数据字段
- `loadBatch` mock 返回真实 `PromiseSettledResult` 结构

## 9. 验收流程

变更层级：**L3 全量级**（涉及 IPC 契约、Rust 后端、Store actions、新组件）

### 9.1 执行顺序

1. **步骤 1（并行）**：
   - 前端：`pnpm --dir frontend run lint:fix` → `pnpm --dir frontend run format` → `pnpm --dir frontend run typecheck`
   - 后端：`cargo fmt --all` → `cargo clippy --workspace --all-targets --fix -- -D warnings` → `cargo check --workspace`

2. **步骤 2（并行）**：
   - 前端测试：`pnpm --dir frontend run test`
   - Rust 测试：`cargo test --workspace`

3. **失败处理**：按 `mandatory-testing.md` 流程修复，3 次仍失败则上报用户

### 9.2 三桥一致性检查（按 `error-handling.md`）

新增/修改 IPC 字段后核对清单：

- [ ] `shared/ipc-types.generated.ts` 已更新
- [ ] tauri-bridge：参数类型由 `AppPreferencePatch` 保证；返回值通过 `app.getInfo` 自动包含新字段
- [ ] mock-bridge：`mock-shared-workspace.ts` config 默认值已更新
- [ ] preview-bridge：`preview-model.ts` config 默认值已更新；偏好持久化到 localStorage
- [ ] 返回类型 `IpcResult<T>` 不变
- [ ] 错误类型 `AppError` 不变
- [ ] JSDoc 注释已更新
- [ ] 对应测试文件 mock 同步

### 9.3 手动验收（用户在 Tauri 桌面应用中验证）

- [ ] 打开设置面板 → 工作区，看到三个列表，标题旁都有"!"图标
- [ ] 悬停"!"图标，看到详细的加载说明与级联规则
- [ ] 拖拽工作区从 natural 列表到 priority 空列表（修复核心 bug 验证）
- [ ] 拖拽工作区从 priority 到 deferred 空列表
- [ ] 拖拽工作区从 deferred 回到 natural
- [ ] 在三个列表内部拖拽重排
- [ ] 重启应用，三个列表的配置保留（持久化修复验证）
- [ ] 修改左侧面板工作区顺序，三个列表顺序不变（独立性验证）
- [ ] 新增工作区后，自动出现在 natural 列表头部（默认排序验证）
- [ ] 移除工作区后，从对应列表中消失（孤儿清理验证）

## 10. 范围与非目标

### 10.1 范围内

- 修复拖拽 bug（空列表 useDroppable）
- 修复持久化 bug（Rust 后端 + 三桥）
- 重写加载顺序逻辑（级联执行）
- 三列表互相拖拽
- natural 列表默认排序（naturalOrder 数组方案）
- 三列表独立性（与侧边栏顺序解耦）
- 9 个新/改 i18n key + 3 个"!"提示卡片
- 清理死代码（`WorkspaceSettingsState`）
- 修复 `findContainer` 未 memoize 问题
- 修复 `loadBatch` rejection 不记录日志问题
- 修复 `accumulateBatch` 失败时 loading 状态卡死问题
- 替换 `generalActions.test.ts` 占位测试
- 新增 DnD / 渲染 / 级联顺序单测

### 10.2 范围外（YAGNI）

- 工作区添加时间戳字段（`added_at`）—— 改用 `naturalOrder` 数组方案
- 后端驱动加载顺序计算（新增 Tauri 命令）—— 前端纯函数已足够
- 后台级联取消机制 —— Promise 随进程退出自然中止
- 键盘 DnD 支持 —— 可选增强，实现成本高时推后
- 工作区移除后自动恢复原列表位置 —— 用户需重新拖拽
- 工作区加载进度条 —— 当前 UI 已有 loading 指示，足够

## 11. 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| Rust 后端字段类型不匹配（usize vs number） | `ipc-types.generated.ts` 手动维护，typecheck 会捕获 |
| 三桥同步遗漏 | 9.2 节核对清单逐项检查 |
| 旧配置文件无新字段导致反序列化失败 | `#[serde(default)]` 兜底 + Rust 测试覆盖 |
| DnD 边界场景（孤儿 ID、并发拖拽） | 单测覆盖 + `useWorkspaceDnd` 内部去重保护 |
| 后台级联 Promise 未捕获 | `void (async () => {...})()` 内部 try/catch + `logRejected` |
| priority 阶段过长导致首屏延迟 | 用户配置权衡；"!"提示明确说明"会阻塞首屏" |
