# Right Panel UI State Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让右侧四面板（文件 / 变更 / 浏览器 / 终端）及其子面板的 UI 状态在应用重启后完整还原，并建立统一的持久化基础设施。

**Architecture:** 一份中心登记表（`stores/persisted/registry.ts`）作为"有哪些状态要持久化、键名、作用域、默认值、读校验、剪枝规则"的唯一事实来源；`hydrateAll()` 在 store 构造期**同步**读盘生成初始状态补丁；`persist()` 是唯一写盘通道（复用 `storageHelpers` 的共享去抖并自动注册关窗 flush）；引用类剪枝按"参照清单是否就绪"分四个入口触发，参照清单为空时一律跳过。

**Tech Stack:** React 19 + TypeScript + Zustand（分片 store）+ Vitest（jsdom）+ Vite。持久化载体为本机浏览器存储，不新增 IPC。

**Spec:** `docs/superpowers/specs/2026-09-20-right-panel-state-persistence-design.md`

## Global Constraints

- **禁止**添加或保留任何数据格式兼容 / 旧版本迁移代码。schema 变更一律"换键名或加版本段 + 启动清理旧键"，不写读取旧格式的代码。
- **唯一写盘通道**：所有 UI 状态写入必须经 `persist()`。**禁止**任何 slice 自建去抖写入器、**禁止**直接调用 `localStorage.setItem`。
- **唯一水合时机**：`hydrateAll()` 在 store 构造期同步执行一次。**禁止**新增第二个异步水合路径（不得使用 `requestIdleCallback` / `setTimeout` 延迟水合）。
- **同步读准入线**：登记表中声明同步读的条目，**单条序列化体积 ≤ 32 KB**。大对象（终端历史索引、浏览器下载列表等）**必须显式标注 `sync: false`**：仍进登记表（获得键名规范 / 校验 / 剪枝 / 统一写通道），但既不产出 store 补丁、也不调用 `apply`；读取沿用各自既有的按需路径。
- **条目归宿规则**：每条登记的 `field` 与 `apply` **恰有其一**（由 `registrySelfCheck.test.ts` 强制）。甲类 `field: keyof StoreState` 用于住在 store 里的状态；乙类 `apply: (value) => void` 用于住在模块级微型存储里的状态（如 `features/terminal/` 下的四个 `load()/save()` 模块）。**禁止**为了填 `field` 而把大对象或高频对象搬进 Zustand store —— 那会与同步读准入线及渲染性能冲突。
- **剪枝安全规则**：剪枝必须与"参照清单是否就绪"绑定；参照清单为空（工作区列表为空 / 标签列表为空 / 该工作区树未加载或加载失败）时**一律跳过**。
- **启动清理安全规则（约束每个任务）**：`cleanupUnregisteredKeys()` 会删除所有不在 registry 内的 `adl:` 键。迁移分批进行期间，**每个迁移任务（Task 7/9/10/11/29）必须把它刚登记的键从 `PERSIST_KEEP_KEYS` 中删除**，并保证"任何遗留键字面量要么已登记、要么在清单内"。这两条不变量由 `persisted/__tests__/keepListGuard.test.ts` 强制；该测试变红即表示有键会被启动清理误删，或清单存在冗余。`PERSIST_KEEP_KEYS` 只在 `persisted/registry.ts` 中定义一次并导出，store 与测试都从那里 import。
- **键名规范**：`adl:<域>.<名称>`，域取值 `ui|files|changes|browser|terminal|search|session`；需要变更 schema 时加版本段 `adl:<域>.<名称>.v<N>`。
- **双端一致**：所有功能必须在 Tauri 桌面模式与浏览器模式行为一致。本计划不新增 IPC 方法，`tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts` 无需改动。
- **i18n**：任何新增 UI 展示文本（含提示、aria-label、按钮 title）必须使用 i18n key，`zh-CN` 与 `en-US` 两份都要加；完成后跑 `pnpm --dir frontend run check:i18n`。
- **禁止项（来自 `AGENTS.md`）**：不得留下调试日志（`console.log` / `[ADL-DEBUG]`）；错误/状态提示不得常驻，仅在活跃错误状态下可见。
- **提交规范**：Conventional Commit，`type(scope): summary`，scope 取 `stores`/`frontend`/`ipc`/`docs` 等；分支名 kebab-case、最多 3 词、无斜杠、无类型前缀。
- **测试规范**：TDD 红绿；每个任务结束前必须跑通该任务的测试；不得跳过。
- **命令（工作目录 `ai-digital-life/`）**：
  - 单文件测试：`pnpm --dir frontend exec vitest run <相对 frontend 的路径>`
  - 全量测试：`pnpm frontend:test`
  - 类型检查：`pnpm frontend:typecheck`
  - Lint：`pnpm frontend:lint`
  - i18n 覆盖检查：`pnpm --dir frontend run check:i18n`
  - 桌面模式启动：`pnpm dev:tauri`；浏览器模式启动：`pnpm dev:browser`
  - 全量门禁：`pnpm check:all`

## File Structure

**新增（全部在 `frontend/src/app/stores/persisted/`）**

| 文件 | 职责 |
|---|---|
| `entry.ts` | 条目类型、键名解析与校验、`defineEntry` 工厂。**唯一**定义"一条持久化状态长什么样"的地方 |
| `registry.ts` | 中心登记表：逐条声明键名 / 字段 / 作用域 / 默认值 / 读校验 / 剪枝规则。**唯一事实来源** |
| `persist.ts` | `persist()` —— 唯一写盘通道 |
| `hydrate.ts` | `hydrateAll()` —— store 构造期同步读盘，产出初始状态补丁 |
| `prune.ts` | 剪枝纯函数 + `pruneRegistry(ctx)` 编排（被四个触发入口共用） |
| `cleanup.ts` | 启动清理：删除不在登记表内的 `adl:` 前缀键 |
| `apply.ts` | 装配层：把补丁转成 store 的 `set` 调用、把状态变化转成 `persist` 调用的桥接工具（供各 slice 使用，避免每个 slice 重复样板） |
| `__tests__/entry.test.ts` | 键名解析 / 校验 / `defineEntry` |
| `__tests__/persist.test.ts` | 唯一写通道行为（去抖合并、flush 落盘） |
| `__tests__/hydrate.test.ts` | 四种降级输入（无数据 / 坏 JSON / 形状不合法 / 存储抛错） |
| `__tests__/prune.test.ts` | 剪枝三个关键负例 + 路径前缀剔除 |
| `__tests__/registrySelfCheck.test.ts` | 登记表自检（键名规范、scope 合法、体积上限、field 唯一、prune 有效性） |
| `__tests__/helpers.ts` | 测试辅助：`stubStorage()`、`expectPersistsAcrossRestart()` |

**主要修改**

| 文件 | 改动 |
|---|---|
| `stores/slicedStore.ts` | 装配 `hydrateAll()` + 启动清理（紧随 store 创建，与既有 `hydrateGitHubRepoSlice` 同一位置） |
| `stores/storageHelpers.ts` | 写入失败 warn 收敛为"仅首次"；导出 `PERSIST_KEY_PREFIX` |
| `stores/slices/uiSlice.ts` | 删除 `hydrateUIDefaults` 的 idle 延迟水合；写盘改走 `persist` |
| `stores/slices/uiSliceExpansion.ts` | `DirExpansion` 结构、`manualCollapsed`、三条转移规则；三条写盘改走 `persist` |
| `stores/slices/workspaceSlice.ts` | 删除私有去抖（:20-45）；工作区级展开态接入唯一写入口；`setRecentWorkspaces` 内触发剪枝 |
| `stores/actions/workspaceTreeActions.ts` | 裸 `set()` 改为经唯一写入口；树加载成功后触发目录剪枝 |
| `stores/actions/gitFileOpsActions.ts` | 同上（变更面板） |
| `stores/actions/browserCleanupActions.ts` | 清理改为遍历登记表 `byWorkspaceId` 条目 |
| `stores/actions/workspaceActions.ts` | 删除目录 / 重命名重映射改走统一通道 + 路径前缀剔除 |
| `stores/slices/browserFoldersSlice.ts`、`browserSlice.ts`、`browserSelectors.ts`、`terminalSlice.ts`、`searchSlice.ts` | 死状态删除、重复定义归并、接入登记表 |
| `regions/right-panel/FileNavigatorShell.tsx` | 消费 `expandFileTreePathChain` 的 `blocked` 返回值触发闪烁；大纲展开接入 |
| `regions/right-panel/panels/ChangesPanel/**` | 状态过滤器 / 大纲展开 / 行号换行接入；目录展开按工作区隔离 |
| `features/browser/**`、`features/terminal/**` | 子面板状态接入 |
| `i18n/zh-CN/*`、`i18n/en-US/*` | 会话恢复失效提示文案 |
| `styles/**` | 折叠提示的脉冲动画 |

---

## Task 1: 前置验证（阻塞后续所有任务）

**Files:**
- Read: `docs/superpowers/specs/2026-09-20-right-panel-state-persistence-design.md` §6
- Modify: `docs/superpowers/specs/2026-09-20-right-panel-state-persistence-design.md:§3.5.3、§6`

**Interfaces:**
- Consumes: 无
- Produces: 三项验证结论（V1 本地存储跨重启持久性、V2 `adl:` 前缀键全量盘点、V3 工作区树完整返回）。**若 V1 不成立，本计划整体作废，须改走 SQLite / 配置文件，立即停止并上报。**

- [ ] **Step 1: V1 —— 验证 Tauri 桌面模式下本地存储跨重启持久**

启动桌面模式：

```bash
cd ai-digital-life && pnpm dev:tauri
```

在应用窗口的开发者控制台执行：

```js
localStorage.setItem('adl:__v1_probe', JSON.stringify({ at: Date.now() }));
localStorage.getItem('adl:__v1_probe');
```

完全关闭应用（确认进程退出），重新 `pnpm dev:tauri`，在新窗口控制台执行：

```js
localStorage.getItem('adl:__v1_probe');
```

Expected: 第二次能读到第一次写入的 JSON 值（非 `null`）。读到 `null` → **V1 不通过**，停止本计划并上报，附带这次实测记录。

- [ ] **Step 2: V1 清理**

```js
localStorage.removeItem('adl:__v1_probe');
```

- [ ] **Step 3: V2 —— 全量盘点现有 `adl` 前缀键**

在同一个控制台执行：

```js
const keys = Object.keys(localStorage).filter((k) => k.startsWith('adl'));
console.table(keys.map((k) => ({ key: k, bytes: (localStorage.getItem(k) || '').length })));
```

Expected: 得到一份键名与体积清单。把清单**原样回填**到规格文档 §3.5.3 的"启动清理前置盘点"处，并逐条确认：这些键是否全部属于本次要接管的 UI 状态域（`ui`/`files`/`changes`/`browser`/`terminal`/`search`/`session`）。

若出现不属于上述域、但同样以 `adl` 开头的键 → 在规格文档中登记为例外清单，并在 Task 21 中把例外加入 `cleanupUnregisteredKeys({ keep })` 允许保留的集合。

- [ ] **Step 4: V3 —— 复核工作区树为一次性完整返回**

```bash
cd ai-digital-life && grep -n -A 6 "listTreeForWorkspace" frontend/src/shared/ipc/workspace.ts
```

Expected: 签名为 `(workspacePath, options?: { force?: boolean }) => Promise<IpcResult<WorkspaceTreeNode[]>>`，且 `WorkspaceTreeNode` 含 `children: WorkspaceTreeNode[]`（`frontend/src/kernel/types-workspace-files.ts:111-116`）。确认无分页 / 无"按需加载子节点"的第二个方法。

若发现存在按需加载子节点的方法 → 规格 §3.5.1 的"目录剪枝仅在树加载后执行"不足以保证安全，须回到规格修订。

- [ ] **Step 5: 回填规格文档并提交**

把 V1/V2/V3 的实测结果（含键清单与体积）写入规格文档 §6 的"验证结果"小节，然后：

```bash
cd E:/AI-DIGITAL-LIFE/SourceWorkspace
git add docs/superpowers/specs/2026-09-20-right-panel-state-persistence-design.md
git commit -m "docs(right-panel): record persistence prerequisite verification results"
```

---

## Task 2: 登记表与唯一写通道

**Files:**
- Create: `frontend/src/app/stores/persisted/entry.ts`
- Create: `frontend/src/app/stores/persisted/registry.ts`
- Create: `frontend/src/app/stores/persisted/persist.ts`
- Create: `frontend/src/app/stores/persisted/__tests__/entry.test.ts`
- Create: `frontend/src/app/stores/persisted/__tests__/persist.test.ts`
- Modify: `frontend/src/app/stores/storageHelpers.ts`（写入失败 warn 收敛为仅首次）

**Interfaces:**
- Consumes: `stores/storageHelpers.ts` 的 `scheduleCrossSliceWrite`、`flushCrossSliceWrites`、`readJson`
- Produces:
  - `type PersistScope = 'global' | 'byWorkspaceId' | 'byTabId'`
  - `type PruneCtx = { workspaceIds: ReadonlySet<string>; loadedDirPaths: ReadonlyMap<string, ReadonlySet<string>>; tabIds: ReadonlySet<string> }`
  - `type PruneResult<T> = { value: T; changed: boolean }`
  - `type PersistEntry<T> = { key: string; field: keyof StoreState; fallback: T; scope: PersistScope; read?: (raw: unknown) => T | undefined; prune?: (value: T, ctx: PruneCtx) => PruneResult<T>; sync?: boolean }`
  - `function defineEntry<T>(entry: PersistEntry<T>): PersistEntry<T>`
  - `function parsePersistKey(key: string): { domain: PersistDomain; name: string; version: number } | null`
  - `const registry: Record<string, PersistEntry<never>>`（后续任务逐条追加；本任务先放入 `adl:files.workspaceExpanded`）
  - `type RegistryKey = keyof typeof registry`、`type RegistryValue<K extends RegistryKey>`
  - `function persist<K extends RegistryKey>(key: K, value: RegistryValue<K>): void`

- [ ] **Step 1: 写失败测试（键名解析）**

创建 `frontend/src/app/stores/persisted/__tests__/entry.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { defineEntry, parsePersistKey } from '../entry';

describe('parsePersistKey', () => {
  it('parses a plain domain.name key with default version 1', () => {
    expect(parsePersistKey('adl:files.workspaceExpanded')).toEqual({
      domain: 'files',
      name: 'workspaceExpanded',
      version: 1,
    });
  });

  it('parses an explicit version segment', () => {
    expect(parsePersistKey('adl:files.workspaceExpanded.v2')).toEqual({
      domain: 'files',
      name: 'workspaceExpanded',
      version: 2,
    });
  });

  it('rejects an unknown domain', () => {
    expect(parsePersistKey('adl:unknown.thing')).toBeNull();
  });

  it('rejects legacy prefixes', () => {
    expect(parsePersistKey('adl-ui:file-tree-expanded')).toBeNull();
    expect(parsePersistKey('adl-terminal:cwd-by-tab')).toBeNull();
  });

  it('rejects a lowercase-starting name', () => {
    expect(parsePersistKey('adl:files.lowercase')).toBeNull();
  });
});

describe('defineEntry', () => {
  it('returns the entry unchanged so the registry stays declarative', () => {
    const entry = defineEntry<Record<string, boolean>>({
      key: 'adl:files.workspaceExpanded',
      field: 'workspaceTreeExpandedInFileNav',
      fallback: {},
      scope: 'byWorkspaceId',
    });
    expect(entry.scope).toBe('byWorkspaceId');
    expect(entry.sync).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/entry.test.ts
```

Expected: FAIL —— `Failed to resolve import "../entry"`。

- [ ] **Step 3: 实现 `entry.ts`**

```ts
import type { StoreState } from '../StoreState';

export type PersistScope = 'global' | 'byWorkspaceId' | 'byTabId';

export const PERSIST_DOMAINS = [
  'ui',
  'files',
  'changes',
  'browser',
  'terminal',
  'search',
  'session',
] as const;

export type PersistDomain = (typeof PERSIST_DOMAINS)[number];

// 名称段：单个以字母开头的字母数字 token（camelCase / PascalCase / 单词皆可）。
// 目的：与遗留前缀的 kebab-case 名称（adl-ui:file-tree-expanded）划清界限，
// 同时拒绝空段、数字开头、下划线/连字符/点号混入。
//
// 修订史（重要，避免再次互相矛盾）：
//  - 初稿为 `[A-Za-z][A-Za-z0-9]*`（允许全小写单词）。
//  - Task 2 实现时，因本任务自带用例要求 `adl:files.lowercase` 返回 null，
//    被收紧为"至少含一个大写字母" —— 该用例本身是武断的，且**与后续
//    Task 9 键表逐字要求的全小写单词名（adl:browser.tabs / history /
//    bookmarks / shortcuts）互斥**。
//  - Task 9 裁定：恢复为初稿正则，并把那条武断用例替换为三条真正可失败的反例
//    （kebab-case / snake_case / 数字开头）。
const KEY_PATTERN =
  /^adl:(?<domain>[a-z]+)\.(?<name>[A-Za-z][A-Za-z0-9]*)(?:\.v(?<version>[0-9]+))?$/;

export type ParsedPersistKey = {
  domain: PersistDomain;
  name: string;
  version: number;
};

export function isPersistDomain(value: string): value is PersistDomain {
  return (PERSIST_DOMAINS as readonly string[]).includes(value);
}

export function parsePersistKey(key: string): ParsedPersistKey | null {
  const matched = KEY_PATTERN.exec(key);
  const groups = matched?.groups;
  if (!groups) {
    return null;
  }
  const domain = groups.domain;
  if (!isPersistDomain(domain)) {
    return null;
  }
  return {
    domain,
    name: groups.name,
    version: groups.version ? Number(groups.version) : 1,
  };
}

/**
 * 剪枝参照清单。
 *
 * 安全不变量：任何一个字段为空集合/空表时，对应的剪枝必须跳过 ——
 * 详见规格 §3.5.1 首要安全规则（在 store 构造期工作区列表尚为空，
 * 此时按存在性剪枝会误删全部按工作区隔离的状态）。
 */
export type PruneCtx = {
  /** 当前实际存在的工作区 id */
  workspaceIds: ReadonlySet<string>;
  /** 已成功加载过目录树的工作区 → 该工作区的目录相对路径全集；未加载/加载失败的工作区不在表内 */
  loadedDirPaths: ReadonlyMap<string, ReadonlySet<string>>;
  /** 当前实际存在的标签 id */
  tabIds: ReadonlySet<string>;
};

export type PruneResult<T> = { value: T; changed: boolean };

export type PersistEntry<T> = {
  /** 完整键名，须符合 PERSIST_KEY_PATTERN 且全域唯一 */
  key: string;
  /** 水合后写入的 store 字段名。全局唯一 —— 同一字段不得由两条键声明（结构性防止重复定义） */
  field: keyof StoreState;
  /** 无数据 / 解析失败时的兜底值 */
  fallback: T;
  scope: PersistScope;
  /** 形状与取值校验；返回 undefined 表示不合法，将退回 fallback */
  read?: (raw: unknown) => T | undefined;
  /** 引用是否仍存在；参照清单为空时必须返回 { value, changed: false } */
  prune?: (value: T, ctx: PruneCtx) => PruneResult<T>;
  /** 是否允许构造期同步读取；默认 true（大对象必须显式设为 false） */
  sync?: boolean;
};

export function defineEntry<T>(entry: PersistEntry<T>): PersistEntry<T> {
  return entry;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/entry.test.ts
```

Expected: PASS（6 个用例全绿）。

- [ ] **Step 5: 写失败测试（唯一写通道）**

创建 `frontend/src/app/stores/persisted/__tests__/persist.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { persist } from '../persist';
import { flushCrossSliceWrites } from '@stores/storageHelpers';

describe('persist', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('coalesces the write instead of writing synchronously', () => {
    persist('adl:files.workspaceExpanded', { workspace_a: true });
    expect(localStorage.getItem('adl:files.workspaceExpanded')).toBeNull();
  });

  it('lands the value on flush', () => {
    persist('adl:files.workspaceExpanded', { workspace_a: true });
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem('adl:files.workspaceExpanded') ?? 'null')).toEqual({
      workspace_a: true,
    });
  });

  it('keeps only the last value for the same key within one flush window', () => {
    persist('adl:files.workspaceExpanded', { workspace_a: true });
    persist('adl:files.workspaceExpanded', { workspace_a: false });
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem('adl:files.workspaceExpanded') ?? 'null')).toEqual({
      workspace_a: false,
    });
  });
});
```

- [ ] **Step 6: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/persist.test.ts
```

Expected: FAIL —— `Failed to resolve import "../persist"`。

- [ ] **Step 7: 实现 `registry.ts` 与 `persist.ts`**

创建 `frontend/src/app/stores/persisted/registry.ts`：

```ts
import { defineEntry, type PersistEntry } from './entry';

/**
 * 中心登记表 —— 全局唯一事实来源。
 *
 * 规则：
 * 1. 键名必须符合 parsePersistKey 的规范，且全域唯一（对象字面量重复键在编译期报错）。
 * 2. field 必须全局唯一 —— 同一 store 字段不得由两条键声明。
 * 3. 声明同步读取的条目，单条序列化体积必须 ≤ 32 KB。
 * 以上三条由 __tests__/registrySelfCheck.test.ts 强制校验。
 */
export const registry = {
  'adl:files.workspaceExpanded': defineEntry<Record<string, boolean>>({
    key: 'adl:files.workspaceExpanded',
    field: 'workspaceTreeExpandedInFileNav',
    fallback: {},
    scope: 'byWorkspaceId',
  }),
} as const;

export type Registry = typeof registry;

export type RegistryKey = keyof Registry;

export type RegistryValue<K extends RegistryKey> =
  Registry[K] extends PersistEntry<infer T> ? T : never;

/** 供自检测试遍历用（registry 的 as const 类型对遍历不友好） */
export const registryEntries: PersistEntry<unknown>[] = Object.values(registry) as PersistEntry<
  unknown
>[];
```

创建 `frontend/src/app/stores/persisted/persist.ts`：

```ts
import { scheduleCrossSliceWrite } from '../storageHelpers';
import type { RegistryKey, RegistryValue } from './registry';

/**
 * 唯一的 UI 状态写盘入口。
 *
 * 硬性约束（见规格 §3.2.2）：
 * - 任何 slice 都不得自建去抖写入器，也不得直接调用 localStorage.setItem；
 * - 本函数复用 storageHelpers 的跨切片共享去抖调度器，因此自动被
 *   flushCrossSliceWrites() 覆盖（关窗/卸载时不会丢最后一次改动）；
 * - 写入失败（如配额超限）由 storageHelpers.writeJson 静默吞掉并仅首次告警，
 *   绝不重试、绝不清理其他键。
 */
export function persist<K extends RegistryKey>(key: K, value: RegistryValue<K>): void {
  scheduleCrossSliceWrite(key, value);
}
```

- [ ] **Step 8: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/persist.test.ts
```

Expected: PASS（3 个用例全绿）。

- [ ] **Step 9: 收敛写入失败告警为仅首次**

修改 `frontend/src/app/stores/storageHelpers.ts`：在 `writeJson` 内新增模块级 `let writeFailureWarned = false;`，仅当 `writeFailureWarned === false` 时 `console.warn` 并置为 `true`；`readJson` 维持每次告警（读取失败不刷屏，且多为配置错误，需要每次可见）。

```ts
let writeFailureWarned = false;

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (!writeFailureWarned) {
      writeFailureWarned = true;
      console.warn('storageHelpers.writeJson failed (further write failures suppressed):', err);
    }
  }
}

/** 仅供测试重置"仅首次告警"标记 */
export function resetWriteFailureWarning(): void {
  writeFailureWarned = false;
}
```

同时更新 `storageHelpers.test.ts` 中依赖"每次写入失败都告警"的既有用例：在用例的 `beforeEach` 里调用 `resetWriteFailureWarning()`，并新增一条用例断言"连续两次失败只告警一次"。

- [ ] **Step 10: 运行 storageHelpers 既有测试确认未破坏**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/storageHelpers.test.ts
```

Expected: PASS（含新用例）。

- [ ] **Step 11: 提交**

```bash
cd ai-digital-life
git add frontend/src/app/stores/persisted frontend/src/app/stores/storageHelpers.ts frontend/src/app/stores/storageHelpers.test.ts
git commit -m "feat(stores): add persisted-state registry and single write channel"
```

---

## Task 3: 同步水合 `hydrateAll`

**Files:**
- Create: `frontend/src/app/stores/persisted/hydrate.ts`
- Create: `frontend/src/app/stores/persisted/__tests__/hydrate.test.ts`

**Interfaces:**
- Consumes: `registry` / `registryEntries`（Task 2）、`readJson`（`stores/storageHelpers.ts`）
- Produces:
  - `type HydrationResult = { patch: Partial<StoreState>; dirtyKeys: string[] }`
  - `function hydrateAll(): HydrationResult` —— 幂等，模块级只执行一次实际读取
  - `function resetHydrationForTest(): void`

- [ ] **Step 1: 写失败测试（四种降级输入）**

创建 `frontend/src/app/stores/persisted/__tests__/hydrate.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hydrateAll, resetHydrationForTest } from '../hydrate';

const KEY = 'adl:files.workspaceExpanded';

