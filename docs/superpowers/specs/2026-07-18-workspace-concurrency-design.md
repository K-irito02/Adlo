# Workspace Concurrency Limiter 设计文档

**日期**: 2026-07-18
**项目**: AI Digital Life
**关联**: 重构洞察报告 P6 发现（并发限制器）

---

## 1. 设计目标

在应用启动/bootstrap 时，限制工作区并发初始化的数量，避免 2N 个 IPC 请求同时涌入后端。默认并发数 6，支持用户通过设置面板自定义并发数和加载优先/延迟顺序。

---

## 2. 优先级层级（三段式）

```
第一优先级: 优先加载列表 (workspacePriorityIds)
  → 用户设置面板自定义顺序，完全覆盖侧边栏顺序

第二优先级: 未在任一列表的工作区 (默认顺序)
  → 按左侧边栏拖拽排序后的自然顺序

第三优先级: 延迟加载列表 (workspaceDeferredIds)
  → 用户设置面板自定义顺序，在优先和默认之后加载
```

---

## 3. 数据模型

### 新增偏好字段

```typescript
// AppPreferencePatch (kernel/types.ts)
interface AppPreferencePatch {
  // ... 已有字段
  maxConcurrentWorkspaces?: number;    // 默认 6
  workspacePriorityIds?: string[];     // 优先加载的工作区 ID 列表
  workspaceDeferredIds?: string[];     // 延迟加载的工作区 ID 列表
}
```

### 默认值

```typescript
// shared/defaultPreferences.ts
export const DEFAULT_MAX_CONCURRENT_WORKSPACES = 6;
export const DEFAULT_WORKSPACE_PRIORITY_IDS: string[] = [];
export const DEFAULT_WORKSPACE_DEFERRED_IDS: string[] = [];
```

### 偏好合并

```typescript
// shared/preferencesMerger.ts
applyPreferencePatch 新增 3 个字段的 patch 合并
```

### 设置项映射

```typescript
// utils/settingsViewModel.ts
preferencePatchFromSettingChange 新增:
  'maxConcurrentWorkspaces' → { maxConcurrentWorkspaces }
  'workspacePriorityIds'    → { workspacePriorityIds }
  'workspaceDeferredIds'    → { workspaceDeferredIds }
```

---

## 4. 并发限制器核心逻辑

### 位置

`frontend/src/app/stores/actions/generalActions.ts:168-199`

### Semaphore 实现

```typescript
// shared/asyncUtils.ts — 新增
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let index = 0;
  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      try { results[i] = { status: 'fulfilled', value: await fn(items[i]) }; }
      catch (e) { results[i] = { status: 'rejected', reason: e }; }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
```

### 重排序逻辑

```typescript
const priorityIds = appInfo.config.workspacePriorityIds ?? [];
const deferredIds = appInfo.config.workspaceDeferredIds ?? [];
const maxConcurrent = appInfo.config.maxConcurrentWorkspaces ?? DEFAULT_MAX_CONCURRENT_WORKSPACES;

const naturalOrder = visibleWorkspaces.filter(
  (w) => !priorityIds.includes(w.id) && !deferredIds.includes(w.id)
);

const ordered = [
  ...priorityIds.map((id) => visibleWorkspaces.find((w) => w.id === id)).filter(Boolean),
  ...naturalOrder,
  ...deferredIds.map((id) => visibleWorkspaces.find((w) => w.id === id)).filter(Boolean),
] as RecentWorkspaceEntry[];
```

---

## 5. 设置面板 UI

### 组件结构

`features/workspace-settings/WorkspaceSettings.tsx`（新建）

```
WorkspaceSettings
├── SettingsHeader: "工作区加载"
├── 并发数 input (number, min=1, max=20) + "!" 悬浮提示
├── 分隔线
├── DndContext (closestCorners + PointerSensor 8px)
│   ├── SortableContext "priority" → PriorityList
│   │   ├── SortableItem × N (手柄 + 名称 + × 移除)
│   │   └── EmptyState
│   ├── SortableContext "deferred" → DeferredList
│   │   ├── SortableItem × N
│   │   └── EmptyState
│   └── Droppable "natural" → NaturalArea
│       └── 未配置的工作区列表
└── DragOverlay → 拖拽浮层
```

### @dnd-kit 依赖

- `@dnd-kit/core` ^6.3.0（核心引擎）
- `@dnd-kit/sortable` ^10.0.0（可排序列表）
- `@dnd-kit/utilities` ^3.2.0（工具函数）

### 跨列表拖拽逻辑

| 操作 | 行为 |
|------|------|
| natural → priority | 从 natural 移除，加入 priority 列表 |
| natural → deferred | 从 natural 移除，加入 deferred 列表 |
| priority/deferred → natural | 从源列表移除（默认顺序） |
| 列表内排序 | arrayMove 重新排列 |
| × 按钮 | 从当前列表移除（回到默认顺序） |
| 所有变更 | debounce 200ms → updatePreferences(patch) |

### "!" 悬浮提示

复用项目内 `TooltipSimple` 组件 + `lucide-react` 的 `AlertCircle` 图标。

---

## 6. i18n Key

新建 `i18n/{en-US,zh-CN}/workspace.ts`，共 10 个 key（含列表空状态提示）。注册到对应语言的 `index.ts` barrel export。

---

## 7. 文件清单

| 操作 | 路径 |
|------|------|
| 🆕 | `features/workspace-settings/WorkspaceSettings.tsx` |
| 🆕 | `features/workspace-settings/WorkspaceSettingsTypes.ts` |
| 🆕 | `shared/asyncUtils.ts` |
| 🆕 | `i18n/en-US/workspace.ts` |
| 🆕 | `i18n/zh-CN/workspace.ts` |
| ✏️ | `stores/actions/generalActions.ts` |
| ✏️ | `shared/defaultPreferences.ts` |
| ✏️ | `shared/preferencesMerger.ts` |
| ✏️ | `utils/settingsViewModel.ts` |
| ✏️ | `components/settings/SettingsPanel.tsx` |
| ✏️ | `kernel/types.ts` |
| ✏️ | `i18n/en-US/index.ts` |
| ✏️ | `i18n/zh-CN/index.ts` |
| ✏️ | `frontend/package.json`（@dnd-kit 依赖） |
| ✅ | `regions/left-sidebar/WorkspaceList.tsx`（已有，利用） |
| ✅ | `utils/dragUtils.ts`（已有，利用） |
| ✅ | `stores/actions/workspaceActions.ts`（已有，利用） |

---

## 8. 未覆盖范围（明确不包含）

- Rust 后端改动：`AppPreferencePatch` 通过已存在的 `app_update_preferences` IPC 通道传输，JSON 序列化自动兼容
- 左侧面板工作区拖拽排序：已存在，不需要新增
- A6（agent-runtime 职责拆分）：独立讨论，不在本设计范畴
