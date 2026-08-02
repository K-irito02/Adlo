# 文件旭日图增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复文件旭日图为空的问题，并新增面包屑导航、扇形名称截断+原生 tooltip、底部 3 态提示文字。

**Architecture:** 方案 A —— 复用热力图 `ModuleBreadcrumb` 组件 + 增强共享图表组件（`SunburstSegment` 添加 `<title>`、`SunburstLabels` 添加 `fitLabel` 截断）。数据流修复集中在 `adaptSunburstData` 适配器，解包 `{ tree }` 包装并递归映射 `size → value`。

**Tech Stack:** React 19 + TypeScript + motion/react + Vitest + @testing-library/react

## Global Constraints

- 所有 UI 文本必须使用 i18n key（`useTCopy()` + `TCopyProvider`），禁止硬编码中英文
- `@` 路径别名导入（禁止深层相对路径）：`@/components/...`、`@/app/...`、`@i18n/...`
- 测试文件就近放置在 `__tests__/` 子目录（前端测试规范）
- TypeScript 禁止 `any`，使用精确类型；禁止 `else`，使用提前返回
- ESLint + Prettier 必须通过；`pnpm --dir frontend run typecheck` 必须通过
- 参考设计文档：`docs/superpowers/specs/2026-08-02-file-sunburst-chart-enhancement-design.md`

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts` | 修改 | 重写 `adaptSunburstData`：解包 `{ tree }` + 映射 `size → value` |
| `ai-digital-life/frontend/src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts` | 新建 | 适配器单测（就近放置规范） |
| `ai-digital-life/frontend/src/test-fixtures/gitVisMockData.ts` | 修改 | `fileTreemapData` 改用 `size` + `type` 字段 |
| `ai-digital-life/frontend/src/mock/mock-workspace.ts` | 修改 | 去掉 `as unknown as` 强转 |
| `ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts` | 修改 | 新增 2 个 i18n key |
| `ai-digital-life/frontend/src/app/i18n/en-US/changes.ts` | 修改 | 新增 2 个 i18n key |
| `ai-digital-life/frontend/src/components/charts/sunburst-segment.tsx` | 修改 | `<motion.g>` 内添加 `<title>` |
| `ai-digital-life/frontend/src/components/charts/__tests__/sunburst-segment.test.tsx` | 新建 | `<title>` 断言测试 |
| `ai-digital-life/frontend/src/components/charts/sunburst-labels.tsx` | 修改 | 新增 `fitLabel` 工具函数 + 截断显示 |
| `ai-digital-life/frontend/src/components/charts/__tests__/sunburst-labels.test.tsx` | 新建 | 截断/过滤测试 |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.tsx` | 修改 | 渲染面包屑 + hint；新增 2 个内部组件 |
| `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.test.tsx` | 修改 | 测试改传 `{ tree: ... }`；新增面包屑/hint 用例 |
| `ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css` | 修改 | 新增 `.adl-file-sunburst-hint`、`.adl-file-sunburst-breadcrumb` |

---

## Task 1: Fix `adaptSunburstData` data flow

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts:491-493`
- Modify: `ai-digital-life/frontend/src/test-fixtures/gitVisMockData.ts:404-445`
- Modify: `ai-digital-life/frontend/src/mock/mock-workspace.ts:429-432`
- Create: `ai-digital-life/frontend/src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts`

**Interfaces:**
- Produces: `adaptSunburstData(raw: unknown): SunburstNode` — 解包 `{ tree }` 包装，递归映射 `size → value`，丢弃 `type` 字段

- [ ] **Step 1: Write failing test for `adaptSunburstData`**

Create `ai-digital-life/frontend/src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { adaptSunburstData } from '../chartDataAdapters';

