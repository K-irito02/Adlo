# 文件热点排行榜（移除旭日图 + 双模式下钻）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将「文件热点」可视化从「旭日图 + 排行榜组合视图」重构为纯排行榜：彻底移除旭日图（含后端/命令/权限/桥接/预览/mock/组件/适配器/i18n/CSS/测试全部死代码），排行榜支持全排列/下钻双模式，名称与路径拆为两列。

**Architecture:** `FileHotspotsView` 收敛为薄容器，数据流不变（IPC `workspace_git_vis_file_hotspots` → `GitVisFileHotspots { tree, files }`）。内部 `FileHotspotsLeaderboard` 持有 `mode` + `drillPath` + 排序状态；两种模式只是行数据源分支（全排列 = `files` 全量仅文件；下钻 = `getHotspotChildren(tree, drillPath)` 目录+文件）。下钻交互复用 `ModuleBreadcrumb` / `ModuleTreeCard`（与贡献者模块热力图一致）。旭日图关联代码按「禁止死代码」规则分两阶段删除（前端→Rust）。

**Tech Stack:** React 19 + TypeScript + Vitest + Zustand（无新增依赖）；Rust / Tauri 2.x；i18n 双语言 key 校验脚本 `check:i18n`。

## Global Constraints

- 禁止死代码/兼容层：旭日图所有关联（含已获取但不再展示的 `FILE_SUNBURST` 图表数据）必须全部移除，不保留「向后兼容」重导出
- TDD：每任务先写失败测试 → 验证失败 → 最小实现 → 验证通过 → 独立提交
- 每次提交前质量门禁：`cargo clippy --workspace --all-targets -- -D warnings`（0 警告）、`pnpm --dir frontend run lint`、`pnpm --dir frontend run test`、`pnpm --dir frontend run typecheck`、`pnpm --dir frontend run check:i18n`（zh-CN / en-US key 必须完全一致）
- 任何 UI 展示文本（含 aria-label）必须使用 i18n key，禁止硬编码
- 颜色一律使用 `var(--…)` 设计 token，禁止硬编码色值
- 长路径展示可使用原生 `title`（项目规则允许）
- 双端一致：Tauri / Preview / Mock 三端 `gitVisFileSunburst` 全部移除，`gitVisFileHotspots` 保持对齐
- 分支命名 kebab-case ≤3 词；Commit 用 Conventional Commit（`feat`/`refactor`/`chore`）
- 数据源不变：不修改 `GitVisFileHotspots` 结构、不新增 Rust 后端工作

## Spec Notes（与 spec 的少量实现性偏差，均满足验收标准）

1. **drillPath 失效重置放在 `FileHotspotsLeaderboard` 内**（spec 2.3 写的是 `FileHotspotsView`）：因为组件内部状态由 leaderboard 持有（spec 1.3），两个组件各自调用 `useFileHotspotsState()` 会产生两份状态实例。验收标准「数据刷新后失效的 `drillPath` 自动重置」由 leaderboard 内 `useEffect` 满足。
2. **额外移除 3 个 i18n key**：`gitVisHotspotsRankingFile`、`gitVisHotspotsRankingEmpty`、`gitVisHotspotsFilterClear`。spec 5.3 未列入删除清单，但旧组件 `FileHotspotsRanking.tsx` 整体删除后它们成为死 key（新列头为 `gitVisHotspotsRankingName`/`RankingPath`，空态为 `gitVisHotspotsEmpty`），按「禁止死代码」规则一并移除。
3. **`getHotspotChildren` 的 root 参数在调用处需一次 `as HotspotTreeNode` 断言**：kernel 的 `GitVisFileHotspotNode.nodeType` 是 `string`，`HotspotTreeNode.nodeType` 收窄为 `'directory' | 'file'`，二者结构其余完全一致，断言安全。

## File Structure

| 文件 | 职责 | 操作 |
|------|------|------|
| `frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts` | 新增 `HotspotTreeNode` + `getHotspotChildren`；移除 `adaptSunburstData/adaptHotspotsTree/computeArcFill/filterFilesByPath` 及 `SunburstNode` import | 改 |
| `frontend/src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts` | 移除旭日图 4 组用例；新增 `getHotspotChildren` 用例 | 改 |
| `frontend/src/app/features/git-visualization/hooks/useFileHotspotsState.ts` | 新增 `mode/setMode` + localStorage 持久化；最终移除 `colorMode` | 改 |
| `frontend/src/app/features/git-visualization/hooks/__tests__/useFileHotspotsState.test.ts` | hook 状态测试（新建） | 建 |
| `frontend/src/app/features/git-visualization/charts/FileHotspotsLeaderboard.tsx` | 双模式排行榜主组件（模式切换/面包屑/表头/虚拟滚动/TreeCard） | 建 |
| `frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsLeaderboard.test.tsx` | 组件测试 | 建 |
| `frontend/src/app/features/git-visualization/charts/FileHotspotsView.tsx` | 收敛为薄容器 | 改 |
| `frontend/src/app/features/git-visualization/charts/FileSunburst.tsx` + `.test.tsx` | 删除 |
| `frontend/src/app/features/git-visualization/charts/FileHotspotsRanking.tsx` + `__tests__/FileHotspotsRanking.test.tsx` | 删除 |
| `frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsView.test.tsx` | 删除（被 leaderboard 测试替代） |
| `frontend/src/components/charts/sunburst*.{ts,tsx}`（9 个）+ `__tests__/sunburst-{segment,labels}.test.tsx` | 共享旭日图库，仅 FileSunburst 消费，全部删除 |
| `frontend/src/app/features/git-visualization/chartIds.ts` | 移除 `FILE_SUNBURST` | 改 |
| `frontend/src/app/stores/actions/gitVisActions.ts` | 移除 `FILE_SUNBURST` case 与 `HEATMAP_TABS` 项 | 改 |
| `frontend/src/kernel/types.ts` | 移除 `GitVisSunburstNode`/`GitVisFileSunburst` | 改 |
| `frontend/src/shared/ipc/workspace.ts` | 移除 `GitVisFileSunburst` 导入/导出/接口方法 | 改 |
| `frontend/src/tauri-bridge/tauri-workspace.ts` | 移除 `GitVisFileSunburst` 导入/实现 | 改 |
| `frontend/src/preview-bridge/preview-git.ts` | 移除 `GitVisFileSunburst` 导入/实现 | 改 |
| `frontend/src/mock/mock-workspace.ts` + `test-fixtures/gitVisMockData.ts` | 移除 `gitVisFileSunburst` mock 与 `fileTreemapData` | 改 |
| `frontend/dev/previewWorkspaceService/gitVisualization.ts` + `index.ts` | 移除 `handleFileSunburst` 与路由 | 改 |
| `frontend/src/app/i18n/zh-CN/changes.ts` / `en-US/changes.ts` | 移除/更新/新增 key | 改 |
| `frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx` | i18n mock 更新 | 改 |
| `frontend/src/styles/regions/rightpanel/git-visualization.css` | 移除旭日图样式；新增模式切换/名称路径列样式 | 改 |
| `crates/workspace/src/git/git_vis/sunburst.rs` | 删除 |
| `crates/workspace/src/git/git_vis/mod.rs` / `crates/workspace/src/lib.rs` | 移除 sunburst 模块与导出 | 改 |
| `crates/types/src/types/git_visualization.rs` | 移除 `GitVisSunburstNode`/`GitVisFileSunburst` | 改 |
| `src-tauri/src/commands/workspace_git_vis.rs` / `src-tauri/src/main.rs` / `src-tauri/permissions/digital-life.toml` | 移除命令/注册/权限 | 改 |

