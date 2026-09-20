# 右侧面板 UI 状态持久化统一设计

> **日期：** 2026-09-20
> **状态：** 设计已确认，待编写实现计划
> **范围：** 右侧面板四面板（文件 / 变更 / 浏览器 / 终端）及其全部子面板的 UI 状态持久化、孤儿数据剪枝、持久化基础设施统一
> **关联约束：**
> - 未发布产品，**禁止添加任何数据格式兼容或旧版本迁移代码**（`AGENTS.md` 禁止项）→ 本设计通过"换键 + 启动清理"取代迁移
> - 功能行为必须**双端一致**（Tauri 桌面模式 / 浏览器模式）
> - UI 展示文本必须走 i18n key，禁止硬编码
> - 错误/状态提示不得常驻，仅在活跃错误状态下可见
> **触发问题（用户报告）：**
> 1. 重启应用后「文件面板」中所有工作区**必定**为折叠状态
> 2. 重启后展开工作区，目录展开状态与关闭前**不一致**（手动折叠过的目录反而变成展开）
> 3. 要求核查其余面板（变更 / 浏览器 / 终端）及其子面板是否同样做了持久化

---

## 1. 问题陈述与现状盘点

### 1.1 根因（已核实，非推测）

#### 根因 A：工作区级展开态"持久化只写了一半"

`adl-ui:workspace-tree-expanded`（`workspaceSlice.ts:16`）与 `adl-ui:workspace-changes-expanded`（`:17`）两个键具备完整的**读**路径（水合 `workspaceSlice.ts:59-64`）与**写**路径（`setWorkspaceTreeExpandedInFileNav` `:163-166`、`setWorkspaceChangesExpanded` `:168-171`），但这两个写函数**在全部生产代码中没有任何调用点**（全仓 grep 仅命中声明与定义）。

所有真实 UI 路径全部绕过它们，直接 `set()` 改内存：

| 位置 | 代码 |
|---|---|
| `stores/actions/workspaceTreeActions.ts:66-75` | `(next) => set({ workspaceTreeExpandedInFileNav: next })` |
| `stores/actions/workspaceTreeActions.ts:165-174` | `batchExpandAll` 整表替换 |
| `stores/actions/workspaceTreeActions.ts:182-184` | `set({ workspaceTreeExpandedInFileNav: {} })` |
| `stores/actions/gitFileOpsActions.ts:20-29` | `set({ workspaceChangesExpanded: next })` |
| `stores/actions/gitFileOpsActions.ts:37-39` / `:49-58` | 折叠全部 / 展开全部 |
| `stores/actions/browserCleanupActions.ts:64` | 剔除工作区的整表替换 |

**后果：** 存储中该键永远为 `{}` → 启动水合读回 `{}` → `MultiWorkspaceTreeShell.tsx:66` 的 `expandedState[ws.id] ?? false` 恒为 `false` → 所有工作区必然折叠。这解释了用户报告的现象 1，且是**确定性**的，不是时序偶发。

**结论：这不是"持久化失效"，而是"从未被写入"。**

#### 根因 B：目录级展开态虽已持久化，但存在三条污染路径

目录级展开态 `expandedFileTreePaths` 走 `writeFileTreeExpanded`（`uiSliceExpansion.ts:10`）落盘，读写闭环存在，但会被以下路径破坏：

| # | 机制 | 位置 | 后果 |
|---|---|---|---|
| B1 | **自动展开与手动折叠写同一份数据** | `FileNavigatorShell.tsx:554-558` 调 `expandFileTreePathChain`，与用户点击折叠共用 `expandedFileTreePaths` | 用户手动折叠 A 后，只要之后打开过 A 内的文件，A 被自动改回展开**并落盘** → 重启后呈现"我折叠过的目录却是展开的"，即现象 2 |
| B2 | **未水合即写盘（时序竞态）** | 水合排到 `requestIdleCallback(timeout:1000)`（`uiSlice.ts:162-166`），写盘去抖排到 `requestIdleCallback(timeout:500)`（`storageHelpers.ts:110-120`）。写盘 deadline 更早时先执行，把**尚未水合的空状态整表替换**到存储（`uiSliceExpansion.ts:79-80` 为整表写） | 历史展开态被抹掉；代码中**没有任何 hydrated 守卫** |
| B3 | **重命名后重映射绕过持久化** | `workspaceActions.ts:106-126` 直接 `set()` 整表替换 `expandedFileTreePaths` / `expandedChangesTreePaths` | 内存新、磁盘旧，重启后回落到重命名前的旧路径 |

#### 根因 C：结构性缺陷（本次一并治理）