describe('hydrateAll', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it('falls back when there is no stored value', () => {
    const { patch, dirtyKeys } = hydrateAll();
    expect(patch.workspaceTreeExpandedInFileNav).toEqual({});
    expect(dirtyKeys).toEqual([]);
  });

  it('returns the stored value when it is valid', () => {
    localStorage.setItem(KEY, JSON.stringify({ workspace_a: true }));
    const { patch, dirtyKeys } = hydrateAll();
    expect(patch.workspaceTreeExpandedInFileNav).toEqual({ workspace_a: true });
    expect(dirtyKeys).toEqual([]);
  });

  it('falls back and marks dirty on malformed JSON', () => {
    localStorage.setItem(KEY, '{not json');
    const { patch, dirtyKeys } = hydrateAll();
    expect(patch.workspaceTreeExpandedInFileNav).toEqual({});
    expect(dirtyKeys).toContain(KEY);
  });

  it('falls back and marks dirty when the reader rejects the shape', () => {
    localStorage.setItem(KEY, JSON.stringify({ workspace_a: 'yes' }));
    const { patch, dirtyKeys } = hydrateAll();
    expect(patch.workspaceTreeExpandedInFileNav).toEqual({});
    expect(dirtyKeys).toContain(KEY);
  });

  it('degrades to fallbacks when storage itself throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const { patch } = hydrateAll();
    expect(patch.workspaceTreeExpandedInFileNav).toEqual({});
  });

  it('only performs the actual read once (idempotent)', () => {
    localStorage.setItem(KEY, JSON.stringify({ workspace_a: true }));
    const first = hydrateAll();
    localStorage.setItem(KEY, JSON.stringify({ workspace_b: true }));
    const second = hydrateAll();
    expect(second).toEqual(first);
  });

  it('skips entries declared as non-sync', () => {
    // adl:terminal.historyIndex 等大对象在后续任务中以 sync: false 声明，
    // 本用例断言"同步补丁里不出现该字段"
    const { patch } = hydrateAll();
    expect(Object.keys(patch)).not.toContain('terminalHistoryIndex');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/hydrate.test.ts
```

Expected: FAIL —— `Failed to resolve import "../hydrate"`。

- [ ] **Step 3: 实现 `hydrate.ts`**

```ts
import type { StoreState } from '../StoreState';
import { readJson } from '../storageHelpers';
import { registryEntries } from './registry';

export type HydrationResult = {
  /** 直接可交给 useAppStore.setState 的初始状态补丁 */
  patch: Partial<StoreState>;
  /** 解析失败或形状不合法、需要在本轮启动中被覆盖的键 */
  dirtyKeys: string[];
};

let cached: HydrationResult | undefined;

/**
 * 只读存在性探针。必需：readJson(key, undefined) 对"键不存在"与"JSON 解析失败"
 * 返回同一个 undefined，若不区分则坏数据永远不会被标记为 dirty（Task 3 实测发现）。
 */
function hasStoredValue(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

/**
 * store 构造期同步执行一次的水合。
 *
 * 设计要点（规格 §3.3）：
 * - 全应用只有这一个水合时机，且是同步的 → 不存在"未水合即写盘"的竞态窗口，
 *   因此不需要 hydrated 守卫标志。
 * - 本函数**不做引用类剪枝**（工作区/目录/标签的存在性剪枝由 prune.ts 的四个
 *   入口在参照清单就绪后分别触发）。原因见规格 §3.5.1 首要安全规则。
 * - 单条读取失败只影响该条，整体降级为 fallback，绝不抛错、绝不阻塞启动。
 */
export function hydrateAll(): HydrationResult {
  if (cached) {
    return cached;
  }
  const patch: Record<string, unknown> = {};
  const dirtyKeys: string[] = [];

  for (const entry of registryEntries) {
    if (entry.sync === false) {
      continue;
    }
    const raw = readJson<unknown>(entry.key, undefined);
    // 本地存在性探针：readJson 把"键不存在"与"解析失败"都折叠成 undefined，
    // 因此单靠它无法区分"无数据"（无需标脏）与"坏数据"（需标脏并清理）。
    // 本探针只读、不写，不违反"唯一写盘通道"约束。
    if (!hasStoredValue(entry.key)) {
      patch[entry.field as string] = entry.fallback;
      continue;
    }
    if (!entry.read) {
      patch[entry.field as string] = raw;
      continue;
    }
    const parsed = entry.read(raw);
    if (parsed === undefined) {
      patch[entry.field as string] = entry.fallback;
      dirtyKeys.push(entry.key);
      continue;
    }
    patch[entry.field as string] = parsed;
  }

  cached = { patch: patch as Partial<StoreState>, dirtyKeys };
  return cached;
}

/** 仅供测试重置模块级缓存 */
export function resetHydrationForTest(): void {
  cached = undefined;
}
```

- [ ] **Step 4: 为 `adl:files.workspaceExpanded` 补上读校验**

修改 `registry.ts` 中该条目，加入 `read`（这是让 Step 1 的"形状不合法"用例通过的必要实现）：

```ts
  'adl:files.workspaceExpanded': defineEntry<Record<string, boolean>>({
    key: 'adl:files.workspaceExpanded',
    field: 'workspaceTreeExpandedInFileNav',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readBooleanRecord,
  }),
```

在 `entry.ts` 末尾新增共享校验器（供全表复用，避免各条目重复实现）：

```ts
/** 校验 Record<string, boolean>；键为字符串、值为布尔，否则整体判为不合法 */
export function readBooleanRecord(raw: unknown): Record<string, boolean> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'boolean') {
      return undefined;
    }
    result[key] = value;
  }
  return result;
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/hydrate.test.ts
```

Expected: PASS（7 个用例全绿）。

- [ ] **Step 6: 提交**

```bash
cd ai-digital-life
git add frontend/src/app/stores/persisted
git commit -m "feat(stores): add synchronous hydrateAll for persisted UI state"
```

---

## Task 4: 剪枝纯函数与编排（含三个关键负例）

**Files:**
- Create: `frontend/src/app/stores/persisted/prune.ts`
- Create: `frontend/src/app/stores/persisted/__tests__/prune.test.ts`

**Interfaces:**
- Consumes: `PruneCtx` / `PruneResult` / `PersistEntry`（Task 2）、`registryEntries`（Task 2）
- Produces:
  - `function pruneByWorkspaceId<T extends Record<string, unknown>>(value: T, ctx: PruneCtx): PruneResult<T>`
  - `function pruneDirPathsByWorkspace<T extends Record<string, Record<string, unknown>>>(value: T, ctx: PruneCtx): PruneResult<T>`
  - `function pruneByTabId<T extends Record<string, unknown>>(value: T, ctx: PruneCtx): PruneResult<T>`
  - `function prunePathPrefix<T extends Record<string, unknown>>(paths: T, removedPath: string): PruneResult<T>`
  - `function pruneRegistry(ctx: PruneCtx): PruneResult<Record<string, unknown>>` —— 遍历登记表中带 `prune` 的条目，返回 `{ field → 新值 }`

- [ ] **Step 1: 写失败测试（含三个关键负例）**

创建 `frontend/src/app/stores/persisted/__tests__/prune.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  pruneByWorkspaceId,
  pruneDirPathsByWorkspace,
  pruneByTabId,
  prunePathPrefix,
} from '../prune';
import type { PruneCtx } from '../entry';

function ctx(partial: Partial<PruneCtx> = {}): PruneCtx {
  return {
    workspaceIds: new Set<string>(),
    loadedDirPaths: new Map<string, ReadonlySet<string>>(),
    tabIds: new Set<string>(),
    ...partial,
  };
}

describe('pruneByWorkspaceId', () => {
  it('NEGATIVE: skips entirely when the workspace list is empty (R7)', () => {
    const value = { workspace_a: true, workspace_b: false };
    const result = pruneByWorkspaceId(value, ctx());
    expect(result.changed).toBe(false);
    expect(result.value).toEqual(value);
  });

  it('removes entries whose workspace no longer exists', () => {
    const result = pruneByWorkspaceId({ workspace_a: true, workspace_b: true }, ctx({
      workspaceIds: new Set(['workspace_a']),
    }));
    expect(result.changed).toBe(true);
    expect(result.value).toEqual({ workspace_a: true });
  });
});

describe('pruneDirPathsByWorkspace', () => {
  const value = {
    workspace_a: { src: true, 'src/legacy': false },
    workspace_b: { docs: true },
  };

  it('NEGATIVE: skips entirely when the workspace list is empty (R7)', () => {
    expect(pruneDirPathsByWorkspace(value, ctx()).changed).toBe(false);
  });

  it('NEGATIVE: keeps all directory paths when that workspace tree is not loaded (R2)', () => {
    const result = pruneDirPathsByWorkspace(
      value,
      ctx({ workspaceIds: new Set(['workspace_a', 'workspace_b']) }),
    );
    expect(result.changed).toBe(false);
    expect(result.value).toEqual(value);
  });

  it('NEGATIVE: keeps the workspace as-is when the tree load failed (not present in loadedDirPaths)', () => {
    const result = pruneDirPathsByWorkspace(
      value,
      ctx({ workspaceIds: new Set(['workspace_a']), loadedDirPaths: new Map() }),
    );
    expect(result.value.workspace_a).toEqual({ src: true, 'src/legacy': false });
  });

  it('drops only directories absent from the loaded tree', () => {
    const result = pruneDirPathsByWorkspace(
      value,
      ctx({
        workspaceIds: new Set(['workspace_a']),
        loadedDirPaths: new Map([['workspace_a', new Set(['src'])]]),
      }),
    );
    expect(result.changed).toBe(true);
    expect(result.value.workspace_a).toEqual({ src: true });
  });

  it('drops the whole workspace record when the workspace is gone', () => {
    const result = pruneDirPathsByWorkspace(value, ctx({
      workspaceIds: new Set(['workspace_a']),
      loadedDirPaths: new Map([['workspace_a', new Set(['src', 'src/legacy'])]]),
    }));
    expect(result.value.workspace_b).toBeUndefined();
  });
});

describe('pruneByTabId', () => {
  it('NEGATIVE: skips when the tab list is empty', () => {
    expect(pruneByTabId({ 'terminal-1': 12 }, ctx()).changed).toBe(false);
  });

  it('drops unknown tabs', () => {
    const result = pruneByTabId(
      { 'terminal-1': 12, 'terminal-2': 30 },
      ctx({ tabIds: new Set(['terminal-1']) }),
    );
    expect(result.value).toEqual({ 'terminal-1': 12 });
  });
});