describe('adaptSunburstData', () => {
  it('unwraps { tree } wrapper from backend payload', () => {
    const input = {
      tree: {
        name: 'root',
        type: 'directory',
        children: [{ name: 'src', type: 'directory', children: [] }],
      },
    };
    const result = adaptSunburstData(input);
    expect(result.name).toBe('root');
    expect(result.children).toHaveLength(1);
    expect(result.children?.[0].name).toBe('src');
  });

  it('maps size to value recursively on leaf nodes', () => {
    const input = {
      tree: {
        name: 'root',
        type: 'directory',
        children: [{ name: 'main.js', type: 'file', size: 120 }],
      },
    };
    const result = adaptSunburstData(input);
    expect(result.children?.[0].value).toBe(120);
  });

  it('drops the type field from output nodes', () => {
    const input = {
      tree: { name: 'root', type: 'directory', children: [{ name: 'f.js', type: 'file', size: 1 }] },
    };
    const result = adaptSunburstData(input) as Record<string, unknown>;
    expect(result.type).toBeUndefined();
    expect(result.children?.[0]).not.toHaveProperty('type');
  });

  it('returns empty root for null/undefined/{} input', () => {
    expect(adaptSunburstData(null)).toEqual({ name: '', children: [] });
    expect(adaptSunburstData(undefined)).toEqual({ name: '', children: [] });
    expect(adaptSunburstData({})).toEqual({ name: '', children: [] });
  });

  it('accepts bare root node without { tree } wrapper', () => {
    const input = { name: 'root', children: [{ name: 'a', size: 1 }] };
    const result = adaptSunburstData(input);
    expect(result.name).toBe('root');
    expect(result.children?.[0].value).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts`
Expected: FAIL — `result.name` is undefined (current `adaptSunburstData` returns input as-is, so `result` is `{ tree: ... }` without top-level `name`)

- [ ] **Step 3: Rewrite `adaptSunburstData` implementation**

Edit `ai-digital-life/frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts`.

First add the `SunburstNode` import at the top of the file (after existing imports). Check if there's already an import from `@/components/charts/sunburst-chart` or `sunburst-data`; if not, add:

```typescript
import type { SunburstNode } from '@/components/charts/sunburst-chart';
```

Then replace lines 491-493 (the current `adaptSunburstData` no-op) with:

```typescript
interface GitVisSunburstNodeInput {
  name: string;
  type?: string;
  size?: number;
  children?: GitVisSunburstNodeInput[];
}

export function adaptSunburstData(raw: unknown): SunburstNode {
  const wrapped = raw as { tree?: GitVisSunburstNodeInput } | GitVisSunburstNodeInput;
  const root =
    wrapped && typeof wrapped === 'object' && 'tree' in wrapped ? wrapped.tree : wrapped;
  if (!root || typeof root !== 'object') {
    return { name: '', children: [] };
  }

  const mapNode = (n: GitVisSunburstNodeInput): SunburstNode => {
    const out: SunburstNode = { name: n.name };
    if (n.size !== undefined) out.value = n.size;
    if (n.children?.length) out.children = n.children.map(mapNode);
    return out;
  };
  return mapNode(root);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Update test fixture to use `size` + `type` fields**

Edit `ai-digital-life/frontend/src/test-fixtures/gitVisMockData.ts` lines 404-445. Replace the `fileTreemapData` object:

```typescript
export const fileTreemapData = {
  name: 'root',
  type: 'directory',
  children: [
    {
      name: 'src',
      type: 'directory',
      children: [
        { name: 'main.js', type: 'file', size: 120 },
        { name: 'utils.js', type: 'file', size: 85 },
        { name: 'api.js', type: 'file', size: 65 },
        {
          name: 'components',
          type: 'directory',
          children: [
            { name: 'Header.vue', type: 'file', size: 45 },
            { name: 'Footer.vue', type: 'file', size: 30 },
            { name: 'Sidebar.vue', type: 'file', size: 55 },
          ],
        },
      ],
    },
    {
      name: 'tests',
      type: 'directory',
      children: [
        { name: 'test_main.js', type: 'file', size: 40 },
        { name: 'test_utils.js', type: 'file', size: 35 },
      ],
    },
    {
      name: 'docs',
      type: 'directory',
      children: [
        { name: 'README.md', type: 'file', size: 20 },
        { name: 'CONTRIBUTING.md', type: 'file', size: 15 },
      ],
    },
    {
      name: 'config',
      type: 'directory',
      children: [
        { name: 'webpack.config.js', type: 'file', size: 25 },
        { name: 'eslint.json', type: 'file', size: 10 },
      ],
    },
  ],
};
```

- [ ] **Step 6: Remove `as unknown as` cast in mock bridge**

Edit `ai-digital-life/frontend/src/mock/mock-workspace.ts` line 431. Replace:

```typescript
    data: { tree: fileTreemapData as unknown as import('@ai-digital-life/kernel').GitVisFileSunburst['tree'] },
```

with:

```typescript
    data: { tree: fileTreemapData },
```

- [ ] **Step 7: Update existing `FileSunburst.test.tsx` to pass `{ tree: ... }` wrapper**

Edit `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.test.tsx` line 67. Replace:

```typescript
        <FileSunburst data={fileTreemapData} />
```

with:

```typescript
        <FileSunburst data={{ tree: fileTreemapData }} />
```

- [ ] **Step 8: Run FileSunburst test to verify data flow fix**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/FileSunburst.test.tsx`
Expected: PASS — `renders SVG with arcs` test passes, `path` elements exist (> 0)

- [ ] **Step 9: Commit**

```bash
cd ai-digital-life
git add frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts frontend/src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts frontend/src/test-fixtures/gitVisMockData.ts frontend/src/mock/mock-workspace.ts frontend/src/app/features/git-visualization/charts/FileSunburst.test.tsx
git commit -m "fix(frontend): unwrap { tree } and map size→value in adaptSunburstData so file sunburst renders"
```

---

## Task 2: Add i18n keys

**Files:**
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts:209` (after `gitVisBreadcrumbNav`)
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/changes.ts:209` (after `gitVisBreadcrumbNav`)

**Interfaces:**
- Produces: `t.gitVisSunburstHintZoomIn`, `t.gitVisSunburstHintZoomOut` — string keys for hint text

- [ ] **Step 1: Add 2 keys to zh-CN dictionary**

Edit `ai-digital-life/frontend/src/app/i18n/zh-CN/changes.ts`. After line 209 (`gitVisBreadcrumbNav: '模块路径导航',`), add:

```typescript
  gitVisSunburstHintZoomIn: '点击扇形可下钻',
  gitVisSunburstHintZoomOut: '点击中心可缩放',
```

- [ ] **Step 2: Add 2 keys to en-US dictionary**

Edit `ai-digital-life/frontend/src/app/i18n/en-US/changes.ts`. After line 209 (`gitVisBreadcrumbNav: 'Module breadcrumb',`), add:

```typescript
  gitVisSunburstHintZoomIn: 'Click a segment to zoom in',
  gitVisSunburstHintZoomOut: 'Click the center to zoom out',
```

- [ ] **Step 3: Verify typecheck passes (keys type-safe via `CopyKey = keyof typeof zhCN`)**

Run: `pnpm --dir frontend run typecheck`
Expected: PASS — no errors (both dictionaries have identical keys)

- [ ] **Step 4: Commit**

```bash
cd ai-digital-life
git add frontend/src/app/i18n/zh-CN/changes.ts frontend/src/app/i18n/en-US/changes.ts
git commit -m "feat(frontend): add i18n keys for sunburst hint zoom in/out text"
```

---

## Task 3: Enhance `SunburstSegment` with native tooltip

**Files:**
- Modify: `ai-digital-life/frontend/src/components/charts/sunburst-segment.tsx:126-137` (static branch) and `:140-155` (animated branch)
- Create: `ai-digital-life/frontend/src/components/charts/__tests__/sunburst-segment.test.tsx`

**Interfaces:**
- Consumes: `arc.name` (string) from `useSunburstStable()` context — already available
- Produces: `<title>` child element inside `<motion.g>` for native SVG tooltip on hover

- [ ] **Step 1: Write failing test asserting `<title>` exists**

Create `ai-digital-life/frontend/src/components/charts/__tests__/sunburst-segment.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SunburstChart } from '../sunburst-chart';
import { SunburstSegment } from '../sunburst-segment';
import type { SunburstNode } from '../sunburst-chart';

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: never, tag: string) =>
        function MotionTag({ children, ...rest }: Record<string, unknown>) {
          const React = require('react');
          const elProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (k !== 'className' && k !== 'children' && k !== 'key') {
              elProps[k] = v;
            }
          }
          return React.createElement(
            tag === 'default' ? 'div' : tag,
            { className: rest.className, key: rest.key, ...elProps },
            children,
          );
        },
    },
  ),
  animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
  useMotionValue: <T,>(val: T) => ({ get: () => val, set: () => {}, stop: () => {}, on: () => () => {} }),
  useTransform: () => ({ get: () => 0, set: () => {}, stop: () => {}, on: () => () => {} }),
  useReducedMotion: () => false,
}));