| # | 缺陷 | 位置 |
|---|---|---|
| C1 | `workspaceSlice.ts:20-45` 自建私有去抖写入表，**未注册**进 `storageHelpers.ts:77` 的 `debouncedWriters` 注册表 → `flushCrossSliceWrites()`（`storageHelpers.ts:135-139`）碰不到它 | 一旦被启用，关窗瞬间的改动必丢 |
| C2 | 四面板持久化"水位"参差不齐，同一概念有**四套不同做法**（store setter / 私有去抖 / 直接写 / 完全不写） | 见 §1.2 |
| C3 | 键名前缀混用：`adl-ui:` / `adl-terminal:` / `adl-search:` / `adl-browser:` | `uiSliceTypes.ts:17-40`、`terminalSliceTypes.ts`、`searchSlice.ts:13-16` |
| C4 | 一个物理键被两个面板共用：`BROWSER_NAVIGATOR_COLLAPSED_KEY === 'adl-ui:navigator-collapsed'`（`constants.ts:1`），uiSlice / browserSlice / terminalSlice 三处读写 | 冲突风险 |
| C5 | 同一状态重复定义：`navigatorCollapsedByTool`、`browserNavigatorWidth`、`setBrowserNavigatorWidth` 在 uiSlice 与 browser/terminal slice 中各自定义，**靠 `slicedStore.ts:69-126` 的注册顺序决定谁生效** | 极易被改坏 |
| C6 | 跨工作区串味：`expandedChangesTreePaths` 是**全局单表**（不按工作区），`computeExpandedPathsByWs`（`useChangesPanelStateUtils.ts:198-207`）把同一张表发给每个工作区；`filePreviewModeByPath` 仅按工作区相对路径做键（`FilesPanel.tsx:121-139`） | 多工作区下同名相对路径互相污染 |
| C7 | 无剪枝：删除工作区/目录后的展开记录永久残留 | 终端面板**完全缺失**清理路径 |
| C8 | 关窗落盘仅两条路径：`beforeunload`（`useTerminalPtyLifecycle.ts:893-912`）与 Tauri `onCloseRequested`（`:918-1003`）；**无 `pagehide` 兜底**。代码自身已承认该缺陷：`terminalSlice.ts:410` 注释"去抖调度器无 pagehide flush，仅靠它是不可靠的" | 进程被强杀时去抖窗口内改动丢失 |
| C9 | 陈旧注释误导：`generalActions.ts:66-70` 注释称"为右侧面板设置默认展开所有可见工作区"，实现中无此逻辑 | 会诱导后续维护者写错 |

#### 根因 D：死代码与无消费者状态（已逐条 grep 核实）

| 项 | 位置 | 结论 |
|---|---|---|
| `browserWorkspaceExpanded` | `browserFoldersSlice.ts:67`、水合 `browserSlice.ts:92,181`、清理 `browserCleanupActions.ts:39-42` | **无任何组件消费者**。浏览器树的展开实际由 `browserTabTreeExpanded['workspace:<wsId>']` 驱动（`BrowserTabTree.tsx:209`） |
| `browserPersisted` / `browserWorkspaceId` / `setBrowserPersisted` / `setBrowserWorkspaceId` | `browserSlice.ts:207-208,227-228,316-318`、selectors `browserSelectors.ts:14-18` | 无生产调用点（仅定义与测试引用） |
| `terminalPersisted` / `setTerminalPersisted` | `terminalSlice.ts:174,211,406` | 无生产调用点 |
| `collapseAllFileTreePaths` | `uiSliceExpansion.ts:102-107`、`uiSliceTypes.ts:131` | 无调用点（注意：`collapseAllChangesTreePaths` **有**调用点于 `useChangesActions.ts:103`、`useChangesPanelStateUtils.ts:305`，**保留**） |
| `SESSION_TABS_EXPANDED_KEY` | `uiSliceTypes.ts:34`，仅被 `uiSlice.ts:74` 再导出 | 无读写点，遗留常量 |

### 1.2 四面板持久化现状矩阵（已核实）

| 层级 | 文件 | 变更 | 浏览器 | 终端 |
|---|---|---|---|---|
| 面板级（整体折叠 / 宽度 / 主模式） | ✅ | ✅ | ✅（导航子视图模式 ❌） | ✅ |
| 工作区级（工作区头展开） | ❌ **缺失**（根因 A） | ❌ **缺失**（根因 A） | ✅（但无消费者，靠 tab 树路径键生效） | ✅ |
| 目录级（目录展开） | ✅ 但被污染（根因 B1/B2/B3） | ✅ 但全局单表串味（C6） | ✅（tab 树路径键） | ✅（区域折叠，按 tabId） |

### 1.3 澄清结论（已与用户确认）

