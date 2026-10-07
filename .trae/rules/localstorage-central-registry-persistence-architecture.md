# 中心登记表驱动的 localStorage 持久化架构

## 规则描述

所有前端 UI 状态的 localStorage 持久化必须收敛到 `stores/persisted/` 的中心登记表（registry）架构，禁止各 slice/组件自建去抖写入器或直接调用 `localStorage.setItem`。该架构取代旧有的逐 slice `requestIdleCallback` 惰性水合方案（该旧方案已废弃，其 `_defaultsHydrated` 守卫不再使用）。

## 架构组成

| 文件 | 职责 |
|------|------|
| `registry.ts` | **全局唯一事实来源**：`defineEntry()` 声明每条键的完整契约，一个键的形状只在同一处定义 |
| `entry.ts` | `PersistEntry` 类型，`PersistScope`（global/byWorkspaceId/byTabId）、键名校验、`PruneCtx` |
| `persist.ts` | 唯一写盘入口，复用跨切片去抖调度器；任何 slice 不得自建写入器 |
| `apply.ts` | `persistField(key, value)` 落盘并返回可直接交给 zustand `set` 的补丁 |
| `hydrate.ts` | store 构造期唯一同步水合时机，产出 `patch + dirtyKeys` |
| `composite.ts` + `searchComposite.ts`/`terminalComposite.ts` | 跨键复合水合器（需多个键共同结果的归一化） |
| `parsers.ts` | 逐键形状/取值校验器（越界钳制、枚举白名单、数组逐项校验） |
| `prune.ts` / `pruneWiring.ts` | 引用类剪枝（工作区/目录/标签存在性），参照清单为空时必须跳过 |
| `cleanup.ts` | 启动清理未登记脏键 |
| `storageHelpers.ts` | 共享去抖调度器、`flushCrossSliceWrites` 关窗兜底 |

### 条目：甲类（field）/ 乙类（apply）二选一

- **甲类（field）**：水合写入 store 字段，`field` 全局唯一（禁止两条键声明同一字段）
- **乙类（apply）**：水合目标为**模块级微型存储**（module-level micro-store），把"校验+剪枝后"的值交回其模块缓存，`apply: (value) => void`

## 模块级微型存储（乙类 apply 汇聚器）

不与 PTY 生命周期/标签状态强耦合的细粒度 UI 偏好（视图模式、工作目录、区域折叠、历史索引等），不塞进 zustand slice，以独立 TS 模块的模块级缓存承载：

1. **模块级缓存**：`let cache = {}; let cacheSet = false;` 惰性填充
2. **cacheSet 防御**：构造期 `apply` 未运行（测试路径/提前调用）时按需读一次存储，避免返回错误空值
3. **唯一写通道**：`saveForTab` 统一走 `persist(KEY, ...)`（复用中心去抖调度器），不直连 localStorage
4. **归一化函数**：`normalizeXxx(raw)` 对持久化数据容错（类型/缺失/越界），作为 registry 的 `read` 校验器
5. **apply() 汇聚器**：构造期水合把校验后值交回模块缓存

```ts
let cache: Record<string, TerminalPaneLayout> = {};
let cacheSet = false;

export const terminalPaneLayoutStore = {
  loadForTab(tabId: string | undefined): TerminalPaneLayout | undefined {
    if (!cacheSet) { cache = readStored(); cacheSet = true; }
    return tabId ? cache[tabId] : undefined;
  },
  saveForTab(tabId: string, layout: TerminalPaneLayout): void {
    if (!cacheSet) { cache = readStored(); cacheSet = true; }
    cache = { ...cache, [tabId]: layout };
    persist(TERMINAL_PANE_LAYOUT_KEY, cache);
  },
  // 构造期水合回调（乙类条目 apply）
  apply(value: Record<string, TerminalPaneLayout>): void { cache = value; cacheSet = true; },
};
```

## 正确示例

```ts
// registry.ts —— 单一事实来源，逐个声明
'adl:ui.rightPanelWidth': defineEntry<number>({
  key: 'adl:ui.rightPanelWidth',
  field: 'rightPanelWidth',
  fallback: DEFAULT_RIGHT_PANEL_WIDTH,
  scope: 'global',
  read: readNumberInRange(RIGHT_PANEL_WIDTH_MIN, RIGHT_PANEL_WIDTH_MAX),
}),
```

```ts
// slice 内写盘：persistField 落盘 + 返回补丁给 set，杜绝手写拼字段
set((state) => persistField('adl:files.workspaceExpanded', next));
```

### 大对象延迟加载
- 单条序列化体积 > 32KB 必须设为 `sync: false`，构造期跳过，由模块按需读取（如 `ciLogCaches`、`ciSnapshots`）
- 读侧边界必须与写侧 clamp 同源（同一 MIN/MAX 常量），避免接住 setter 产不出的越界值

## 错误示例

```ts
// ❌ slice 自建去抖写入器 / 直接 setItem（违反单一写盘入口）
const { scheduleWrite } = createDebouncedWrite(50);
scheduleWrite(key, value);

// ❌ 未经登记悄悄读写 localStorage
window.localStorage.setItem('adl-foo', '1');

// ❌ 模块级微型存储读路径跳过 cacheSet 防御，构造期 apply 未运行时返回错误空值
loadForTab() { return cache[tabId]; }

// ❌ 同一键在多个地方重复定义"预期形状"（会绕过登记表的拒绝判定）
function isTab(v: any) { ... } // 又抄了一份，与 registry 里的严/宽不一致
```

## 关键约束
1. **写**：统一走 `persist()`/`persistField()`；失败由 storageHelpers 首个警告静默，绝不重试、绝不清理其他键
2. **读**：`hydrateAll()` 是全应用唯一水合时机且是同步的 → 无"未水合即写盘"竞态窗口，无需 hydrated 守卫
3. **损坏自愈**：键存在但读不出值/形状不合法 → 回退 fallback 并记入 `dirtyKeys`，本轮启动被覆盖
4. **复合水合**：必须用 `priorPatch` 快照（简单条目补丁的快照，不含任何复合派生值），禁止读取其他复合水合器的输出再次派生
5. **剪枝安全**：参照清单（workspaceIds/tabIds/loadedDirPaths）为空时，剪枝必须 `{ value, changed: false }` 跳过，防止构造期误删全部按工作区隔离的状态
6. **关窗兜底**：只刷共享实例不够，slice 自己的去抖实例也要注册，统一由 `flushCrossSliceWrites()` 在 `pagehide`/`visibilitychange(hidden)` 时同步落盘

## 适用场景

所有需要跨重启保留的 UI 状态（面板宽度、展开树、标签/书签、搜索配置、终端偏好等）。新增持久化字段时：在 `registry.ts` 用 `defineEntry` 登记 → slice 内用 `persistField` 写（甲类）或模块级存储 `saveForTab` + `apply` 汇聚（乙类）→ 不需额外水合。