任务依赖顺序：Task 1（适配层）→ Task 2（i18n）→ Task 3（hook）→ Task 4（组件）→ Task 5（视图接线）→ Task 6（CSS）→ Task 7（前端清理，含 colorMode 移除）→ Task 8（Rust 清理）→ Task 9（全量门禁）。

---

### Task 1: `getHotspotChildren` 适配函数

**Files:**
- Modify: `frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts`
- Test: `frontend/src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts`

**Interfaces:**
- Consumes: `GitVisFileHotspots` IPC 结构（`tree: GitVisFileHotspotNode`，目录节点含 `children?`）。
- Produces: `HotspotTreeNode`（`name`/`nodeType: 'directory'|'file'`/`changeCount?`/`additions?`/`deletions?`/`lastModified?`/`children?`）与 `getHotspotChildren(root: HotspotTreeNode, drillPath: string[]): HotspotTreeNode[]`。Task 4 的 leaderboard 依赖此签名。

- [ ] **Step 1: 在测试文件追加失败测试**

在 `frontend/src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts` 末尾追加（保留文件已有的 4 个 `describe`，它们会在 Task 7 移除）：

```ts
import { describe, it, expect } from 'vitest';
import { getHotspotChildren, type HotspotTreeNode } from '../chartDataAdapters';

function node(overrides: Partial<HotspotTreeNode> = {}): HotspotTreeNode {
  return {
    name: 'n',
    nodeType: 'directory',
    children: [],
    ...overrides,
  };
}

const tree: HotspotTreeNode = node({
  name: 'root',
  children: [
    node({
      name: 'src',
      children: [
        node({
          name: 'core',
          children: [node({ name: 'engine.ts', nodeType: 'file', children: undefined })],
        }),
        node({
          name: 'api',
          children: [node({ name: 'handler.ts', nodeType: 'file', children: undefined })],
        }),
      ],
    }),
    node({ name: 'tests', children: [] }),
  ],
});

describe('getHotspotChildren', () => {
  it('returns root children for empty drillPath', () => {
    const children = getHotspotChildren(tree, []);
    expect(children.map((c) => c.name)).toEqual(['src', 'tests']);
  });

  it('walks one segment', () => {
    const children = getHotspotChildren(tree, ['src']);
    expect(children.map((c) => c.name)).toEqual(['core', 'api']);
  });

  it('walks multiple segments', () => {
    const children = getHotspotChildren(tree, ['src', 'core']);
    expect(children.map((c) => c.name)).toEqual(['engine.ts']);
  });

  it('returns empty array for nonexistent path', () => {
    expect(getHotspotChildren(tree, ['nope'])).toEqual([]);
    expect(getHotspotChildren(tree, ['src', 'nope'])).toEqual([]);
  });

  it('returns empty array for a file node (no children)', () => {
    expect(getHotspotChildren(tree, ['src', 'core', 'engine.ts'])).toEqual([]);
  });

  it('returns empty array for a directory with no children', () => {
    expect(getHotspotChildren(tree, ['tests'])).toEqual([]);
  });

  it('returns empty array when children is undefined', () => {
    const bare = node({ children: undefined });
    expect(getHotspotChildren(bare, [])).toEqual([]);
  });
});
```

注意：第 1 行已存在 `import { describe, it, expect } from 'vitest';`，追加时不要重复该 import（本测试文件头部已有）。新增 import 行 `getHotspotChildren` 放在文件顶部 import 区。

- [ ] **Step 2: 运行测试验证失败**

Run: `pnpm --dir frontend run test -- src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts`
Expected: FAIL — `getHotspotChildren is not a function`（测试通过旧 import 时即编译错误，符合红-绿预期）。

- [ ] **Step 3: 实现 `HotspotTreeNode` + `getHotspotChildren`**

在 `chartDataAdapters.ts` 的「File Hotspots Adapters」段（现约 line 519 起）之前插入（若「File Hotspots Adapters」段在 Task 7 才删除，此处放在 `adaptSunburstData` 之后、`filterFilesByPath` 之前亦可，位置不影响编译）：

```ts
export interface HotspotTreeNode {
  name: string;
  nodeType: 'directory' | 'file';
  changeCount?: number;
  additions?: number;
  deletions?: number;
  lastModified?: string;
  children?: HotspotTreeNode[];
}

/**
 * Walk from root down by `drillPath` segments (matching `name` at each level)
 * and return the child nodes of the node at that path. Empty `drillPath`
 * returns the root's direct children. Returns [] when any segment is missing
 * or the node has no children.
 */
export function getHotspotChildren(
  root: HotspotTreeNode,
  drillPath: string[],
): HotspotTreeNode[] {
  let current = root;
  for (const seg of drillPath) {
    const found = current.children?.find((c) => c.name === seg);
    if (!found) {
      return [];
    }
    current = found;
  }
  return current.children ?? [];
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `pnpm --dir frontend run test -- src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts`
Expected: PASS（新增 7 个用例 + 原有用例全绿）。

- [ ] **Step 5: 质量门禁 + 提交**

Run: `pnpm --dir frontend run typecheck && pnpm --dir frontend run lint && pnpm --dir frontend run check:i18n`
Expected: 0 errors。

```bash
git add frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts frontend/src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts
git commit -m "feat(git-vis): add getHotspotChildren tree walker for leaderboard drill-down"
```

---

### Task 2: i18n 新 key 与描述更新

**Files:**
- Modify: `frontend/src/app/i18n/zh-CN/changes.ts`
- Modify: `frontend/src/app/i18n/en-US/changes.ts`

**Interfaces:**
- Consumes: 无。
- Produces: 以下 key 供 Task 4 组件使用：`gitVisHotspotsModeFull`、`gitVisHotspotsModeDrill`、`gitVisHotspotsRankingName`、`gitVisHotspotsRankingPath`、`gitVisHotspotsEmpty`、`gitVisHotspotsDrillHint`，及更新后的 `gitVisFileHotspotsDesc`。

- [ ] **Step 1: 更新 `gitVisFileHotspotsDesc`**

zh-CN（现 line 147-148）改为：

```ts
  gitVisFileHotspotsDesc:
    '双模式排行榜：全排列模式按变更指标对全部文件排序；下钻模式沿目录树逐层下钻，支持点击目录行下钻、面包屑回退与右键路径跳转。',
```

en-US（现 line 147-148）改为：

```ts
  gitVisFileHotspotsDesc:
    'Two-mode leaderboard: Full Ranking sorts every changed file by a metric; Drill Down navigates the directory tree with click-to-drill on directory rows, breadcrumb back-navigation, and right-click path jump.',
```

- [ ] **Step 2: 新增 6 个 key（两语言同步，放在 `gitVisFileHotspotsDesc` 之后、`gitVisHeatmapTabCalendar` 之前）**

zh-CN：

```ts
  gitVisHotspotsModeFull: '全排列',
  gitVisHotspotsModeDrill: '下钻',
  gitVisHotspotsRankingName: '名称',
  gitVisHotspotsRankingPath: '路径',
  gitVisHotspotsEmpty: '无变更文件',
  gitVisHotspotsDrillHint: '点击目录行下钻，右键目录行可路径跳转',
```

en-US：

```ts
  gitVisHotspotsModeFull: 'Full Ranking',
  gitVisHotspotsModeDrill: 'Drill Down',
  gitVisHotspotsRankingName: 'Name',
  gitVisHotspotsRankingPath: 'Path',
  gitVisHotspotsEmpty: 'No changed files',
  gitVisHotspotsDrillHint: 'Click a directory row to drill down; right-click for path jump',
```

- [ ] **Step 3: 校验 i18n key 对齐**

Run: `pnpm --dir frontend run check:i18n`
Expected: `✅ zh-CN (N keys) 与 en-US (N keys) 完全一致`（N 比原计数 +6）。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/app/i18n/zh-CN/changes.ts frontend/src/app/i18n/en-US/changes.ts
git commit -m "feat(i18n): add file-hotspots leaderboard mode and column labels"
```