describe('prunePathPrefix', () => {
  it('drops the path itself and every descendant', () => {
    const result = prunePathPrefix(
      { src: true, 'src/legacy': true, 'src/legacy/deep': true, docs: false },
      'src/legacy',
    );
    expect(result.changed).toBe(true);
    expect(result.value).toEqual({ src: true, docs: false });
  });

  it('does not drop sibling paths sharing a name prefix', () => {
    const result = prunePathPrefix({ 'src-legacy': true, src: true }, 'src');
    expect(result.value).toEqual({ 'src-legacy': true });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/prune.test.ts
```

Expected: FAIL —— `Failed to resolve import "../prune"`。

- [ ] **Step 3: 实现 `prune.ts`**

```ts
import type { PruneCtx, PruneResult } from './entry';
import { registryEntries } from './registry';

/**
 * 按工作区存在性剪枝。
 *
 * 安全不变量：workspaceIds 为空时**必须**跳过 —— store 构造期工作区列表尚未载入，
 * 此时剪枝会误删全部按工作区隔离的状态（规格 §3.5.1 首要安全规则 / 风险 R7）。
 */
export function pruneByWorkspaceId<T extends Record<string, unknown>>(
  value: T,
  ctx: PruneCtx,
): PruneResult<T> {
  if (ctx.workspaceIds.size === 0) {
    return { value, changed: false };
  }
  const next: Record<string, unknown> = {};
  let changed = false;
  for (const [workspaceId, entryValue] of Object.entries(value)) {
    if (ctx.workspaceIds.has(workspaceId)) {
      next[workspaceId] = entryValue;
    } else {
      changed = true;
    }
  }
  return changed ? { value: next as T, changed: true } : { value, changed: false };
}

/**
 * 按"工作区存在性 + 该工作区已加载的目录路径"剪枝。
 *
 * 安全不变量：
 * - workspaceIds 为空 → 跳过；
 * - 该工作区不在 loadedDirPaths 内（树未加载 / 加载失败）→ 该工作区整体跳过（规格 §3.5.1 / 风险 R2）。
 */
export function pruneDirPathsByWorkspace<T extends Record<string, Record<string, unknown>>>(
  value: T,
  ctx: PruneCtx,
): PruneResult<T> {
  if (ctx.workspaceIds.size === 0) {
    return { value, changed: false };
  }
  const next: Record<string, Record<string, unknown>> = {};
  let changed = false;
  for (const [workspaceId, paths] of Object.entries(value)) {
    if (!ctx.workspaceIds.has(workspaceId)) {
      changed = true;
      continue;
    }
    const loadedPaths = ctx.loadedDirPaths.get(workspaceId);
    if (!loadedPaths) {
      next[workspaceId] = paths;
      continue;
    }
    const keptPaths: Record<string, unknown> = {};
    for (const [path, pathValue] of Object.entries(paths)) {
      if (loadedPaths.has(path)) {
        keptPaths[path] = pathValue;
      } else {
        changed = true;
      }
    }
    next[workspaceId] = keptPaths;
  }
  return changed ? { value: next as T, changed: true } : { value, changed: false };
}

/** 按标签存在性剪枝；tabIds 为空时跳过 */
export function pruneByTabId<T extends Record<string, unknown>>(
  value: T,
  ctx: PruneCtx,
): PruneResult<T> {
  if (ctx.tabIds.size === 0) {
    return { value, changed: false };
  }
  const next: Record<string, unknown> = {};
  let changed = false;
  for (const [tabId, entryValue] of Object.entries(value)) {
    if (ctx.tabIds.has(tabId)) {
      next[tabId] = entryValue;
    } else {
      changed = true;
    }
  }
  return changed ? { value: next as T, changed: true } : { value, changed: false };
}

/** 剔除某个路径自身及其全部子孙路径（删除目录 / 重命名后的重映射用） */
export function prunePathPrefix<T extends Record<string, unknown>>(
  paths: T,
  removedPath: string,
): PruneResult<T> {
  const prefix = `${removedPath}/`;
  const next: Record<string, unknown> = {};
  let changed = false;
  for (const [path, pathValue] of Object.entries(paths)) {
    if (path === removedPath || path.startsWith(prefix)) {
      changed = true;
      continue;
    }
    next[path] = pathValue;
  }
  return changed ? { value: next as T, changed: true } : { value: paths, changed: false };
}

/**
 * 遍历登记表中带有 prune 的条目，对传入的"内存当前值"逐条剪枝。
 * 由四个触发入口（pruneAfterWorkspacesKnown / pruneAfterTreeLoaded / pruneAfterTabsKnown / 删除路径）
 * 共用，避免每个入口各自列举要剪哪个字段。
 */
export function pruneRegistry(
  current: Record<string, unknown>,
  ctx: PruneCtx,
): PruneResult<Record<string, unknown>> {
  const patch: Record<string, unknown> = {};
  let changed = false;
  for (const entry of registryEntries) {
    if (!entry.prune) {
      continue;
    }
    const field = entry.field as string;
    const value = current[field];
    if (value === undefined) {
      continue;
    }
    const result = entry.prune(value, ctx);
    if (result.changed) {
      patch[field] = result.value;
      changed = true;
    }
  }
  return { value: patch, changed };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/prune.test.ts
```

Expected: PASS（11 个用例全绿，其中 5 个为负例）。

- [ ] **Step 5: 提交**

```bash
cd ai-digital-life
git add frontend/src/app/stores/persisted
git commit -m "feat(stores): add persisted-state pruning with empty-reference guards"
```

---

## Task 5: 登记表自检与测试辅助

**Files:**
- Create: `frontend/src/app/stores/persisted/__tests__/helpers.ts`
- Create: `frontend/src/app/stores/persisted/__tests__/registrySelfCheck.test.ts`

**Interfaces:**
- Consumes: `registryEntries`、`parsePersistKey`、`PruneCtx`（Task 2/4）
- Produces:
  - `function stubStorage(): void` —— 清空存储并重置模块级缓存
  - `function expectPersistsAcrossRestart<K>(key: K, write: (value: RegistryValue<K>) => void, readAfterRestart: () => unknown, value: RegistryValue<K>): void` —— 断言"写入 → 模拟重启 → 读回一致"
  - 自检测试的断言集合（键名规范、域合法、`field` 唯一、体积上限、`prune` 有效性）

- [ ] **Step 1: 写自检测试（先失败）**

创建 `frontend/src/app/stores/persisted/__tests__/registrySelfCheck.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { registryEntries } from '../registry';
import { parsePersistKey, PERSIST_DOMAINS, type PruneCtx } from '../entry';

const SYNC_BYTES_LIMIT = 32 * 1024;

const EMPTY_CTX: PruneCtx = {
  workspaceIds: new Set<string>(),
  loadedDirPaths: new Map(),
  tabIds: new Set<string>(),
};

describe('registry self-check', () => {
  it('every key matches the adl:<domain>.<name>[.vN] pattern with a known domain', () => {
    for (const entry of registryEntries) {
      const parsed = parsePersistKey(entry.key);
      expect(parsed, `key ${entry.key} must be a valid persist key`).not.toBeNull();
      expect(PERSIST_DOMAINS).toContain(parsed?.domain);
    }
  });

  it('keys are unique across the registry', () => {
    const keys = registryEntries.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('store fields are unique — one field must not be declared by two keys', () => {
    const fields = registryEntries.map((entry) => entry.field as string);
    const duplicates = fields.filter((field, index) => fields.indexOf(field) !== index);
    expect(duplicates).toEqual([]);
  });

  it('every entry declares a scope', () => {
    for (const entry of registryEntries) {
      expect(['global', 'byWorkspaceId', 'byTabId']).toContain(entry.scope);
    }
  });

  it('sync entries stay within the 32 KB budget — large objects must set sync: false', () => {
    for (const entry of registryEntries) {
      if (entry.sync === false) {
        continue;
      }
      const bytes = JSON.stringify(entry.fallback).length;
      expect(bytes, `sync entry ${entry.key} exceeds the ${SYNC_BYTES_LIMIT} byte budget`).toBeLessThanOrEqual(
        SYNC_BYTES_LIMIT,
      );
    }
  });

  it('workspace-scoped entries skip pruning when the reference list is empty', () => {
    for (const entry of registryEntries) {
      if (!entry.prune || entry.scope === 'global') {
        continue;
      }
      const sample = entry.fallback as Record<string, unknown>;
      const result = entry.prune(sample, EMPTY_CTX);
      expect(result.changed, `${entry.key} must not prune with an empty reference list`).toBe(false);
    }
  });
});
```

- [ ] **Step 2: 运行测试确认通过（同时暴露已有的违规条目）**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/registrySelfCheck.test.ts
```

Expected: 当前登记表只有 `adl:files.workspaceExpanded` 一条，全部用例 PASS。后续任务每追加一条登记都会自动被这组断言约束；若有违规（键名不合法 / 字段重复 / 同步体积超限 / 空清单剪枝），此测试立即变红。

- [ ] **Step 3: 实现测试辅助 `helpers.ts`**

```ts
import { expect } from 'vitest';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import { resetHydrationForTest } from '../hydrate';
import { resetWriteFailureWarning } from '@stores/storageHelpers';
import type { RegistryKey, RegistryValue } from '../registry';

/** 清空存储并重置模块级缓存，模拟"全新启动" */
export function stubStorage(): void {
  localStorage.clear();
  resetHydrationForTest();
  resetWriteFailureWarning();
}

/**
 * 断言"写入 → 模拟重启 → 读回一致"。
 *
 * @param key 登记键
 * @param write 触发写入的动作（内部应调用 persist 或经其封装的 setter）
 * @param readAfterRestart 重启后读取该状态的函数（内部应调用 hydrateAll）
 * @param value 期望还原的值
 */
export function expectPersistsAcrossRestart<K extends RegistryKey>(
  key: K,
  write: (value: RegistryValue<K>) => void,
  readAfterRestart: () => unknown,
  value: RegistryValue<K>,
): void {
  write(value);
  flushCrossSliceWrites();
  expect(localStorage.getItem(key), `expected ${key} to be written`).not.toBeNull();

  resetHydrationForTest();
  expect(readAfterRestart()).toEqual(value);
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted
```

Expected: PASS（entry / persist / hydrate / prune / 自检 全部全绿）。

- [ ] **Step 5: 提交**

```bash
cd ai-digital-life
git add frontend/src/app/stores/persisted
git commit -m "test(stores): add registry self-check and restart-persistence helper"
```

---

## Task 6: 装配层与 store 接线

**Files:**
- Create: `frontend/src/app/stores/persisted/apply.ts`
- Create: `frontend/src/app/stores/persisted/cleanup.ts`
- Create: `frontend/src/app/stores/persisted/__tests__/cleanup.test.ts`
- Modify: `frontend/src/app/stores/slicedStore.ts:126-129`
- Modify: `frontend/src/app/stores/persisted/index.ts`（新增，统一入口再导出）

**Interfaces:**
- Consumes: `hydrateAll`（Task 3）、`persist`（Task 2）、`registry`（Task 2）
- Produces:
  - `function persistField<K extends RegistryKey>(key: K, value: RegistryValue<K>): Partial<StoreState>` —— 落盘并返回可直接交给 `set` 的补丁；各 slice 一律用它替换"先写盘再拼补丁"的样板
  - `function cleanupUnregisteredKeys(options?: { keep?: ReadonlySet<string> }): string[]`
  - `stores/persisted/index.ts` 再导出 `persistField` / `persist` / `hydrateAll` / `pruneRegistry` / `parsePersistKey` / `defineEntry` 及全部类型

- [ ] **Step 1: 写失败测试（启动清理）**

创建 `frontend/src/app/stores/persisted/__tests__/cleanup.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanupUnregisteredKeys } from '../cleanup';
import { registryEntries } from '../registry';

const REGISTERED = registryEntries[0].key;

describe('cleanupUnregisteredKeys', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes unregistered adl: keys', () => {
    localStorage.setItem(REGISTERED, '{"workspace_a":true}');
    localStorage.setItem('adl:legacy.thing', '1');
    const removed = cleanupUnregisteredKeys();
    expect(removed).toEqual(['adl:legacy.thing']);
    expect(localStorage.getItem('adl:legacy.thing')).toBeNull();
  });

  it('keeps registered keys', () => {
    localStorage.setItem(REGISTERED, '{"workspace_a":true}');
    cleanupUnregisteredKeys();
    expect(localStorage.getItem(REGISTERED)).toBe('{"workspace_a":true}');
  });

  it('never touches keys outside the adl: namespace', () => {
    localStorage.setItem('some-other-app:key', '1');
    localStorage.setItem('adl-avatars-db', '2');
    const removed = cleanupUnregisteredKeys();
    expect(removed).toEqual([]);
    expect(localStorage.getItem('some-other-app:key')).toBe('1');
    expect(localStorage.getItem('adl-avatars-db')).toBe('2');
  });

  it('honours the keep allowlist (exceptions recorded from the V2 inventory)', () => {
    localStorage.setItem('adl:exempt.thing', '1');
    const removed = cleanupUnregisteredKeys({ keep: new Set(['adl:exempt.thing']) });
    expect(removed).toEqual([]);
    expect(localStorage.getItem('adl:exempt.thing')).toBe('1');
  });

  it('removes corrupt keys reported by hydrateAll as dirty', () => {
    localStorage.setItem('adl:corrupt.value', '1');
    const removed = cleanupUnregisteredKeys({ extra: ['adl:corrupt.value'] });
    expect(removed).toEqual(['adl:corrupt.value']);
  });

  it('does not throw when storage access is denied', () => {
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = () => {
      throw new Error('denied');
    };
    expect(() => cleanupUnregisteredKeys()).not.toThrow();
    Storage.prototype.removeItem = original;
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/cleanup.test.ts
```

Expected: FAIL —— `Failed to resolve import "../cleanup"`。

- [ ] **Step 3: 实现 `cleanup.ts` 与 `apply.ts`**

创建 `frontend/src/app/stores/persisted/cleanup.ts`：

```ts
import { registryEntries } from './registry';

export type CleanupOptions = {
  /** V2 盘点中登记的例外键（不属于本次接管范围但共用 adl 前缀），一律保留 */
  keep?: ReadonlySet<string>;
  /** 需要额外删除的键（如 hydrateAll 报告的解析失败/形状不合法的坏数据） */
  extra?: readonly string[];
};

/**
 * 启动清理：删除 adl: 命名空间下所有"不在登记表内"的键。
 *
 * 这是取代迁移代码的机制（规格 §3.5.3）：schema 变更时直接换键名或加版本段，
 * 旧键在下一次启动被本函数清除，因此不需要写任何读取旧格式的代码。
 */
export function cleanupUnregisteredKeys(options: CleanupOptions = {}): string[] {
  const registered = new Set(registryEntries.map((entry) => entry.key));
  const keep = options.keep ?? new Set<string>();
  const doomed = new Set<string>(options.extra ?? []);
  const removed: string[] = [];

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith('adl:') || registered.has(key) || keep.has(key)) {
        continue;
      }
      doomed.add(key);
    }
  } catch {
    return removed;
  }

  for (const key of doomed) {
    try {
      localStorage.removeItem(key);
      removed.push(key);
    } catch {
      // 存储不可用：静默跳过，绝不阻塞启动
    }
  }
  return removed;
}
```

创建 `frontend/src/app/stores/persisted/apply.ts`：

```ts
import type { StoreState } from '../StoreState';
import { persist } from './persist';
import { registry, type RegistryKey, type RegistryValue } from './registry';

/**
 * 落盘一个已登记的字段，并返回可直接交给 zustand set 的补丁。
 *
 * 用法：set((state) => persistField('adl:files.workspaceExpanded', next))
 *
 * 之所以需要这个 helper：字段名来自登记表而非调用方手写，因此不存在
 * "写盘用了 A 字段、set 用了 B 字段"这类错配；同时消灭各 slice 中
 * "先写盘、再手动拼 { fieldName: next }"的重复样板。
 */
export function persistField<K extends RegistryKey>(
  key: K,
  value: RegistryValue<K>,
): Partial<StoreState> {
  persist(key, value);
  const field = registry[key].field as string;
  return { [field]: value } as Partial<StoreState>;
}
```

创建 `frontend/src/app/stores/persisted/index.ts`：

```ts
export { defineEntry, parsePersistKey, readBooleanRecord, PERSIST_DOMAINS } from './entry';
export type {
  ParsedPersistKey,
  PersistDomain,
  PersistEntry,
  PersistScope,
  PruneCtx,
  PruneResult,
} from './entry';
export { registry, registryEntries } from './registry';
export type { Registry, RegistryKey, RegistryValue } from './registry';
export { persist } from './persist';
export { persistField } from './apply';
export { hydrateAll, resetHydrationForTest } from './hydrate';
export type { HydrationResult } from './hydrate';
export {
  pruneByTabId,
  pruneByWorkspaceId,
  pruneDirPathsByWorkspace,
  prunePathPrefix,
  pruneRegistry,
} from './prune';
export { cleanupUnregisteredKeys } from './cleanup';
export type { CleanupOptions } from './cleanup';
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/cleanup.test.ts
```

Expected: PASS（6 个用例全绿）。

- [ ] **Step 5: 接线到 store**

修改 `frontend/src/app/stores/slicedStore.ts`，在 store 创建之后、既有 `hydrateGitHubRepoSlice` 之前插入：

```ts
import { hydrateAll } from './persisted/hydrate';
import { cleanupUnregisteredKeys } from './persisted/cleanup';

// ⚠️ 安全关键：启动清理会删除所有不在 registry 内的 adl: 键。迁移是分批进行的，
// 在 Task 7–11 / 29 完成前，registry 只声明极少数键，因此**全部遗留键都必须列入本清单**，
// 否则首次启动即清空用户的宽度/展开态/浏览器标签/终端标签/CI 快照等全部 UI 状态。
//
// 本清单由下面的命令生成（不要手工增删）：
//   cd ai-digital-life && grep -rhoE "'adl-(ui|terminal|search|browser):[a-zA-Z0-9:._-]+'" \
//     frontend/src --include=*.ts --include=*.tsx | grep -v "__tests__" | sort -u
//
// 维护规则（由 Task 6 新增的守卫测试强制）：
// 1. 任何遗留键字面量必须"已登记 或 在本清单内" —— 否则守卫测试变红，杜绝漏保护。
// 2. 本清单不得包含已登记的键 —— 每个迁移任务（Task 7/9/10/11/29）必须把
//    自己刚登记的键从本清单删除，守卫测试会强制这一点。
// 3. Task 21 完成时，本清单应只剩"范围外工具"的键；Task 29 完成后本清单必须为空
//    （此时启动清理才真正开始清除遗留键，Task 18 的命名空间门禁随之生效）。
const PERSIST_KEEP_KEYS = new Set<string>([
  // ← 以生成命令的输出逐行填入（约 72 条遗留键）
]);

// 同步水合：必须在 store 创建后立即执行，且早于任何 React 渲染 ——
// 全应用唯一的水合时机（规格 §3.3）。禁止再引入第二处异步水合。
const hydration = hydrateAll();
if (Object.keys(hydration.patch).length > 0) {
  useSlicedAppStore.setState(hydration.patch);
}
cleanupUnregisteredKeys({ keep: PERSIST_KEEP_KEYS, extra: hydration.dirtyKeys });
```

同时新增守卫测试 `persisted/__tests__/keepListGuard.test.ts`（本任务的一部分，**不得**推迟）：

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { registryEntries } from '../registry';
import { PERSIST_KEEP_KEYS } from '@stores/slicedStore';

const LEGACY_PREFIXES = ['adl-ui:', 'adl-terminal:', 'adl-search:', 'adl-browser:'];
const LEGACY_LITERAL = /'(adl-(?:ui|terminal|search|browser):[a-zA-Z0-9:._-]+)'/g;

function collectProductionSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === '__tests__' ? [] : collectProductionSources(full);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function legacyKeysInProductionSource(): string[] {
  const found = new Set<string>();
  for (const file of collectProductionSources(join(process.cwd(), 'src'))) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(LEGACY_LITERAL)) {
      found.add(match[1]);
    }
  }
  return [...found];
}

describe('startup-cleanup allowlist guard', () => {
  it('every legacy key literal in production source is either registered or kept', () => {
    const registered = new Set(registryEntries.map((entry) => entry.key));
    const unguarded = legacyKeysInProductionSource().filter(
      (key) => !registered.has(key) && !PERSIST_KEEP_KEYS.has(key),
    );
    expect(
      unguarded,
      'these legacy keys would be deleted by startup cleanup — register them or add them to PERSIST_KEEP_KEYS',
    ).toEqual([]);
  });

  it('no kept key is already registered (migrations must narrow the list)', () => {
    const registered = new Set(registryEntries.map((entry) => entry.key));
    const redundant = [...PERSIST_KEEP_KEYS].filter((key) => registered.has(key));
    expect(redundant, 'remove these from PERSIST_KEEP_KEYS now that they are registered').toEqual([]);
  });
});
```

`PERSIST_KEEP_KEYS` 必须从 `slicedStore.ts` 导出（供守卫测试 import）；若要避免测试反向依赖 store，可把它移到 `persisted/registry.ts` 并在 store 中 import —— 二选一，**不得两处各定义一份**。

- [ ] **Step 6: 运行全量前端测试确认无回归**

```bash
cd ai-digital-life && pnpm frontend:test
```

Expected: PASS。若出现与"idle 水合"相关的既有测试失败，说明该测试断言了旧行为 —— 记录并在下一任务（Task 7）随 `uiSlice` 迁移一并更新。

- [ ] **Step 7: 类型检查与 Lint**

```bash
cd ai-digital-life && pnpm frontend:typecheck && pnpm frontend:lint
```

Expected: 无错误。注意：此步可能暴露 `frontend/src/app/stores/persisted/index.ts` 中尚未被使用的再导出被 ESLint 判为无用导出是**正常**的（它是公共入口），若规则报错则在 `eslint.config.js` 中对该文件放行。

- [ ] **Step 8: 提交**

```bash
cd ai-digital-life
git add frontend/src/app/stores/persisted frontend/src/app/stores/slicedStore.ts
git commit -m "feat(stores): wire sync hydration and startup cleanup into the store"
```

---

## Task 7: 迁移 `uiSlice` 的全量 UI 状态（并删除 idle 水合）

**Files:**
- Create: `frontend/src/app/stores/persisted/parsers.ts`
- Create: `frontend/src/app/stores/persisted/__tests__/parsers.test.ts`
- Modify: `frontend/src/app/stores/slices/uiSliceTypes.ts`（键名常量改为登记键名）
- Modify: `frontend/src/app/stores/slices/uiSlice.ts`（删除 `hydrateUIDefaults` 与全部 idle 水合；写盘改走 `persistField`）
- Modify: `frontend/src/app/stores/slices/uiSliceWidths.ts`（同上）
- Modify: `frontend/src/app/stores/persisted/registry.ts`（追加条目）

**Interfaces:**
- Consumes: `defineEntry` / `PersistEntry` / `readBooleanRecord`（Task 2）、`persistField`（Task 6）、`pruneDirPathsByWorkspace` / `pruneByWorkspaceId`（Task 4）
- Produces: `parsers.ts` 中的纯解析器（全部无 DOM 依赖、可独立测试）：
  - `readFlag(raw: unknown): boolean | undefined`
  - `readNumberInRange(min: number, max: number): (raw: unknown) => number | undefined`
  - `readStringEnum<T extends string>(allowed: readonly T[]): (raw: unknown) => T | undefined`
  - `readBooleanPropRecord(raw: unknown): Record<string, Record<string, boolean>> | undefined`（`Record<wsId, Record<path, boolean>>`）

**键名与字段的对应关系（本任务需全部登记）**

| 现键名 | 新键名 | store 字段 | scope | 解析器 | 剪枝 |
|---|---|---|---|---|---|
| `adl-ui:left-collapsed` | `adl:ui.leftCollapsed` | `leftCollapsed` | global | `readFlag` | — |
| `adl-ui:left-panel-width` | `adl:ui.leftPanelWidth` | `leftbarWidth` | global | `readNumberInRange(180, 260)` | — |
| `adl-ui:right-collapsed` | `adl:ui.rightCollapsed` | `rightCollapsed` | global | `readFlag` | — |
| `adl-ui:right-panel-width` | `adl:ui.rightPanelWidth` | `rightPanelWidth` | global | `readNumberInRange(320, 4096)` | — |
| `adl-ui:files-navigator-width` | `adl:files.navigatorWidth` | `filesNavigatorWidth` | global | `readNumberInRange(180, 420)` | — |
| `adl-ui:changes-navigator-width` | `adl:changes.navigatorWidth` | `changesNavigatorWidth` | global | `readNumberInRange(180, 300)` | — |
| `adl-ui:github-navigator-width` | `adl:ui.githubNavigatorWidth` | `gitHubNavigatorWidth` | global | `readNumberInRange(180, 420)` | — |
| `adl-ui:settings-navigator-width` | `adl:ui.settingsNavigatorWidth` | `settingsNavigatorWidth` | global | `readNumberInRange(160, 360)` | — |
| `adl-ui:navigator-collapsed` | `adl:ui.navigatorCollapsed` | `navigatorCollapsedByTool` | global | `readBooleanRecord` | — |
| `adl-ui:active-right-tool` | `adl:ui.activeRightTool` | `activeRightTool` | global | `readStringEnum(['files','changes','browser','terminal','settings'])` | — |
| `adl-ui:files-navigator-mode` | `adl:files.navigatorMode` | `filesNavigatorMode` | global | `readStringEnum(['tree','search','outline'])` | — |
| `adl-ui:changes-navigator-mode` | `adl:changes.navigatorMode` | `changesNavigatorMode` | global | `readStringEnum(['tree','list','outline'])` | — |
| `adl-ui:files-search-view` | `adl:files.searchView` | `filesSearchView` | global | `readStringEnum(['tree','list','outline'])` | — |
| `adl-ui:files-search-scope` | `adl:files.searchScope` | `filesSearchScope` | global | `readStringEnum(['file','content'])` | — |
| `adl-ui:file-tree-expanded` | `adl:files.dirExpanded` | `expandedFileTreePaths` | byWorkspaceId | `readBooleanPropRecord` | `pruneDirPathsByWorkspace` |
| `adl-ui:changes-tree-expanded` | `adl:changes.dirExpanded` | `expandedChangesTreePaths` | global（Task 14 改为 byWorkspaceId） | `readBooleanRecord`（扁平表，与现状一致） | — |
| `adl-ui:file-preview-mode` | `adl:files.previewMode` | `filePreviewModeByPath` | byWorkspaceId | 见 Task 14（补工作区维度） | 见 Task 14 |
| `adl-ui:changes-preview-enabled` | `adl:changes.previewEnabled` | `changesPreviewEnabled` | global | `readFlag` | — |
| `adl-ui:show-git-visualization` | `adl:changes.showGitVisualization` | `showGitVisualization` | global | `readFlag` | — |
| `adl-ui:active-heatmap-tab` | `adl:changes.activeHeatmapTab` | `activeHeatmapTab` | global | `readStringEnum(['calendar','clock','activity','module'])` | — |
| `adl-ui:active-workspace-tab` | `adl:changes.activeWorkspaceTab` | `activeWorkspaceTab` | global | `(raw) => (typeof raw === 'string' ? raw : undefined)` | — |
| `adl-ui:chart-color-preset` | `adl:changes.chartColorPreset` | `chartColorPreset` | global | `readStringEnum(['bklit-default','cool-ocean','warm-sunset','high-contrast'])` | — |
| `adl-ui:right-panel-mode` | `adl:ui.rightPanelMode` | 见 Step 2 | global | 复用既有解析器 | — |
| `adl-ui:right-panel-last-restorable-width` | `adl:ui.rightPanelLastRestorableWidth` | 见 Step 2 | global | 复用既有解析器 | — |
| `adl-ui:session-tabs-expanded` | 不登记 | — | — | — | 死常量，Task 20 删除 |

> `filePreviewModeByPath` 的作用域在 Task 14 才改为按工作区隔离；本任务先按现状登记为 `global` 并加 `// TODO(Task14)` 注释消除，Task 14 会改写该条目。为避免中间态破坏现有功能，本任务**不得**改变该值的数据结构。

- [ ] **Step 1: 写失败测试（解析器）**

创建 `frontend/src/app/stores/persisted/__tests__/parsers.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { readFlag, readNumberInRange, readStringEnum, readBooleanPropRecord } from '../parsers';

describe('readFlag', () => {
  it('accepts booleans only', () => {
    expect(readFlag(true)).toBe(true);
    expect(readFlag(false)).toBe(false);
    expect(readFlag('true')).toBeUndefined();
    expect(readFlag(1)).toBeUndefined();
    expect(readFlag(null)).toBeUndefined();
  });
});

describe('readNumberInRange', () => {
  it('clamps out-of-range values instead of rejecting them', () => {
    const read = readNumberInRange(180, 260);
    expect(read(200)).toBe(200);
    expect(read(10)).toBe(180);
    expect(read(9999)).toBe(260);
  });

  it('rejects non-finite numbers', () => {
    const read = readNumberInRange(0, 10);
    expect(read('5')).toBeUndefined();
    expect(read(Number.NaN)).toBeUndefined();
    expect(read(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe('readStringEnum', () => {
  it('accepts only listed members', () => {
    const read = readStringEnum(['tree', 'group'] as const);
    expect(read('tree')).toBe('tree');
    expect(read('group')).toBe('group');
    expect(read('list')).toBeUndefined();
  });
});

describe('readBooleanPropRecord', () => {
  it('accepts a nested boolean map', () => {
    expect(readBooleanPropRecord({ ws1: { src: true } })).toEqual({ ws1: { src: true } });
  });

  it('rejects a flat boolean map', () => {
    expect(readBooleanPropRecord({ ws1: true })).toBeUndefined();
  });

  it('rejects a nested map with a non-boolean leaf', () => {
    expect(readBooleanPropRecord({ ws1: { src: 'yes' } })).toBeUndefined();
  });

  it('rejects arrays and null', () => {
    expect(readBooleanPropRecord([])).toBeUndefined();
    expect(readBooleanPropRecord(null)).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/parsers.test.ts
```

Expected: FAIL —— `Failed to resolve import "../parsers"`。

- [ ] **Step 3: 实现 `parsers.ts`**

```ts
import { clamp } from '../storageHelpers';

/** 布尔：仅接受真正的 boolean */
export function readFlag(raw: unknown): boolean | undefined {
  return typeof raw === 'boolean' ? raw : undefined;
}

/** 数值 + 区间钳制：越界钳制（宽度类状态越界应纠正而非丢弃），非有限数值判为不合法 */
export function readNumberInRange(min: number, max: number): (raw: unknown) => number | undefined {
  return (raw: unknown) => {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return undefined;
    }
    return clamp(raw, min, max);
  };
}

/** 字符串枚举：不在白名单内判为不合法（避免恢复出无法识别的模式） */
export function readStringEnum<T extends string>(
  allowed: readonly T[],
): (raw: unknown) => T | undefined {
  return (raw: unknown) => {
    if (typeof raw !== 'string') {
      return undefined;
    }
    return (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
  };
}

/** Record<workspaceId, Record<path, boolean>> 两层布尔映射 */
export function readBooleanPropRecord(
  raw: unknown,
): Record<string, Record<string, boolean>> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, Record<string, boolean>> = {};
  for (const [outerKey, outerValue] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof outerValue !== 'object' || outerValue === null || Array.isArray(outerValue)) {
      return undefined;
    }
    const inner: Record<string, boolean> = {};
    for (const [innerKey, innerValue] of Object.entries(outerValue as Record<string, unknown>)) {
      if (typeof innerValue !== 'boolean') {
        return undefined;
      }
      inner[innerKey] = innerValue;
    }
    result[outerKey] = inner;
  }
  return result;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/parsers.test.ts
```

Expected: PASS（10 个用例全绿）。

- [ ] **Step 5: 处理两个取值域未知的键**

读 `frontend/src/app/regions/right-panel/hooks/useRightPanelLayout.ts:11-47`，把其中的 `readPersistedRightPanelMode()` 与读取 `RIGHT_PANEL_LAST_RESTORABLE_WIDTH_KEY` 的内联逻辑**提取为导出的纯函数**（分别移到 `parsers.ts` 与 `persisted/parsers.ts` 中的数值解析器），并在登记表中引用它们。提取后 `useRightPanelLayout.ts` 改为 import 这两个纯函数，**不得**保留重复实现。

同时确认这两个键对应的 store 字段：若它们的状态目前只存在于 `useRightPanelLayout` 的组件本地 state（`useState`）而非 store，则**本任务不登记它们**，改在 Task 22（文件面板补齐）中先把状态上提到 store 再登记；在本任务提交信息中记录该决定。

- [ ] **Step 6: 追加登记表条目**

按上表在 `registry.ts` 中追加全部条目（`filePreviewModeByPath` 除外，见 Task 14）。示例（其余条目同形）：

```ts
  'adl:ui.leftCollapsed': defineEntry<boolean>({
    key: 'adl:ui.leftCollapsed',
    field: 'leftCollapsed',
    fallback: false,
    scope: 'global',
    read: readFlag,
  }),
  'adl:ui.leftPanelWidth': defineEntry<number>({
    key: 'adl:ui.leftPanelWidth',
    field: 'leftbarWidth',
    fallback: DEFAULT_LEFT_PANEL_WIDTH,
    scope: 'global',
    read: readNumberInRange(LEFT_PANEL_WIDTH_MIN, LEFT_PANEL_WIDTH_MAX),
  }),
  'adl:files.dirExpanded': defineEntry<Record<string, Record<string, boolean>>>({
    key: 'adl:files.dirExpanded',
    field: 'expandedFileTreePaths',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readBooleanPropRecord,
    prune: pruneDirPathsByWorkspace,
  }),
```

- [ ] **Step 7: 运行登记表自检确认没有违规**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/registrySelfCheck.test.ts
```

Expected: PASS。若 `field 唯一` 用例变红，说明上表存在同一字段被两条键声明的情况 —— 按报错信息收敛为单条。

- [ ] **Step 8: 删除 `uiSlice` 的 idle 水合，写盘改走 `persistField`**

修改 `frontend/src/app/stores/slices/uiSlice.ts`：删除 `hydrateUIDefaults` 函数、`_defaultsHydrated` 标记、`hydrateUIDefaults(_get, set)` 调用，以及 `writeJson` / `writeFlag` / `makePersistedWriter` 的直接用法；每个 setter 改为：

```ts
    setFilesNavigatorMode: (mode) => {
      set(persistField('adl:files.navigatorMode', mode));
    },
    setChangesPreviewEnabled: (previewEnabled) => {
      set(persistField('adl:changes.previewEnabled', previewEnabled));
    },
```

`uiSliceWidths.ts` 同样处理（`setLeftCollapsed` / `setLeftbarWidth` / `setRightPanelWidth` / 各导航器宽度 / `setActiveRightTool` / `toggleLeft` / `toggleRight` / `toggleBoth`），全部改为 `set(persistField('<key>', next))`。

删除 `uiSlice.ts:96-167` 整段水合代码后，`STORAGE_HYDRATION_DELAY_MS` 若不再有其他使用者，一并从 `constants.ts` 删除（用 `grep -rn "STORAGE_HYDRATION_DELAY_MS" frontend/src` 确认）。

- [ ] **Step 9: 写回归测试（现象 1 的镜像 + 迁移正确性）**

在 `frontend/src/app/stores/slices/__tests__/uiSlicePersistence.test.ts` 新建：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { persistField } from '@stores/persisted/apply';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';
import { flushCrossSliceWrites } from '@stores/storageHelpers';

describe('uiSlice persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it('restores filesNavigatorMode after a simulated restart', () => {
    const patch = persistField('adl:files.navigatorMode', 'search');
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(patch).toEqual({ filesNavigatorMode: 'search' });
    expect(hydrateAll().patch.filesNavigatorMode).toBe('search');
  });

  it('restores leftPanelWidth after a simulated restart', () => {
    persistField('adl:ui.leftPanelWidth', 220);
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.leftbarWidth).toBe(220);
  });

  it('clamps an out-of-range persisted width on hydration', () => {
    localStorage.setItem('adl:ui.leftPanelWidth', '9999');
    expect(hydrateAll().patch.leftbarWidth).toBe(260);
  });

  it('restores navigatorCollapsedByTool', () => {
    persistField('adl:ui.navigatorCollapsed', { files: true, changes: false } as never);
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.navigatorCollapsedByTool).toEqual({ files: true, changes: false });
  });
});
```

- [ ] **Step 10: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/slices/__tests__/uiSlicePersistence.test.ts
```

Expected: PASS（4 个用例全绿）。

- [ ] **Step 11: 全量测试 + 类型检查，确认没有残留的旧键引用**

```bash
cd ai-digital-life && pnpm frontend:test && pnpm frontend:typecheck
grep -rn "adl-ui:" frontend/src | grep -v "__tests__" | grep -v "persisted/"
```

Expected: 测试与类型检查通过；最后一条 grep **无输出**（旧前缀 `adl-ui:` 已不在生产代码中被读写）。

- [ ] **Step 12: 提交**

```bash
cd ai-digital-life
git add frontend/src/app/stores/persisted frontend/src/app/stores/slices/uiSlice.ts frontend/src/app/stores/slices/uiSliceTypes.ts frontend/src/app/stores/slices/uiSliceWidths.ts frontend/src/app/stores/slices/__tests__/uiSlicePersistence.test.ts
git commit -m "refactor(stores): migrate ui slice persistence to the registry"
```

---

## Task 8: 修复现象 1 —— 工作区级展开态接入唯一写入口

**Files:**
- Modify: `frontend/src/app/stores/persisted/registry.ts`（追加 2 条）
- Modify: `frontend/src/app/stores/slices/workspaceSlice.ts`（删除私有去抖；`setWorkspaceTreeExpandedInFileNav` / `setWorkspaceChangesExpanded` 改为唯一写入口）
- Modify: `frontend/src/app/stores/actions/workspaceTreeActions.ts:48-56,66-75,165-174,182-184`
- Modify: `frontend/src/app/stores/actions/gitFileOpsActions.ts:20-29,37-39,49-58`
- Modify: `frontend/src/app/stores/actions/browserCleanupActions.ts:60-71`
- Create: `frontend/src/app/stores/slices/__tests__/workspaceExpansionPersistence.test.ts`

**Interfaces:**
- Consumes: `persistField`（Task 6）、`pruneByWorkspaceId`（Task 4）
- Produces:
  - 登记键 `adl:files.workspaceExpanded` → 字段 `workspaceTreeExpandedInFileNav`
  - 登记键 `adl:changes.workspaceExpanded` → 字段 `workspaceChangesExpanded`
  - `setWorkspaceTreeExpandedInFileNav(expanded)` / `setWorkspaceChangesExpanded(expanded)` 成为**唯一**写入口；两个 action 与清理路径一律改为调用它们，**不得**再出现裸 `set({ workspaceTreeExpandedInFileNav: ... })`

- [ ] **Step 1: 写失败测试（现象 1 的精确复现）**

创建 `frontend/src/app/stores/slices/__tests__/workspaceExpansionPersistence.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';

const FILES_KEY = 'adl:files.workspaceExpanded';
const CHANGES_KEY = 'adl:changes.workspaceExpanded';

describe('workspace-level expansion survives a restart', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it('writes the files-panel workspace expansion through the single write entry', () => {
    useAppStore.getState().setWorkspaceTreeExpandedInFileNav({
      workspace_a: true,
      workspace_b: false,
    });
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem(FILES_KEY) ?? 'null')).toEqual({
      workspace_a: true,
      workspace_b: false,
    });
  });

  it('writes the changes-panel workspace expansion through the single write entry', () => {
    useAppStore.getState().setWorkspaceChangesExpanded({ workspace_a: true });
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem(CHANGES_KEY) ?? 'null')).toEqual({ workspace_a: true });
  });

  it('restores both after a simulated restart', () => {
    localStorage.setItem(FILES_KEY, JSON.stringify({ workspace_a: true }));
    localStorage.setItem(CHANGES_KEY, JSON.stringify({ workspace_b: true }));
    resetHydrationForTest();
    const { patch } = hydrateAll();
    expect(patch.workspaceTreeExpandedInFileNav).toEqual({ workspace_a: true });
    expect(patch.workspaceChangesExpanded).toEqual({ workspace_b: true });
  });

  it('toggling a workspace head from the files panel persists the new state', async () => {
    const workspaceId = 'workspace_toggle';
    useAppStore.setState({ workspaceTrees: { [workspaceId]: [] } });
    await useAppStore.getState().expandWorkspaceTreeInFileNav(workspaceId as never, '/tmp/ws');
    flushCrossSliceWrites();
    const stored = JSON.parse(localStorage.getItem(FILES_KEY) ?? 'null');
    expect(stored).not.toBeNull();
    expect(stored[workspaceId]).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/slices/__tests__/workspaceExpansionPersistence.test.ts
```

Expected: FAIL —— 前两个用例的 `localStorage.getItem(...)` 为 `null`（因为 `setWorkspaceTreeExpandedInFileNav` 当前会写盘但无人调用；且校验的是"经 action 路径触发"的第四个用例必失败）。

- [ ] **Step 3: 追加两条登记**

```ts
  'adl:files.workspaceExpanded': defineEntry<Record<string, boolean>>({
    key: 'adl:files.workspaceExpanded',
    field: 'workspaceTreeExpandedInFileNav',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readBooleanRecord,
    prune: pruneByWorkspaceId,
  }),
  'adl:changes.workspaceExpanded': defineEntry<Record<string, boolean>>({
    key: 'adl:changes.workspaceExpanded',
    field: 'workspaceChangesExpanded',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readBooleanRecord,
    prune: pruneByWorkspaceId,
  }),
```

同时把 Task 2 中已有的 `adl:files.workspaceExpanded` 那条**删除**（同一键不得声明两次；这正是自检测试要拦住的情况）。

- [ ] **Step 4: 删除 `workspaceSlice` 的私有去抖并改造两个 setter**

删除 `frontend/src/app/stores/slices/workspaceSlice.ts:19-45` 的 `pendingWrites` / `scheduleWrite` / `scheduleFlush` 整段，以及 `:16-17` 的旧键常量与 `:50-71` 的 `hydrateWorkspaceDefaults`。两个 setter 改为：

```ts
    setWorkspaceTreeExpandedInFileNav: (expanded) => set(persistField('adl:files.workspaceExpanded', expanded)),
    setWorkspaceChangesExpanded: (expanded) => set(persistField('adl:changes.workspaceExpanded', expanded)),
```

并删除 `createWorkspaceSlice` 内的 `hydrateWorkspaceDefaults(get, set);` 调用。

- [ ] **Step 5: 把两个 action 的裸 `set()` 改为调用唯一写入口**

`workspaceTreeActions.ts`：

```ts
    expandWorkspaceTreeInFileNav: async (workspaceId, workspacePath) => {
      const state = get();
      await expandSingle(
        state.workspaceTreeExpandedInFileNav,
        workspaceId,
        (next) => get().setWorkspaceTreeExpandedInFileNav(next),
        !!state.workspaceTrees[workspaceId],
        () => get().loadWorkspaceTree(workspaceId, workspacePath),
      );
    },
```

`collapseAllWorkspaceTreesInFileNav`（:182-184）改为 `get().setWorkspaceTreeExpandedInFileNav({});`；`expandAllWorkspaceTreesInFileNav`（:165-174）的 `(next) => set({ ... })` 改为 `(next) => get().setWorkspaceTreeExpandedInFileNav(next)`。

`gitFileOpsActions.ts` 三处（:20-29 `:37-39` `:49-58`）同样改为调用 `setWorkspaceChangesExpanded`。

`browserCleanupActions.ts:64` 的裸 `set()` 改为 `get().setWorkspaceTreeExpandedInFileNav(next)`。

- [ ] **Step 6: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/slices/__tests__/workspaceExpansionPersistence.test.ts
```

Expected: PASS（4 个用例全绿）。

- [ ] **Step 7: 断言裸 `set()` 已绝迹**

```bash
grep -rn "set({ workspaceTreeExpandedInFileNav\|set({ workspaceChangesExpanded\|workspaceTreeExpandedInFileNav: next\|workspaceChangesExpanded: next" ai-digital-life/frontend/src
```

Expected: 无输出。

- [ ] **Step 8: 全量测试并提交**

```bash
cd ai-digital-life && pnpm frontend:test && pnpm frontend:typecheck
git add frontend/src/app/stores
git commit -m "fix(stores): persist workspace-level tree expansion on both panels"
```

---

## Task 9: 迁移浏览器面板持久化状态（含跨键归一化）

**Files:**
- Modify: `frontend/src/app/stores/persisted/registry.ts`
- Create: `frontend/src/app/stores/persisted/composite.ts`
- Create: `frontend/src/app/stores/persisted/__tests__/composite.test.ts`
- Modify: `frontend/src/app/stores/slices/browserSlice.ts`（删除 `hydrateBrowserDefaults` 与 `_defaultsHydrated`）
- Modify: `frontend/src/app/stores/slices/browserTabsSlice.ts`、`browserFoldersSlice.ts`、`browserBookmarkSlice.ts`、`browserHistorySlice.ts`、`browserLandingSlice.ts`、`browserSearchEnginesSlice.ts`（写盘改走 `persist`）

**Interfaces:**
- Consumes: `defineEntry` / `readBooleanRecord` / `readBooleanPropRecord`、`persistField`、`pruneByWorkspaceId` / `pruneByTabId`
- Produces:
  - `type CompositeHydrator = { name: string; build: (reads: ReadFn) => Partial<StoreState> }`
  - `const compositeHydrators: CompositeHydrator[]`（`hydrateAll` 在简单条目之后应用它们）
  - `function buildBrowserTabUrlMap(input: { tabs: BrowserTabState[]; workspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]>; tabFolders: TabFolderState[]; persistedMap: Record<string, string> }): Record<string, string>`
  - `function markResolvedTitles(tabs: BrowserTabState[]): BrowserTabState[]`

**登记清单**

| 现键名 | 新键名 | 字段 | scope | 解析器 | 剪枝 |
|---|---|---|---|---|---|
| `adl-ui:browser-tabs` | `adl:browser.tabs` | `browserTabs` | global | 自定义（数组 + 逐项校验） | — |
| `adl-ui:browser-active-tab` | `adl:browser.activeTabId` | `browserActiveTabId` | global | 字符串 | — |
| `adl-ui:browser-tab-folders` | `adl:browser.tabFolders` | `browserTabFolders` | global | 数组 | — |
| `adl-ui:browser-tab-tree-expanded` | `adl:browser.tabTreeExpanded` | `browserTabTreeExpanded` | byTabId | `readBooleanRecord` | 见 Step 4 |
| `adl-ui:browser-history` | `adl:browser.history` | `browserHistory` | global | 数组（上限 100） | — |
| `adl-ui:browser-bookmarks` | `adl:browser.bookmarks` | `browserBookmarks` | global | 数组 | — |
| `adl-ui:browser-workspace-bookmarks` | `adl:browser.workspaceBookmarks` | `browserWorkspaceBookmarks` | byWorkspaceId | 两层对象 | `pruneByWorkspaceId` |
| `adl-ui:browser-bookmark-tabid-url-map` | `adl:browser.tabIdUrlMap` | `browserBookmarkTabIdUrlMap` | global | 字符串映射 | — |
| `adl-ui:browser-shortcuts` | `adl:browser.shortcuts` | `browserShortcuts` | global | 数组 | — |
| `adl-ui:browser-local-ports` | `adl:browser.localPorts` | `browserLocalPorts` | global | 数组 | — |
| `adl-ui:browser-bg-config` | `adl:browser.bgConfig` | `browserBgConfig` | global | 对象（`mode`/`fit` 校验） | — |
| `adl-ui:browser-configured-ports` | `adl:browser.configuredPorts` | `browserConfiguredPorts` | global | 数字数组 | — |
| `adl-ui:browser-navigator-width` | `adl:browser.navigatorWidth` | `browserNavigatorWidth` | global | `readNumberInRange(180, 300)` | — |
| `adl-ui:browser-navigate-in-place` | `adl:browser.navigateInPlace` | `browserNavigateInPlace` | global | `readFlag` | — |
| `adl:browser:searchEngines` | `adl:browser.searchEngines` | `searchEngines` | global | 数组 | — |
| `adl:browser:defaultSearchEngineId` | `adl:browser.defaultSearchEngineId` | `defaultSearchEngineId` | global | 字符串 | — |
| `adl-ui:browser-workspace-expanded` | 不登记 | — | — | — | 无消费者的死状态，Task 20 删除 |

- [ ] **Step 1: 写失败测试（跨键归一化）**

创建 `frontend/src/app/stores/persisted/__tests__/composite.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { buildBrowserTabUrlMap, markResolvedTitles } from '../composite';

describe('markResolvedTitles', () => {
  it('marks tabs with a real title as resolved', () => {
    const tabs = [{ id: 'browser-1', title: 'Example', url: 'https://example.com' }];
    expect(markResolvedTitles(tabs as never)[0].titleResolved).toBe(true);
  });

  it('keeps an explicit titleResolved flag untouched', () => {
    const tabs = [{ id: 'browser-1', title: '新建标签页', url: '', titleResolved: false }];
    expect(markResolvedTitles(tabs as never)[0].titleResolved).toBe(false);
  });

  it('does not mutate the input array', () => {
    const tabs = [{ id: 'browser-1', title: 'Example', url: 'https://example.com' }];
    markResolvedTitles(tabs as never);
    expect('titleResolved' in tabs[0]).toBe(false);
  });
});

describe('buildBrowserTabUrlMap', () => {
  it('prefers workspace bookmark urls, then folder tab urls, then the persisted map', () => {
    const map = buildBrowserTabUrlMap({
      tabs: [{ id: 'tab-b', url: 'https://from-tab.test' }] as never,
      workspaceBookmarks: { ws1: [{ tabId: 'tab-a', url: 'https://from-bookmark.test' }] } as never,
      tabFolders: [{ tabs: [{ tabId: 'tab-b' }] }] as never,
      persistedMap: { 'tab-c': 'https://from-persisted.test' },
    });
    expect(map).toEqual({
      'tab-a': 'https://from-bookmark.test',
      'tab-b': 'https://from-tab.test',
      'tab-c': 'https://from-persisted.test',
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/composite.test.ts
```

Expected: FAIL —— `Failed to resolve import "../composite"`。

- [ ] **Step 3: 实现 `composite.ts`**

把 `browserSlice.ts:84-168` 中"标题真实性结算"与"tabId→URL 映射构建"两段逻辑**原样迁出**为纯函数（逻辑不变，仅去掉对 store 的依赖）：

```ts
import { isRealTitle } from '@utils/browserDisplayUtils';
import type { StoreState } from '../StoreState';
import type { BrowserTabState } from '../slices/browserSliceShared';
import type { WorkspaceBookmarkEntry } from '../slices/browserTypes';
import type { TabFolderState } from '../slices/browserFoldersSlice';

/** 跨键归一化器：需要在简单条目读完之后、基于多个键的共同结果构建补丁 */
export type CompositeHydrator = {
  name: string;
  build: (read: (key: string) => unknown) => Partial<StoreState>;
};

export function markResolvedTitles(tabs: BrowserTabState[]): BrowserTabState[] {
  return tabs.map((tab) => ({
    ...tab,
    titleResolved:
      typeof tab.titleResolved === 'boolean'
        ? tab.titleResolved
        : isRealTitle(tab.title, tab.url ?? ''),
  }));
}

export function buildBrowserTabUrlMap(input: {
  tabs: BrowserTabState[];
  workspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]>;
  tabFolders: TabFolderState[];
  persistedMap: Record<string, string>;
}): Record<string, string> {
  const tabsById = new Map(input.tabs.map((tab) => [tab.id, tab]));
  const result: Record<string, string> = {};
  for (const entries of Object.values(input.workspaceBookmarks)) {
    for (const entry of entries) {
      if (entry.url && !result[entry.tabId]) {
        result[entry.tabId] = entry.url;
      }
    }
  }
  for (const folder of input.tabFolders) {
    for (const item of folder.tabs ?? []) {
      if (result[item.tabId]) {
        continue;
      }
      const url = tabsById.get(item.tabId)?.url;
      if (url) {
        result[item.tabId] = url;
      }
    }
  }
  for (const [tabId, url] of Object.entries(input.persistedMap)) {
    if (!result[tabId]) {
      result[tabId] = url;
    }
  }
  return result;
}

export const compositeHydrators: CompositeHydrator[] = [
  {
    name: 'browserTabs',
    build: (read) => {
      const persistedTabs = (read('adl:browser.tabs') as BrowserTabState[] | undefined) ?? [];
      if (persistedTabs.length === 0) {
        return {};
      }
      const tabs = markResolvedTitles(persistedTabs);
      const persistedActiveTabId = read('adl:browser.activeTabId') as string | undefined;
      const activeTabId =
        persistedActiveTabId && tabs.some((tab) => tab.id === persistedActiveTabId)
          ? persistedActiveTabId
          : (tabs[tabs.length - 1]?.id ?? '');
      return {
        browserTabs: tabs,
        browserTabsById: Object.fromEntries(tabs.map((tab) => [tab.id, tab])),
        browserActiveTabId: activeTabId,
      };
    },
  },
  {
    name: 'browserTabIdUrlMap',
    build: (read) => ({
      browserBookmarkTabIdUrlMap: buildBrowserTabUrlMap({
        tabs: (read('adl:browser.tabs') as BrowserTabState[] | undefined) ?? [],
        workspaceBookmarks:
          (read('adl:browser.workspaceBookmarks') as
            | Record<string, WorkspaceBookmarkEntry[]>
            | undefined) ?? {},
        tabFolders: (read('adl:browser.tabFolders') as TabFolderState[] | undefined) ?? [],
        persistedMap:
          (read('adl:browser.tabIdUrlMap') as Record<string, string> | undefined) ?? {},
      }),
    }),
  },
];
```

在 `hydrate.ts` 的 `hydrateAll()` 末尾追加 composite 应用（`read` 回调直接读注册键的原始值）：

```ts
  for (const hydrator of compositeHydrators) {
    Object.assign(patch, hydrator.build((key) => readJson<unknown>(key, undefined)));
  }
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/composite.test.ts
```

Expected: PASS（5 个用例全绿）。

- [ ] **Step 5: 处理 `browserTabTreeExpanded` 的剪枝**

该键的路径形态为 `workspace:<wsId>` / `folder:<folderId>` / `tab:<uniqueKey>:<tabId>` / `history:...`。剪枝规则：

```ts
function pruneBrowserTreeExpanded(
  value: Record<string, boolean>,
  ctx: PruneCtx,
): PruneResult<Record<string, boolean>> {
  if (ctx.workspaceIds.size === 0 || ctx.tabIds.size === 0) {
    return { value, changed: false };
  }
  const next: Record<string, boolean> = {};
  let changed = false;
  for (const [path, expanded] of Object.entries(value)) {
    const isOrphan =
      (path.startsWith('workspace:') && !ctx.workspaceIds.has(path.slice('workspace:'.length))) ||
      (path.startsWith('tab:') &&
        !ctx.tabIds.has(path.slice(path.lastIndexOf(':') + 1)));
    if (isOrphan) {
      changed = true;
      continue;
    }
    next[path] = expanded;
  }
  return changed ? { value: next, changed: true } : { value, changed: false };
}
```

把该函数放入 `prune.ts` 并加 3 条单测到 `prune.test.ts`（孤儿 folder 路径保留、孤儿 workspace 路径剔除、空清单跳过）。`folder:` 与 `history:` 前缀的路径**不剪**（folder 删除当前无剪枝路径，登记为后续子项目 F3 写入任务 28 的收尾文档）。

- [ ] **Step 6: 追加登记、删除 idle 水合、写盘改走 `persist`**

按上表追加条目（`browserWorkspaceExpanded` 不登记）；删除 `browserSlice.ts:75-203` 的 `hydrateBrowserDefaults`、`_defaultsHydrated` 与 `hydrateBrowserDefaults(...)` 调用；`browserTabsSlice` / `browserFoldersSlice` / `browserBookmarkSlice` / `browserHistorySlice` / `browserLandingSlice` / `browserSearchEnginesSlice` 中所有 `makePersistedWriter(...)` 与直接 `setItem` 改为 `persist(key, value)`，`browserCleanupActions.ts:37-47` 的 5 次直接 `setItem` 改为 `persist`。

- [ ] **Step 7: 全量测试 + 自检 + 提交**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores && pnpm frontend:test && pnpm frontend:typecheck
git add frontend/src/app/stores
git commit -m "refactor(stores): migrate browser panel persistence to the registry"
```

Expected: PASS；自检的 `field 唯一` 用例保持绿色。

---

## Task 10: 迁移终端面板持久化状态

**Files:**
- Modify: `frontend/src/app/stores/persisted/entry.ts`（**Step 0**：`PersistEntry` 支持"外部水合目标"，使 `field` 不再必填）
- Modify: `frontend/src/app/stores/persisted/hydrate.ts`（**Step 0**：对无 `field` 的条目调用其 `apply` 汇聚器）
- Modify: `frontend/src/app/stores/persisted/__tests__/registrySelfCheck.test.ts`（**Step 0**：新增"`field` / `apply` 恰有其一"断言）
- Modify: `frontend/src/app/stores/persisted/registry.ts`
- Create: `frontend/src/app/stores/persisted/terminalComposite.ts`（终端复合水合器，见 Step 1b）
- Modify: `frontend/src/app/stores/slices/terminalSlice.ts`（删除 `hydrateTerminalDefaults` 与 `_defaultsHydrated`；8 个私有 writer 退役）
- Modify: `frontend/src/app/features/terminal/terminalCwdStore.ts`
- Modify: `frontend/src/app/features/terminal/terminalHistoryStore.ts`
- Modify: `frontend/src/app/features/terminal/terminalRegionCollapse.ts`
- Modify: `frontend/src/app/features/terminal/terminalViewPrefs.ts`
- Create: `frontend/src/app/stores/slices/__tests__/terminalPersistence.test.ts`
- Create: `frontend/src/app/stores/persisted/__tests__/terminalComposite.test.ts`

**Interfaces:**
- Consumes: `defineEntry` / `readBooleanRecord` / `readStringEnum`、`persistField` / `persist`、`pruneByWorkspaceId` / `pruneByTabId`
- Produces: 终端侧登记键（见下表）+ `adl:terminal.*` 命名空间

**为什么需要 Step 0（规格 §3.2.1 的 `Entry` 里从来没有 `field`）**

初稿表格把 `viewPrefs` / `regionCollapse` / `cwdByTab` / `historyIndex` 的"字段"写成 `terminalViewPrefs` 等，但**这四个字段在 `StoreState` / `TerminalSlice` 中并不存在** —— 它们住在 `features/terminal/` 下的四个模块级微型存储里（`load()/save()` + 各自的 `makePersistedWriter`）。`field` 是 `keyof StoreState` 的必填项（`entry.ts:79`），因此按原文写**无法通过类型检查**。

同时，把它们搬进 Zustand store 是**错的**：规格 §3.3 要点 3 明确要求"终端历史索引这类大对象不允许进入构造期同步读"，而搬进 store 会让它常驻并随每次 `saveAll` 触发 store 通知。正确做法是让登记表支持"**外部水合目标**"：条目声明 `apply(value)` 汇聚器而非 `field`，水合时把校验后的值交回模块自己的缓存。

**登记清单 — 甲类：store 字段（`field`）**

| 现键名 | 新键名 | 字段 | scope | 解析器 | 剪枝 |
|---|---|---|---|---|---|
| `adl-ui:terminal-tabs` | `adl:terminal.tabs` | `terminalTabs` | global | 数组（复用 `isTerminalTabState` 条目校验器） | — |
| `adl-ui:terminal-active-tab` | `adl:terminal.activeTabId` | `terminalActiveTabId` | global | 字符串 | — |
| `adl-ui:terminal-default-profile` | `adl:terminal.defaultProfile` | `defaultTerminalProfile` | global | 字符串枚举（profile 白名单） | — |
| `adl-ui:terminal-workspace-default-profiles` | `adl:terminal.workspaceDefaultProfiles` | `workspaceDefaultProfiles` | byWorkspaceId | 字符串映射 | `pruneByWorkspaceId` |
| `adl-ui:terminal-shell-selector-profile` | `adl:terminal.shellSelectorProfile` | `shellSelectorProfile` | global | 字符串枚举 | — |
| `adl-ui:terminal-navigator-width` | `adl:terminal.navigatorWidth` | `terminalNavigatorWidth` | global | `readNumberInRange(180, 480)` | — |
| `adl-ui:terminal-workspace-expanded` | `adl:terminal.workspaceExpanded` | `terminalWorkspaceExpanded` | byWorkspaceId | `readBooleanRecord` | `pruneByWorkspaceId` |
| `adl-ui:terminal-workspace-id` | `adl:terminal.workspaceId` | `terminalWorkspaceId` | global | 字符串 | — |

**登记清单 — 乙类：外部微型存储（`apply`）**

| 现键名 | 新键名 | 所有者 | scope | 解析器 | 剪枝 |
|---|---|---|---|---|---|
| `adl-terminal:view-prefs` | `adl:terminal.viewPrefs` | `terminalViewPrefs.ts` | global | `normalizeTerminalViewPrefs` | — |
| `adl-terminal:region-collapse` | `adl:terminal.regionCollapse` | `terminalRegionCollapse.ts` | byTabId | `normalizeRegionCollapseMap` | —（见下） |
| `adl-terminal:cwd-by-tab` | `adl:terminal.cwdByTab` | `terminalCwdStore.ts` | byTabId | 字符串映射 | —（见下） |
| `adl-terminal:history-index` | `adl:terminal.historyIndex` | `terminalHistoryStore.ts` | byTabId | `normalizeHistoryIndex` | —（见下）；**`sync: false`** |

> **为什么乙类三条不声明 `prune`（本任务裁定）**：`pruneRegistry` 的契约是"给 store 快照 → 返回 store 补丁"，它靠 `entry.field` 取值（`prune.ts:155-156`）。乙类没有 store 字段，故无法被现有编排执行；**声明一个无人能执行的 `prune` 等于假完整**（本计划已多次踩到"看起来完成实则没有"的坑）。真实清理路径分两种、都已存在或另有归属：①`cwd` / `historyIndex` 的消费方已有"载入 → 过滤失效项 → 回写快照"的自清理（`useTerminalPtyLifecycle.ts:109,120` 与 `:568,580`）；②`regionCollapse` 与乙类的按标签孤儿清理，连同乙类剪枝所需的取值能力，一并归 **Task 17**（Phase 4 剪枝接线）统一设计。这是**显式延期**，不是遗漏。

| `adl-ui:terminal-persisted` | 不登记 | — | — | — | 死字段，Task 20 删除 |

> `adl:terminal.historyIndex` 是登记表中**唯一**标注 `sync: false` 的条目：它随会话数增长，可能超过 32 KB，不得进入构造期同步读。它在对应 tab 激活时按需读取（沿用既有 `ensureHistoryIndexLoaded`）—— 这是规格 §3.3 要点 3 允许的**唯一**按需读取例外，`sync: false` 条目既不产出 store 补丁、也不调用 `apply`。

**乙类的统一改造方式（四个文件同构，逐个照做）**

四个微型存储当前都是 `load()/loadAll()`（每次调用 `readJson` 重新解析）+ `save()/saveAll()`（私有去抖 `makePersistedWriter`）。改造为：

1. 模块级缓存 `let cache: T = <fallback>`；`load()/loadAll()` 改为**返回缓存**（起效后不再每次重解析 JSON）。
2. 登记条目声明 `apply: (value) => { cache = value; }` —— 构造期水合把校验+剪枝后的值交回缓存。
3. `save()/saveAll()` 改为 `cache = next; persist('<新键名>', next)` —— 退役私有去抖，接入共享去抖与关窗 flush（这正是本任务要修的既有缺陷：这四个 writer **未注册进 `flushCrossSliceWrites`，关窗瞬间的写入必丢**）。
4. `historyIndex` 例外：`sync: false` 故 `apply` 不会被构造期调用；`loadAll()` **不得**改成"只返回空缓存"，必须保持**先按需读一次存储、再返回缓存**的语义（沿用既有 `ensureHistoryIndexLoaded` 思路）。**否则会静默回归**：`TerminalHistoryBudgetSection.tsx:139` 在 `useMemo` 里直接调 `loadAll()` 统计已用字节 —— 若返回空缓存，存储预算面板会显示 0。
5. 删除四个 `_KEY` 常量中的**旧字面量**（改成新键名即可，`keepListGuard` 不允许旧字面量残留于生产代码）。

**模块加载方向（会导致运行时循环依赖，必须遵守）**

甲类与乙类的水合方向相反：甲类由 `hydrateAll` 产出 store 补丁，乙类由 `hydrateAll` 调用条目自带的 `apply`。因此 **`registry.ts` 必须 import 那四个外部模块**，形成 `persisted → features/terminal` 的依赖。为了让这条边不成环：

- 四个外部模块**只能** import `@stores/persisted/persist`（`persist.ts` 对 registry 是 `import type`，编译期擦除，运行时不成环）；
- **禁止** import `@stores/persisted/apply`（`apply.ts:3` 是 registry 的**值**导入 → 会形成 `registry → feature → apply → registry` 的运行时环，表现为启动时 `undefined`）；
- 也**禁止**从 `slices/*` 或 `slicedStore` 反向导入（会触发 store 在 registry 求值中途被构造）。

四个外部模块目前只依赖 `@stores/storageHelpers`，改造后新增依赖仅限 `persist`，方向安全。`apply` 闭包引用模块级 `cache` 变量，在全部模块求值完成后才被调用，顺序安全。

- [ ] **Step 0: 扩展登记表契约以支持外部水合目标**

`entry.ts`：把 `field: keyof StoreState` 改为"`field` 与 `apply` 恰有其一"的联合：

```ts
type EntryBase<T> = {
  key: string;
  fallback: T;
  scope: PersistScope;
  read?: (raw: unknown) => T | undefined;
  prune?: (value: T, ctx: PruneCtx) => PruneResult<T>;
  sync?: boolean;
};

export type PersistEntry<T> = EntryBase<T> &
  (
    | { field: keyof StoreState; apply?: never }
    | { field?: never; /** 水合目标为模块级微型存储：把校验后的值交回其缓存 */ apply: (value: T) => void }
  );
```

`hydrate.ts`：对 `sync !== false` 的条目，若有 `field` 则写入 `patch`，否则调用 `apply(validated)`；`sync: false` 的条目两条路都不走（既不入补丁也不调 `apply`）。

`registrySelfCheck.test.ts`：把 `field 唯一` 断言改为只遍历带 `field` 的条目；新增断言"每条 ①`field` ②`apply` 恰有其一"（`field !== undefined) !== (apply !== undefined` 必须为真），并保留"每条有 `fallback` 与合法 `scope`"。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/stores/slices/__tests__/terminalPersistence.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';

describe('terminal panel persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it('restores terminalWorkspaceExpanded after a simulated restart', () => {
    useAppStore.getState().setTerminalWorkspaceExpanded({ __independent__: true });
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.terminalWorkspaceExpanded).toEqual({ __independent__: true });
  });

  it('restores the active terminal tab id', () => {
    // 真实方法名是 terminalSelectTab（terminalSlice.ts:241）；不存在 terminalSetActiveTab
    useAppStore.getState().terminalSelectTab('terminal-abc');
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.terminalActiveTabId).toBe('terminal-abc');
  });

  it('keeps the history index out of the synchronous hydration patch', () => {
    localStorage.setItem('adl:terminal.historyIndex', JSON.stringify({ 'terminal-1': [] }));
    const { patch } = hydrateAll();
    expect(patch.terminalHistoryIndex).toBeUndefined();
  });
});
```

- [ ] **Step 1b: 终端复合水合器（保住被删除的派生行为）**

创建 `frontend/src/app/stores/persisted/terminalComposite.ts`，与 T9 的 `composite.ts` 同构：接在简单条目之后执行，只负责**跨键派生**。要搬过来的行为（都来自即将删除的 `hydrateTerminalDefaults`）：

| 行为 | 现状 | 必须保住 |
|---|---|---|
| `terminalTabsById` | `hydrateTerminalDefaults` 里 `buildTabsById(tabs)`；且每次 tab 变更也重建 | 重启后由水合重建；否则标签按 id 检索全失效 |
| `shellSelectorProfile` 回退链 | 读自己的键 → 非法则回退 `defaultTerminalProfile` → 再非法则 `'powershell'` | 三档回退逐档保留，缺一档即改变观感 |

**关键约束（T9 已踩过的坑）**：复合水合器**不得**自写一套"期望形状"校验，必须复用登记表的条目校验器（`terminalTabs` 用 `isTerminalTabState`）。语义与 T9 一致：**键不存在 ⇒ 视为空；键存在但损坏 ⇒ 不产出补丁**（绝不把畸形值写回 store）。

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/slices/__tests__/terminalPersistence.test.ts
```

Expected: FAIL。注意 `terminalSetActiveTab` 在现有代码中**不存在**，真实方法名是 `terminalSelectTab`（`terminalSlice.ts:241`）—— 上面测试已按真实名写好，不得为此新增方法。

- [ ] **Step 3: 追加登记、删除 idle 水合、写盘改走 `persist`**

按甲、乙两张表追加条目；删除 `terminalSlice.ts:95-160` 的 `hydrateTerminalDefaults` / `_defaultsHydrated` 及其调用。

**8 个私有 writer 全部退役**（`terminalSlice.ts:85-92`），对应替换为 `persist` / `persistField`：

| 退役 writer | 替换 |
|---|---|
| `writeTerminalTabs` / `writeTerminalActiveTab` / `writeDefaultProfile` / `writeWorkspaceDefaultProfiles` / `writeWorkspaceExpanded` / `writeNavigatorWidth` / `writeTerminalWorkspaceId` / `writeShellSelectorProfile` | 一律 `persist('<新键名>', value)`；所在 setter 若同时改 store 字段，则 `set(persistField('<新键名>', value))`，**两者合并为一次 `persistField`**，不再"先 setItem 再去抖双写" |

**4 处 `setItem` + writer 双写必须收敛为单次 `persist`**：`terminalSlice.ts:344`（defaultProfile）、`:356`（workspaceDefaultProfiles）、`:400`（workspaceId）、`:410`（shellSelectorProfile）。双写是历史遗留，本任务统一为单通道 —— 这也是"写盘注册表漏项"缺陷的落点。

**`PERSIST_KEEP_KEYS` 收窄**：删除上表 12 个已登记键（含 `adl-ui:terminal-*` 8 个与 `adl-terminal:*` 4 个）；`'adl-ui:terminal-persisted'` **保留**（死字段，Task 20 删除）。预期 keep 清单剩 **22** 条。

- [ ] **Step 4: 运行测试确认通过并提交**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/slices/__tests__/terminalPersistence.test.ts && pnpm frontend:test
git add frontend/src/app/stores
git commit -m "refactor(stores): migrate terminal panel persistence to the registry"
```

Expected: PASS。

---

## Task 11: 迁移检索侧持久化状态

**Files:**
- Modify: `frontend/src/app/stores/persisted/registry.ts`
- Modify: `frontend/src/app/stores/persisted/parsers.ts`（新增取整版数值解析器）
- Create: `frontend/src/app/stores/persisted/searchComposite.ts`（检索复合水合器，见 Step 1b）
- Modify: `frontend/src/app/stores/persisted/hydrate.ts`（挂载第三个复合循环）
- Modify: `frontend/src/app/stores/slices/searchSlice.ts:13-16,148-208,213-275`（删 4 个遗留键常量与 4 个创建期读取器；写盘改走 `persist`）
- Create: `frontend/src/app/stores/slices/__tests__/searchPersistence.test.ts`
- Create: `frontend/src/app/stores/persisted/__tests__/searchComposite.test.ts`

**Interfaces:**
- Consumes: `defineEntry`、`persist` / `persistField`、`pruneByWorkspaceId`
- Produces: 检索侧登记键 + `adl:search.*` 命名空间

**登记清单（读界已按 `searchSlice.ts` 实际的 `clamp` 参数核准，非初稿数字）**

| 现键名 | 新键名 | 字段 | scope | 解析器 | 剪枝 |
|---|---|---|---|---|---|
| `adl-search:page-size` | `adl:search.pageSize` | `searchPageSize` | global | 取整 + `readNumberInRange(SEARCH_PAGE_SIZE_MIN, SEARCH_PAGE_SIZE_MAX)` = **[50, 1000]**；fallback `SEARCH_PAGE_SIZE` = **200** | — |
| `adl-search:max-results` | `adl:search.maxResults` | `searchMaxResults` | global | 取整 + `readNumberInRange(SEARCH_PAGE_SIZE, SEARCH_HARD_MAX_RESULTS)` = **[200, 20000]**；fallback `SEARCH_MAX_RESULTS` = **5000** | — |
| `adl-search:ignored-paths` | `adl:search.ignoredPaths` | `searchIgnoredPaths` | byWorkspaceId | 复用既有归一化清洗（`normalizeIgnoredEntry` + 去重）迁入 `parsers.ts`，**不得保留第二份** | `pruneByWorkspaceId` |
| `adl-search:use-gitignore` | `adl:search.useGitignore` | `searchUseGitignore` | byWorkspaceId | 布尔映射 | `pruneByWorkspaceId` |

> **初稿表格的两个数字都是错的**：初稿写 `readNumberInRange(10, 500)` 与 `(100, 10000)`；真值是 `[50, 1000]`（`SEARCH_PAGE_SIZE_MIN/MAX`）与 `[200, 20000]`（下界是 `SEARCH_PAGE_SIZE` 而非某个 MIN 常量，上界 `SEARCH_HARD_MAX_RESULTS`）。全部四个常量应从 `@shared/ipc/searchWindow` 导入，**不得在登记表里重打数字**。
>
> **取整不可省**：既有读路径是 `Math.floor(readNumber(...))`，而 `readNumberInRange` 只做钳制不取整（`parsers.ts:9-16`）。两者差一个 `Math.floor`，直接复用会改变语义（持久化的 `200.7` 由 200 变为 200.7）。故 `parsers.ts` 新增取整版（如 `readFlooredNumberInRange(min, max)`），两条数值条目共用它 —— 不要在两处各写一次 `Math.floor`。

**Step 1b：检索复合水合器（保住创建期被删除的两项派生）**

`searchSlice.ts:215-216` 的创建期读取里有两条**跨键派生**，删掉读取器后会无声丢失，必须由复合水合器承接（新建 `persisted/searchComposite.ts`，导出 `searchCompositeHydrators: CompositeHydrator[]`，并在 `hydrate.ts` 中作为第三个复合循环挂载；消费 `priorPatch` 快照而非原始键）：

| 派生 | 现状 | 必须保住 |
|---|---|---|
| `searchMaxResults` 自愈 | `Math.max(readSearchMaxResults(), initialPageSize)`（事项 N1'） | 历史脏组合 `page > max` 重载后自愈 |
| `searchLimit` 初值 | `searchLimit: initialPageSize`（事项 L5） | 重载后**首屏即按用户步长**请求；否则回落常量 200。`searchLimit` 有真实消费者（`FileNavigatorShell.tsx:235`、`searchActions.ts:78,140,287,300,327`），**且它不是持久化字段**，只能由复合水合器产出 |

`priorPatch` 中两条字段由简单条目保证存在（`hydrateAll` 对缺失键写 fallback），故直接 `Math.max(priorPatch.searchMaxResults, priorPatch.searchPageSize)` 即可。**不要为这次纠偏新增写盘** —— 旧代码也只改内存、不回写（自愈结果由用户下一次保存自然落盘）。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/stores/slices/__tests__/searchPersistence.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';

describe('search settings persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it('restores the per-workspace ignored paths after a simulated restart', () => {
    useAppStore.getState().setSearchIgnoredPaths('workspace_a', ['node_modules']);
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.searchIgnoredPaths).toEqual({ workspace_a: ['node_modules'] });
  });

  it('clamps an out-of-range page size on hydration', () => {
    localStorage.setItem('adl:search.pageSize', '99999');
    const { patch } = hydrateAll();
    expect(patch.searchPageSize).toBe(1000);
  });
});
```

两处已按真实语义收紧：`setSearchIgnoredPaths` 已确认为真实 setter 名（`searchSlice.ts:267`）；上界断言由 `toBeLessThanOrEqual(500)` 改为**上确界** `toBe(1000)`（`SEARCH_PAGE_SIZE_MAX`），因为"小于等于某数"对任何更小的错误上界都会通过 —— 属断言空转风险。

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/slices/__tests__/searchPersistence.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 追加登记并改写写入路径**

按上表追加条目；删除 `searchSlice.ts:13-16` 的四个遗留键常量（**已核实：全仓无外部消费者**，可整体删除）与 `:148-208` 的四个创建期读取器；写盘改为 `persist` / `persistField`。

**必须保留（这是 T7 踩过的坑：迁移时顺手丢掉写时保护）**：

- 四个 setter 里的 `Number.isFinite` 早退与 `clamp(Math.floor(value), …)` —— 读侧 `readNumberInRange` 只是兜底，**不替代写时边界**；
- `setSearchPageSize` 里"步长超过当前上限时同步上调上限"的**第二处写盘**（`next > maxResults` → `persistField('adl:search.maxResults', maxed)`）。同一 setter 写两个键时**合并为一次 `set`**（把两个 `persistField` 的补丁展开进同一个对象），不要连续两次 `set`；
- `setSearchMaxResults` 的下界 `Math.max(SEARCH_PAGE_SIZE, _get().searchPageSize)`（保证 `page ≤ max` 闭合）。

**写出格式无变化（免疑虑）**：旧路径 `writeNumber` 存 `String(value)`（如 `"200"`），新路径 `persist` → `writeJson` 存 `JSON.stringify(value)`（`JSON.stringify(200) === "200"`）；数值与对象两种形态都逐字相同，故不构成格式迁移、无需兼容代码。行为差异仅有一处且是设计目标：写出由**同步直写**变为**共享去抖**（关窗 flush 覆盖，`pagehide` 兜底见 Task 21）。

- [ ] **Step 4: 运行测试确认通过并提交**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/slices/__tests__/searchPersistence.test.ts && pnpm frontend:test && pnpm frontend:typecheck
git add frontend/src/app/stores
git commit -m "refactor(stores): migrate search settings persistence to the registry"
```