| # | 议题 | 结论 |
|---|---|---|
| D1 | 覆盖范围 | **全量 + 清理与统一基础设施**：除大对象（终端历史索引等）外，四面板所有影响用户可见形态的状态均纳入；同时清理死代码 / 死状态 / 重复定义 |
| D2 | 启动水合时序 | **构造期同步读取**（接入宽度 / 折叠的既有轨道），不做异步水合 + 写入门控 |
| D3 | 自动展开与手动折叠冲突 | **尊重手动折叠**：自动展开不得覆盖用户手动折叠过的目录 |
| D4 | 孤儿数据处理 | **读盘懒剪 + 主动剪枝** |
| D5 | 统一持久化层架构 | **中心登记表 + 统一读写通道**（内部复用轻量工厂，不另开第二套写盘实现） |
| D6 | 折叠提示交互 | **保持折叠 + 短暂闪烁**（不自动展开，不解除折叠标记） |
| D7 | 会话恢复边界 | **包含**：恢复上次打开的文件 + 滚动偏移 + 折叠区间 |

---

## 2. 目标与非目标

### 2.1 目标

1. 四面板及其全部子面板的**面板级 / 工作区级 / 目录级**状态在重启后完整还原。
2. 消除根因 B 的三条污染路径；用户的手动折叠意图具备**可预测性**。
3. 建立**统一持久化基础设施**：中心登记表 + 唯一读写通道，消除 C1–C8。
4. 顺带清理 §1.1-D 的死代码、死状态与重复定义（C5）。
5. 恢复上次打开的文件、滚动偏移与折叠区间。

### 2.2 非目标

- **不做**数据格式兼容或旧版本迁移代码（遵守项目规则，改为换键 + 启动清理）。
- **不改变**存储技术方案：UI 状态仍使用浏览器本地存储，不迁移到 SQLite。
- **不改变**任何业务逻辑与 IPC 契约（本次不新增 IPC 方法，`mock-bridge` 无需改动）。
- **不重构**与持久化无关的面板代码。

---

## 3. 设计

### 3.1 数据模型与键规范

#### 3.1.1 键名规范

```
adl:<域>.<名称>                例：adl:files.dirExpanded
adl:<域>.<名称>.<版本段>        仅当该键的 schema 需要变更时才加
```

- 域取值：`ui` / `files` / `changes` / `browser` / `terminal` / `search` / `session`。
- 现有 `adl-ui:` / `adl-terminal:` / `adl-search:` / `adl-browser:` 四种前缀全部收敛为上述形式。
- **不写键名搬迁代码**：旧键在首次启动的"启动清理"阶段被删除（§3.5.3）。

#### 3.1.2 目录展开态结构（本次唯一有语义变化的结构）

```ts
type DirExpansion = {
  expanded: Record<string, boolean>;        // 语义不变：该目录是否展开
  manualCollapsed?: Record<string, true>;   // 新增：用户亲手折叠过，自动展开不得覆盖
};
```

**设计依据（YAGNI）**：自动展开只会**展开**、从不折叠，因此"手动展开"永远不会被自动展开违背，无需记录。只有"手动折叠"这一侧需要保护意图 → 新增状态仅一项，而非把每个节点结构改胖。

**状态转移规则（三条，实现时须有对应测试）：**

| 触发 | `expanded[A]` | `manualCollapsed[A]` |
|---|---|---|
| 用户手动折叠 A | `false` | `true` |
| 用户手动展开 A | `true` | **删除该项** |
| 自动展开路径链经过 A | 命中 `manualCollapsed` → **跳过**并记入"被挡下"列表；否则 `true` | 不变 |
| 剪枝 | 清理已不存在的路径 | 同时清理已不存在、或已处于展开态的项 |

#### 3.1.3 作用域纪律

每条登记**必须**显式声明 `scope`：`global` / `byWorkspaceId` / `byTabId`。

- 文件树、变更树的目录展开态一律 `byWorkspaceId`（**修复 C6**：变更树由全局单表改为按工作区隔离）。
- `filePreviewModeByPath` 补上工作区维度（**修复 C6**）。
- `scope` 不仅是读时隔离的依据，也是 §3.5.2 主动剪枝的遍历依据。

### 3.2 统一读写通道

#### 3.2.1 登记表（唯一事实来源）

新目录 `frontend/src/app/stores/persisted/`：

```ts
// registry.ts
export type EntryBase<T> = {
  key: string;                    // 完整键名，全表唯一
  fallback: T;                    // 无数据 / 解析失败时的兜底
  scope: 'global' | 'byWorkspaceId' | 'byTabId';
  read?: (raw: unknown) => T;     // 形状与取值校验；不合法则返回 fallback
  prune?: (v: T, ctx: PruneCtx) => { value: T; changed: boolean };  // 引用是否仍存在
  sync?: boolean;                 // 是否允许构造期同步读，默认 true
};

// 值的归宿（二者恰有其一）—— 水合必须知道把值交给谁
export type Entry<T> = EntryBase<T> &
  (
    | { field: keyof StoreState; apply?: never }   // 甲类：store 字段
    | { field?: never; apply: (value: T) => void } // 乙类：模块级微型存储的缓存
  );
```