---

### Task 3: `useFileHotspotsState` 新增模式状态与持久化

**Files:**
- Modify: `frontend/src/app/features/git-visualization/hooks/useFileHotspotsState.ts`
- Test: `frontend/src/app/features/git-visualization/hooks/__tests__/useFileHotspotsState.test.ts`（新建）

**Interfaces:**
- Consumes: `@stores/shared` 的 `readJson`/`writeJson`（现有 `CodeLineEvo.tsx` 同款用法）。
- Produces: `HotspotMode = 'full' | 'drill'`、`FILE_HOTSPOTS_MODE_KEY = 'git-vis:file-hotspots-mode'`、`FileHotspotsState.mode/setMode`。**保留** `colorMode`（Task 7 随 FileSunburst 删除后再移除）。Task 4 组件依赖此接口。

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/app/features/git-visualization/hooks/__tests__/useFileHotspotsState.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileHotspotsState, FILE_HOTSPOTS_MODE_KEY } from '../useFileHotspotsState';

describe('useFileHotspotsState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults mode to full', () => {
    const { result } = renderHook(() => useFileHotspotsState());
    expect(result.current.mode).toBe('full');
  });

  it('persists mode to localStorage', () => {
    const { result } = renderHook(() => useFileHotspotsState());
    act(() => result.current.setMode('drill'));
    expect(JSON.parse(localStorage.getItem(FILE_HOTSPOTS_MODE_KEY) ?? '""')).toBe('drill');
    expect(result.current.mode).toBe('drill');
  });

  it('reads persisted mode on mount', () => {
    localStorage.setItem(FILE_HOTSPOTS_MODE_KEY, JSON.stringify('drill'));
    const { result } = renderHook(() => useFileHotspotsState());
    expect(result.current.mode).toBe('drill');
  });

  it('falls back to full for invalid persisted value', () => {
    localStorage.setItem(FILE_HOTSPOTS_MODE_KEY, JSON.stringify('bogus'));
    const { result } = renderHook(() => useFileHotspotsState());
    expect(result.current.mode).toBe('full');
  });

  it('defaults sort to changeCount desc and toggles direction on same key', () => {
    const { result } = renderHook(() => useFileHotspotsState());
    expect(result.current.sortKey).toBe('changeCount');
    expect(result.current.sortDir).toBe('desc');
    act(() => result.current.setSort('changeCount'));
    expect(result.current.sortDir).toBe('asc');
    act(() => result.current.setSort('changeCount'));
    expect(result.current.sortDir).toBe('desc');
  });

  it('switches sort key and resets direction to desc', () => {
    const { result } = renderHook(() => useFileHotspotsState());
    act(() => result.current.setSort('additions'));
    expect(result.current.sortKey).toBe('additions');
    expect(result.current.sortDir).toBe('desc');
  });

  it('updates drillPath', () => {
    const { result } = renderHook(() => useFileHotspotsState());
    act(() => result.current.setDrillPath(['src', 'core']));
    expect(result.current.drillPath).toEqual(['src', 'core']);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `pnpm --dir frontend run test -- src/app/features/git-visualization/hooks/__tests__/useFileHotspotsState.test.ts`
Expected: FAIL — `FILE_HOTSPOTS_MODE_KEY`/`mode` 不存在。

- [ ] **Step 3: 实现**

重写 `useFileHotspotsState.ts`（完整文件，**保留** `HotspotColorMode` 及 `colorMode`/`setColorMode`，仅新增 mode 相关）：

```ts
import { useCallback, useState } from 'react';
import { readJson, writeJson } from '@stores/shared';

export type HotspotColorMode = 'heat' | 'time';
export type HotspotMode = 'full' | 'drill';
export type RankingSortKey = 'changeCount' | 'additions' | 'deletions' | 'net';
export type SortDir = 'asc' | 'desc';

export const FILE_HOTSPOTS_MODE_KEY = 'git-vis:file-hotspots-mode';

export interface FileHotspotsState {
  mode: HotspotMode;
  setMode: (mode: HotspotMode) => void;
  drillPath: string[];
  setDrillPath: (path: string[]) => void;
  colorMode: HotspotColorMode;
  setColorMode: (mode: HotspotColorMode) => void;
  sortKey: RankingSortKey;
  sortDir: SortDir;
  setSort: (key: RankingSortKey) => void;
}

export function useFileHotspotsState(): FileHotspotsState {
  const [mode, setModeState] = useState<HotspotMode>(() => {
    const saved = readJson<HotspotMode>(FILE_HOTSPOTS_MODE_KEY, 'full');
    return saved === 'drill' ? 'drill' : 'full';
  });
  const [drillPath, setDrillPath] = useState<string[]>([]);
  const [colorMode, setColorMode] = useState<HotspotColorMode>('heat');
  const [sortKey, setSortKey] = useState<RankingSortKey>('changeCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const setMode = useCallback((next: HotspotMode) => {
    setModeState(next);
    writeJson(FILE_HOTSPOTS_MODE_KEY, next);
  }, []);

  const setSort = useCallback(
    (key: RankingSortKey) => {
      if (key === sortKey) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        return;
      }
      setSortKey(key);
      setSortDir('desc');
    },
    [sortKey],
  );

  return {
    mode,
    setMode,
    drillPath,
    setDrillPath,
    colorMode,
    setColorMode,
    sortKey,
    sortDir,
    setSort,
  };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `pnpm --dir frontend run test -- src/app/features/git-visualization/hooks/__tests__/useFileHotspotsState.test.ts`
Expected: PASS（7 个用例）。

- [ ] **Step 5: 质量门禁 + 提交**

Run: `pnpm --dir frontend run typecheck && pnpm --dir frontend run lint`
Expected: 0 errors。

```bash
git add frontend/src/app/features/git-visualization/hooks/useFileHotspotsState.ts frontend/src/app/features/git-visualization/hooks/__tests__/useFileHotspotsState.test.ts
git commit -m "feat(git-vis): persist hotspot leaderboard mode to localStorage"
```

---

### Task 4: `FileHotspotsLeaderboard` 双模式组件

**Files:**
- Create: `frontend/src/app/features/git-visualization/charts/FileHotspotsLeaderboard.tsx`
- Test: `frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsLeaderboard.test.tsx`（新建）

**Interfaces:**
- Consumes: `getHotspotChildren` + `HotspotTreeNode`（Task 1）；`useFileHotspotsState` 的 `mode/setMode/drillPath/setDrillPath/sortKey/sortDir/setSort`（Task 3）；i18n key（Task 2）；`ModuleBreadcrumb`/`ModuleTreeCard`/`EmptyRow`/`cn`（现有）。
- Produces: `FileHotspotsLeaderboard({ data?: GitVisFileHotspots })`。Task 5 的 `FileHotspotsView` 依赖此 props。

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsLeaderboard.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileHotspotsLeaderboard } from '../FileHotspotsLeaderboard';
import { fileHotspotsMockData } from '@/test-fixtures/gitVisMockData';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisHotspotsModeFull: 'Full Ranking',
      gitVisHotspotsModeDrill: 'Drill Down',
      gitVisHotspotsRankingName: 'Name',
      gitVisHotspotsRankingPath: 'Path',
      gitVisHotspotsRankingChangeCount: 'Changes',
      gitVisHotspotsRankingAdditions: 'Added',
      gitVisHotspotsRankingDeletions: 'Deleted',
      gitVisHotspotsRankingNet: 'Net',
      gitVisHotspotsEmpty: 'No changed files',
      gitVisHotspotsDrillHint: 'Click a directory row to drill down',
    },
    locale: 'en-US',
    formatT: vi.fn(),
  }),
}));

vi.mock('../ModuleBreadcrumb', () => ({
  ModuleBreadcrumb: ({
    pathSegments,
    onNavigate,
  }: {
    pathSegments: string[];
    onNavigate: (level: number) => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'breadcrumb' },
      React.createElement('button', { onClick: () => onNavigate(-1) }, 'Root'),
      pathSegments.map((seg, i) =>
        React.createElement('button', { key: i, onClick: () => onNavigate(i) }, seg),
      ),
    ),
}));

vi.mock('../ModuleTreeCard', () => ({
  ModuleTreeCard: ({
    onSelect,
    onClose,
  }: {
    onSelect: (path: string) => void;
    onClose: () => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'tree-card' },
      React.createElement('button', { onClick: () => onSelect('src/core') }, 'Jump'),
      React.createElement('button', { onClick: onClose }, 'Close'),
    ),
}));

function getRowNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.adl-file-hotspots-ranking__cell--name')).map(
    (el) => el.textContent ?? '',
  );
}

function getRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.adl-file-hotspots-ranking__row'));
}

beforeEach(() => {
  localStorage.clear();
});

describe('FileHotspotsLeaderboard', () => {
  it('renders all files in full mode with split name/path columns, sorted by change count desc', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    expect(getRowNames(container)).toEqual(['engine.ts', 'handler.ts', 'engine.test.ts']);
    expect(screen.getByText('src/core/engine.ts')).toBeTruthy();
    expect(screen.getByText('src/api/handler.ts')).toBeTruthy();
    expect(screen.getByText('tests/unit/engine.test.ts')).toBeTruthy();
  });

  it('re-sorts by net column and toggles direction', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    fireEvent.click(screen.getByRole('button', { name: /^Net/ }));
    expect(getRowNames(container)).toEqual(['engine.ts', 'engine.test.ts', 'handler.ts']);
    fireEvent.click(screen.getByRole('button', { name: /^Net/ }));
    expect(getRowNames(container)).toEqual(['handler.ts', 'engine.test.ts', 'engine.ts']);
  });

  it('shows directory rows at tree root in drill mode', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    fireEvent.click(screen.getByText('Drill Down'));
    expect(getRowNames(container)).toEqual(['src', 'tests']);
  });

  it('drills down on directory row click and back via breadcrumb', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    fireEvent.click(screen.getByText('Drill Down'));
    expect(getRowNames(container)).toEqual(['src', 'tests']);

    fireEvent.click(getRows(container)[0]); // src (changeCount 35 > tests 12)
    expect(getRowNames(container)).toEqual(['core', 'api']);

    fireEvent.click(getRows(container)[0]); // core
    expect(getRowNames(container)).toEqual(['engine.ts']);

    fireEvent.click(screen.getByText('Root'));
    expect(getRowNames(container)).toEqual(['src', 'tests']);
  });

  it('clears drillPath when switching to full mode', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    fireEvent.click(screen.getByText('Drill Down'));
    fireEvent.click(getRows(container)[0]); // src
    expect(getRowNames(container)).toEqual(['core', 'api']);

    fireEvent.click(screen.getByText('Full Ranking'));
    expect(getRowNames(container)).toEqual(['engine.ts', 'handler.ts', 'engine.test.ts']);

    fireEvent.click(screen.getByText('Drill Down'));
    expect(getRowNames(container)).toEqual(['src', 'tests']);
  });

  it('opens the tree card on right-click and jumps on confirm', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    fireEvent.click(screen.getByText('Drill Down'));
    fireEvent.contextMenu(getRows(container)[0]); // src
    expect(screen.getByTestId('tree-card')).toBeTruthy();
    fireEvent.click(screen.getByText('Jump'));
    expect(getRowNames(container)).toEqual(['engine.ts']);
  });

  it('shows empty state when no data', () => {
    render(<FileHotspotsLeaderboard />);
    expect(screen.getByText('No changed files')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `pnpm --dir frontend run test -- src/app/features/git-visualization/charts/__tests__/FileHotspotsLeaderboard.test.tsx`
Expected: FAIL — 无法解析 `../FileHotspotsLeaderboard`。

- [ ] **Step 3: 实现组件**

新建 `frontend/src/app/features/git-visualization/charts/FileHotspotsLeaderboard.tsx`：

```tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GitVisFileHotspots } from '@/shared/ipc/workspace';
import { useTCopy } from '@i18n/useTCopy';
import { cn } from '@/lib/utils';
import { EmptyRow } from '@components/LoadingRow';
import {
  getHotspotChildren,
  type HotspotTreeNode,
} from '../adapters/chartDataAdapters';
import { useFileHotspotsState, type HotspotMode } from '../hooks/useFileHotspotsState';
import { ModuleBreadcrumb } from '../ModuleBreadcrumb';
import { ModuleTreeCard } from '../ModuleTreeCard';
import type { ModuleTreeNode } from '../moduleTreeUtils';

const ROW_HEIGHT = 32;
const OVERSCAN = 5;
const MAX_HEIGHT = 320;

export interface FileHotspotsLeaderboardProps {
  data?: GitVisFileHotspots;
}

interface LeaderboardRow {
  key: string;
  name: string;
  path: string;
  isDir: boolean;
  changeCount: number;
  additions: number;
  deletions: number;
  net: number;
  children: HotspotTreeNode[];
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function buildRowsFromFiles(files: GitVisFileHotspots['files']): LeaderboardRow[] {
  return files.map((f) => ({
    key: f.path,
    name: basename(f.path),
    path: f.path,
    isDir: false,
    changeCount: f.changeCount,
    additions: f.additions,
    deletions: f.deletions,
    net: f.additions - f.deletions,
    children: [],
  }));
}

function buildRowsFromChildren(
  children: HotspotTreeNode[],
  prefix: string,
): LeaderboardRow[] {
  return children.map((c) => {
    const path = prefix ? `${prefix}/${c.name}` : c.name;
    return {
      key: path,
      name: c.name,
      path,
      isDir: c.nodeType === 'directory',
      changeCount: c.changeCount ?? 0,
      additions: c.additions ?? 0,
      deletions: c.deletions ?? 0,
      net: (c.additions ?? 0) - (c.deletions ?? 0),
      children: c.children ?? [],
    };
  });
}

function hotspotChildrenToModuleTree(
  children: HotspotTreeNode[],
  prefix: string,
): ModuleTreeNode[] {
  return children.map((c) => {
    const path = prefix ? `${prefix}/${c.name}` : c.name;
    return {
      name: c.name,
      path,
      isDir: c.nodeType === 'directory',
      children: c.children ? hotspotChildrenToModuleTree(c.children, path) : [],
    };
  });
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export const FileHotspotsLeaderboard = React.memo(function FileHotspotsLeaderboard({
  data,
}: FileHotspotsLeaderboardProps) {
  const { t } = useTCopy();
  const state = useFileHotspotsState();
  const { mode, setMode, drillPath, setDrillPath, sortKey, sortDir, setSort } = state;

  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(MAX_HEIGHT);
  const containerRef = useRef<HTMLDivElement>(null);
  const [treeCard, setTreeCard] = useState<{
    subtree: ModuleTreeNode[];
    prefix: string;
    position: { x: number; y: number };
  } | null>(null);

  // Reset a stale drillPath when the underlying data no longer contains it.
  useEffect(() => {
    if (data && drillPath.length > 0) {
      const children = getHotspotChildren(data.tree as HotspotTreeNode, drillPath);
      if (children.length === 0) {
        setDrillPath([]);
      }
    }
  }, [data, drillPath, setDrillPath]);

  const rows = useMemo<LeaderboardRow[]>(() => {
    if (!data) {
      return [];
    }
    if (mode === 'full') {
      return buildRowsFromFiles(data.files);
    }
    const children = getHotspotChildren(data.tree as HotspotTreeNode, drillPath);
    return buildRowsFromChildren(children, drillPath.join('/'));
  }, [data, mode, drillPath]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === 'desc' ? -diff : diff;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const handleModeChange = useCallback(
    (next: HotspotMode) => {
      setMode(next);
      if (next === 'full') {
        setDrillPath([]);
      }
    },
    [setMode, setDrillPath],
  );

  const handleRowClick = useCallback(
    (row: LeaderboardRow) => {
      if (row.isDir && row.children.length > 0) {
        setDrillPath([...drillPath, row.name]);
      }
    },
    [drillPath, setDrillPath],
  );

  const handleRowContextMenu = useCallback((e: React.MouseEvent, row: LeaderboardRow) => {
    if (row.isDir && row.children.length > 0) {
      e.preventDefault();
      setTreeCard({
        subtree: hotspotChildrenToModuleTree(row.children, row.path),
        prefix: row.path,
        position: { x: e.clientX, y: e.clientY },
      });
    }
  }, []);

  const handleBreadcrumbNavigate = useCallback(
    (level: number) => {
      if (level === -1) {
        setDrillPath([]);
      } else {
        setDrillPath((prev) => prev.slice(0, level + 1));
      }
    },
    [setDrillPath],
  );

  const handleTreeSelect = useCallback(
    (path: string) => {
      const segments = path.split('/');
      if (treeCard) {
        const prefixSegs = treeCard.prefix ? treeCard.prefix.split('/') : [];
        const remaining = segments.slice(prefixSegs.length);
        let nodes = treeCard.subtree;
        let isFile = false;
        for (const seg of remaining) {
          const found = nodes.find((n) => n.name === seg);
          if (!found) {
            break;
          }
          isFile = !found.isDir;
          nodes = found.children;
        }
        if (isFile && segments.length > 0) {
          segments.pop();
        }
      }
      setDrillPath(segments);
      setTreeCard(null);
    },
    [treeCard, setDrillPath],
  );

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
    if (containerRef.current) {
      setContainerHeight(containerRef.current.clientHeight);
    }
  };

  const { startIndex, endIndex } = useMemo(() => {
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + OVERSCAN * 2;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    return { startIndex: start, endIndex: Math.min(sorted.length, start + visibleCount) };
  }, [scrollTop, containerHeight, sorted.length]);

  const visibleRows = sorted.slice(startIndex, endIndex);
  const totalHeight = sorted.length * ROW_HEIGHT;
  const offsetY = startIndex * ROW_HEIGHT;

  return (
    <div className="adl-file-hotspots-ranking">
      <div className="adl-file-hotspots__toolbar">
        <div className="adl-file-hotspots__mode-toggle" role="group">
          <button
            type="button"
            className={cn(
              'adl-file-hotspots__mode-btn',
              mode === 'full' && 'adl-file-hotspots__mode-btn--active',
            )}
            aria-pressed={mode === 'full'}
            onClick={() => handleModeChange('full')}
          >
            {t.gitVisHotspotsModeFull}
          </button>
          <button
            type="button"
            className={cn(
              'adl-file-hotspots__mode-btn',
              mode === 'drill' && 'adl-file-hotspots__mode-btn--active',
            )}
            aria-pressed={mode === 'drill'}
            onClick={() => handleModeChange('drill')}
          >
            {t.gitVisHotspotsModeDrill}
          </button>
        </div>
        {mode === 'drill' && (
          <span className="adl-file-hotspots__drill-hint">{t.gitVisHotspotsDrillHint}</span>
        )}
      </div>

      {mode === 'drill' && (
        <div className="adl-file-hotspots-ranking__filter-bar">
          <ModuleBreadcrumb pathSegments={drillPath} onNavigate={handleBreadcrumbNavigate} />
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyRow message={t.gitVisHotspotsEmpty} />
      ) : (
        <div
          ref={containerRef}
          className="adl-file-hotspots-ranking__scroll"
          style={{ maxHeight: MAX_HEIGHT, overflowY: 'auto' }}
          onScroll={handleScroll}
          role="table"
        >
          <div className="adl-file-hotspots-ranking__header" role="row">
            <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--rank">
              #
            </span>
            <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--name">
              {t.gitVisHotspotsRankingName}
            </span>
            <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--path">
              {t.gitVisHotspotsRankingPath}
            </span>
            <button
              type="button"
              className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
              onClick={() => setSort('changeCount')}
            >
              {t.gitVisHotspotsRankingChangeCount}
              {sortKey === 'changeCount' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
            </button>
            <button
              type="button"
              className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
              onClick={() => setSort('additions')}
            >
              {t.gitVisHotspotsRankingAdditions}
              {sortKey === 'additions' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
            </button>
            <button
              type="button"
              className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
              onClick={() => setSort('deletions')}
            >
              {t.gitVisHotspotsRankingDeletions}
              {sortKey === 'deletions' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
            </button>
            <button
              type="button"
              className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__sort-btn"
              onClick={() => setSort('net')}
            >
              {t.gitVisHotspotsRankingNet}
              {sortKey === 'net' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
            </button>
          </div>
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              {visibleRows.map((row, i) => {
                const rank = startIndex + i + 1;
                return (
                  <div
                    key={row.key}
                    role="row"
                    className={cn(
                      'adl-file-hotspots-ranking__row',
                      row.isDir && 'adl-file-hotspots-ranking__row--dir',
                    )}
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => handleRowClick(row)}
                    onContextMenu={(e) => handleRowContextMenu(e, row)}
                  >
                    <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--rank">
                      {rank}
                    </span>
                    <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--name">
                      {row.name}
                    </span>
                    <span
                      className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--path"
                      title={row.path}
                    >
                      {row.path}
                    </span>
                    <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num">
                      {formatNumber(row.changeCount)}
                    </span>
                    <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__cell--add">
                      +{formatNumber(row.additions)}
                    </span>
                    <span className="adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num adl-file-hotspots-ranking__cell--del">
                      -{formatNumber(row.deletions)}
                    </span>
                    <span
                      className={`adl-file-hotspots-ranking__cell adl-file-hotspots-ranking__cell--num ${
                        row.net > 0
                          ? 'adl-file-hotspots-ranking__cell--add'
                          : row.net < 0
                            ? 'adl-file-hotspots-ranking__cell--del'
                            : 'adl-file-hotspots-ranking__cell--zero'
                      }`}
                    >
                      {row.net > 0 ? '+' : ''}
                      {formatNumber(row.net)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {treeCard && (
        <ModuleTreeCard
          subtree={treeCard.subtree}
          position={treeCard.position}
          onSelect={handleTreeSelect}
          onClose={() => setTreeCard(null)}
        />
      )}
    </div>
  );
});
```

- [ ] **Step 4: 运行测试验证通过**

Run: `pnpm --dir frontend run test -- src/app/features/git-visualization/charts/__tests__/FileHotspotsLeaderboard.test.tsx`
Expected: PASS（7 个用例）。若出现 `useTCopy` 相关类型错误，说明 mock key 与组件引用不一致，按报错补齐 mock。

- [ ] **Step 5: 质量门禁 + 提交**

Run: `pnpm --dir frontend run typecheck && pnpm --dir frontend run lint`
Expected: 0 errors。

```bash
git add frontend/src/app/features/git-visualization/charts/FileHotspotsLeaderboard.tsx frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsLeaderboard.test.tsx
git commit -m "feat(git-vis): add dual-mode file hotspots leaderboard"
```

---

### Task 5: 收敛 `FileHotspotsView` 为排行榜容器

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/FileHotspotsView.tsx`
- Delete: `frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsView.test.tsx`

**Interfaces:**
- Consumes: `FileHotspotsLeaderboard`（Task 4）。
- Produces: `FileHotspotsView({ data?: GitVisFileHotspots })`（props 不变，`GitVisualizationView.tsx` 无需改动数据流）。

- [ ] **Step 1: 重写 `FileHotspotsView.tsx`**

```tsx
import React from 'react';
import { FileHotspotsLeaderboard } from './FileHotspotsLeaderboard';
import type { GitVisFileHotspots } from '@/shared/ipc/workspace';

export interface FileHotspotsViewProps {
  data?: GitVisFileHotspots;
}

export const FileHotspotsView = React.memo(function FileHotspotsView({
  data,
}: FileHotspotsViewProps) {
  return (
    <div className="adl-file-hotspots-view">
      <FileHotspotsLeaderboard data={data} />
    </div>
  );
});
```

- [ ] **Step 2: 删除旧测试**

删除 `frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsView.test.tsx`（其断言 sunburst SVG 渲染，已不适用；行为由 `FileHotspotsLeaderboard.test.tsx` 覆盖）。

- [ ] **Step 3: 验证**

Run: `pnpm --dir frontend run test -- src/app/features/git-visualization/charts`
Expected: 该目录下测试 PASS。注意 `FileSunburst.test.tsx` 与 `__tests__/FileHotspotsRanking.test.tsx` 仍会运行且应保持 PASS（它们依赖的组件/适配器/i18n 尚未删除）。

- [ ] **Step 4: 质量门禁 + 提交**

Run: `pnpm --dir frontend run typecheck && pnpm --dir frontend run lint`
Expected: 0 errors。

```bash
git add frontend/src/app/features/git-visualization/charts/FileHotspotsView.tsx
git rm frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsView.test.tsx
git commit -m "refactor(git-vis): slim FileHotspotsView to leaderboard container"
```

---

### Task 6: CSS — 模式切换、名称/路径列，移除旭日图样式

**Files:**
- Modify: `frontend/src/styles/regions/rightpanel/git-visualization.css`

**Interfaces:**
- Consumes: Task 4 组件使用的 class：`.adl-file-hotspots__toolbar`/`__mode-toggle`/`__mode-btn`/`__mode-btn--active`/`__drill-hint`、`.adl-file-hotspots-ranking__row--dir`、`.adl-file-hotspots-ranking__cell--name`/`--path`。
- Produces: 无（纯样式）。

- [ ] **Step 1: 移除旭日图样式与死样式**

在 `git-visualization.css` 中删除以下规则块：

```css
.adl-file-sunburst-hint { ... }                       /* line 1396-1403 */
.adl-file-sunburst-breadcrumb { ... }                 /* line 1405-1407 */
.adl-file-hotspots-view .adl-file-sunburst--hotspots { ... }  /* line 1417-1419 */
.adl-file-hotspots-ranking__clear-btn { ... }         /* line 1438-1447 */
.adl-file-hotspots-ranking__clear-btn:hover { ... }   /* line 1449-1451 */
```

同时将 `.adl-file-hotspots-ranking__cell--file`（line 1497-1500）及其 `> *`（line 1502-1505）整块删除。

- [ ] **Step 2: 更新网格为 7 列 + 新增模式切换/名称路径列样式**

将 `.adl-file-hotspots-ranking__header, .adl-file-hotspots-ranking__row` 的 `grid-template-columns`（现 line 1461）：

```css
  grid-template-columns: 40px 1fr 80px 70px 70px 80px;
```

改为：

```css
  grid-template-columns: 40px 1fr 1.6fr 80px 70px 70px 80px;
```

在「File Hotspots Combined View」段末尾（`.adl-file-hotspots-ranking__sort-btn:hover` 之后，即文件末尾）追加：

```css
/* ── File Hotspots Leaderboard (dual mode) ── */
.adl-file-hotspots__toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.adl-file-hotspots__mode-toggle {
  display: inline-flex;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
}

.adl-file-hotspots__mode-btn {
  background: transparent;
  border: none;
  padding: 2px 12px;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s;
}

.adl-file-hotspots__mode-btn:hover {
  color: var(--text-primary);
}

.adl-file-hotspots__mode-btn--active {
  background: var(--bg-hover);
  color: var(--text-primary);
  font-weight: 600;
}

.adl-file-hotspots__drill-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.adl-file-hotspots-ranking__row--dir {
  cursor: pointer;
}

.adl-file-hotspots-ranking__row--dir .adl-file-hotspots-ranking__cell--name {
  font-weight: 600;
}

.adl-file-hotspots-ranking__cell--name {
  text-align: left;
}

.adl-file-hotspots-ranking__cell--path {
  text-align: left;
  color: var(--text-muted);
  direction: rtl;
}

.adl-file-hotspots-ranking__cell--path > * {
  direction: ltr;
  unicode-bidi: plaintext;
}
```

- [ ] **Step 3: 验证**

Run: `pnpm --dir frontend run lint`
Expected: 0 errors（CSS 无 lint 校验项则确认改动无语法错误即可）。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/styles/regions/rightpanel/git-visualization.css
git commit -m "style(git-vis): add leaderboard mode toggle and name/path columns"
```

---

### Task 7: 前端清理 — 移除旭日图全部代码 + `colorMode`

**Files:**（全部在 `frontend/` 下）
- Delete: `src/app/features/git-visualization/charts/FileSunburst.tsx`、`FileSunburst.test.tsx`、`FileHotspotsRanking.tsx`
- Delete: `src/app/features/git-visualization/charts/__tests__/FileHotspotsRanking.test.tsx`
- Delete: `src/components/charts/sunburst.ts`、`sunburst-data.ts`、`sunburst-context.tsx`、`sunburst-chart.tsx`、`sunburst-segment.tsx`、`sunburst-labels.tsx`、`sunburst-center.tsx`、`sunburst-breadcrumb.tsx`、`sunburst-hint.tsx`
- Delete: `src/components/charts/__tests__/sunburst-segment.test.tsx`、`sunburst-labels.test.tsx`
- Modify: `src/app/features/git-visualization/chartIds.ts`
- Modify: `src/app/stores/actions/gitVisActions.ts`
- Modify: `src/app/features/git-visualization/adapters/chartDataAdapters.ts`
- Modify: `src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts`
- Modify: `src/app/features/git-visualization/hooks/useFileHotspotsState.ts`
- Modify: `src/kernel/types.ts`
- Modify: `src/shared/ipc/workspace.ts`
- Modify: `src/tauri-bridge/tauri-workspace.ts`
- Modify: `src/preview-bridge/preview-git.ts`
- Modify: `src/mock/mock-workspace.ts`
- Modify: `src/test-fixtures/gitVisMockData.ts`
- Modify: `dev/previewWorkspaceService/gitVisualization.ts`
- Modify: `dev/previewWorkspaceService/index.ts`
- Modify: `src/app/i18n/zh-CN/changes.ts`、`src/app/i18n/en-US/changes.ts`
- Modify: `src/app/features/git-visualization/GitVisualizationView.test.tsx`

**Interfaces:**
- Consumes: 前 6 个任务已就绪。
- Produces: `chartDataAdapters.ts` 仅剩（保留）+ `getHotspotChildren` + `HotspotTreeNode` + 其余非旭日图函数；`useFileHotspotsState.ts` 移除 `HotspotColorMode`/`colorMode`/`setColorMode`。三端 `gitVisFileSunburst` 全部移除，`gitVisFileHotspots` 保留。

- [ ] **Step 1: 删除组件与共享旭日图库文件**

用 `git rm` 删除下列文件（均为旭日图专用，删除前用 `grep -r "sunburst-chart" frontend/src` 确认无外部引用，仅 `FileSunburst.tsx` 引用）：

```
frontend/src/app/features/git-visualization/charts/FileSunburst.tsx
frontend/src/app/features/git-visualization/charts/FileSunburst.test.tsx
frontend/src/app/features/git-visualization/charts/FileHotspotsRanking.tsx
frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsRanking.test.tsx
frontend/src/components/charts/sunburst.ts
frontend/src/components/charts/sunburst-data.ts
frontend/src/components/charts/sunburst-context.tsx
frontend/src/components/charts/sunburst-chart.tsx
frontend/src/components/charts/sunburst-segment.tsx
frontend/src/components/charts/sunburst-labels.tsx
frontend/src/components/charts/sunburst-center.tsx
frontend/src/components/charts/sunburst-breadcrumb.tsx
frontend/src/components/charts/sunburst-hint.tsx
frontend/src/components/charts/__tests__/sunburst-segment.test.tsx
frontend/src/components/charts/__tests__/sunburst-labels.test.tsx
```

- [ ] **Step 2: 移除图表注册与拉取分支**

`chartIds.ts` — 删除行：

```ts
  FILE_SUNBURST: 'file-sunburst',
```

`gitVisActions.ts` — 从 `HEATMAP_TABS` 数组删除：

```ts
  CHART_IDS.FILE_SUNBURST,
```

并删除整个 case 分支：

```ts
    case CHART_IDS.FILE_SUNBURST:
      result = await bridge.workspace.gitVisFileSunburst(rootPath);
      break;
```

- [ ] **Step 3: 适配层移除旭日图函数**

`chartDataAdapters.ts` — 删除 `import type { SunburstNode } from '@/components/charts/sunburst-chart';`（line 2）；删除 `GitVisSunburstNodeInput` 接口、`adaptSunburstData`（line 492-517）、`GitVisHotspotNodeInput`/`HotspotArcMeta` 接口、`adaptHotspotsTree`（line 538-587）、`filterFilesByPath`（line 589-599）、`computeArcFill`（line 601-641）。保留 `getHotspotChildren` + `HotspotTreeNode`（Task 1 新增）与文件其余函数。

- [ ] **Step 4: 重写适配器测试文件**

将 `frontend/src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts` 整体替换为只含 `getHotspotChildren` 用例（内容 = Task 1 的测试代码块；该文件当前 4 个旭日图 `describe` 全部移除）。

- [ ] **Step 5: 移除 hook 的 `colorMode`**

`useFileHotspotsState.ts` — 删除 `export type HotspotColorMode = 'heat' | 'time';`、接口中的 `colorMode`/`setColorMode`、`useState<HotspotColorMode>`、返回对象中的 `colorMode`/`setColorMode`。删除后文件应如下（mode/排序逻辑保持不变）：

```ts
import { useCallback, useState } from 'react';
import { readJson, writeJson } from '@stores/shared';

export type HotspotMode = 'full' | 'drill';
export type RankingSortKey = 'changeCount' | 'additions' | 'deletions' | 'net';
export type SortDir = 'asc' | 'desc';

export const FILE_HOTSPOTS_MODE_KEY = 'git-vis:file-hotspots-mode';

export interface FileHotspotsState {
  mode: HotspotMode;
  setMode: (mode: HotspotMode) => void;
  drillPath: string[];
  setDrillPath: (path: string[]) => void;
  sortKey: RankingSortKey;
  sortDir: SortDir;
  setSort: (key: RankingSortKey) => void;
}

export function useFileHotspotsState(): FileHotspotsState {
  const [mode, setModeState] = useState<HotspotMode>(() => {
    const saved = readJson<HotspotMode>(FILE_HOTSPOTS_MODE_KEY, 'full');
    return saved === 'drill' ? 'drill' : 'full';
  });
  const [drillPath, setDrillPath] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<RankingSortKey>('changeCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const setMode = useCallback((next: HotspotMode) => {
    setModeState(next);
    writeJson(FILE_HOTSPOTS_MODE_KEY, next);
  }, []);

  const setSort = useCallback(
    (key: RankingSortKey) => {
      if (key === sortKey) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        return;
      }
      setSortKey(key);
      setSortDir('desc');
    },
    [sortKey],
  );

  return {
    mode,
    setMode,
    drillPath,
    setDrillPath,
    sortKey,
    sortDir,
    setSort,
  };
}
```

- [ ] **Step 6: 移除 IPC 类型与三端实现**

`src/kernel/types.ts` — 删除 `GitVisSunburstNode`（line 198-203）与 `GitVisFileSunburst`（line 204-206）。

`src/shared/ipc/workspace.ts` — 从 import 列表（line 12）与 export 列表（line 38）删除 `GitVisFileSunburst,`；删除方法：

```ts
  /** Get file sunburst tree data */
  gitVisFileSunburst: (rootPath: string) => Promise<IpcResult<GitVisFileSunburst>>;
```

`src/tauri-bridge/tauri-workspace.ts` — 删除 import 中 `GitVisFileSunburst,`（line 10）与方法：

```ts
    gitVisFileSunburst: (rootPath) =>
      invokeIpc<GitVisFileSunburst>('workspace_git_vis_file_sunburst', { rootPath }),
```

`src/preview-bridge/preview-git.ts` — 删除 import 中 `GitVisFileSunburst,`（line 9）与方法：

```ts
    gitVisFileSunburst: async (rootPath: string) => {
      const params = new URLSearchParams({ rootPath });
      return requestPreviewApi<GitVisFileSunburst>(
        `/workspace/git-vis-file-sunburst?${params.toString()}`,
      );
    },
```

`src/mock/mock-workspace.ts` — 删除 import 中 `fileTreemapData,`（line 38）与方法：

```ts
  gitVisFileSunburst: async () => ({
    ok: true as const,
    data: { tree: fileTreemapData },
  }),
```

`src/test-fixtures/gitVisMockData.ts` — 删除 `fileTreemapData` 常量（line 404-452）。

- [ ] **Step 7: 移除 Preview 服务端实现与路由**

`dev/previewWorkspaceService/gitVisualization.ts` — 删除 `handleFileSunburst`（line 323-349）。

`dev/previewWorkspaceService/index.ts` — 删除路由：

```ts
  {
    method: 'GET', pathname: makePath('/workspace/git-vis-file-sunburst'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      const data = await gitVis.handleFileSunburst(rootPath);
      return ok(data);
    },
  },
```

- [ ] **Step 8: i18n 移除（两语言同步）**

`zh-CN/changes.ts` 与 `en-US/changes.ts` 均删除以下 key：

```
gitVisFileSunburst
gitVisFileSunburstDesc
gitVisSunburstHintZoomIn
gitVisSunburstHintZoomOut
gitVisHotspotsColorModeHeat
gitVisHotspotsColorModeTime
gitVisHotspotsTooltipChanges
gitVisHotspotsTooltipLines
gitVisHotspotsTooltipLastModified
gitVisHotspotsNoDirectoryChanges
gitVisHotspotsRankingFile
gitVisHotspotsRankingEmpty
gitVisHotspotsFilterClear
```

保留：`gitVisHotspotsRankingChangeCount/Additions/Deletions/Net`（新组件仍在用）。

- [ ] **Step 9: 更新 `GitVisualizationView.test.tsx` i18n mock**

删除 mock 中两行：

```ts
      gitVisFileSunburst: 'File Sunburst',
```
```ts
      gitVisFileSunburstDesc: 'desc',
```

- [ ] **Step 10: 全局 grep 确认无残留**

Run:
```powershell
Get-ChildItem -Recurse -Path "frontend\src" -Include *.ts,*.tsx,*.css | Select-String -Pattern 'sunburst|gitVisFileSunburst|FILE_SUNBURST|colorMode|adaptSunburstData|adaptHotspotsTree|computeArcFill|filterFilesByPath|fileTreemapData|HotspotColorMode'
```
Expected: 无输出（除 `node_modules`）。

- [ ] **Step 11: 质量门禁 + 提交**

Run: `pnpm --dir frontend run typecheck && pnpm --dir frontend run lint && pnpm --dir frontend run test && pnpm --dir frontend run check:i18n`
Expected: 全部通过（注意 `gitVisFileHotspots` 相关测试仍须 PASS）。

```bash
git add -A frontend/src frontend/dev/previewWorkspaceService
git commit -m "refactor(git-vis): remove sunburst chart and dead code across frontend"
```

---

### Task 8: Rust 后端移除旭日图

**Files:**
- Delete: `crates/workspace/src/git/git_vis/sunburst.rs`
- Modify: `crates/workspace/src/git/git_vis/mod.rs`
- Modify: `crates/workspace/src/lib.rs`
- Modify: `crates/types/src/types/git_visualization.rs`
- Modify: `src-tauri/src/commands/workspace_git_vis.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/permissions/digital-life.toml`

**Interfaces:**
- Consumes: Task 7 已移除前端对 `workspace_git_vis_file_sunburst` 的所有调用。
- Produces: `adl_workspace` 不再导出 `capture_file_sunburst`；Tauri 不再注册/授权该命令。

- [ ] **Step 1: 删除模块文件**

`git rm crates/workspace/src/git/git_vis/sunburst.rs`

- [ ] **Step 2: 移除模块声明与导出**

`crates/workspace/src/git/git_vis/mod.rs` — 删除：

```rust
pub mod sunburst;
```
```rust
pub use sunburst::capture_file_sunburst;
```

`crates/workspace/src/lib.rs` — 将 re-export 改为：

```rust
pub use git::git_vis::{
    capture_branch_graph, capture_code_evolution, capture_commit_stats,
    capture_contributor_modules, capture_file_hotspots,
};
```

- [ ] **Step 3: 移除类型**

`crates/types/src/types/git_visualization.rs` — 删除 `GitVisSunburstNode`（line 142-152）与 `GitVisFileSunburst`（line 154-158）。

- [ ] **Step 4: 移除命令与注册与权限**

`src-tauri/src/commands/workspace_git_vis.rs` — import 改为：

```rust
use adl_types::{
    GitVisBranchGraph, GitVisCodeEvolution, GitVisCommitStats, GitVisContributorModules,
    GitVisFileHotspots, IpcResult,
};
```

删除命令函数：

```rust
#[tauri::command]
pub async fn workspace_git_vis_file_sunburst(
    _app: tauri::AppHandle,
    root_path: String,
) -> Result<IpcResult<GitVisFileSunburst>, AppError> {
    let root = Path::new(&root_path);
    let data = adl_workspace::capture_file_sunburst(root).await?;
    Ok(ipc(Ok(data)))
}
```

`src-tauri/src/main.rs` — 删除注册行：

```rust
            commands::workspace_git_vis::workspace_git_vis_file_sunburst,
```

`src-tauri/permissions/digital-life.toml` — 删除：

```toml
  "workspace_git_vis_file_sunburst",
```

- [ ] **Step 5: 编译 + 测试 + clippy**

Run: `cargo check --workspace`（workdir: `ai-digital-life`）
Expected: 0 errors。

Run: `cargo test --workspace`
Expected: 全绿（现有测试不涉及 sunburst）。

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Expected: 0 warnings。

- [ ] **Step 6: 提交**

```bash
git add -A crates src-tauri
git commit -m "refactor(rust): remove file sunburst command, types, and permissions"
```

---

### Task 9: 全量门禁与残留扫描

**Files:**
- Modify: 无预期变更（若扫描发现残留则修复并提交）。

**Interfaces:**
- Consumes: 全部前置任务。
- Produces: 可交付的完整状态。

- [ ] **Step 1: 全仓 grep 确认无 `sunburst` / `gitVisFileSunburst` 残留**

Run（从仓库根 `E:\AI-DIGITAL-LIFE\SourceWorkspace`）：
```powershell
Get-ChildItem -Recurse -Path "ai-digital-life\frontend\src","ai-digital-life\frontend\dev","ai-digital-life\crates","ai-digital-life\src-tauri" -Include *.ts,*.tsx,*.css,*.rs,*.toml | Select-String -Pattern 'sunburst|gitVisFileSunburst|FILE_SUNBURST|fileTreemapData|HotspotColorMode'
```
Expected: 无输出。

- [ ] **Step 2: Rust 全量门禁**

Run: `cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace`
Expected: 0 warnings，全绿。

- [ ] **Step 3: 前端全量门禁**

Run: `pnpm --dir frontend run lint && pnpm --dir frontend run typecheck && pnpm --dir frontend run test && pnpm --dir frontend run check:i18n`
Expected: lint 0 errors、typecheck 通过、测试全绿、i18n key 完全一致。

- [ ] **Step 4: 验收核对（对照 spec 第 8 节）**

- [ ] 文件热点卡片不再渲染旭日图（无 SVG 扇形），仅排行榜
- [ ] 分段按钮「全排列 | 下钻」，默认全排列，localStorage 持久化
- [ ] 全排列：全部文件按指标排序，名称/路径分列
- [ ] 下钻：点击目录行逐层下钻、面包屑逐级回退、右键弹树形选择器跳转
- [ ] 名称 = basename，路径 = 完整路径，长路径 `title` 完整展示
- [ ] 数据刷新后失效 `drillPath` 自动重置
- [ ] 旭日图相关代码全部移除，无死代码
- [ ] 三端 `gitVisFileSunburst` 移除、`gitVisFileHotspots` 对齐

若存在未勾选项，修复后重新执行 Step 2-3 直至全绿，最后提交：

```bash
git commit -m "chore(git-vis): final cleanup after sunburst removal"
```

---

## Self-Review

**Spec coverage:**
- §1.3 方案 A（单 mode-aware 组件）→ Task 4/5
- §2.2 `getHotspotChildren` → Task 1；行来源表 → Task 4 `buildRowsFromFiles`/`buildRowsFromChildren`
- §2.3 空仓库/drillPath 失效/无子节点不可下钻 → Task 4（空态 `EmptyRow`、`useEffect` 重置、`row.children.length > 0` 门控）
- §3 列设计（7 列、仅数值列可排序、名称=basename、路径=完整路径+title）→ Task 4 + Task 6
- §4.2 状态（`mode` 持久化、移除 `colorMode`）→ Task 3 + Task 7；`drillPath` 不持久化 → 天然满足（`useState([])`）
- §4.3 下钻交互（面包屑/点击/右键/切模式清空）→ Task 4 四个 handler
- §5.1 Rust 清理（7 处）→ Task 8
- §5.2 前端清理 → Task 7
- §5.3 i18n → Task 2（新增）+ Task 7（移除/更新）
- §6 CSS → Task 6
- §7 测试（组件/适配层/清理回归/门禁）→ Task 1/3/4/7/9
- §8 验收标准 → Task 9 Step 4

**Placeholder scan:** 无 TBD/TODO；所有代码步骤给出完整代码或精确 diff；删除类步骤给出文件清单与删除内容。

**Type consistency:** `HotspotTreeNode`/`getHotspotChildren(root, drillPath)` 在 Task 1 定义、Task 4 消费；`useFileHotspotsState` 接口在 Task 3 定义、Task 4 消费、Task 7 移除 `colorMode` 后无外部引用；`FileHotspotsLeaderboardProps = { data?: GitVisFileHotspots }` 在 Task 4 定义、Task 5 消费。`FILE_HOTSPOTS_MODE_KEY` 常量名在 Task 3 与测试中一致。