Expected: PASS。至此四面板的"四套写盘做法"已全部收敛为唯一通道 —— 扫描范围限定为四面板对应文件（ledger B2 裁定；其余面板工具的收敛见 Task 29）。

> 门禁分两段（下方两条命令）：**主扫描** 用显式文件清单，**定点检查** 覆盖被排除的那一个文件。两段都必须跑，缺一不可。
>
> **文件清单已由 `browser*.ts` 通配收窄为显式列举**：通配会匹配 `browserFoldersSlice.ts`（含 T9 有意留下的死键 writer，归 Task 20 删除），使门禁不可满足。收窄时另外 6 个被通配匹配到的 browser 文件（`browserDownloadsSlice` / `browserFoldersDeletion` / `browserFoldersTypes` / `browserFoldersUtils` / `browserSliceShared` / `browserTypes`）已逐一核查**无裸写**，故收窄不产生盲区；这是有意的收窄，不是疏漏。

```bash
# 主扫描：四面板文件，排除唯一例外文件 browserFoldersSlice.ts
cd ai-digital-life && grep -rn "makePersistedWriter\|createDebouncedWrite\|setItem(" \
  frontend/src/app/stores/slices/uiSlice.ts \
  frontend/src/app/stores/slices/uiSliceWidths.ts \
  frontend/src/app/stores/slices/workspaceSlice.ts \
  frontend/src/app/stores/slices/browserSlice.ts \
  frontend/src/app/stores/slices/browserTabsSlice.ts \
  frontend/src/app/stores/slices/browserBookmarkSlice.ts \
  frontend/src/app/stores/slices/browserHistorySlice.ts \
  frontend/src/app/stores/slices/browserLandingSlice.ts \
  frontend/src/app/stores/slices/browserSearchEnginesSlice.ts \
  frontend/src/app/stores/slices/terminalSlice.ts \
  frontend/src/app/stores/slices/searchSlice.ts \
  frontend/src/app/stores/actions/workspaceTreeActions.ts \
  frontend/src/app/stores/actions/gitFileOpsActions.ts \
  frontend/src/app/stores/actions/browserCleanupActions.ts \
  | grep -v "__tests__"
```