**为什么需要"乙类"（外部水合目标）**：并非所有持久化状态都住在 Zustand store 里。`features/terminal/` 下有四个模块级微型存储（`terminalViewPrefs` / `terminalRegionCollapse` / `terminalCwdStore` / `terminalHistoryStore`），它们是 `load()/save()` 形式、**没有订阅机制**，且其中一个（终端历史索引）按 §3.3 要点 3 明确**不得**进入构造期同步读。把它们搬进 store 会让大对象常驻并触发无关渲染通知；因此登记表允许条目声明 `apply` 汇聚器，构造期水合把校验+剪枝后的值交回该模块自己的缓存。

**乙类的三条附带规则**：

1. `sync: false` 的条目**既不产出 store 补丁、也不调用 `apply`** —— 它的读取沿用各自既有的按需路径（如 `ensureHistoryIndexLoaded`），该路径必须读**新键名**。
2. `apply` 汇聚器只在构造期被调用一次（水合幂等），不得被用作运行时同步机制。
3. `field` 唯一性断言只覆盖甲类；乙类由"恰有其一"断言保证不重复声明归宿。

**为什么乙类不是"第二套读取路径"**：按需路径针对 `sync: false` 条目，本就是 §3.3 要点 3 强制要求存在的例外（大对象不得同步读）；乙类的其余三个条目仍是构造期同步水合，与甲类共用同一时机。

```ts
// index.ts —— 仅两个入口，职责互斥
export function hydrateAll(): { patch: Partial<StoreState>; prunedKeys: string[] }
export function persist<K extends keyof typeof registry>(key: K, value: RegistryValue<K>): void
```

#### 3.2.2 硬性规则（作为代码评审检查项）

| 规则 | 针对的现有问题 |
|---|---|
| `persist` 是**唯一**写盘入口，内部走共享去抖并已注册关窗 flush | `workspaceSlice.ts:20-45` 私有去抖整体删除；`uiSlice` / `browserSlice` / `terminalSlice` 中各自的 `makePersistedWriter` / 直接 `setItem` 全部改为走 `persist` |
| **禁止**任何 slice 自建去抖或直接 `setItem` | C1、C2 的根源 |
| 只有登记表中的键会被读取 | 未登记键不可读，杜绝"半迁移"状态 |
| 键名唯一性由对象字面量保证 | 重复键在编译期报错 → 结构性保证，不依赖人工检查 |

#### 3.2.3 `read` 与 `prune` 的职责分离

- `read` 回答"**形状/取值还合法吗**"（例：`filesSearchScope` 只能是 `file` / `content`）。
- `prune` 回答"**它引用的东西还在吗**"（工作区是否仍存在、目录是否仍在）。
- 两者分离才能各自独立测试；`read` 失败退 `fallback`，`prune` 命中则剔除。

### 3.3 水合时序（决策：构造期同步读取）

```
store 模块加载
  ├─ hydrateAll()  同步执行一次：逐条 read → prune → 汇总 patch，同时收集待清理键
  ├─ createUISlice / createWorkspaceSlice / createBrowserSlice / createTerminalSlice 以 patch 为初值
  ├─ React 首帧渲染（即上次的样子，无抖动）
  └─ 启动清理：删除不在登记表内的 adl: 键（一次性）

用户交互 → persist(key, value) → 共享去抖 → 空闲 flush
窗口关闭 → flushCrossSliceWrites()；新增 pagehide 兜底
```

**要点：**

1. **竞态是被"移除"的，不是被"防住"的**。全应用仅剩一个水合时机（store 构造）且为同步 → 异步写入窗口从结构上不存在，因此**不需要** `hydrated` 标志位这类防御性代码（这正是拒绝"异步水合 + 写入门控"方案的原因：门控靠每个写入点自觉判断，漏一处即复发，且首帧会出现可见抖动）。
2. 与现有惯例一致：面板宽度、整体折叠、导航模式**本来**就是构造期同步读的（`uiSliceWidths.ts:105-148`、`searchSlice.ts:216-217,232-233`、`useRightPanelViewProps.ts:30`）。本设计是把展开态接入同一轨道，**不引入第二套读取路径**。
3. **同步读的准入线（硬性）**：单条数据必须体量小、且影响首帧外观。终端历史索引、浏览器下载列表等大对象**必须显式标注 `sync: false`**：它们仍进登记表（以获得键名规范、校验、剪枝与统一写通道），但**既不产出 store 补丁、也不调用 `apply`**，读取沿用各自既有的按需路径。原文此处写作"不允许进登记表…登记时须显式标注"，两句互斥，已按上文更正。
4. `hydrateAll()` 幂等且只执行一次（模块级单例）。

### 3.4 折叠意图（决策：尊重手动折叠）