const testData: SunburstNode = {
  name: 'root',
  children: [
    { name: 'src', children: [{ name: 'main.js', value: 10 }] },
    { name: 'docs', children: [{ name: 'README.md', value: 5 }] },
  ],
};

describe('SunburstSegment', () => {
  it('renders a <title> element with the arc name for native tooltip', () => {
    const { container } = render(
      <SunburstChart data={testData} size={200}>
        <SunburstSegment index={0} />
        <SunburstSegment index={1} />
      </SunburstChart>,
    );
    const titles = container.querySelectorAll('g title');
    expect(titles.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend exec vitest run src/components/charts/__tests__/sunburst-segment.test.tsx`
Expected: FAIL — `titles.length` is 0 (current `SunburstSegment` has no `<title>` element)

- [ ] **Step 3: Add `<title>` to both render branches of `SunburstSegment`**

Edit `ai-digital-life/frontend/src/components/charts/sunburst-segment.tsx`.

In the static branch (around line 126-137), change the `<motion.g>` content to add `<title>` as the first child:

```tsx
  if (showStatic) {
    return (
      <motion.g
        animate={{ opacity: layerOpacity }}
        initial={false}
        onClick={hitHandlers.onClick}
        onPointerEnter={hitHandlers.onPointerEnter}
        style={groupStyle}
        transition={{ opacity: HOVER_DIM_TRANSITION }}
      >
        <title>{arc.name}</title>
        <path d={fullHitPath} fill="transparent" />
        <path d={fullVisualPath} {...visualPathProps} />
      </motion.g>
    );
  }
```

In the animated branch (around line 140-155), add `<title>` as the first child of `<motion.g>`:

```tsx
  return (
    <motion.g
      animate={{ opacity: layerOpacity }}
      initial={false}
      onClick={hitHandlers.onClick}
      onPointerEnter={hitHandlers.onPointerEnter}
      style={{
        ...groupStyle,
        scale: enterScale,
      }}
      transition={{ opacity: HOVER_DIM_TRANSITION }}
    >
      <title>{arc.name}</title>
      <motion.path d={animatedHitPath} fill="transparent" />
      <motion.path d={animatedVisualPath} {...visualPathProps} />
    </motion.g>
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend exec vitest run src/components/charts/__tests__/sunburst-segment.test.tsx`
Expected: PASS — `<title>` elements exist

- [ ] **Step 5: Commit**

```bash
cd ai-digital-life
git add frontend/src/components/charts/sunburst-segment.tsx frontend/src/components/charts/__tests__/sunburst-segment.test.tsx
git commit -m "feat(frontend): add native <title> tooltip to SunburstSegment for all arcs"
```

---

## Task 4: Enhance `SunburstLabels` with `fitLabel` truncation

**Files:**
- Modify: `ai-digital-life/frontend/src/components/charts/sunburst-labels.tsx`
- Create: `ai-digital-life/frontend/src/components/charts/__tests__/sunburst-labels.test.tsx`

**Interfaces:**
- Produces: `fitLabel(name, maxWidth, fontSize)` — internal utility that truncates names exceeding `maxWidth` with `…` suffix

- [ ] **Step 1: Write failing tests for `fitLabel` and label rendering**

Create `ai-digital-life/frontend/src/components/charts/__tests__/sunburst-labels.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SunburstChart } from '../sunburst-chart';
import { SunburstSegment } from '../sunburst-segment';
import { SunburstLabels } from '../sunburst-labels';
import type { SunburstNode } from '../sunburst-chart';

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: never, tag: string) =>
        function MotionTag({ children, ...rest }: Record<string, unknown>) {
          const React = require('react');
          const elProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (k !== 'className' && k !== 'children' && k !== 'key') {
              elProps[k] = v;
            }
          }
          return React.createElement(
            tag === 'default' ? 'div' : tag,
            { className: rest.className, key: rest.key, ...elProps },
            children,
          );
        },
    },
  ),
  animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
  useMotionValue: <T,>(val: T) => ({ get: () => val, set: () => {}, stop: () => {}, on: () => () => {} }),
  useTransform: () => ({ get: () => 0, set: () => {}, stop: () => {}, on: () => () => {} }),
  useReducedMotion: () => false,
}));