Expected: 无输出。

```bash
# 定点检查：唯一例外文件必须恰好 2 处，且就是这两行
cd ai-digital-life && grep -n "makePersistedWriter\|createDebouncedWrite\|setItem(" \
  frontend/src/app/stores/slices/browserFoldersSlice.ts
```

Expected: **恰好 2 行**，内容为 `:2` 的 import 与 `:20` 的 `makePersistedWriter(BROWSER_WORKSPACE_EXPANDED_KEY)`；**任何第三处出现即视为失败**。

**为什么不是简单地 `grep -v` 一行（初稿此处自相矛盾，且我第一次的修正也不够）**

初稿的期望是"无输出"，但 `browser*.ts` 会匹配到 `browserFoldersSlice.ts`，该文件仍写遗留键 `adl-ui:browser-workspace-expanded`。**这条 writer 是 T9 有意留下的**：该键属死状态，T9 裁定不登记、字面量留在源码并留在 `PERSIST_KEEP_KEYS`，删除职责归 Task 20。故初稿门禁在 T11 完成的当天就无法通过。

我第一次的修正（`grep -v "BROWSER_WORKSPACE_EXPANDED_KEY"`）**仍然不够**：该文件第 2 行是 `import { createUiId, makePersistedWriter } from '../shared'`，不含该键名，不会被过滤掉 —— 门禁依旧输出一行。故改为"**主扫描排除整个文件 + 对该文件做定点计数**"：排除避免门禁不可满足，定点计数（恰好 2 行）防止该文件成为"裸写盲区"——若将来有人往里加第三个 writer，门禁仍会失败。

**例外的到期机制**：Task 20 的 Files 清单已点名到行（writer / setter / 键常量 / 两处再导出 / selectors / 清理入参），Phase 5 之后该文件在扫描中不再需要排除，Task 21 的全仓门禁将不带任何例外。

**已核实该例外自证"死"**：`setBrowserWorkspaceExpanded`（`browserFoldersSlice.ts:41,251`）全仓**无调用点**，`writeWorkspaceExpanded` 仅被该 setter 调用（`:252`），故运行时不可达。注意**字段本身并非全死** —— `browserCleanupActions.ts:33,44,69`、`browserCleanupHelpers.ts:37-55`、`browserSelectors.ts:84-85` 仍读它，所以不能在此任务里只删 writer 而留字段（那是半拉子）；其完整清除属 Task 20。

---

## Task 12: 折叠意图 —— `DirExpansion` 结构与三条转移规则

**Files:**
- Modify: `frontend/src/app/stores/slices/uiSliceTypes.ts:59-60,91`（`FileTreeExpansionState` 指向新结构；**`TreeExpansionState` 保持扁平不动** —— 它仍是变更侧 `expandedChangesTreePaths:92` 与三个树组件的叶级 prop 类型，T14 才改造变更侧）
- Modify: `frontend/src/app/stores/slices/uiSliceExpansion.ts`（三条转移规则 + 结构）
- Modify: `frontend/src/app/stores/persisted/parsers.ts`（新增 `readDirExpansion`）
- Modify: `frontend/src/app/stores/persisted/prune.ts`（`pruneDirExpansion`）
- Modify: `frontend/src/app/stores/persisted/registry.ts`（`adl:files.dirExpanded` 的 read/prune 换成新结构；**`adl:changes.dirExpanded` 保持 `readBooleanRecord` / `pruneDirPathsByWorkspace` 不动**）
- Modify: `frontend/src/app/stores/actions/workspaceTreeRename.ts:58-78`（新增 `remapTreeExpansion`，同时重映射 `expanded` 与 `manualCollapsed`；**既有 `remapExpandedTreePaths` 保留** —— 它仍服务于变更侧那个扁平整表）
- Modify: `frontend/src/app/stores/actions/workspaceActions.ts:106-118`（重命名重映射改用 `remapTreeExpansion`）
- Modify: `frontend/src/app/regions/right-panel/FileNavigatorTree.tsx:19`（prop 类型改为 `Record<string, TreeExpansion>`）
- Modify: `frontend/src/app/features/workspace-file-tree/MultiWorkspaceFileTree.tsx:21,100`（prop 类型同上；`:100` 解包改为 `expandedPaths[workspace.id]?.expanded ?? {}`）
- Create: `frontend/src/app/stores/slices/uiSliceExpansion.test.ts`

> **为什么 Files 清单初稿漏了后四处（本任务裁定）**：`expandedFileTreePaths` 的值结构由"扁平 `path→bool`"变为 `{ expanded, manualCollapsed }`，而**内层结构被两处组件 prop 与一处重命名重映射直接消费**（`MultiWorkspaceFileTree.tsx:100` 会解包出内层交给叶级树组件）。初稿只列了 store 侧文件，按原文实现会**直接类型报错**。已逐一核查全部消费点（`grep -rn expandedFileTreePaths`）并将上列四处纳入范围；**叶级树的 `Record<string, boolean>` prop 不受影响**（内层解包后仍是扁平表），故 `fileTree.tsx`、`WorkspaceFileTreeEntry.tsx` 等无需改动。

**Interfaces:**
- Consumes: `persistField`（Task 6）
- Produces:
  - `type TreeExpansion = { expanded: Record<string, boolean>; manualCollapsed?: Record<string, true> }`
  - `readDirExpansion(raw: unknown): TreeExpansion | undefined`
  - `pruneDirExpansion(value: TreeExpansion, ctx: PruneCtx): PruneResult<TreeExpansion>`
  - `remapTreeExpansion(value: TreeExpansion, oldPath: string, newPath: string): TreeExpansion`
  - store action 签名变化：`expandFileTreePathChain(workspaceId: string, path: string): { blocked: string[] }`（Task 13 消费该返回值）
  - 不变量：`manualCollapsed[k] === true` 与 `expanded[k] === true` **不得同时成立**

**三条语义裁定（初稿未覆盖，均已核实代码后确定）**

1. **`collapseAllFileTreePaths` 改为 `{ expanded: {} }`，并保留既有 `manualCollapsed`**。初稿未提这一处，但现状 `uiSliceExpansion.ts:96-101` 写的是 `[workspaceId]: {}` —— 新结构下 `{}` 缺少必填的 `expanded`，直接类型报错。语义上"全部折叠"= 无展开项，故 `{ expanded: {} }` 等价；`manualCollapsed` 保留（它表达"用户亲手折叠过这些"，此刻依然成立，且与 `expanded: {}` 无冲突）。

2. **`read` 对跨字段不变量做"就地修复"，而不是整字段判非法**。规格 §3.2.3 分工是"`read` 管形状、`prune` 管引用是否还在"，而"同一路径同时出现在两侧"既非形状错误也非引用消失，属**内部一致性**。两种处理方式后果不对称：整字段判非法会因一处冲突**丢掉用户全部展开态**；而冲突有唯一正确解 —— `expanded[k] === true` 表示该目录当前是展开的，与"被手动折叠"矛盾时以后者为准删除 `manualCollapsed[k]`。故裁定：`readDirExpansion` 校验形状（`manualCollapsed` 叶子必须恒为 `true`，否则判非法）+ **就地丢弃冲突项**；`pruneDirExpansion` 在按引用清理之外**再次应用同一修复**（防御后来者绕过 read 直接构造）。这是**有意偏离**本计划"任一成员不合法即整条回退"的惯例，理由是此处被破坏的值**可解释且有唯一正解**，而非不可解释。

3. **`expandFileTreePathChain` 要把 `blocked` 返出来，不能再是裸 `set(...)`**。现状（`uiSliceExpansion.ts:84-94`）是 `set((state) => {...})` 且返回值被忽略。改为返回 `{ blocked: string[] }` 时，实现须在**同一次同步执行**内既更新 state 又拿到 `blocked`（Zustand 的 `set(fn)` 是同步的，可在闭包内收集 `blocked` 后返回；或用 `_get()` 先算再 `set`）。**不得**为了拿返回值而把更新拆成两次 `set`。返回 `{ blocked: [] }` 时不得写盘（沿用既有的"无变化则原样返回 state"短路，避免每次点文件都触发一次落盘）。

- [ ] **Step 1: 写失败测试（三条转移规则）**

创建 `frontend/src/app/stores/slices/uiSliceExpansion.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { flushCrossSliceWrites } from '@stores/storageHelpers';

const WS = 'workspace_rules';

function expansion(): { expanded: Record<string, boolean>; manualCollapsed?: Record<string, true> } {
  return useAppStore.getState().expandedFileTreePaths[WS] ?? { expanded: {} };
}

describe('directory expansion intent', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ expandedFileTreePaths: {} });
  });

  it('manual collapse records both the collapsed state and the manual intent', () => {
    useAppStore.getState().setFileTreePathExpanded(WS, 'src/legacy', false);
    expect(expansion()).toEqual({ expanded: { 'src/legacy': false }, manualCollapsed: { 'src/legacy': true } });
  });

  it('manual expand clears the manual intent', () => {
    useAppStore.getState().setFileTreePathExpanded(WS, 'src/legacy', false);
    useAppStore.getState().setFileTreePathExpanded(WS, 'src/legacy', true);
    expect(expansion().expanded['src/legacy']).toBe(true);
    expect(expansion().manualCollapsed?.['src/legacy']).toBeUndefined();
  });

  it('reports the blocked directory instead of re-expanding it', () => {
    useAppStore.getState().setFileTreePathExpanded(WS, 'src/legacy', false);
    const result = useAppStore.getState().expandFileTreePathChain(WS, 'src/legacy/old.ts');
    expect(result.blocked).toEqual(['src/legacy']);
    expect(expansion().expanded['src/legacy']).toBe(false);
  });

  it('auto-expand still expands ancestors that were not manually collapsed', () => {
    useAppStore.getState().setFileTreePathExpanded(WS, 'src/legacy', false);
    const result = useAppStore.getState().expandFileTreePathChain(WS, 'src/active/now.ts');
    expect(result.blocked).toEqual([]);
    expect(expansion().expanded['src']).toBe(true);
    expect(expansion().expanded['src/active']).toBe(true);
  });

  it('persists the manual intent across a restart', () => {
    useAppStore.getState().setFileTreePathExpanded(WS, 'src/legacy', false);
    flushCrossSliceWrites();
    const stored = JSON.parse(localStorage.getItem('adl:files.dirExpanded') ?? 'null');
    expect(stored[WS].manualCollapsed).toEqual({ 'src/legacy': true });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/slices/uiSliceExpansion.test.ts
```

Expected: FAIL —— `expansion()` 返回的是扁平表，`manualCollapsed` 为 `undefined`。

- [ ] **Step 3: 实现结构、转移规则与解析/剪枝**

`uiSliceTypes.ts`：