**实现要点（避免冗余代码）：**

`expandFileTreePathChain` 改为返回被 `manualCollapsed` 挡下的目录列表：

```ts
expandFileTreePathChain(workspaceId: string, path: string): { blocked: string[] }
```

调用方 `FileNavigatorShell` 直接消费该返回值，用**组件本地 state** 触发一次闪烁。这样"被挡下"这一信号在**产生它的地方**即被消费，不引入新的持久化字段，也不引入新的 store 字段。

**折叠提示交互（决策：方案 3 —— 保持折叠 + 短暂闪烁）：**

- 目标文件位于被手动折叠的目录内时，目录**保持折叠**，该行播放一次约 1 秒的浅色脉冲动画。
- 动画走 CSS，不使用持久化状态；`prefers-reduced-motion` 下退化为无动画（仅保持选中高亮）。
- 不在折叠状态下自动展开，保证用户手动折叠意图不被推翻。

### 3.5 剪枝（决策：读盘懒剪 + 主动剪枝）

#### 3.5.1 懒剪（读盘时）

**首要安全规则：剪枝必须与"参照清单是否已就绪"绑定，参照清单为空时一律跳过。**

> 依据：`hydrateAll()` 在 store 构造期（模块加载）执行，而 `recentWorkspaces` 要等 `bootstrap()` 之后才从后端载入（`generalActions.ts:72-83`）。若在构造期按工作区存在性剪枝，此时的"存在的工作区集合"为空，会把**全部**按工作区隔离的展开态误判为孤儿删除。这是本设计中最危险的一处陷阱。

| 剪枝对象 | 触发时机（参照清单就绪后） | 原因 |
|---|---|---|
| 已不存在的工作区 | **`recentWorkspaces` 加载完成后**（`setRecentWorkspaces` 内触发），**不可在 store 构造期** | 构造期工作区列表为空，剪枝即误删。空清单时跳过 |
| 已不存在的目录 | **仅在该工作区树成功加载完成之后**（`pruneAfterTreeLoaded`） | 树未加载 ≠ 目录不存在。若在未加载时剪枝，会把"尚未读到的有效展开态"误判为孤儿删除 |
| 已不存在的标签 | 标签列表水合完成后 | 与工作区同理，空清单时跳过 |
| 树加载失败 / 列表请求失败的工作区 | **跳过剪枝** | 路径不可用 / 权限不足 / 网络失败 ≠ 目录被删 |

**正确性依据（已核实）**：工作区树为**一次性完整返回**（`shared/ipc/workspace.ts:119-121` → `WorkspaceTreeNode[]`，节点含 `children` 嵌套，`kernel/types-workspace-files.ts:111-116`），无分页 / 无懒加载子节点 → 树加载完成后目录全集已知，剪枝安全。

**四个剪枝入口（职责互斥）：**

| 入口 | 调用时机 | 作用范围 |
|---|---|---|
| `hydrateAll()` | store 构造，同步 | 仅做 `read` 形状校验 + `fallback` 兜底。**不做引用类剪枝** |
| `pruneAfterWorkspacesKnown(workspaceIds)` | `setRecentWorkspaces` 内 | `byWorkspaceId` 条目按工作区存在性剔除；空清单跳过 |
| `pruneAfterTreeLoaded(workspaceId, dirPaths)` | 该工作区树成功加载后 | 该工作区的目录路径剔除 |
| `pruneAfterTabsKnown(tabIds)` | 标签列表水合后 | `byTabId` 条目剔除；空清单跳过 |

#### 3.5.2 主动剪枝（删除时）

**关键发现：全部工作区移除入口已收敛到单一函数** —— 文件面板（`useFilesPanelProps.ts:182`）、变更面板（`useChangesPanelProps.ts:96`）、浏览器面板（`useBrowserMenuActions.ts:15`）、GitHub 树（`GitHubTreeEntry.tsx:97`）、终端面板（`features/terminal/TerminalPanel.tsx:174`），均调用 `removeWorkspaceFromSidebar`（`browserCleanupActions.ts:82-95`）→ `cleanupRemovedWorkspaceTree`（`:20-72`）。

因此**无需枚举 UI 入口**，只需挂一个点，并把清理逻辑从"**逐个列举**要清哪个 slice"改为"**遍历登记表中所有 `scope: 'byWorkspaceId'` 的条目统一剔除**"：

| | 现在 | 改后 |
|---|---|---|
| 清理方式 | 手写列举 `browserTabs` / `browserTabFolders` / `browserWorkspaceExpanded` / `browserWorkspaceBookmarks` | 按声明统一处理 |
| 终端面板 | **漏掉**（无人清理） | 自动覆盖 |
| 以后新增面板 | 容易被忘 | 不可能忘 |
| 磁盘写入 | 直接 `setItem` 5 次（`browserCleanupActions.ts:37-47`） | 走 `persist` 通道 |