// jsdom lacks canvas measureText; mock it to return a predictable width
const mockCtx = {
  font: '',
  measureText: (text: string) => ({ width: text.length * 6 }),
};
vi.stubGlobal('measureCanvas', undefined);
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);

const testData: SunburstNode = {
  name: 'root',
  children: [
    { name: 'src', children: [{ name: 'a.ts', value: 10 }] },
    { name: 'very-long-directory-name-here', children: [{ name: 'b.ts', value: 5 }] },
  ],
};

function renderLabels() {
  return render(
    <SunburstChart data={testData} size={200}>
      <SunburstSegment index={0} />
      <SunburstSegment index={1} />
      <SunburstSegment index={2} />
      <SunburstSegment index={3} />
      <SunburstLabels />
    </SunburstChart>,
  );
}

describe('SunburstLabels', () => {
  it('renders short names without truncation', () => {
    const { container } = renderLabels();
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts.some((t) => t === 'src')).toBe(true);
  });

  it('truncates long names with ellipsis when they exceed available width', () => {
    const { container } = renderLabels();
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent ?? '');
    const truncated = texts.find((t) => t.endsWith('…'));
    expect(truncated).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend exec vitest run src/components/charts/__tests__/sunburst-labels.test.tsx`
Expected: FAIL — no text ends with `…` (current labels render full `arc.name`)

- [ ] **Step 3: Add `fitLabel` utility and apply truncation in `SunburstLabels`**

Edit `ai-digital-life/frontend/src/components/charts/sunburst-labels.tsx`.

Add the `measureText` and `fitLabel` functions after the imports (before `SunburstLabelsProps` interface, around line 16):

```typescript
let measureCanvas: HTMLCanvasElement | null = null;
function measureText(text: string, fontSize: number): number {
  if (typeof document === 'undefined') return text.length * fontSize * 0.6;
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return text.length * fontSize * 0.6;
  ctx.font = `600 ${fontSize}px inherit`;
  return ctx.measureText(text).width;
}

function fitLabel(name: string, maxWidth: number, fontSize: number): string {
  if (maxWidth <= 0) return '…';
  if (measureText(name, fontSize) <= maxWidth) return name;
  let lo = 1;
  let hi = name.length;
  let result = '';
  const ellipsis = '…';
  while (lo <= hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = name.slice(0, mid) + ellipsis;
    if (measureText(candidate, fontSize) <= maxWidth) {
      result = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result || ellipsis;
}
```

Then in the `arcs.map` callback, after the existing filter checks (after line 73 `if (!isRelated(arc)) return null;`), add the truncation logic. Find the line that computes `r` (line 67) and add after the filter checks:

```typescript
        const availableWidth = Math.max(0, angleSpan * r - 8);
        const displayLabel = fitLabel(arc.name, availableWidth, fontSize);
```

Then replace both `{arc.name}` occurrences in the `<text>` and `<motion.text>` render outputs with `{displayLabel}`.

The `<text>` branch (around line 100-113) becomes:

```tsx
          return (
            <text
              dominantBaseline="middle"
              key={`label-${arc.id}`}
              pointerEvents="none"
              style={{ ...labelStyle, opacity: 1 }}
              textAnchor="middle"
              transform={`rotate(${deg} ${x} ${y})`}
              x={x}
              y={y}
            >
              {displayLabel}
            </text>
          );
```

The `<motion.text>` branch (around line 116-129) becomes:

```tsx
        return (
          <motion.text
            dominantBaseline="middle"
            key={`label-${arc.id}`}
            pointerEvents="none"
            style={{ ...labelStyle, opacity: labelOpacity }}
            textAnchor="middle"
            transform={`rotate(${deg} ${x} ${y})`}
            x={x}
            y={y}
          >
            {displayLabel}
          </motion.text>
        );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend exec vitest run src/components/charts/__tests__/sunburst-labels.test.tsx`
Expected: PASS — short name "src" renders intact, long name is truncated with `…`

- [ ] **Step 5: Commit**

```bash
cd ai-digital-life
git add frontend/src/components/charts/sunburst-labels.tsx frontend/src/components/charts/__tests__/sunburst-labels.test.tsx
git commit -m "feat(frontend): truncate long sunburst labels with fitLabel and ellipsis"
```

---

## Task 5: Add breadcrumb + hint to `FileSunburst`

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.test.tsx`
- Modify: `ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css`

**Interfaces:**
- Consumes: `useSunburstBreadcrumbItems()` from `@/components/charts/sunburst-breadcrumb`, `SunburstHint` (render prop) from `@/components/charts/sunburst-hint`, `ModuleBreadcrumb` from `../ModuleBreadcrumb`, `t.gitVisModuleRoot` / `t.gitVisSunburstHintZoomIn` / `t.gitVisSunburstHintZoomOut` from i18n
- Produces: `FileSunburst` renders breadcrumb (when drilled), center, segments, and hint (3-state)

- [ ] **Step 1: Write failing tests for breadcrumb visibility and hint text**

Edit `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.test.tsx`. Replace the entire file content:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { FileSunburst } from './FileSunburst';
import { fileTreemapData } from '../../../../test-fixtures/gitVisMockData';
import { TCopyProvider } from '@app/i18n/TCopyContext';

function createMotionValue(initial = 0) {
  const listeners: Record<string, ((v: unknown) => void)[]> = {};
  return {
    get: () => initial,
    set: (v: unknown) => {
      listeners.change?.forEach((fn) => fn(v));
    },
    stop: () => {},
    on: (event: string, fn: (v: unknown) => void) => {
      (listeners[event] ??= []).push(fn);
      return () => {
        listeners[event] = listeners[event]?.filter((f) => f !== fn);
      };
    },
  };
}

const mockCtx = {
  font: '',
  measureText: (text: string) => ({ width: text.length * 6 }),
};

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: never, tag: string) =>
        function MotionTag({
          children,
          _initial,
          _animate,
          _exit,
          _transition,
          _variants,
          _whileHover,
          _whileTap,
          _style,
          ...rest
        }: Record<string, unknown>) {
          const React = require('react');
          const elProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (k !== 'className' && k !== 'children' && k !== 'key') {
              elProps[k] = v;
            }
          }
          return React.createElement(
            tag === 'default' ? 'div' : tag,
            { className: rest.className, key: rest.key, ...elProps },
            children,
          );
        },
    },
  ),
  animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
  useMotionValue: <T,>(val: T) => createMotionValue(val as number),
  useTransform: () => createMotionValue(0),
  useReducedMotion: () => false,
}));

vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);

const mockT = {
  gitVisModuleRoot: '根目录',
  gitVisBreadcrumbNav: '模块路径导航',
  gitVisSunburstHintZoomIn: '点击扇形可下钻',
  gitVisSunburstHintZoomOut: '点击中心可缩放',
} as any;

function renderSunburst() {
  return render(
    <TCopyProvider t={mockT} locale="zh-CN">
      <FileSunburst data={{ tree: fileTreemapData }} />
    </TCopyProvider>,
  );
}

describe('FileSunburst', () => {
  it('renders SVG with arcs', () => {
    const { container } = renderSunburst();
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('shows root-view hint text "点击扇形可下钻" when not drilled', () => {
    const { container } = renderSunburst();
    const hint = container.querySelector('.adl-file-sunburst-hint');
    expect(hint?.textContent).toBe('点击扇形可下钻');
  });

  it('does not render breadcrumb in root view', () => {
    const { container } = renderSunburst();
    expect(container.querySelector('.adl-module-breadcrumb')).toBeNull();
  });

  it('renders breadcrumb and zoom-out hint after drilling into a segment', () => {
    const { container } = renderSunburst();
    // Click the first clickable segment (a directory with children)
    const clickablePaths = Array.from(container.querySelectorAll('path')).filter(
      (p) => p.getAttribute('fill') === 'transparent',
    );
    expect(clickablePaths.length).toBeGreaterThan(0);
    fireEvent.click(clickablePaths[0]);

    const breadcrumb = container.querySelector('.adl-module-breadcrumb');
    expect(breadcrumb).not.toBeNull();
    expect(breadcrumb?.textContent).toContain('根目录');

    const hint = container.querySelector('.adl-file-sunburst-hint');
    expect(hint?.textContent).toBe('点击中心可缩放');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/FileSunburst.test.tsx`
Expected: FAIL — `.adl-file-sunburst-hint` not found, `.adl-module-breadcrumb` not found after click

- [ ] **Step 3: Add CSS styles**

Edit `ai-digital-life/frontend/src/styles/regions/rightpanel/git-visualization.css`. Append at the end of the file:

```css

.adl-file-sunburst-hint {
  text-align: center;
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: var(--space-2);
  line-height: 1.4;
  user-select: none;
}

.adl-file-sunburst-breadcrumb {
  padding: 4px 8px;
}
```

- [ ] **Step 4: Rewrite `FileSunburst.tsx` with breadcrumb + hint**

Edit `ai-digital-life/frontend/src/app/features/git-visualization/charts/FileSunburst.tsx`. Replace the entire file content:

```typescript
import React, { useMemo } from 'react';
import { SunburstChart } from '@/components/charts/sunburst-chart';
import type { SunburstNode, ArcDatum, Focus } from '@/components/charts/sunburst-chart';
import { SunburstSegment } from '@/components/charts/sunburst-segment';
import { SunburstCenter } from '@/components/charts/sunburst-center';
import { SunburstBreadcrumb, useSunburstBreadcrumbItems } from '@/components/charts/sunburst-breadcrumb';
import { SunburstHint } from '@/components/charts/sunburst-hint';
import { ModuleBreadcrumb } from '../ModuleBreadcrumb';
import { adaptSunburstData } from '../adapters/chartDataAdapters';
import { useTCopy } from '@i18n/useTCopy';

function countDescendants(node: SunburstNode): number {
  if (!node.children) {
    return 0;
  }
  let count = node.children.length;
  for (const child of node.children) {
    if (child.children) {
      count += countDescendants(child);
    }
  }
  return count;
}

function FileSunburstBreadcrumbContent() {
  const { items, zoomTo } = useSunburstBreadcrumbItems();
  const { t } = useTCopy();

  if (items.length <= 1) return null;

  const pathSegments = items.slice(1).map((it) => it.label);

  const handleNavigate = (level: number) => {
    const targetIndex = level === -1 ? 0 : level + 1;
    const target = items[targetIndex];
    if (target) zoomTo(target.id);
  };

  return <ModuleBreadcrumb pathSegments={pathSegments} onNavigate={handleNavigate} />;
}

function FileSunburstHintText({
  hoveredArc,
  focus,
}: {
  hoveredArc: ArcDatum | null;
  focus: Focus;
}) {
  const { t } = useTCopy();

  const text = (() => {
    if (hoveredArc) {
      return hoveredArc.trail.join('  ›  ');
    }
    if (focus.depth > 0) {
      return t.gitVisSunburstHintZoomOut;
    }
    return t.gitVisSunburstHintZoomIn;
  })();

  return (
    <div aria-live="polite" className="adl-file-sunburst-hint" style={{ minHeight: 20 }}>
      {text}
    </div>
  );
}

interface FileSunburstProps {
  data?: unknown;
}

export const FileSunburst = React.memo(function FileSunburst({ data }: FileSunburstProps) {
  const treeData = useMemo(
    () => (data ? adaptSunburstData(data) : null),
    [data],
  );
  const segments = useMemo(() => {
    if (!treeData) {
      return [];
    }
    const n = countDescendants(treeData);
    return Array.from({ length: n }, (_, i) => <SunburstSegment key={i} index={i} />);
  }, [treeData]);

  if (!treeData) {
    return (
      <div
        className="adl-git-vis__chart"
        style={{ position: 'relative', display: 'flex', justifyContent: 'center', padding: 16 }}
      />
    );
  }

  return (
    <div
      className="adl-git-vis__chart"
      style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}
    >
      <SunburstChart data={treeData} size={320}>
        <SunburstBreadcrumb className="adl-file-sunburst-breadcrumb">
          <FileSunburstBreadcrumbContent />
        </SunburstBreadcrumb>
        <SunburstCenter />
        {segments}
        <SunburstHint>
          {({ hoveredArc, focus }) => <FileSunburstHintText hoveredArc={hoveredArc} focus={focus} />}
        </SunburstHint>
      </SunburstChart>
    </div>
  );
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --dir frontend exec vitest run src/app/features/git-visualization/charts/FileSunburst.test.tsx`
Expected: PASS — all 4 tests pass (arcs render, root hint text, no breadcrumb in root, breadcrumb + zoom-out hint after drill)

- [ ] **Step 6: Commit**

```bash
cd ai-digital-life
git add frontend/src/app/features/git-visualization/charts/FileSunburst.tsx frontend/src/app/features/git-visualization/charts/FileSunburst.test.tsx frontend/src/styles/regions/rightpanel/git-visualization.css
git commit -m "feat(frontend): add breadcrumb nav and 3-state hint to FileSunburst chart"
```

---

## Task 6: Final verification (acceptance flow)

**Files:** None (verification only)

- [ ] **Step 1: Run ESLint fix + Prettier**

Run: `pnpm --dir frontend run lint:fix ; pnpm --dir frontend run format`
Expected: 0 errors (pre-existing warnings acceptable)

- [ ] **Step 2: Run TypeScript typecheck**

Run: `pnpm --dir frontend run typecheck`
Expected: 0 errors

- [ ] **Step 3: Run full frontend test suite (L3 regression)**

Run: `pnpm --dir frontend run test`
Expected: All tests pass, including:
- `src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts`
- `src/components/charts/__tests__/sunburst-segment.test.tsx`
- `src/components/charts/__tests__/sunburst-labels.test.tsx`
- `src/app/features/git-visualization/charts/FileSunburst.test.tsx`
- `src/app/features/git-visualization/GitVisualizationView.test.tsx` (regression)

- [ ] **Step 4: Verify no regressions in git-visualization feature tests**

If any test in `src/app/features/git-visualization/` fails, investigate:
- If implementation bug → fix implementation
- If test uses old data shape (`value` instead of `size`, or missing `{ tree }` wrapper) → update test

- [ ] **Step 5: Final commit if lint/format produced changes**

```bash
cd ai-digital-life
git add -A
git diff --cached --quiet || git commit -m "chore(frontend): apply lint/format fixes from acceptance flow"
```

---

## Notes for implementer

1. **motion/react mock pattern**: The test files mock `motion/react` to avoid animation timing issues in jsdom. Copy the mock verbatim from the existing `FileSunburst.test.tsx` pattern. The mock must expose `motion` (Proxy that creates DOM elements), `animate`, `useMotionValue`, `useTransform`, `useReducedMotion`.

2. **Canvas measureText mock**: `SunburstLabels` uses `document.createElement('canvas').getContext('2d').measureText()`. jsdom doesn't implement canvas, so tests must `vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(...)` with a mock context whose `measureText` returns `{ width: text.length * 6 }`.

3. **`{ tree }` wrapper**: All test renders of `FileSunburst` must pass `data={{ tree: fileTreemapData }}`, NOT `data={fileTreemapData}`. The `adaptSunburstData` function handles both wrapped and unwrapped input (defensive), but tests should mirror production data shape.

4. **Breadcrumb `onNavigate` index mapping**: `ModuleBreadcrumb` calls `onNavigate(-1)` for root, `onNavigate(i)` for the i-th path segment (0-indexed, excluding root). Since `useSunburstBreadcrumbItems()` returns `items` where `items[0]` is root, the mapping is: `level === -1 → items[0]`, `level === i → items[i+1]`.

5. **`fileTreemapData` is shared**: Other tests may import `fileTreemapData` from `gitVisMockData.ts`. After changing fields from `value` to `size`, search for all usages (`Grep` for `fileTreemapData`) and update any test that reads `.value` directly. The mock bridge (`mock-workspace.ts`) is updated in Task 1 Step 6.