```ts
export type TreeExpansion = {
  expanded: Record<string, boolean>;
  /** 用户亲手折叠过的路径 —— 自动展开不得覆盖（规格 §3.1.2） */
  manualCollapsed?: Record<string, true>;
};
export type FileTreeExpansionState = Record<string, TreeExpansion>;
```

`uiSliceExpansion.ts` 的三条规则实现（关键片段）：

```ts
function applySetExpanded(current: TreeExpansion, path: string, expanded: boolean): TreeExpansion {
  if (expanded) {
    const nextManual = { ...(current.manualCollapsed ?? {}) };
    delete nextManual[path];
    return { expanded: { ...current.expanded, [path]: true }, manualCollapsed: nextManual };
  }
  return {
    expanded: { ...current.expanded, [path]: false },
    manualCollapsed: { ...(current.manualCollapsed ?? {}), [path]: true },
  };
}

export function expandTreePathChainInState(current: TreeExpansion, path: string): {
  next: TreeExpansion;
  blocked: string[];
} {
  const blocked: string[] = [];
  const expanded = { ...current.expanded };
  const segments = path.split('/').filter(Boolean);
  let currentPath = '';
  for (let index = 0; index < segments.length - 1; index += 1) {
    currentPath = currentPath ? `${currentPath}/${segments[index]}` : segments[index];
    if (current.manualCollapsed?.[currentPath]) {
      blocked.push(currentPath);
      continue;
    }
    if (!expanded[currentPath]) {
      expanded[currentPath] = true;
    }
  }
  return { next: { ...current, expanded }, blocked };
}
```

`toggleFileTreePath` 改为基于 `applySetExpanded(current, path, !(current.expanded[path] ?? false))`。

`parsers.ts` 新增 `readDirExpansion`（复用 `readBooleanRecord` 校验 `expanded`，并校验 `manualCollapsed` 的叶子值恒为 `true`，否则判为不合法；**并按上文的裁定 2 就地丢弃 `expanded[k] === true` 的冲突项**）；`prune.ts` 新增 `pruneDirExpansion`（在 `pruneDirPathsByWorkspace` 基础上，额外清理 `manualCollapsed` 中已不存在、或已处于展开态的项）。

同步完成上列 Files 的其余四处改动：`workspaceTreeRename.ts` 新增 `remapTreeExpansion`、`workspaceActions.ts:106-118` 改用它、`FileNavigatorTree.tsx:19` 与 `MultiWorkspaceFileTree.tsx:21,100` 改类型与解包、`uiSliceExpansion.ts` 的 `collapseAllFileTreePaths` 改为 `{ expanded: {} }`（保留 `manualCollapsed`）。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/slices/uiSliceExpansion.test.ts
```

Expected: PASS（5 个用例全绿）。

- [ ] **Step 5: 补解析/剪枝/重映射单测，跑自检与类型检查**

在 `prune.test.ts` 追加：`manualCollapsed` 中"已不存在路径"被清理、"已展开项"（与 `expanded[k] === true` 冲突）被清理、空清单跳过。
另需覆盖本任务新引入的三条语义（初稿未列，属裁定 1/2/3 的落点）：

1. `readDirExpansion` 对冲突项**修复而非判非法**（输入同时含 `expanded[k]=true` 与 `manualCollapsed[k]=true` → 返回的 `manualCollapsed` 不含 `k`，且**其余路径全部保留**）——这条正是"不丢用户全部展开态"的守卫；
2. `remapTreeExpansion` 同时重映射两侧（`expanded` 与 `manualCollapsed` 的子树前缀都要跟着改），且**两侧都无变化时返回原对象**（保持既有的 `changed ? next : original` 引用等价约定，避免无谓落盘）；
3. `expandFileTreePathChain` 在**无可展开项时返回 `{ blocked: [] }` 且不写盘**（用 spy 或断言 localStorage 未变），防止"每点一个已展开目录就触发一次落盘"。

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted && pnpm frontend:test && pnpm frontend:typecheck
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
cd ai-digital-life
git add frontend/src/app/stores
git commit -m "feat(stores): preserve manual collapse intent against auto-expansion"
```

---

## Task 13: 折叠提示 —— 保持折叠 + 短暂闪烁

**Files:**
- Modify: `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx:554-558`
- Modify: `frontend/src/app/features/workspace-file-tree/WorkspaceFileTreeEntry.tsx`（传递 `flashPath` 到 FileTree）
- Modify: `frontend/src/app/features/file-tree/fileTree.tsx`（行级闪烁 class）
- Modify: `frontend/src/app/features/file-tree/TreeNodeRow.tsx` / `TreeRow.tsx`（`isFlashing` 样式钩子）
- Modify: `frontend/src/styles/**`（脉冲动画，`prefers-reduced-motion` 降级）

**Interfaces:**
- Consumes: `expandFileTreePathChain` 返回的 `{ blocked: string[] }`（Task 12）
- Produces: `FileTree` 新增可选 prop `flashPath?: string`；闪烁持续 1000ms 后由调用方清除

- [ ] **Step 1: 写失败测试（闪烁触发）**

在 `frontend/src/app/features/file-tree/fileTree.test.tsx` 追加：

```tsx
it('applies the flash class to the row matching flashPath', () => {
  const nodes = [{ path: 'src/legacy', name: 'legacy', kind: 'directory' as const, children: [] }];
  const { container } = render(
    <FileTree
      nodes={nodes}
      expandedPaths={{}}
      onToggle={() => undefined}
      onOpenFile={() => undefined}
      flashPath="src/legacy"
    />,
  );
  expect(container.querySelector('[data-flash="true"]')).not.toBeNull();
});

it('does not apply the flash class when flashPath is absent', () => {
  const nodes = [{ path: 'src/legacy', name: 'legacy', kind: 'directory' as const, children: [] }];
  const { container } = render(
    <FileTree nodes={nodes} expandedPaths={{}} onToggle={() => undefined} onOpenFile={() => undefined} />,
  );
  expect(container.querySelector('[data-flash="true"]')).toBeNull();
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/features/file-tree/fileTree.test.tsx
```

Expected: FAIL —— `flashPath` 属性不存在。

- [ ] **Step 3: 实现闪烁链路**

`FileTree` / `TreeNodeRow` 增加 `flashPath` 与 `data-flash="true"`；`WorkspaceFileTreeEntry` 透传；`FileNavigatorShell.tsx:554-558` 改为：

```tsx
const [flashPath, setFlashPath] = useState<string | undefined>(undefined);
const flashTimerRef = useRef<number | undefined>(undefined);

useEffect(() => {
  if (!selectedFilePath || !activeWorkspaceId) {
    return;
  }
  const { blocked } = expandFileTreePathChain(activeWorkspaceId, selectedFilePath);
  if (blocked.length === 0) {
    return;
  }
  // 目标文件位于被手动折叠的目录内：保持折叠，用一次闪烁提示位置（规格 §3.4）
  window.clearTimeout(flashTimerRef.current);
  setFlashPath(blocked[blocked.length - 1]);
  flashTimerRef.current = window.setTimeout(() => setFlashPath(undefined), 1000);
}, [expandFileTreePathChain, selectedFilePath, activeWorkspaceId]);

useEffect(() => () => window.clearTimeout(flashTimerRef.current), []);
```

样式（`styles/` 下对应文件）：

```css
@media (prefers-reduced-motion: no-preference) {
  .adl-filetree__row[data-flash='true'] {
    animation: adl-filetree-flash 1s ease-out;
  }
}
@keyframes adl-filetree-flash {
  0% { background-color: color-mix(in srgb, var(--adl-accent) 45%, transparent); }
  100% { background-color: transparent; }
}
```

`prefers-reduced-motion: reduce` 时不做动画，仅保留选中高亮（不新增可见文本，因此无需 i18n）。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/features/file-tree/fileTree.test.tsx && pnpm frontend:test
```

Expected: PASS。

- [ ] **Step 5: 手动验证（必须真机确认，不得只靠单测）**

启动 `pnpm dev:tauri`，在文件树中手动折叠某一目录（如 `src/legacy`），再通过检索结果打开该目录内的文件。Expected：目录**保持折叠**，其行闪烁一次；工具栏的"展开到当前文件"路径可用（若该按钮本次未实现，需在提交信息中记录为已知未实现项并说明原因）。

- [ ] **Step 6: 提交**

```bash
cd ai-digital-life
git add frontend/src/app/features frontend/src/styles
git commit -m "feat(files): flash the collapsed ancestor instead of re-expanding it"
```

---

## Task 14: 目录展开按工作区隔离 + 预览开关补工作区维度

**Files:**
- Modify: `frontend/src/app/stores/slices/uiSliceTypes.ts`（`expandedChangesTreePaths` 类型）
- Modify: `frontend/src/app/stores/slices/uiSliceExpansion.ts`（变更树三处 action 加 `workspaceId` 参数）
- Modify: `frontend/src/app/regions/right-panel/panels/ChangesPanel/**`（调用点补 `workspaceId`）
- Modify: `frontend/src/app/stores/persisted/registry.ts`（两条条目改为按工作区隔离）
- Create: `frontend/src/app/stores/slices/changesExpansionScope.test.ts`

**Interfaces:**
- Consumes: `TreeExpansion`（Task 12）
- Produces:
  - `expandedChangesTreePaths: Record<string, TreeExpansion>`（与文件树同构）
  - `setChangesTreePathExpanded(workspaceId: string, path: string, expanded: boolean)`、`toggleChangesTreePath(workspaceId, path)`、`expandChangesTreePathChain(workspaceId, path): { blocked: string[] }`、`collapseAllChangesTreePaths(workspaceId)`
  - `filePreviewModeByPath: Record<string, Record<string, boolean>>`（`[workspaceId][relativePath]`）

- [ ] **Step 1: 写失败测试（跨工作区不串味）**

创建 `frontend/src/app/stores/slices/changesExpansionScope.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';

describe('changes tree expansion is workspace-scoped', () => {
  beforeEach(() => {
    useAppStore.setState({ expandedChangesTreePaths: {}, filePreviewModeByPath: {} });
  });

  it('expanding a path in one workspace does not expand it in another', () => {
    useAppStore.getState().toggleChangesTreePath('workspace_a', 'src');
    expect(useAppStore.getState().expandedChangesTreePaths['workspace_a'].expanded['src']).toBe(true);
    expect(useAppStore.getState().expandedChangesTreePaths['workspace_b']).toBeUndefined();
  });

  it('does not leak preview mode between workspaces for the same relative path', () => {
    useAppStore.getState().setFilePreviewModeForPath('workspace_a', 'README.md', true);
    const state = useAppStore.getState();
    expect(state.filePreviewModeByPath['workspace_a']['README.md']).toBe(true);
    expect(state.filePreviewModeByPath['workspace_b']).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/slices/changesExpansionScope.test.ts
```

Expected: FAIL —— `toggleChangesTreePath` 当前只接受 `(path)`；`setFilePreviewModeForPath` 当前只接受 `(path, enabled)`。

- [ ] **Step 3: 实现按工作区隔离**

按上表签名改造两个字段与全部 action，并同步更新调用点：

- `useChangesPanelState.tsx` / `useChangesPanelStateUtils.ts`：`computeExpandedPathsByWs` 直接取 `expandedChangesTreePaths[workspaceId] ?? { expanded: {} }`，**删除**原来"把同一张全局表发给每个工作区"的转发函数（`useChangesPanelStateUtils.ts:198-207`）。
- `useChangesFilters.ts:155-156`、`useChangesPanelSort.ts:25-26`、`useChangesActions.ts` 的调用点补 `workspaceId`。
- `FilesPanel.tsx:121-139` 的 `filePreviewModeByPath[path]` 改为 `filePreviewModeByPath[selectedFileWorkspaceId]?.[path]`；`carryFilePreviewModeForRename` 同步加 `workspaceId`。
- 登记表：`adl:changes.dirExpanded` 的 `scope` 改为 `byWorkspaceId`、read 改 `readDirExpansion`、prune 改 `pruneDirExpansion`；`adl:files.previewMode` 改为 `byWorkspaceId` + `readBooleanPropRecord` + `pruneDirPathsByWorkspace`。

- [ ] **Step 4: 运行测试确认通过并全量回归**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/slices/changesExpansionScope.test.ts && pnpm frontend:test && pnpm frontend:typecheck
```

Expected: PASS。调用点遗漏会由类型检查报错暴露 —— 必须清零。

- [ ] **Step 5: 提交**

```bash
cd ai-digital-life
git add frontend/src/app
git commit -m "fix(changes): scope tree expansion and preview mode per workspace"
```

---

## Task 15: 懒剪四入口接线

**Files:**
- Modify: `frontend/src/app/stores/persisted/prune.ts`（新增 `applyPrunePatch` 编排入口）
- Modify: `frontend/src/app/stores/slices/workspaceSlice.ts`（`setRecentWorkspaces` 内触发）
- Modify: `frontend/src/app/stores/actions/workspaceTreeActions.ts`（树加载成功后触发）
- Modify: `frontend/src/app/stores/slices/terminalSlice.ts`、`browserTabsSlice.ts`（标签水合后触发）
- Create: `frontend/src/app/stores/persisted/__tests__/pruneWiring.test.ts`

**Interfaces:**
- Consumes: `pruneRegistry`（Task 4）、`persistField`（Task 6）
- Produces:
  - `function applyWorkspacePrune(): void` —— 从 store 读 `recentWorkspaces` 构造 `PruneCtx.workspaceIds` 后剪枝，**清单为空直接返回**
  - `function applyTreeLoadedPrune(workspaceId: string, dirPaths: ReadonlySet<string>): void`
  - `function applyTabPrune(tabIds: ReadonlySet<string>): void`

- [ ] **Step 1: 写失败测试（接线正确性 + 三个负例）**

创建 `frontend/src/app/stores/persisted/__tests__/pruneWiring.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { applyWorkspacePrune, applyTreeLoadedPrune } from '@stores/persisted/pruneWiring';
import { flushCrossSliceWrites } from '@stores/storageHelpers';

describe('prune wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      recentWorkspaces: [],
      expandedFileTreePaths: { workspace_a: { expanded: { src: true } }, workspace_gone: { expanded: { old: true } } },
    });
  });

  it('NEGATIVE: does nothing while the workspace list is still empty', () => {
    applyWorkspacePrune();
    expect(useAppStore.getState().expandedFileTreePaths.workspace_gone).toBeDefined();
  });

  it('drops the removed workspace once the list is known', () => {
    useAppStore.setState({ recentWorkspaces: [{ id: 'workspace_a' }] as never });
    applyWorkspacePrune();
    flushCrossSliceWrites();
    expect(useAppStore.getState().expandedFileTreePaths.workspace_gone).toBeUndefined();
    expect(useAppStore.getState().expandedFileTreePaths.workspace_a).toBeDefined();
  });

  it('NEGATIVE: keeps directory paths for a workspace whose tree is not loaded', () => {
    useAppStore.setState({ recentWorkspaces: [{ id: 'workspace_a' }] as never });
    applyWorkspacePrune();
    expect(useAppStore.getState().expandedFileTreePaths.workspace_a.expanded.src).toBe(true);
  });

  it('drops a directory that is absent from the loaded tree', () => {
    useAppStore.setState({
      recentWorkspaces: [{ id: 'workspace_a' }] as never,
      expandedFileTreePaths: { workspace_a: { expanded: { src: true, 'src/deleted': true } } },
    });
    applyTreeLoadedPrune('workspace_a', new Set(['src']));
    expect(useAppStore.getState().expandedFileTreePaths.workspace_a.expanded).toEqual({ src: true });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/pruneWiring.test.ts
```

Expected: FAIL —— `Failed to resolve import "../pruneWiring"`。

- [ ] **Step 3: 实现 `pruneWiring.ts` 并在四个入口接线**

```ts
import type { PruneCtx } from './entry';
import { pruneRegistry } from './prune';
import { persist } from './persist';
import { registry, registryEntries } from './registry';
import { useAppStore } from '../slicedStore';

let loadedDirPaths = new Map<string, ReadonlySet<string>>();

function currentCtx(): PruneCtx {
  const state = useAppStore.getState();
  return {
    workspaceIds: new Set(state.recentWorkspaces.map((workspace) => workspace.id)),
    loadedDirPaths,
    tabIds: new Set(state.terminalTabs.map((tab) => tab.id)),
  };
}

function runPrune(ctx: PruneCtx): void {
  if (ctx.workspaceIds.size === 0) {
    // 参照清单未就绪 —— 剪枝会误删，直接跳过（规格 §3.5.1 / 风险 R7）
    return;
  }
  const snapshot = useAppStore.getState() as unknown as Record<string, unknown>;
  const { value: patch } = pruneRegistry(snapshot, ctx);
  for (const [field, fieldValue] of Object.entries(patch)) {
    const entry = registryEntries.find((candidate) => candidate.field === field);
    if (!entry) {
      continue;
    }
    persist(entry.key as keyof typeof registry, fieldValue as never);
  }
  if (Object.keys(patch).length > 0) {
    useAppStore.setState(patch as never);
  }
}

export function applyWorkspacePrune(): void {
  runPrune(currentCtx());
}

export function applyTreeLoadedPrune(workspaceId: string, dirPaths: ReadonlySet<string>): void {
  loadedDirPaths = new Map(loadedDirPaths).set(workspaceId, dirPaths);
  runPrune(currentCtx());
}

export function applyTabPrune(tabIds: ReadonlySet<string>): void {
  runPrune({ ...currentCtx(), tabIds });
}

/** 仅供测试重置已加载目录缓存 */
export function resetLoadedDirPathsForTest(): void {
  loadedDirPaths = new Map();
}
```

接线点（每处都在状态写入**之后**调用）：

| 入口 | 位置 | 调用 |
|---|---|---|
| 工作区列表就绪 | `workspaceSlice.ts` 的 `setRecentWorkspaces` 末尾 | `applyWorkspacePrune()` |
| 某工作区树加载成功 | `workspaceTreeActions.ts` 的 `loadWorkspaceTree` 成功分支（`set({ workspaceTrees })` 之后） | `applyTreeLoadedPrune(workspaceId, collectDirPaths(tree))` |
| 树加载失败 | 同函数的失败分支 | **不调用**（规格 §3.5.1：加载失败跳过） |
| 标签水合后 | `terminalSlice.ts` 水合完成处 | `applyTabPrune(new Set(terminalTabs.map((t) => t.id)))` |

`collectDirPaths(tree)` 为纯函数（递归收集 `kind === 'directory'` 的 `path`），放入 `prune.ts` 并补 1 条单测。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/pruneWiring.test.ts && pnpm frontend:test
```

Expected: PASS（4 个用例，含 2 个负例）。

**本任务必须一并处理的乙类条目剪枝（Task 10 显式延期的部分）**

Task 10 为终端的三个外部微型存储（`regionCollapse` / `cwdByTab` / `historyIndex`）登记了键，但**未声明 `prune`**：`pruneRegistry` 靠 `entry.field` 从 store 快照取值（`prune.ts:155-156`），而乙类没有 store 字段，无法被现有编排执行。本任务在接线剪枝时**必须补上这一环**，方式二选一（择优并说明理由）：

- **甲**：把外部条目的归宿从 `apply` 扩展为 `{ get(): T; set(v: T): void }`，使 `pruneRegistry` 能对乙类取值并回写（回写走 `persist`）；或
- **乙**：乙类剪枝不并入 `pruneRegistry`，改由各外部模块在自己的载入路径上剔除失效 tabId（`cwd` / `historyIndex` 的消费方已有此模式，见 `useTerminalPtyLifecycle.ts:109,120` 与 `:568,580`），并在 `regionCollapse` 上补齐同等自清理。

无论选哪种，**必须留下可失败的测试**：写入一个已不存在 tabId 的条目 → 触发对应剪枝 → 断言该条目被剔除。**禁止**只声明 `prune` 而不接线（这正是 Task 10 拒绝假完整的原因）。

- [ ] **Step 5: 提交**

```bash
cd ai-digital-life
git add frontend/src/app/stores
git commit -m "feat(stores): wire reference-gated pruning into the four trigger points"
```

---

## Task 16: 主动剪枝 —— 挂到唯一的工作区移除入口

**Files:**
- Modify: `frontend/src/app/stores/actions/browserCleanupActions.ts:20-72`
- Modify: `frontend/src/app/stores/persisted/pruneWiring.ts`（新增 `applyWorkspaceRemoved`）
- Modify: `frontend/src/app/stores/actions/browserCleanupHelpers.ts`
- Create: `frontend/src/app/stores/actions/__tests__/workspaceRemovalCleanup.test.ts`

**Interfaces:**
- Consumes: `pruneRegistry`、`persist`、`registryEntries`
- Produces: `function applyWorkspaceRemoved(workspaceId: string): void` —— 遍历登记表**全部** `scope === 'byWorkspaceId'` 的条目剔除该工作区

- [ ] **Step 1: 写失败测试（终端面板的键也被清理）**

创建 `frontend/src/app/stores/actions/__tests__/workspaceRemovalCleanup.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { flushCrossSliceWrites } from '@stores/storageHelpers';

describe('removing a workspace cleans every workspace-scoped key', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      recentWorkspaces: [{ id: 'workspace_a' }, { id: 'workspace_b' }] as never,
      workspaceTreeExpandedInFileNav: { workspace_a: true, workspace_b: true },
      workspaceChangesExpanded: { workspace_a: true, workspace_b: true },
      terminalWorkspaceExpanded: { workspace_a: true, workspace_b: true },
    });
  });

  it('drops the workspace from files / changes / terminal scopes in one pass', async () => {
    useAppStore.setState({ recentWorkspaces: [{ id: 'workspace_b' }] as never });
    useAppStore.getState().cleanupRemovedWorkspaceTree('workspace_a' as never);
    flushCrossSliceWrites();

    const state = useAppStore.getState();
    expect(state.workspaceTreeExpandedInFileNav.workspace_a).toBeUndefined();
    expect(state.workspaceChangesExpanded.workspace_a).toBeUndefined();
    expect(state.terminalWorkspaceExpanded.workspace_a).toBeUndefined();
    expect(state.workspaceTreeExpandedInFileNav.workspace_b).toBe(true);
    expect(JSON.parse(localStorage.getItem('adl:terminal.workspaceExpanded') ?? 'null')).toEqual({
      workspace_b: true,
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/actions/__tests__/workspaceRemovalCleanup.test.ts
```

Expected: FAIL —— `terminalWorkspaceExpanded.workspace_a` 仍为 `true`（当前清理只覆盖 browser 系列）。

- [ ] **Step 3: 改为按声明统一剔除**

`pruneWiring.ts` 新增：

```ts
/** 工作区被移除时：遍历登记表中全部按工作区隔离的条目，统一剔除该工作区 */
export function applyWorkspaceRemoved(workspaceId: string): void {
  const snapshot = useAppStore.getState() as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const entry of registryEntries) {
    if (entry.scope !== 'byWorkspaceId') {
      continue;
    }
    const field = entry.field as string;
    const value = snapshot[field];
    if (typeof value !== 'object' || value === null) {
      continue;
    }
    const record = value as Record<string, unknown>;
    if (!(workspaceId in record)) {
      continue;
    }
    const next = { ...record };
    delete next[workspaceId];
    patch[field] = next;
    persist(entry.key as keyof typeof registry, next as never);
  }
  if (Object.keys(patch).length > 0) {
    useAppStore.setState(patch as never);
  }
}
```

`browserCleanupActions.ts` 的 `cleanupRemovedWorkspaceTree` 改为：保留原有 browser 系列清理（或改用同一机制，二选一，**不得两套并存**），并在末尾调用 `applyWorkspaceRemoved(workspaceId)`。若 browser 系列清理被该机制完全覆盖，则删除重复实现，只留 `applyWorkspaceRemoved`。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/actions/__tests__/workspaceRemovalCleanup.test.ts && pnpm frontend:test
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd ai-digital-life
git add frontend/src/app/stores
git commit -m "fix(stores): prune every workspace-scoped key on workspace removal"
```

---

## Task 17: 删除目录与重命名重映射的持久化一致性

**Files:**
- Modify: `frontend/src/app/stores/actions/workspaceActions.ts:106-126`（重映射改走统一通道）
- Modify: `frontend/src/app/stores/actions/workspaceActions.ts:157`（删除目录后剔除前缀）
- Create: `frontend/src/app/stores/actions/__tests__/workspacePathRemap.test.ts`

**Interfaces:**
- Consumes: `prunePathPrefix`（Task 4）、`persistField`（Task 6）
- Produces: 不变量 —— 任何改变路径集合的操作结束后，持久化值与内存值**必须一致**（当前重映射只改内存，导致"内存新、磁盘旧"，重启后回落旧路径，即根因 B3）

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/stores/actions/__tests__/workspacePathRemap.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { flushCrossSliceWrites } from '@stores/storageHelpers';

const WS = 'workspace_a';

describe('path remap keeps memory and storage consistent', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ expandedFileTreePaths: { [WS]: { expanded: { 'src/old': true } } } });
  });

  it('persists the renamed path instead of leaving the stale one on disk', () => {
    useAppStore.getState().carryExpandedPathsForRename(WS, 'src/old', 'src/new');
    flushCrossSliceWrites();
    const stored = JSON.parse(localStorage.getItem('adl:files.dirExpanded') ?? 'null');
    expect(stored[WS].expanded).toEqual({ 'src/new': true });
  });

  it('drops the deleted directory and its descendants', () => {
    useAppStore.setState({
      expandedFileTreePaths: {
        [WS]: { expanded: { src: true, 'src/gone': true, 'src/gone/deep': true } },
      },
    });
    useAppStore.getState().dropExpandedPathsUnder(WS, 'src/gone');
    flushCrossSliceWrites();
    const stored = JSON.parse(localStorage.getItem('adl:files.dirExpanded') ?? 'null');
    expect(stored[WS].expanded).toEqual({ src: true });
  });
});
```