**目录级**：

- 删除目录（`deleteWorkspaceFile` → `workspaceActions.ts:157`）：剔除该路径**及其所有子路径**的展开记录（前缀匹配）。
- 重命名后的重映射（`workspaceActions.ts:106-126`）：由裸 `set()` 改为走统一通道（**修复 B3**）。

**剪枝结果的落盘策略**：不单独写盘（避免启动时产生额外写入），仅标记 dirty，交由下一次真实写入或关窗 flush 一并落盘。

#### 3.5.3 启动清理（替代迁移代码）

启动时删除**不在登记表内**的 `adl:` 前缀键，用于清除旧命名空间遗留与 schema 变更后的残骸。

**前置调查（必须最先执行，非实现细节）**：先做一次现有键全量盘点，确认没有其他子系统共用相同前缀，否则会误删。盘点结果需回填本设计文档。

### 3.6 会话恢复（决策：包含）

恢复内容与降级策略：

| 项 | 存储 | 失效处理 |
|---|---|---|
| 上次打开的文件（路径 + 工作区） | 登记表 | 文件已删除/改名/工作区已移除/权限不足 → 编辑器停在空态 + 显示一条**非模态** i18n 提示（形如"上次打开的文件已不存在"），打开任何文件即消失（遵守"提示不得常驻"规则） |
| 滚动偏移 | 登记表（仅数值） | 越界则钳制到末尾 |
| 折叠区间 | 登记表（仅数值区间） | 无效区间整段忽略 |

**实现约束**：CodeMirror 的 `EditorState` 是活对象，**不可直接序列化落盘**。现有 `editorStateCache.ts:4-6` 为纯内存缓存（`Map` + 5 分钟 TTL + 上限 20 条），仅本次运行内跨文件切换有效、**跨重启不复原**。因此会话恢复**只落"文件路径 + 滚动偏移 + 折叠区间"三个小数值**，启动后重建，复用 `getSavedEditorState` / `saveEditorState` 的调用位置但不复用其内存结构作为持久层。

### 3.7 全量覆盖清单

> "全量"= 除大对象（终端历史索引等）外，四面板所有影响用户可见形态的状态均纳入。

| 面板 | 新增持久化 | 修复 |
|---|---|---|
| 文件 | 树选中节点（路径 + 工作区）、大纲展开项、检索开关（Aa / ab / .*）、目录展开的 `manualCollapsed` | 工作区级展开接线（A）；目录展开接统一通道（B1/B3）；`filePreviewModeByPath` 补工作区维度（C6） |
| 变更 | 工作区级展开态、状态过滤器（已暂存/已修改/未跟踪）、大纲展开项、行号 / 自动换行 | 工作区级展开接线（A）；目录展开改按工作区隔离（C6） |
| 浏览器 | 导航子视图模式（打开页/标签/列表/检索）、导航检索词与范围、树选中项、每标签缩放、三个大类区可折叠 | 移除无消费者的 `browserWorkspaceExpanded`（D）；tab 树展开接入统一通道 |
| 终端 | 每标签视图偏好（单列/双列、历史优先、比例）从**全局**改为**按标签** | 工作区删除时的清理（C7，由 §3.5.2 统一机制自动补上） |
| 跨面板 | — | 键命名空间收敛（C3）；同键冲突拆分（C4）；重复定义归并（C5）；`pagehide` 兜底（C8）；陈旧注释修正（C9） |

---

## 4. 清理清单（死代码 / 死状态 / 重复定义）

| 项 | 位置 | 处置 |
|---|---|---|
| `setWorkspaceTreeExpandedInFileNav` / `setWorkspaceChangesExpanded` | `workspaceSlice.ts:163-171` | **不删除**：改造为经 `persist` 写入，成为工作区级展开态的**唯一写入口**（同时消解根因 A） |
| `workspaceSlice.ts:20-45` 私有去抖写入表 | 同 | **删除**，改用共享通道（C1） |
| `browserWorkspaceExpanded` + 其 key 写入 | `browserFoldersSlice.ts:67,269`、`browserSlice.ts:92,181`、`browserCleanupActions.ts:39-42` | **删除**（无消费者） |
| `browserPersisted` / `browserWorkspaceId` / `setBrowserPersisted` / `setBrowserWorkspaceId` | `browserSlice.ts:207-208,227-228,316-318`；selectors `browserSelectors.ts:14-18` | **删除**（无生产调用点） |
| `terminalPersisted` / `setTerminalPersisted` | `terminalSlice.ts:174,211,406` | **删除**（无生产调用点） |
| `collapseAllFileTreePaths` | `uiSliceExpansion.ts:102-107`、`uiSliceTypes.ts:131` | **删除**（无调用点）。`collapseAllChangesTreePaths` **保留**（有调用点） |
| `SESSION_TABS_EXPANDED_KEY` | `uiSliceTypes.ts:34`、`uiSlice.ts:74` | **删除**（仅再导出，无读写点） |
| `navigatorCollapsedByTool` / `browserNavigatorWidth` / `setBrowserNavigatorWidth` 的重复定义 | uiSlice 与 `browserSlice.ts`、`terminalSlice.ts` | **归并为单一归属**（C5） |
| `BROWSER_NAVIGATOR_COLLAPSED_KEY` 与终端共用同键 | `constants.ts:1`、`terminalSliceTypes.ts:28` | **按工具拆分键**或统一为中性常量并明确唯一归属（C4） |
| `generalActions.ts:66-70` 陈旧注释 | 同 | 修正为与实现一致（C9） |

> 注：删除范围以本表为界，**不扩大到**与持久化无关的清理，避免范围蔓延。

---

## 5. 错误处理与降级

| 场景 | 处理 | 理由 |
|---|---|---|
| 本地存储不可用（隐私模式 / 被禁用） | `hydrateAll()` 整体降级为"全部返回 fallback"，**绝不抛错、绝不阻塞启动** | UI 形态丢失不影响可用性；启动失败不可接受 |
| 写入配额超限 | 丢弃本次写入 + **首次**失败 warn 一次，**绝不重试、绝不清理其他键** | UI 形态丢失可接受；删除别处数据不可接受 |
| JSON 解析失败 / 形状不合法 | 退回 `fallback`，并把该键列入 `dirtyKeys`，在启动清理阶段**立即删除**（不留待下次写入，避免坏数据长期驻留） | 自愈，无需人工干预 |
| schema 变更 | 换键名或加版本段，旧键由启动清理删除，**不写任何读旧格式的代码** | 遵守项目禁止项 |
| 恢复文件失效 | 非模态提示 + 空态，打开任何文件即消失 | 遵守"提示不得常驻"规则 |
| 滚动偏移越界 | 钳制到末尾 | 绝不抛错 |
| 剪枝剪掉正在展开的路径 | 前端按"未记录 = 折叠"处理，不加分支 | 避免为极端情况增加复杂度 |

---

## 6. 前置验证项

| # | 验证项 | 不通过的后果 |
|---|---|---|
| V1 | **实测确认 Tauri 桌面模式下本地存储跨重启持久**（浏览器模式已知可用） | 若不持久，则本设计整体需改走 SQLite / 配置文件；该项也是"用户报告现象"尚未被代码证据排除的唯一假设 |
| V2 | 现有 `adl:` 前缀键全量盘点，确认无第三方子系统共用前缀 | 否则启动清理会误删；盘点结果需回填本文档 §3.5.3 |
| V3 | 确认 `WorkspaceTreeNode` 树确为一次性完整返回（无懒加载子节点） | 否则 §3.5.1 的目录剪枝会误删有效数据 |

---

## 7. 测试策略与验收标准

### 7.1 测试分层

1. **登记表自检（新增能力，方案 A 的核心收益）** —— 遍历登记表断言：
   - 键名全部符合 `adl:` 规范且唯一；
   - 每条均有 `fallback` 与合法 `scope`；
   - 声明同步读的条目**单条序列化体积 ≤ 32 KB**（防止日后有人把大对象塞进同步读）；
   - 每条 `byWorkspaceId` 条目在传入"工作区已不存在"上下文时 `prune` 确实返回 `changed: true`。
   > 这类测试**在无中心登记表时无法写出**，是选择方案 A 而非"分散式工厂"的直接理由。
2. **单元测试（纯函数，无 DOM）** —— `hydrateAll` 在"无数据 / 坏 JSON / 形状不合法 / 存储抛错"四种输入下的降级；§3.1.2 的三条状态转移规则；剪枝的三个**关键负例**：①工作区清单为空时必须跳过（R7）②树未加载时必须跳过（R2）③树加载失败时必须跳过；路径前缀匹配；滚动偏移越界钳制。
3. **红绿测试（TDD，符合项目强制测试规范）** —— 先写会失败的测试再实现：
   - "重启后工作区级展开态应当保留" → 对应现象 1；
   - "手动折叠的目录在打开其内部文件后仍保持折叠" → 对应现象 2；
   - 因改为同步读，"未水合即写盘"的测试形态变为断言"写入结果 = 读入值 + 本次改动"，而非断言空对象。
4. **双端一致性验证（项目硬性要求）** —— Tauri 桌面模式与浏览器模式各执行"关窗 → 重启 → 四面板状态还原"，并确认两端行为一致。

### 7.2 验收标准