> 两个 action 的签名固定为 `carryExpandedPathsForRename(workspaceId, oldPath, newPath)` 与 `dropExpandedPathsUnder(workspaceId, removedPath)`，是把 `workspaceActions.ts:106-126` 的内联裸 `set()` 逻辑提取为**可测试的具名 action**。变更树侧同名同形（`carryChangesExpandedPathsForRename` / `dropChangesExpandedPathsUnder`）。

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/actions/__tests__/workspacePathRemap.test.ts
```

Expected: FAIL —— `carryExpandedPathsForRename is not a function`。

- [ ] **Step 3: 实现两个具名 action 并替换内联逻辑**

```ts
    carryExpandedPathsForRename: (workspaceId, oldPath, newPath) =>
      set((state) => {
        const current = state.expandedFileTreePaths[workspaceId] ?? { expanded: {} };
        if (current.expanded[oldPath] === undefined) {
          return state;
        }
        const expanded = { ...current.expanded };
        delete expanded[oldPath];
        expanded[newPath] = true;
        const manualCollapsed = { ...(current.manualCollapsed ?? {}) };
        delete manualCollapsed[oldPath];
        const next = { expanded, manualCollapsed };
        return persistField('adl:files.dirExpanded', {
          ...state.expandedFileTreePaths,
          [workspaceId]: next,
        });
      }),

    dropExpandedPathsUnder: (workspaceId, removedPath) =>
      set((state) => {
        const current = state.expandedFileTreePaths[workspaceId] ?? { expanded: {} };
        const expandedPruned = prunePathPrefix(current.expanded, removedPath);
        const manualPruned = prunePathPrefix(current.manualCollapsed ?? {}, removedPath);
        if (!expandedPruned.changed && !manualPruned.changed) {
          return state;
        }
        return persistField('adl:files.dirExpanded', {
          ...state.expandedFileTreePaths,
          [workspaceId]: { expanded: expandedPruned.value, manualCollapsed: manualPruned.value },
        });
      }),
```

同构地为变更树补 `carryChangesExpandedPathsForRename` / `dropChangesExpandedPathsUnder`；`workspaceActions.ts:106-126` 改为调用这两个 action；`deleteWorkspaceFile` 成功后调用 `dropExpandedPathsUnder` 与 `dropChangesExpandedPathsUnder`。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/actions/__tests__/workspacePathRemap.test.ts && pnpm frontend:test && pnpm frontend:typecheck
```

Expected: PASS。此时根因 B3 消除：内存与磁盘不再分叉。

- [ ] **Step 5: 提交**

```bash
cd ai-digital-life
git add frontend/src/app/stores
git commit -m "fix(stores): keep persisted expansion in sync on rename and delete"
```

---

## Task 18: 键命名空间收敛收尾

**Files:**
- Modify: 全仓（以 grep 结果为准）
- Create: `frontend/src/app/stores/persisted/__tests__/keyNamespace.test.ts`

**Interfaces:**
- Consumes: Task 7–11 已完成的前缀迁移
- Produces: 不变量 —— 生产代码中**不得**出现 `adl-ui:` / `adl-terminal:` / `adl-search:` / `adl-browser:` 四种旧前缀；所有持久化键必须能被 `parsePersistKey` 解析

- [ ] **Step 1: 写失败测试（静态断言）**

创建 `frontend/src/app/stores/persisted/__tests__/keyNamespace.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parsePersistKey } from '../entry';
import { registryEntries } from '../registry';

const LEGACY_PREFIXES = ['adl-ui:', 'adl-terminal:', 'adl-search:', 'adl-browser:'];
const SCAN_ROOT = join(process.cwd(), 'src');
const LITERAL_KEY_PATTERN = /'(adl:[a-zA-Z0-9.]+)'/g;

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === '__tests__' ? [] : collectSourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('key namespace', () => {
  it('no production source references a legacy prefix', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SCAN_ROOT)) {
      const content = readFileSync(file, 'utf8');
      for (const prefix of LEGACY_PREFIXES) {
        if (content.includes(prefix) && !content.includes('LEGACY_PREFIX')) {
          offenders.push(`${file} → ${prefix}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every adl: literal in the registry parses as a valid persist key', () => {
    for (const entry of registryEntries) {
      expect(parsePersistKey(entry.key)).not.toBeNull();
    }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/keyNamespace.test.ts
```

Expected: FAIL —— 至少一处仍含旧前缀（Task 7–11 若已彻底迁移则该用例可能直接通过；两种结果都接受，若有 offender，按输出的 `file → prefix` 清单逐个修正）。

- [ ] **Step 3: 按报告逐个修正并确认**

```bash
grep -rn "adl-ui:\|adl-terminal:\|adl-search:\|adl-browser:" ai-digital-life/frontend/src --include=*.ts --include=*.tsx
```

按输出逐处改为登记键名或删除（**例外**：`__tests__` 下用于断言"旧键已被清除"的用例可保留字面量，需在测试中引用 `LEGACY_PREFIXES` 常量而非硬编码，以免被本任务自己的门禁拦下）。

- [ ] **Step 4: 运行测试确认通过并提交**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted && pnpm frontend:test && pnpm frontend:typecheck
git add frontend/src/app
git commit -m "refactor(stores): converge persistence keys onto the adl: namespace"
```

Expected: PASS。

---

## Task 19: 归并重复定义

**Files:**
- Modify: `frontend/src/app/stores/slices/browserSlice.ts:52,206,290,305,312`（删除重复的宽度键与 `navigatorCollapsedByTool` 读写）
- Modify: `frontend/src/app/stores/slices/terminalSlice.ts:172,390,397`（同上）
- Modify: `frontend/src/app/stores/constants.ts:1`（删除被三个 slice 共用的 `BROWSER_NAVIGATOR_COLLAPSED_KEY`）
- Modify: `frontend/src/app/stores/slices/terminalSliceTypes.ts:28`（删除同名常量）
- Create: `frontend/src/app/stores/slices/__tests__/singleOwner.test.ts`

**Interfaces:**
- Consumes: Task 7 已将 `navigatorCollapsedByTool` 与全部导航器宽度登记为 `adl:ui.*`
- Produces: 不变量 —— `navigatorCollapsedByTool`、`browserNavigatorWidth`、`setBrowserNavigatorWidth` 等在 `slicedStore.ts` 中**只由 `createUISlice` 提供一次**；browser/terminal slice 不再定义它们

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/stores/slices/__tests__/singleOwner.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(relative: string): string {
  return readFileSync(join(process.cwd(), 'src/app/stores', relative), 'utf8');
}

describe('duplicated slice definitions', () => {
  it('browser slice does not redefine navigatorCollapsedByTool', () => {
    const content = source('slices/browserSlice.ts');
    expect(content).not.toContain('navigatorCollapsedByTool:');
    expect(content).not.toContain('setBrowserNavigatorWidth');
  });

  it('terminal slice does not redefine navigatorCollapsedByTool', () => {
    const content = source('slices/terminalSlice.ts');
    expect(content).not.toContain('navigatorCollapsedByTool:');
  });

  it('only one module declares the navigator width registry keys', () => {
    const content = source('slices/browserSlice.ts');
    expect(content).not.toContain('adl:browser.navigatorWidth');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/slices/__tests__/singleOwner.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 归并为单一归属**

删除 `browserSlice.ts` / `terminalSlice.ts` 中重复定义的字段、setter 与常量；调用点改为使用 `uiSlice` 提供的 `navigatorCollapsedByTool` / `toggleNavigator` / `browserNavigatorWidth` / `setBrowserNavigatorWidth`。浏览器面板的导航器宽度登记键固定为 `adl:browser.navigatorWidth`，**只在 registry 中出现一次**，由 `uiSliceWidths.ts` 写入。

终端面板若原本使用同一物理键（`BROWSER_NAVIGATOR_COLLAPSED_KEY`），改为使用自己独立的 `navigatorCollapsedByTool.terminal`，不再与浏览器共享。

- [ ] **Step 4: 运行测试确认通过并提交**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/slices/__tests__/singleOwner.test.ts && pnpm frontend:test && pnpm frontend:typecheck
git add frontend/src/app/stores
git commit -m "refactor(stores): give each duplicated slice state a single owner"
```

Expected: PASS。

---

## Task 20: 死代码与死状态清理

**Files:**
- Modify: `frontend/src/app/stores/slices/browserFoldersSlice.ts:67,269`
- Modify: `frontend/src/app/stores/slices/browserFoldersSlice.ts:8,20,41,251-254`（**死状态 `adl-ui:browser-workspace-expanded` 的完整清除**：C9 例外 writer `writeWorkspaceExpanded`、setter `setBrowserWorkspaceExpanded`、以及对 `BROWSER_WORKSPACE_EXPANDED_KEY` 的 import。T11 的收尾门禁为它留了唯一一条 `grep -v` 例外，本任务必须让该例外到期）
- Modify: `frontend/src/app/stores/slices/browserSliceShared.ts:16`（删除键常量 `BROWSER_WORKSPACE_EXPANDED_KEY`）
- Modify: `frontend/src/app/stores/slices/browserFoldersUtils.ts:6,13,16`（删除该键的 import 与两处再导出常量）
- Modify: `frontend/src/app/stores/browserSelectors.ts:84-85`（`getBrowserWorkspaceExpanded` / `useBrowserWorkspaceExpanded` —— 字段清除后一并删除；先确认无组件消费）
- Modify: `frontend/src/app/stores/actions/browserCleanupHelpers.ts:15,37-38,55`（从清理入参中移除 `browserWorkspaceExpanded`）
- Modify: `frontend/src/app/stores/slices/browserSlice.ts:92,181,207-208,227-228,316-318`
- Modify: `frontend/src/app/stores/browserSelectors.ts:14-18`
- Modify: `frontend/src/app/stores/slices/terminalSlice.ts:174,211,406`
- Modify: `frontend/src/app/stores/slices/terminalSliceTypes.ts`（删除 `normalizeTerminalShellProfile` —— Task 10 修复轮把最后一处生产调用移交给 registry 的条目 read 后，它只剩自身单测引用）
- Modify: `frontend/src/app/stores/slices/uiSliceExpansion.ts:57,102-107`
- Modify: `frontend/src/app/stores/slices/uiSliceTypes.ts:34,131`
- Modify: `frontend/src/app/stores/slices/uiSlice.ts:74`
- Modify: `frontend/src/app/stores/actions/browserCleanupActions.ts:39-42`
- Create: `frontend/src/app/stores/slices/__tests__/noDeadState.test.ts`

**Interfaces:**
- Consumes: Tasks 7–11 已把真实状态迁移到登记表，因此下列字段确认无消费者
- Produces: 不变量 —— 下列符号在 `frontend/src` 中**不再存在**

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/stores/slices/__tests__/noDeadState.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DEAD_SYMBOLS = [
  'browserWorkspaceExpanded',
  'browserPersisted',
  'browserWorkspaceId',
  'setBrowserPersisted',
  'setBrowserWorkspaceId',
  'terminalPersisted',
  'setTerminalPersisted',
  'normalizeTerminalShellProfile',
  'collapseAllFileTreePaths',
  'SESSION_TABS_EXPANDED_KEY',
];

function collect(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return collect(full);
    }
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('dead state is removed', () => {
  it('no production file references any dead symbol', () => {
    const offenders: string[] = [];
    for (const file of collect(join(process.cwd(), 'src'))) {
      if (file.includes('__tests__') || file.endsWith('.test.ts') || file.endsWith('.test.tsx')) {
        continue;
      }
      const content = readFileSync(file, 'utf8');
      for (const symbol of DEAD_SYMBOLS) {
        if (content.includes(symbol)) {
          offenders.push(`${file} → ${symbol}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/slices/__tests__/noDeadState.test.ts
```

Expected: FAIL，输出全部残留文件清单。

- [ ] **Step 3: 逐个删除**

| 符号 | 删除内容 |
|---|---|
| `browserWorkspaceExpanded` | `browserFoldersSlice.ts` 的字段与 setter、`browserSlice.ts` 的水合读写、`browserCleanupActions.ts:39-42` 的直写 |
| `browserPersisted` / `setBrowserPersisted` / `browserWorkspaceId` / `setBrowserWorkspaceId` | `browserSlice.ts` 字段与 setter、`browserSelectors.ts:14-18` 的 selector 导出；同时删除 `browserSlice.test.ts` 中对应用例 |
| `terminalPersisted` / `setTerminalPersisted` | `terminalSlice.ts` 字段与 setter；删除 `terminalSlice.test.ts:253` 的对应断言 |
| `collapseAllFileTreePaths` | `uiSliceExpansion.ts:57,102-107`、`uiSliceTypes.ts:131`。**注意保留 `collapseAllChangesTreePaths`**（有调用点） |
| `SESSION_TABS_EXPANDED_KEY` | `uiSliceTypes.ts:34`、`uiSlice.ts:74` 的再导出 |

> `browserWorkspaceExpanded` 被删除后，浏览器树的工作区行展开仍由 `browserTabTreeExpanded['workspace:<wsId>']` 驱动，功能不受影响 —— 删除前先在浏览器面板实测一次"展开/折叠工作区行"确认该结论。

- [ ] **Step 4: 运行测试确认通过并提交**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/slices/__tests__/noDeadState.test.ts && pnpm frontend:test && pnpm frontend:typecheck && pnpm frontend:lint
git add frontend/src/app/stores
git commit -m "chore(stores): remove dead persisted state and obsolete constants"
```

Expected: PASS。

---

## Task 21: 关窗兜底与陈旧注释

**Files:**
- Modify: `frontend/src/app/stores/storageHelpers.ts`（新增 `registerFlushOnPageHide`）
- Modify: `frontend/src/app/main.tsx`（或应用入口，注册兜底）
- Modify: `frontend/src/app/stores/actions/generalActions.ts:66-70`（陈旧注释）
- Modify: `frontend/src/app/stores/persisted/composite.ts:16,21`（`priorPatch` 注释对**乙类**条目的描述不实 —— Task 10 修复轮 2 写的该括注称快照含"乙类 `apply` 之前的校验结果"且"`priorPatch.field` 键一定存在"，但乙类的校验值由 `apply` 接收、**从不写入 patch**，且乙类 `field === undefined`。须把该括注限定为甲类含义，否则未来为乙类形状写复合水合器时会去读一个不存在的快照字段）
- Modify: `frontend/src/app/stores/slicedStore.ts`（V2 例外键传入 `keep`）

**Interfaces:**
- Consumes: `flushCrossSliceWrites`（既有）
- Produces: `function registerFlushOnPageHide(): () => void` —— 注册 `pagehide` 与 `visibilitychange(hidden)` 两个兜底，返回取消订阅函数

- [ ] **Step 1: 写失败测试**

在 `frontend/src/app/stores/storageHelpers.test.ts` 追加：

```ts
it('flushOnPageHide flushes pending writes when pagehide fires', async () => {
  const { registerFlushOnPageHide, scheduleCrossSliceWrite } = await import('./storageHelpers');
  const dispose = registerFlushOnPageHide();
  localStorage.clear();
  scheduleCrossSliceWrite('adl:__probe', { ok: true });
  window.dispatchEvent(new Event('pagehide'));
  expect(localStorage.getItem('adl:__probe')).toBe('{"ok":true}');
  dispose();
});

it('flushOnPageHide also flushes when the document becomes hidden', async () => {
  const { registerFlushOnPageHide, scheduleCrossSliceWrite } = await import('./storageHelpers');
  const dispose = registerFlushOnPageHide();
  localStorage.clear();
  scheduleCrossSliceWrite('adl:__probe2', { ok: true });
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(localStorage.getItem('adl:__probe2')).toBe('{"ok":true}');
  dispose();
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/storageHelpers.test.ts
```

Expected: FAIL —— `registerFlushOnPageHide is not a function`。

- [ ] **Step 3: 实现并注册**

```ts
/**
 * 关窗兜底：Tauri 的 onCloseRequested 与浏览器 beforeunload 之外，
 * 补充 pagehide 与 visibilitychange(hidden) 两条路径（规格 §3.7 / 根因 C8）。
 * 代码中原有注释已自认"去抖调度器无 pagehide flush，仅靠它是不可靠的"
 * （terminalSlice.ts:410）。
 */
export function registerFlushOnPageHide(): () => void {
  const onPageHide = () => flushCrossSliceWrites();
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      flushCrossSliceWrites();
    }
  };
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
```

在应用入口（`frontend/src/app/main.tsx` 的模块顶层）调用一次 `registerFlushOnPageHide();`。

同时修正 `generalActions.ts:66-70` 的陈旧注释：删除"为右侧面板设置默认展开所有可见工作区"表述，改为与实现一致的说明（`visibleWorkspaces` 仅用于加载瀑布）。

并把 Task 1 的 V2 例外键清单写入 `slicedStore.ts`：

```ts
// V2 盘点结论：以下键共用 adl 前缀但不属于 UI 状态域，启动清理必须保留
const PERSIST_KEEP_KEYS = new Set<string>([
  // 以 Task 1 Step 3 的实测清单为准逐条填入
]);
cleanupUnregisteredKeys({ keep: PERSIST_KEEP_KEYS, extra: hydration.dirtyKeys });
```

- [ ] **Step 4: 运行测试确认通过并提交**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/storageHelpers.test.ts && pnpm frontend:test && pnpm frontend:typecheck
git add frontend/src/app
git commit -m "fix(stores): flush pending writes on pagehide and hidden visibility"
```

Expected: PASS。

---

## Task 22: 文件面板子状态补齐

**Files:**
- Modify: `frontend/src/app/stores/slices/editorSlice.ts`（若需上提 `fileNavigatorActiveWorkspaceId` 等）
- Modify: `frontend/src/app/stores/slices/searchSlice.ts:227-240`（检索开关）
- Modify: `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx:529-534`（大纲展开上提）
- Modify: `frontend/src/app/regions/right-panel/hooks/useRightPanelLayout.ts`（`rightPanelMode` 上提 store，若 Task 7 Step 5 判定需要）
- Modify: `frontend/src/app/stores/persisted/registry.ts`

**Interfaces:**
- Consumes: `persist` / `persistField`、`pruneByWorkspaceId`
- Produces: 新增登记键（见下表）

| 状态 | 现位置 | 新键名 | 字段 | scope | 说明 |
|---|---|---|---|---|---|
| 树选中节点 | `editorSlice.ts:41-52`（`fileTreeClickedPath/WorkspaceId/Kind`） | `adl:files.clickedNode` | `fileTreeClicked` | byWorkspaceId | 三个字段合并为一个记录，避免三次写盘 |
| 检索大小写/全词/正则开关 | `searchSlice.ts:227-229` | `adl:files.searchFlags` | `searchFlags` | global | 三布尔合并为一个对象 |
| 检索输入框草稿 | `useFilesPanelProps.ts:53`（本地 state） | 不登记 | — | — | 输入草稿属瞬态，恢复反而突兀（YAGNI） |
| 大纲展开项 | `FileNavigatorShell.tsx:529-534`（本地 state） | `adl:files.outlineExpanded` | `filesOutlineExpanded` | byWorkspaceId | 需先把 state 上提到 store |
| 右侧面板模式 | `useRightPanelLayout.ts:76-78`（本地 state） | `adl:ui.rightPanelMode` | `rightPanelMode` | global | 仅在 Task 7 Step 5 判定其为 store 状态时才登记 |

- [ ] **Step 1: 写失败测试（逐项"重启还原"）**

创建 `frontend/src/app/regions/right-panel/__tests__/filesPanelStatePersistence.test.tsx`，使用 `__tests__/helpers.ts` 的 `expectPersistsAcrossRestart` 对表中每一项各写一条用例：

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { stubStorage, expectPersistsAcrossRestart } from '@stores/persisted/__tests__/helpers';
import { useAppStore } from '@stores/slicedStore';
import { hydrateAll } from '@stores/persisted/hydrate';

describe('files panel sub-state persistence', () => {
  beforeEach(() => {
    stubStorage();
  });

  it('restores the clicked tree node per workspace', () => {
    expectPersistsAcrossRestart(
      'adl:files.clickedNode',
      (value) => useAppStore.getState().setFileTreeClickedNode('workspace_a', value as never),
      () => hydrateAll().patch.fileTreeClicked?.['workspace_a'],
      { path: 'src/app.ts', kind: 'file' } as never,
    );
  });

  it('restores the outline expansion per workspace', () => {
    expectPersistsAcrossRestart(
      'adl:files.outlineExpanded',
      (value) => useAppStore.getState().setFilesOutlineExpanded('workspace_a', value as never),
      () => hydrateAll().patch.filesOutlineExpanded?.['workspace_a'],
      ['fn-main', 'cls-a'] as never,
    );
  });
});
```

（其余条目按同一形状各补一条；`stubStorage()` 的路径别名若不被 vitest 解析，改为相对路径 `../../../stores/persisted/__tests__/helpers`。）

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/regions/right-panel/__tests__/filesPanelStatePersistence.test.tsx
```

Expected: FAIL —— 登记键与对应 setter 均不存在。

- [ ] **Step 3: 实施**

按表追加登记条目；把大纲展开从组件本地 state 上提到 store（`filesOutlineExpanded`），组件改为读写 store；`searchFlags` 作为单对象状态替换三个独立布尔（`setSearchFlags` 一次落盘）；重复选中同一节点时不写盘（提前 return，避免冗余写入）。

- [ ] **Step 4: 运行测试确认通过并提交**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/regions/right-panel/__tests__/filesPanelStatePersistence.test.tsx && pnpm frontend:test && pnpm frontend:typecheck
git add frontend/src/app
git commit -m "feat(files): persist panel sub-state through the registry"
```

Expected: PASS。

---

## Task 23: 变更面板子状态补齐

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelFilters.ts:6-8`
- Modify: `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesFilters.ts:85-94`
- Modify: `frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesPanelState.tsx:68-69`
- Modify: `frontend/src/app/stores/persisted/registry.ts`

**Interfaces:**
- Consumes: `persist` / `persistField`
- Produces: 新增登记键

| 状态 | 现位置 | 新键名 | 字段 | scope |
|---|---|---|---|---|
| 状态过滤器（已暂存/已修改/未跟踪） | `useChangesPanelFilters.ts:6-8`（`Set<ChangeFileState>`） | `adl:changes.statusFilter` | `changesStatusFilter` | global |
| 大纲展开项 | `useChangesFilters.ts:85-94` | `adl:changes.outlineExpanded` | `changesOutlineExpanded` | byWorkspaceId |
| 行号开关 | `useChangesPanelState.tsx:68` | `adl:changes.lineNumbers` | `changesLineNumbers` | global |
| 自动换行开关 | `useChangesPanelState.tsx:69` | `adl:changes.wordWrap` | `changesWordWrap` | global |

> `Set` 不可直接 JSON 序列化 —— 落盘前转数组，`read` 中再转回 `Set`（`readStringEnum` 数组版：`readStringSet(allowed)`）。在 `parsers.ts` 新增该解析器并补 2 条单测（合法成员过滤 + 非数组拒绝）。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/regions/right-panel/panels/ChangesPanel/__tests__/changesPanelStatePersistence.test.ts`，对表中四项各一条"写入 → 模拟重启 → 读回一致"用例（四项依次为：过滤器 Set 往返、大纲展开按工作区隔离、行号、换行）。过滤器用例须额外断言 `Set` 往返后仍为 `Set` 实例。

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/regions/right-panel/panels/ChangesPanel/__tests__/changesPanelStatePersistence.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实施**

新增 `readStringSet` 解析器；追加登记条目；四处状态改为 store 持有并走 `persist`；大纲展开按工作区隔离。

- [ ] **Step 4: 运行测试确认通过并提交**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/regions/right-panel/panels/ChangesPanel/__tests__/changesPanelStatePersistence.test.ts && pnpm frontend:test
git add frontend/src/app
git commit -m "feat(changes): persist panel sub-state through the registry"
```

Expected: PASS。

---

## Task 24: 浏览器面板子状态补齐

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserNavigatorState.ts:21`
- Modify: `frontend/src/app/features/browser/useBrowserSearch.ts:71-72`
- Modify: `frontend/src/app/features/browser/useBrowserZoomState.ts:16`
- Modify: `frontend/src/app/features/browser-tree/useBrowserTreeCache.ts:109,131,148`
- Modify: `frontend/src/app/stores/persisted/registry.ts`

**Interfaces:**
- Consumes: `persist` / `persistField`、`pruneByTabId`
- Produces: 新增登记键

| 状态 | 现位置 | 新键名 | 字段 | scope |
|---|---|---|---|---|
| 导航子视图模式 | `useBrowserNavigatorState.ts:21` | `adl:browser.navigatorMode` | `browserNavigatorMode` | global |
| 导航检索范围 | `useBrowserSearch.ts:72` | `adl:browser.searchScope` | `browserSearchScope` | global |
| 树选中项 | `useBrowserNavigatorState.ts:28` | `adl:browser.selectedTreePath` | `browserSelectedTreePath` | global |
| 每标签缩放 | `useBrowserZoomState.ts:16` | `adl:browser.zoomByTab` | `browserZoomByTab` | byTabId |
| 三个大类区展开 | `useBrowserTreeCache.ts:109,131,148`（硬编码 `isExpanded: true`） | `adl:browser.categoryExpanded` | `browserCategoryExpanded` | global |

> 导航检索词（`navigatorQuery`）按 Task 22 的同一理由**不登记**（瞬态输入草稿）。`selectedTreePath` 目前"点击外部即清空"（`useBrowserNavigatorState.ts:63-71`）—— 登记后需确认该行为仍然生效，否则会出现"重启后树里高亮着一个用户早已放弃的项"。

- [ ] **Step 1: 写失败测试**：对表中五项各一条"重启还原"用例；`categoryExpanded` 用例需额外断言"三个大类区可独立折叠"（当前硬编码恒为展开，实现后应能读回 `false`）。
- [ ] **Step 2: 运行确认失败**：`cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/features/browser/__tests__/browserPanelStatePersistence.test.ts`
- [ ] **Step 3: 实施**：追加登记条目；五处状态上提 store 并走 `persist`；把三个大类区的硬编码展开改为受 `browserCategoryExpanded` 驱动（首次无记录时默认展开，保持现有观感）。
- [ ] **Step 4: 运行测试通过并提交**：

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/features/browser/__tests__/browserPanelStatePersistence.test.ts && pnpm frontend:test
git add frontend/src/app
git commit -m "feat(browser): persist panel sub-state through the registry"
```

---

## Task 25: 终端面板子状态补齐（每标签视图偏好）

**Files:**
- Modify: `frontend/src/app/features/terminal/terminalViewPrefs.ts:13-20`
- Modify: `frontend/src/app/features/terminal/useTerminalViewPrefs.ts:21,35-37`
- Modify: `frontend/src/app/features/terminal/useTerminalPanel.ts:140-143`
- Modify: `frontend/src/app/stores/persisted/registry.ts`

**Interfaces:**
- Consumes: `persist`、`pruneByTabId`
- Produces:
  - `adl:terminal.viewPrefs` 的结构由 `TerminalViewPrefs` 改为 `Record<tabId, TerminalViewPrefs>`（scope `byTabId`）
  - 不变量：某标签无记录时，观感等同改造前的全局默认值（`{ mode: 'split', historyFirst: false, historyRatio: 0.5 }`，以 `terminalViewPrefs.ts` 现有默认值为准，不得臆测）

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/features/terminal/__tests__/terminalViewPrefsPerTab.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { stubStorage } from '@stores/persisted/__tests__/helpers';
import { useAppStore } from '@stores/slicedStore';
import { hydrateAll } from '@stores/persisted/hydrate';
import { flushCrossSliceWrites } from '@stores/storageHelpers';

describe('per-tab terminal view prefs', () => {
  beforeEach(() => {
    stubStorage();
  });

  it('stores prefs per tab instead of globally', () => {
    useAppStore.getState().setTerminalViewPrefs('terminal-1', { mode: 'single', historyFirst: true, historyRatio: 0.3 });
    flushCrossSliceWrites();
    const stored = JSON.parse(localStorage.getItem('adl:terminal.viewPrefs') ?? 'null');
    expect(stored['terminal-1'].mode).toBe('single');
    expect(stored['terminal-2']).toBeUndefined();
  });

  it('falls back to the previous global defaults for a tab without a record', () => {
    const prefs = useAppStore.getState().getTerminalViewPrefs('terminal-unseen');
    expect(prefs.mode).toBe('split');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/features/terminal/__tests__/terminalViewPrefsPerTab.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实施**

按标签维度改造结构；`useTerminalViewPrefs` 改为读取当前活动标签的偏好（标签切换时不重置、不互相影响）；登记表 `scope` 改 `byTabId` 并挂 `pruneByTabId`（关闭标签时随剪枝一并清理，与既有 `terminalRegionCollapseStore` 的剪枝行为对齐）。

- [ ] **Step 4: 运行测试通过并提交**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/features/terminal/__tests__/terminalViewPrefsPerTab.test.ts && pnpm frontend:test && pnpm frontend:typecheck
git add frontend/src/app
git commit -m "feat(terminal): make view prefs per-tab instead of global"
```

Expected: PASS。

---

## Task 26: 会话恢复 —— 上次打开的文件

**Files:**
- Modify: `frontend/src/app/stores/persisted/registry.ts`（新增 `adl:session.lastFile`）
- Modify: `frontend/src/app/stores/actions/editorActions.ts`（打开/关闭文件时落盘）
- Modify: `frontend/src/app/hooks/useAppStartup.ts`（启动恢复）
- Modify: `frontend/src/app/i18n/zh-CN/*.ts`、`frontend/src/app/i18n/en-US/*.ts`
- Create: `frontend/src/app/stores/actions/__tests__/sessionRestore.test.ts`

**Interfaces:**
- Consumes: `persist`、`persistField`
- Produces:
  - `adl:session.lastFile` → `{ workspaceId: string; relativePath: string } | undefined`
  - `function restoreLastOpenedFile(): Promise<void>` —— 启动时调用一次
  - i18n key `sessionLastFileMissing`（zh-CN：`上次打开的文件已不存在`；en-US：`The file opened last time no longer exists`）

- [ ] **Step 1: 写失败测试（含失效降级）**

创建 `frontend/src/app/stores/actions/__tests__/sessionRestore.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { stubStorage } from '@stores/persisted/__tests__/helpers';
import { useAppStore } from '@stores/slicedStore';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';

describe('session restore', () => {
  beforeEach(() => {
    stubStorage();
  });

  it('records the last opened file', () => {
    useAppStore.getState().rememberLastOpenedFile('workspace_a', 'src/app.ts');
    flushCrossSliceWrites();
    expect(JSON.parse(localStorage.getItem('adl:session.lastFile') ?? 'null')).toEqual({
      workspaceId: 'workspace_a',
      relativePath: 'src/app.ts',
    });
  });

  it('restores it after a simulated restart', () => {
    localStorage.setItem(
      'adl:session.lastFile',
      JSON.stringify({ workspaceId: 'workspace_a', relativePath: 'src/app.ts' }),
    );
    resetHydrationForTest();
    expect(hydrateAll().patch.lastOpenedFile).toEqual({
      workspaceId: 'workspace_a',
      relativePath: 'src/app.ts',
    });
  });

  it('degrades gracefully when the file no longer exists', async () => {
    const openFile = vi.fn().mockRejectedValue(new Error('ENOENT'));
    useAppStore.setState({
      lastOpenedFile: { workspaceId: 'workspace_a', relativePath: 'gone.ts' },
      openFile: openFile as never,
    });
    await expect(useAppStore.getState().restoreLastOpenedFile()).resolves.toBeUndefined();
    expect(useAppStore.getState().sessionRestoreNotice).toBe('sessionLastFileMissing');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/actions/__tests__/sessionRestore.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实施**

- 新增登记键 `adl:session.lastFile`（`read` 校验两个字段均为字符串，否则判为不合法）。
- `rememberLastOpenedFile(workspaceId, relativePath)` 在 `openFileForWorkspace` 成功后调用。
- `restoreLastOpenedFile()`：工作区/文件不存在、权限不足、读取失败时**不抛错**，设置 `sessionRestoreNotice = 'sessionLastFileMissing'`，编辑器停在空态。
- `sessionRestoreNotice` 为非持久化的瞬态字段，在打开任意文件时清空 —— 满足"提示不得常驻"。
- 提示渲染处（`FilesPanel` 编辑器区域）用 `t.sessionRestoreNotice`，`zh-CN` / `en-US` 两份都加；跑 `pnpm --dir frontend run check:i18n` 确认覆盖。

- [ ] **Step 4: 运行测试通过 + i18n 覆盖检查**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/actions/__tests__/sessionRestore.test.ts && pnpm --dir frontend run check:i18n && pnpm frontend:test
```

Expected: PASS；i18n 覆盖检查无缺失。

- [ ] **Step 5: 提交**

```bash
cd ai-digital-life
git add frontend/src/app
git commit -m "feat(session): restore the last opened file with graceful degradation"
```

---

## Task 27: 会话恢复 —— 滚动偏移与折叠区间

**Files:**
- Modify: `frontend/src/app/stores/persisted/registry.ts`（新增 `adl:session.editorViewport`）
- Modify: `frontend/src/app/regions/right-panel/hooks/useEditorStateCache.ts`
- Modify: `frontend/src/app/features/editor/CodeEditor.tsx`（恢复挂载后应用偏移）
- Create: `frontend/src/app/stores/persisted/__tests__/viewport.test.ts`

**Interfaces:**
- Consumes: `persist`、`persistField`
- Produces:
  - `adl:session.editorViewport` → `{ relativePath: string; workspaceId: string; scrollTop: number; scrollTopLine: number; foldedRanges: Array<[number, number]> } | undefined`
  - `function readPersistedViewport(): PersistedViewport | undefined`
  - `function clampScrollTop(viewport: PersistedViewport, docLines: number): number` —— 越界钳制

**实现约束（必须遵守，否则做错方向）：** CodeMirror 的 `EditorState` 是活对象，**不可序列化**。只落"文档行号 + 折叠区间"这类小数值，启动后重建；不得序列化 `EditorState` 或视口 DOM 对象。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/stores/persisted/__tests__/viewport.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { clampScrollTop } from '../viewport';

const viewport = { relativePath: 'a.ts', workspaceId: 'ws', scrollTop: 900, scrollTopLine: 120, foldedRanges: [[10, 20]] as Array<[number, number]> };

describe('clampScrollTop', () => {
  it('keeps the stored offset when the document is long enough', () => {
    expect(clampScrollTop(viewport, 500)).toBe(900);
  });

  it('clamps to the tail when the document became shorter', () => {
    expect(clampScrollTop(viewport, 60)).toBeLessThan(900);
    expect(clampScrollTop(viewport, 60)).toBeGreaterThanOrEqual(0);
  });

  it('never returns a negative offset for an empty document', () => {
    expect(clampScrollTop(viewport, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/viewport.test.ts
```

Expected: FAIL —— `Failed to resolve import "../viewport"`。

- [ ] **Step 3: 实施 `viewport.ts` 与恢复链路**

- `clampScrollTop`：按 `docLines / scrollTopLine` 比例换算，内容变短时钳制到可滚动范围末尾，`docLines === 0` 返回 0。
- `readPersistedViewport()`：`read` 校验必需字段类型与 `foldedRanges` 的区间形状；非法区间整段忽略（不是整条丢弃）。
- `useEditorStateCache` 在文件切换时把"行号 + 折叠区间"经 `persistField('adl:session.editorViewport', …)` 落盘（替换原内存缓存路径，或与之并存但**明确注释**为何需要两套：内存缓存负责同会话快速切换、登记表负责跨重启；能合并则合并）。
- `CodeEditor` 挂载并拿到文档行数后，用 `clampScrollTop` 得到目标偏移并 `dispatch` 滚动，再重建折叠区间。

- [ ] **Step 4: 运行测试通过并提交**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/viewport.test.ts && pnpm frontend:test && pnpm frontend:typecheck
git add frontend/src/app
git commit -m "feat(session): restore editor scroll offset and folded ranges"
```

Expected: PASS。

---

## Task 28: 双端验收与收尾

**Files:**
- Modify: `docs/superpowers/specs/2026-09-20-right-panel-state-persistence-design.md`（回填验收结果与后续子项目）
- Modify: `docs/knowledge-base/README.md`（登记本次经验）

**Interfaces:**
- Consumes: Task 1–27 的全部产出
- Produces: 验收记录 + 后续子项目登记（F1 大对象收纳、F2 跨设备同步、F3 `browserTabTreeExpanded` 的 `folder:` 前缀孤儿剪枝 —— 该前缀当前无剪枝路径，本次有意不做）

- [ ] **Step 1: 桌面模式端到端验收**

```bash
cd ai-digital-life && pnpm dev:tauri
```

依次执行并记录结果：

1. 文件面板：展开工作区 W、展开 `src`、折叠 `src/legacy` → 完全关闭应用 → 重启。Expected：W 与 `src` 展开、`src/legacy` 保持折叠；`adl:files.workspaceExpanded` 与 `adl:files.dirExpanded` 在控制台可见且与操作一致。
2. 通过检索结果打开 `src/legacy` 内的文件。Expected：`src/legacy` **保持折叠**并闪烁一次。
3. 变更面板：切换状态过滤器、折叠某工作区头、切换到大纲并展开若干项 → 重启。Expected：三项全部还原。
4. 浏览器面板：切换导航子视图、折叠一个大类区 → 重启。Expected：全部还原。
5. 终端面板：调整某标签的历史/实时比例与模式 → 切到另一标签（应不受影响）→ 重启。Expected：原标签偏好还原、另一标签仍为默认。
6. 窗口关闭瞬间改一次展开态（点一下后立刻关窗）→ 重启。Expected：改动未丢。
7. 删除一个工作区 → 控制台检查。Expected：`adl:` 命名空间下不再有该工作区 id 的任何残留（`Object.keys(localStorage).filter(k => k.startsWith('adl:')).forEach(k => console.log(k, localStorage.getItem(k)))` 逐条确认）。

- [ ] **Step 2: 浏览器模式端到端验收**

```bash
cd ai-digital-life && pnpm dev:browser
```

重复 Step 1 的 1、3、4、5、7 项。Expected：与桌面模式**行为一致**（差异只允许出现在实现载体，不允许出现在用户可感知的输入输出上）。

- [ ] **Step 3: 全量门禁**

```bash
cd ai-digital-life && pnpm check:all
```

Expected: 全绿（cargo fmt/clippy/check/test + frontend lint/format/typecheck）。本计划不涉及 Rust 改动，cargo 部分应保持原状。

- [ ] **Step 4: 逐条核对验收标准**

对照规格 §7.2 的 8 条标准逐条勾核；任何未达标项**不得**标记完成，须记录为待办并说明阻塞原因。特别确认第 6 条：故意删掉登记表任意一条 → 运行自检测试应报错（证明声明式约束真实生效）。

```bash
# 示例：临时注释掉 registry.ts 中 adl:files.workspaceExpanded 后运行自检，应报错
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/registrySelfCheck.test.ts
```

Expected: 报错（依赖该键的用例失败）。核对完成后**恢复**被临时注释的条目。

- [ ] **Step 5: 回填文档并提交**

把验收结果、发现的问题、后续子项目 F3 写入规格文档；把"登记表 + 剪枝参照清单必须就绪"这条经验写入 `docs/knowledge-base/README.md` 索引下的新条目。

```bash
cd E:/AI-DIGITAL-LIFE/SourceWorkspace
git add docs
git commit -m "docs(right-panel): record persistence acceptance results and follow-ups"
```

---

## Task 29: 登记其余右侧面板工具的持久化状态（预检新增）

**Files:**
- Modify: `frontend/src/app/stores/persisted/registry.ts`
- Modify: `frontend/src/app/stores/slices/gitSlice.ts`（`adl-ui:changes-branch`）
- Modify: `frontend/src/app/stores/slices/ciSlice.ts`、`githubSlice.ts`、`githubSliceHelpers.ts`（`adl-ui:ci-*` / `adl-ui:github-*`）
- Modify: `frontend/src/app/stores/slices/communicateSlice.ts`（`adl-ui:active-communicate-platform` / `adl-ui:communicate-navigator-collapsed`）
- Modify: `frontend/src/app/stores/slices/systemMonitorSlice.ts`（`adl-ui:sysmon-*`）
- Modify: `frontend/src/app/stores/slices/clipboardHistorySlice.ts`（`adl-ui:clipboard-scroll-top`）
- Modify: `frontend/src/app/stores/slicedStore.ts`（清空 `PERSIST_KEEP_KEYS`）
- Create: `frontend/src/app/stores/persisted/__tests__/outOfScopePanelsPersistence.test.ts`

**Why this task exists:** V2 全量盘点（ledger B1）发现 15 个 `adl-ui:` 键不在 Task 7/9/10/11 的登记表内。它们属通信/GitHub/CI/系统监控/剪贴板面板（spec §3.7 的四面板范围外），但同在 `adl` 命名空间下。若不登记：(a) Task 6 的启动清理会删除它们（含 CI 快照、GitHub 工作区配置、两个访问令牌）；(b) Task 11 与 Task 18 的验收门禁以全仓为扫描范围，会恒为假。本任务把它们纳入统一通道，"统一基础设施"这一已确认决策才算真正落地。

**Interfaces:**
- Consumes: `defineEntry` / `readBooleanRecord` / `readStringEnum` / `readFlag` / `readNumberInRange`、`persist` / `persistField`、`pruneByWorkspaceId`（若适用）
- Produces: 15 条新登记键 + `PERSIST_KEEP_KEYS` 归零

**登记清单**

| 现键名 | 新键名 | 域 | scope | 解析器 |
|---|---|---|---|---|
| `adl-ui:changes-branch` | `adl:changes.branch` | changes | byWorkspaceId | 字符串映射 |
| `adl-ui:active-github-section` | `adl:browser.githubSection` | browser | global | `readStringEnum`（区块白名单以 `githubTreeSlice` 现有取值为准） |
| `adl-ui:github-ci-folders` | `adl:browser.ciFolders` | browser | global | 数组 |
| `adl-ui:github-workspace-configs` | `adl:browser.workspaceConfigs` | browser | byWorkspaceId | 对象映射；`pruneByWorkspaceId` |
| `adl-ui:github-access-token` | `adl:browser.githubAccessToken` | browser | global | 字符串（**见下方安全说明**） |
| `adl-ui:ci-access-token` | `adl:browser.ciAccessToken` | browser | global | 字符串（**见下方安全说明**） |
| `adl-ui:ci-config` | `adl:browser.ciConfig` | browser | global | 对象 |
| `adl-ui:ci-snapshots` | `adl:browser.ciSnapshots` | browser | global | 对象（体积需实测，超 32 KB 则 `sync: false`） |
| `adl-ui:ci-log-caches` | `adl:browser.ciLogCaches` | browser | global | 对象（同上，超限则 `sync: false`） |
| `adl-ui:ci-auto-refresh-on-push` | `adl:browser.ciAutoRefreshOnPush` | browser | global | `readFlag` |
| `adl-ui:active-communicate-platform` | `adl:ui.communicatePlatform` | ui | global | `readStringEnum` |
| `adl-ui:communicate-navigator-collapsed` | `adl:ui.communicateNavigatorCollapsed` | ui | global | `readFlag` |
| `adl-ui:sysmon-collapsed` | `adl:ui.sysmonCollapsed` | ui | global | `readFlag` |
| `adl-ui:sysmon-scroll-top` | `adl:ui.sysmonScrollTop` | ui | global | `readNumberInRange(0, 1e9)` |
| `adl-ui:clipboard-scroll-top` | `adl:ui.clipboardScrollTop` | ui | global | `readNumberInRange(0, 1e9)` |

**安全说明（预检更正后的事实，必须遵守）：** 先前预检曾把 `github-access-token` / `ci-access-token` 判为"明文凭据违反凭据规则"，**该判断已被证伪**：

- `adl-ui:github-access-token` **不存在于生产代码**（全仓唯一命中是 `frontend/src/mock/mock-ci.ts:11` 的一处注释）；
- CI 令牌在 **Tauri 模式已走 OS 凭据库**且不回读前端（`ciSlice.ts:6` 注释 + `ciSlice.ts:252` 的 `isTauriMode() ? null : ...`；服务端经 `adl_credential::get_ci_access_token_in_dir` 读取）；令牌 IPC 设计为只写不回读（`shared/ipc/github.ts:38-61`）；
- 仅**浏览器模式**因无 OS 钥匙串而回退到浏览器存储，任何替代（IndexedDB 等）同为明文。

因此本任务对这两个键只做"**原样搬迁 + 保留**"，**不得**改变其存储位置、明文形态或读取路径（改走 credential 存储属安全敏感变更，且需读取旧值 → 违反"未发布产品禁止迁移代码"，明确排除在本次范围外）。该残余风险在 Task 28 作为独立发现上报。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/app/stores/persisted/__tests__/outOfScopePanelsPersistence.test.ts`，对 15 条逐一断言"写入 → 模拟重启 → 读回一致"；另加两条：

```ts
it('keeps every previously-leaked key registered, so startup cleanup cannot delete it', () => {
  const registered = new Set(registryEntries.map((entry) => entry.key));
  for (const legacyKey of V2_LEAKED_KEYS) {
    expect([...registered]).toContain(legacyKey);
  }
});

it('no longer needs the transition keep-list', () => {
  expect(PERSIST_KEEP_KEYS_HAS_ENTRIES).toBe(false);
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted/__tests__/outOfScopePanelsPersistence.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实施**

按表登记 15 条；各 slice 的写入改走 `persist`（删除各自的 `makePersistedWriter` / 直接 `setItem`）；随后把 `slicedStore.ts` 中的 `PERSIST_KEEP_KEYS` 清空并删除该常量与其注释。

实施前先实测 `ci-snapshots` / `ci-log-caches` / `github-ci-folders` 三项的真实体积（在运行中的应用控制台执行 `Object.entries(localStorage).filter(([k]) => k.includes('ci-')).map(([k, v]) => [k, v.length])`）；超过 32 KB 的必须标 `sync: false`，否则自检的体积用例会变红。

- [ ] **Step 4: 运行测试确认通过，并把 Task 11 的门禁放开为全仓**

```bash
cd ai-digital-life && pnpm --dir frontend exec vitest run src/app/stores/persisted && pnpm frontend:test && pnpm frontend:typecheck
grep -rn "makePersistedWriter\|createDebouncedWrite\|setItem(" frontend/src --include=*.ts --include=*.tsx | grep -v "__tests__" | grep -v "storageHelpers.ts"
```

Expected: 测试全绿；grep **无输出**（此时唯二允许出现 `setItem` 的位置是 `storageHelpers.ts` 自身，以及 vendored 参考实现）。

- [ ] **Step 5: 提交**

```bash
cd ai-digital-life
git add frontend/src/app/stores
git commit -m "refactor(stores): register remaining right-panel tool state in the registry"
```

---

## Self-Review

**1. 规格覆盖核对**

| 规格章节 | 覆盖任务 |
|---|---|
| §3.1 数据模型与键规范 | T2（结构）、T7（键表）、T18（命名空间收敛） |
| §3.1.2 `manualCollapsed` 与三条转移规则 | T12 |
| §3.1.3 作用域纪律（含 C6 串味修复） | T7、T14 |
| §3.2 统一读写通道与三条硬性规则 | T2、T6；"禁止自建去抖"由 T11 Step 4 的 grep 门禁验收 |
| §3.3 水合时序（构造期同步、唯一时机） | T3、T6；T7–T11 逐个删除旧 idle 水合 |
| §3.4 折叠意图与闪烁提示 | T12、T13 |
| §3.5.1 懒剪与首要安全规则（R7 / R2） | T4（纯函数与负例）、T15（接线与负例） |
| §3.5.2 主动剪枝挂唯一入口 | T16 |
| §3.5.3 启动清理（替代迁移） | T6（机制）、T1（V2 盘点）、T21（例外清单回填） |
| §3.6 会话恢复 | T26、T27 |
| §3.7 全量覆盖清单 | T22–T25 |
| §3.7 之外：同命名空间的其他右侧面板工具（预检新增） | T29 |
| §4 清理清单（死代码 / 死状态 / 重复定义） | T19、T20；`setWorkspaceTreeExpandedInFileNav` 的"改造为唯一写入口"在 T8 |
| §5 错误处理与降级 | T3（四种降级输入）、T2（仅首次告警）、T6（清理不抛错）、T26（文件失效）、T27（越界钳制） |
| §6 前置验证 | T1 |
| §7 测试策略与验收 | T5（自检 + 辅助）、各任务红绿、T28（双端验收） |
| §9 影响文件清单 | 各任务 Files 段 |
| §10 后续子项目 | T28 Step 5 追加 F3 |

**2. 占位符扫描**：全文无 `TBD` / `TODO` / "适当处理" / "类似 Task N" 表述。Task 7 表格中 `filePreviewModeByPath` 一行指向 Task 14，属跨任务引用而非占位符（Task 14 给出了完整实现）。`Task 22` 的检索输入框草稿一行明确标注"不登记"并给出理由，属决策而非遗漏。Task 21 / Task 28 中"以 Task 1 的实测清单为准逐条填入"是**前置验证产出的数据**，不是设计缺口。

**3. 类型与命名一致性**：`TreeExpansion`（T12 定义，T14 复用）在 `uiSliceTypes.ts` / `entry.ts` / `prune.ts` 三处保持同名同形；`pruneByWorkspaceId` / `pruneDirPathsByWorkspace` / `pruneByTabId` / `prunePathPrefix` / `pruneRegistry` 在 T4 一次性定义、后续只引用不再改名；`persistField` 在 T6 定义后所有 slice 统一使用；登记表 `field` 必须与 `StoreState` 字段名逐字一致，由 T5 自检的"field 唯一"用例 + `pnpm frontend:typecheck` 双重兜底。

**4. 已知未覆盖项（有意排除，须在 T28 登记）**：

- `browserTabTreeExpanded` 中 `folder:` 前缀路径的孤儿剪枝（浏览器侧原本就无 folder 删除剪枝路径）→ 记为 F3。
- 检索输入框草稿、浏览器地址栏内容等瞬态输入不做持久化（YAGNI）。
- 终端历史索引等大对象不进入同步登记表（受 §3.3 准入线约束）→ 记为 F1。
- Task 13 Step 5 提到的"展开到当前文件"工具栏按钮：若本次未实现，须在 T28 明确记录为已知未实现项。