1. 重启后四面板的**面板级 / 工作区级 / 目录级**状态全部与原状态一致。
2. 手动折叠过的目录在打开其内部文件后**不会**自行展开，仅有一次闪烁提示。
3. 变更面板的目录展开在多工作区下不再串味。
4. 删除工作区后，存储中不再残留该工作区的任何 `byWorkspaceId` 键（**含终端面板**）。
5. 关窗瞬间的最后一次改动不丢失。
6. **故意删掉登记表任意一条 → 编译期或自检测试报错**（证明声明式约束真实生效）。
7. 全部新增 / 修改代码均有对应测试，前端测试全绿，无遗留调试日志。
8. Tauri 与浏览器两端行为一致（§7.1.4）。

---

## 8. 风险与注意事项

| # | 风险 | 缓解 |
|---|---|---|
| R1 | 启动清理误删非本机制的 `adl:` 键 | V2 前置盘点；清理范围限定为被管理域前缀 |
| R2 | 目录级剪枝误删"尚未加载"的有效展开态 | §3.5.1 的"仅在该工作区树成功加载后剪枝，失败则跳过"约束；配套关键负例测试 |
| R3 | 同步读引入启动开销 | §3.3 第 3 条的准入线 + 登记表自检的体积阈值测试 |
| R4 | 一次性迁移 20+ 个键，改动面大 | 中心登记表先行落地并跑通自检测试，再按面板逐个迁移；每迁移一个面板跑一次红绿测试 |
| R5 | 每标签视图偏好由全局改按标签，可能改变用户既有观感 | 首次升级后按"无记录则继承全局默认"处理，避免出现"全部标签都是默认值"的突兀感 |
| R6 | `manualCollapsed` 标记长期累积 | 随剪枝一并清理已不存在、以及已处于展开态的项 |
| R7 | **在 store 构造期按工作区存在性剪枝 → 参照清单为空 → 误删全部按工作区隔离的状态**（本设计最危险陷阱） | §3.5.1 首要安全规则：剪枝与"参照清单就绪"绑定；四个剪枝入口职责互斥；配套"空清单必须跳过"的负例测试 |

---

## 9. 影响文件清单（预估）

**新增**

- `frontend/src/app/stores/persisted/registry.ts` — 登记表（唯一事实来源）
- `frontend/src/app/stores/persisted/index.ts` — `hydrateAll` / `persist` 两个入口
- `frontend/src/app/stores/persisted/prune.ts` — 剪枝纯函数
- `frontend/src/app/stores/persisted/__tests__/` — 登记表自检 + 剪枝单元测试

**主要修改**

- `stores/storageHelpers.ts` — 收敛为共享去抖通道；补充 `pagehide` 兜底入口
- `stores/slices/uiSlice.ts` / `uiSliceTypes.ts` / `uiSliceExpansion.ts` / `uiSliceWidths.ts` — 接入登记表；`manualCollapsed`；删除无调用点项
- `stores/slices/workspaceSlice.ts` — 删除私有去抖；工作区级展开态接入唯一写入口
- `stores/actions/workspaceTreeActions.ts` / `gitFileOpsActions.ts` — 裸 `set()` 改为走唯一写入口
- `stores/actions/workspaceActions.ts` — 重命名重映射（B3）与删除目录的前缀剔除
- `stores/actions/browserCleanupActions.ts` — 清理改为遍历登记表 `byWorkspaceId` 条目
- `stores/slices/browserFoldersSlice.ts` / `browserSlice.ts` / `browserSelectors.ts` / `terminalSlice.ts` — 删除死状态、归并重复定义、接入登记表
- `stores/slices/searchSlice.ts` — 前缀收敛 + 按工作区隔离
- `regions/right-panel/FileNavigatorShell.tsx` — 消费 `expandFileTreePathChain` 返回值触发闪烁；大纲展开接入
- `regions/right-panel/panels/ChangesPanel/**` — 状态过滤器、大纲展开、行号/换行接入；目录展开按工作区隔离
- `features/browser/**`、`features/terminal/**` — 子面板状态接入
- `i18n/zh-CN/*`、`i18n/en-US/*` — 会话恢复失效提示等新增文案
- `stores/actions/generalActions.ts` — 修正陈旧注释

---

## 10. 后续独立子项目（本次不做，登记备查）

| # | 事项 | 说明 |
|---|---|---|
| F1 | 终端历史索引等大对象的持久化收纳 | 受 §3.3 同步读准入线限制，登记但标注 `sync: false`，读取继续走按需路径；如需将其纳入构造期同步读须另行设计 |
| F2 | 面板状态跨设备同步 | 当前为本地存储，无跨设备诉求 |
| F3 | 乙类（外部微型存储）条目的引用剪枝 | `regionCollapse` / `cwdByTab` / `historyIndex` 三条按标签键的孤儿清理：`cwd` 与 `historyIndex` 的消费方已有自清理，`regionCollapse` 尚缺。延期至计划 Task 15 一并接线（见该任务注记），本次不在 Task 10 声明无人能执行的 `prune` |
