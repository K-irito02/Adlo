# Contributor Module Heatmap Drill-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tree drill-down to the Contributor Module Heatmap — left-click column headers to drill one level, right-click to open a file tree path picker, breadcrumb navigation to go back.

**Architecture:** Backend returns full file paths (instead of top-level dirs) + a flat `all_paths` list. Frontend parses paths into a tree, filters by drill path, and re-aggregates commit counts at each level. All drill-down computation is client-side after the initial IPC load.

**Tech Stack:** Rust (backend), React + TypeScript + @visx/heatmap (frontend), SQLite cache (unchanged)

## Global Constraints

- Backend Rust structs use serde + ts-rs derives; new fields must be optional or have serde defaults for cache backward compat
- All heatmap sub-components follow existing `@visx/heatmap` + Motion animation patterns
- i18n keys go in both `zh-CN/changes.ts` and `en-US/changes.ts`
- CSS follows existing design tokens (`--bg-hover`, `--border-subtle`, etc.)
- File tree card visual style follows `file-tree-core.css` conventions (28px row height, indent lines, extension badge icons)

---

### Task 1: Backend — Store Full Paths + allPaths

**Files:**
- Modify: `crates/types/src/types/git_visualization.rs`
- Modify: `crates/workspace/src/git/git_vis/contributor.rs`
- Test: `crates/workspace/src/git/git_vis/contributor.rs` (add test module)

**Interfaces:**
- Consumes: existing `GitVisContributorModule`, `GitVisModuleEntry`, `GitVisContributorModules` types
- Produces: `GitVisContributorModules` with `all_paths` field; `GitVisModuleEntry.module` now stores full paths

- [ ] **Step 1: Add `all_paths` to `GitVisContributorModules`**

In `crates/types/src/types/git_visualization.rs`, add the new field with serde default:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisContributorModules {
    pub matrix: Vec<GitVisContributorModule>,
    #[serde(default)]
    pub all_paths: Vec<String>,
}
```

The `#[serde(default)]` on `all_paths` ensures old cached data (without this field) deserializes gracefully.

- [ ] **Step 2: Update `contributor.rs` to store full paths and collect all_paths**

In `crates/workspace/src/git/git_vis/contributor.rs`:

```rust
use std::collections::HashSet;

pub async fn capture_contributor_modules(
    root: &Path,
    since: Option<&str>,
    until: Option<&str>,
) -> Result<GitVisContributorModules, AppError> {
    let t0 = std::time::Instant::now();
    let time_filter = build_time_filter(since, until);
    let mut args: Vec<&str> = vec!["-c", "core.quotepath=false", "log", "--pretty=format:%an|%ae", "--name-only"];
    args.extend(time_filter.iter().map(|s| s.as_str()));

    debug!("[ADL-GIT-VIS] [contributor_modules] running: git {}", args.join(" "));

    let raw = super::super::git_helpers::run_git_with_timeout(root, &args)
        .await
        .ok_or_else(|| AppError::Workspace("git log --name-only failed".into()))?;

    let mut author_modules: HashMap<String, (String, HashMap<String, i32>)> = HashMap::new();
    let mut current_author: Option<String> = None;
    let mut current_email: String = String::new();
    let mut all_paths_set: HashSet<String> = HashSet::new();

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(_pipe_idx) = trimmed.find('|') {
            let parts: Vec<&str> = trimmed.splitn(2, '|').collect();
            current_author = Some(parts[0].to_string());
            current_email = parts.get(1).unwrap_or(&"").to_string();
        } else if let Some(ref author) = current_author {
            // Store full path instead of top-level dir
            let entry = author_modules
                .entry(author.clone())
                .or_insert_with(|| (current_email.clone(), HashMap::new()));
            *entry.1.entry(trimmed.to_string()).or_insert(0) += 1;
            all_paths_set.insert(trimmed.to_string());
        }
    }

    let all_paths: Vec<String> = {
        let mut v: Vec<String> = all_paths_set.into_iter().collect();
        v.sort();
        v
    };

    let matrix: Vec<GitVisContributorModule> = author_modules
        .into_iter()
        .map(|(author, (author_email, modules))| GitVisContributorModule {
            author,
            author_email,
            modules: modules
                .into_iter()
                .map(|(module, count)| GitVisModuleEntry { module, count })
                .collect(),
        })
        .collect();

    debug!(
        "[ADL-GIT-VIS] [contributor_modules] [{}] done in {:?} — {} contributors, {} unique paths",
        root.display(),
        t0.elapsed(),
        matrix.len(),
        all_paths.len()
    );

    Ok(GitVisContributorModules { matrix, all_paths })
}
```

Key changes:
- `let top_dir = trimmed.split('/').next().unwrap_or(trimmed)` → use `trimmed` directly
- Added `all_paths_set: HashSet<String>` to collect unique paths
- Return `GitVisContributorModules { matrix, all_paths }`

- [ ] **Step 3: Run tests to verify compilation**

```bash
cd ai-digital-life && cargo test --package adl-types && cargo test --package adl-workspace -- git_vis
```

Expected: compilation passes, existing tests pass.

- [ ] **Step 4: Commit**

```bash
cd ai-digital-life && git add -A && git commit -m "feat(backend): store full paths and all_paths for contributor modules drill-down"
```

---

### Task 2: Frontend — Tree Parsing Utilities (`moduleTreeUtils.ts`)

**Files:**
- Create: `frontend/src/app/features/git-visualization/moduleTreeUtils.ts`
- Test: `frontend/src/app/features/git-visualization/moduleTreeUtils.test.ts`

**Interfaces:**
- Consumes: `RawContributorModules['matrix']` (from `chartDataAdapters.ts`)
- Produces: `ModuleTreeNode`, `buildModuleTree()`, `getChildrenAtPath()`, `childrenToHeatmapColumns()`

- [ ] **Step 1: Create `moduleTreeUtils.ts`**

Write the complete file:

```typescript
import type { HeatmapColumn } from '@/components/charts/heatmap/heatmap-context';
import type { RawContributorModules } from './adapters/chartDataAdapters';

export interface ModuleTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: ModuleTreeNode[];
}

export function buildModuleTree(allPaths: string[]): ModuleTreeNode {
  const root: ModuleTreeNode = { name: '', path: '', isDir: true, children: [] };

  for (const fullPath of allPaths) {
    const segments = fullPath.replace(/\\/g, '/').split('/');
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      const segPath = current.path ? `${current.path}/${seg}` : seg;

      let child = current.children.find((c) => c.name === seg);
      if (!child) {
        child = {
          name: seg,
          path: segPath,
          isDir: !isLast,
          children: [],
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  sortTreeChildren(root);
  return root;
}

function sortTreeChildren(node: ModuleTreeNode): void {
  // Directories first, then files; alphabetically within each group
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    sortTreeChildren(child);
  }
}

export function getChildrenAtPath(
  tree: ModuleTreeNode,
  pathSegments: string[],
): ModuleTreeNode[] {
  let current = tree;
  for (const seg of pathSegments) {
    const found = current.children.find((c) => c.name === seg);
    if (!found) {
      return [];
    }
    current = found;
  }
  return current.children;
}

export function childrenToHeatmapColumns(
  children: ModuleTreeNode[],
  matrix: RawContributorModules['matrix'],
): { columns: HeatmapColumn[]; rowLabels: string[] } {
  const sorted = [...matrix].sort((a, b) => a.author.localeCompare(b.author));
  const rowLabels = sorted.map((m) => m.author);

  const columns: HeatmapColumn[] = children.map((child, colIdx) => ({
    bin: colIdx,
    columnLabel: child.name,
    bins: sorted.map((contributor, rowIdx) => {
      // Sum commit counts for all paths under this child subtree
      const prefix = child.path + (child.isDir ? '/' : '');
      let total = 0;
      for (const mod of contributor.modules) {
        if (mod.module === child.path || mod.module.startsWith(prefix)) {
          total += mod.count;
        }
      }
      return {
        count: total,
        bin: rowIdx,
        tooltipTitle: child.path,
        tooltipSubtitle: contributor.author,
      };
    }),
  }));

  return { columns, rowLabels };
}
```

- [ ] **Step 2: Write unit tests**

Create `frontend/src/app/features/git-visualization/moduleTreeUtils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildModuleTree, getChildrenAtPath, childrenToHeatmapColumns } from './moduleTreeUtils';

describe('buildModuleTree', () => {
  it('should build tree from flat paths', () => {
    const paths = [
      'src/components/bar.tsx',
      'src/components/foo.tsx',
      'src/utils/helpers.ts',
      'docs/README.md',
      'package.json',
    ];
    const tree = buildModuleTree(paths);

    expect(tree.isDir).toBe(true);
    expect(tree.children.length).toBe(3); // src, docs, package.json

    const src = tree.children[0];
    expect(src.name).toBe('src');
    expect(src.isDir).toBe(true);

    const docs = tree.children[1];
    expect(docs.name).toBe('docs');
    expect(docs.isDir).toBe(true);

    const pkg = tree.children[2];
    expect(pkg.name).toBe('package.json');
    expect(pkg.isDir).toBe(false);
  });

  it('should handle empty paths', () => {
    const tree = buildModuleTree([]);
    expect(tree.children.length).toBe(0);
  });

  it('should handle single file at root', () => {
    const tree = buildModuleTree(['readme.md']);
    expect(tree.children.length).toBe(1);
    expect(tree.children[0].name).toBe('readme.md');
    expect(tree.children[0].isDir).toBe(false);
  });

  it('should sort directories before files', () => {
    const paths = ['a-file.ts', 'z-dir/something.ts', 'm-dir/other.ts'];
    const tree = buildModuleTree(paths);
    expect(tree.children[0].isDir).toBe(true);  // m-dir or z-dir
    expect(tree.children[1].isDir).toBe(true);  // whichever is second
    expect(tree.children[2].isDir).toBe(false); // a-file.ts
  });
});

describe('getChildrenAtPath', () => {
  const paths = ['src/components/bar.tsx', 'src/components/foo.tsx', 'src/utils/helpers.ts', 'docs/readme.md'];
  const tree = buildModuleTree(paths);

  it('should return root children for empty path', () => {
    const children = getChildrenAtPath(tree, []);
    expect(children.length).toBe(2); // src, docs
  });

  it('should drill into src', () => {
    const children = getChildrenAtPath(tree, ['src']);
    expect(children.length).toBe(2); // components, utils
  });

  it('should drill into src/components', () => {
    const children = getChildrenAtPath(tree, ['src', 'components']);
    expect(children.length).toBe(2); // bar.tsx, foo.tsx
    expect(children[0].isDir).toBe(false);
  });

  it('should return empty for non-existent path', () => {
    const children = getChildrenAtPath(tree, ['nonexistent']);
    expect(children.length).toBe(0);
  });
});

describe('childrenToHeatmapColumns', () => {
  const matrix = [
    {
      author: 'Alice',
      authorEmail: 'alice@test.com',
      modules: [
        { module: 'src/components/bar.tsx', count: 3 },
        { module: 'src/components/foo.tsx', count: 2 },
        { module: 'src/utils/helpers.ts', count: 1 },
      ],
    },
    {
      author: 'Bob',
      authorEmail: 'bob@test.com',
      modules: [
        { module: 'src/components/bar.tsx', count: 1 },
        { module: 'docs/readme.md', count: 4 },
      ],
    },
  ];

  const tree = buildModuleTree([
    'src/components/bar.tsx',
    'src/components/foo.tsx',
    'src/utils/helpers.ts',
    'docs/readme.md',
  ]);

  it('should aggregate counts at root level', () => {
    const children = getChildrenAtPath(tree, []);
    const { columns, rowLabels } = childrenToHeatmapColumns(children, matrix);

    expect(rowLabels).toEqual(['Alice', 'Bob']);
    expect(columns.length).toBe(2); // src, docs

    const srcCol = columns.find(c => c.columnLabel === 'src')!;
    expect(srcCol.bins[0].count).toBe(6); // Alice: 3+2+1
    expect(srcCol.bins[1].count).toBe(1); // Bob: 1
  });

  it('should aggregate at deeper level', () => {
    const children = getChildrenAtPath(tree, ['src', 'components']);
    const { columns } = childrenToHeatmapColumns(children, matrix);

    expect(columns.length).toBe(2); // bar.tsx, foo.tsx
    const barCol = columns.find(c => c.columnLabel === 'bar.tsx')!;
    expect(barCol.bins[0].count).toBe(3); // Alice
    expect(barCol.bins[1].count).toBe(1); // Bob
  });
});
```

- [ ] **Step 3: Run tests to verify**

```bash
cd ai-digital-life/frontend && npx vitest run --reporter=verbose src/app/features/git-visualization/moduleTreeUtils.test.ts
```

Expected: all 10+ tests PASS.

- [ ] **Step 4: Commit**

```bash
cd ai-digital-life && git add -A && git commit -m "feat(frontend): add moduleTreeUtils for tree parsing and drill-down aggregation"
```

---

### Task 3: Frontend — Interactive X-Axis Labels

**Files:**
- Modify: `frontend/src/components/charts/heatmap/heatmap-x-axis.tsx`
- Modify: `frontend/src/components/charts/heatmap/heatmap-context.tsx` (no changes needed — existing types suffice)

**Interfaces:**
- Consumes: existing `HeatmapXAxisProps`
- Produces: `HeatmapXAxisProps` with new `onColumnClick`, `onColumnContextMenu` props

- [ ] **Step 1: Add interactive props to `HeatmapXAxis`**

In `frontend/src/components/charts/heatmap/heatmap-x-axis.tsx`, add props and wrap labels in clickable buttons:

```typescript
export interface HeatmapXAxisProps {
  className?: string;
  tickEvery?: number;
  labelFormat?: 'short' | 'numeric';
  top?: number;
  rotateAngle?: number;
  /** Called when a column label is left-clicked */
  onColumnClick?: (label: string) => void;
  /** Called when a column label is right-clicked */
  onColumnContextMenu?: (label: string, x: number, y: number) => void;
}
```

Update the label rendering in the portal. Change the `pointer-events-none` wrapper to conditional:

```typescript
export const HeatmapXAxis = memo(function HeatmapXAxis({
  className,
  tickEvery = 1,
  labelFormat = 'short',
  top = 0,
  rotateAngle,
  onColumnClick,
  onColumnContextMenu,
}: HeatmapXAxisProps) {
  // ... existing setup ...

  return createPortal(
    labels.map((tick) => {
      const isRotated = rotateAngle !== undefined && rotateAngle !== 0;
      const hasInteraction = Boolean(onColumnClick || onColumnContextMenu);

      const labelStyle: React.CSSProperties = {
        top,
        left: tick.x + (isRotated ? 6 : 0),
        width: 'max-content',
        display: 'flex',
        justifyContent: 'flex-start',
        overflow: 'visible',
      };

      const handleContextMenu = onColumnContextMenu
        ? (e: React.MouseEvent) => {
            e.preventDefault();
            onColumnContextMenu(tick.label, e.clientX, e.clientY);
          }
        : undefined;

      return (
        <div
          className={cn(
            'absolute',
            hasInteraction ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none',
          )}
          key={tick.key}
          style={labelStyle}
          onClick={hasInteraction ? () => onColumnClick?.(tick.label) : undefined}
          onContextMenu={handleContextMenu}
          title={hasInteraction ? tick.label : undefined}
        >
          <span
            className={cn(
              'text-chart-label text-xs whitespace-nowrap',
              className,
              hasInteraction && 'hover:text-chart-label-hover',
            )}
            style={{
              ...(isRotated
                ? {
                    transform: `rotate(-${rotateAngle}deg)`,
                    transformOrigin: 'left center',
                  }
                : {}),
            }}
          >
            {tick.label}
          </span>
        </div>
      );
    }),
    container,
  );
});
```

- [ ] **Step 2: Run lint + existing tests**

```bash
cd ai-digital-life/frontend && npx eslint src/components/charts/heatmap/heatmap-x-axis.tsx --fix && npx vitest run --reporter=verbose src/components/charts/heatmap/
```

Expected: no lint errors, all existing heatmap tests pass.

- [ ] **Step 3: Commit**

```bash
cd ai-digital-life && git add -A && git commit -m "feat(frontend): add onColumnClick and onColumnContextMenu to HeatmapXAxis"
```

---

### Task 4: Frontend — Breadcrumb Component

**Files:**
- Create: `frontend/src/app/features/git-visualization/ModuleBreadcrumb.tsx`
- Create: `frontend/src/styles/components/module-breadcrumb.css`
- Test: `frontend/src/app/features/git-visualization/ModuleBreadcrumb.test.tsx`

**Interfaces:**
- Consumes: `pathSegments: string[]`, `onNavigate: (index: number) => void`
- Produces: rendered breadcrumb UI

- [ ] **Step 1: Create `ModuleBreadcrumb.tsx`**

```typescript
import React from 'react';
import { useTCopy } from '@i18n/useTCopy';
import '@/styles/components/module-breadcrumb.css';

interface ModuleBreadcrumbProps {
  pathSegments: string[];
  onNavigate: (level: number) => void;
}

export const ModuleBreadcrumb = React.memo(function ModuleBreadcrumb({
  pathSegments,
  onNavigate,
}: ModuleBreadcrumbProps) {
  const { t } = useTCopy();

  return (
    <nav className="adl-module-breadcrumb" aria-label={t.gitVisBreadcrumbNav}>
      <button
        className={cn(
          'adl-module-breadcrumb__item',
          pathSegments.length === 0 && 'adl-module-breadcrumb__item--active',
        )}
        onClick={() => onNavigate(-1)}
        disabled={pathSegments.length === 0}
      >
        {t.gitVisModuleRoot}
      </button>
      {pathSegments.map((seg, i) => (
        <React.Fragment key={i}>
          <span className="adl-module-breadcrumb__sep" aria-hidden="true">&gt;</span>
          <button
            className={cn(
              'adl-module-breadcrumb__item',
              i === pathSegments.length - 1 && 'adl-module-breadcrumb__item--active',
            )}
            onClick={() => onNavigate(i)}
            disabled={i === pathSegments.length - 1}
          >
            {seg}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
});
```

Note: `cn` is already imported from `@/lib/utils` in the codebase. Import it.

- [ ] **Step 2: Create `module-breadcrumb.css`**

```css
.adl-module-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  flex-wrap: wrap;
  font-size: var(--text-xs);
  line-height: 1.4;
}

.adl-module-breadcrumb__item {
  background: none;
  border: none;
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: inherit;
  line-height: inherit;
  white-space: nowrap;
  transition: background-color 0.15s, color 0.15s;
}

.adl-module-breadcrumb__item:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.adl-module-breadcrumb__item--active {
  color: var(--text-primary);
  font-weight: 500;
  cursor: default;
}

.adl-module-breadcrumb__item:disabled {
  cursor: default;
  opacity: 0.7;
}

.adl-module-breadcrumb__sep {
  color: var(--text-muted);
  opacity: 0.5;
  user-select: none;
}
```

- [ ] **Step 3: Write unit tests in `ModuleBreadcrumb.test.tsx`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModuleBreadcrumb } from './ModuleBreadcrumb';

// Mock i18n
vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({ t: { gitVisBreadcrumbNav: 'breadcrumb', gitVisModuleRoot: 'Root' }, locale: 'en' }),
}));

describe('ModuleBreadcrumb', () => {
  it('should show Root at top level', () => {
    const onNav = vi.fn();
    render(<ModuleBreadcrumb pathSegments={[]} onNavigate={onNav} />);
    expect(screen.getByText('Root')).toBeInTheDocument();
  });

  it('should show path segments', () => {
    render(<ModuleBreadcrumb pathSegments={['src', 'components']} onNavigate={vi.fn()} />);
    expect(screen.getByText('Root')).toBeInTheDocument();
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('components')).toBeInTheDocument();
  });

  it('should call onNavigate with -1 for Root click', () => {
    const onNav = vi.fn();
    render(<ModuleBreadcrumb pathSegments={['src']} onNavigate={onNav} />);
    fireEvent.click(screen.getByText('Root'));
    expect(onNav).toHaveBeenCalledWith(-1);
  });

  it('should call onNavigate with index for segment click', () => {
    const onNav = vi.fn();
    render(<ModuleBreadcrumb pathSegments={['src', 'components']} onNavigate={onNav} />);
    fireEvent.click(screen.getByText('src'));
    expect(onNav).toHaveBeenCalledWith(0);
  });

  it('should disable the last segment', () => {
    render(<ModuleBreadcrumb pathSegments={['src']} onNavigate={vi.fn()} />);
    expect(screen.getByText('src')).toBeDisabled();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd ai-digital-life/frontend && npx vitest run --reporter=verbose src/app/features/git-visualization/ModuleBreadcrumb.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd ai-digital-life && git add -A && git commit -m "feat(frontend): add ModuleBreadcrumb component for drill-down navigation"
```

---

### Task 5: Frontend — Right-Click File Tree Card (ModuleTreeCard)

**Files:**
- Create: `frontend/src/app/features/git-visualization/ModuleTreeCard.tsx`
- Create: `frontend/src/styles/components/module-tree-card.css`
- Test: `frontend/src/app/features/git-visualization/ModuleTreeCard.test.tsx`

**Interfaces:**
- Consumes: `subtree: ModuleTreeNode[]`, `position: { x: number; y: number }`, `onSelect: (path: string) => void`, `onClose: () => void`
- Produces: portal-based file tree card UI

- [ ] **Step 1: Create `ModuleTreeCard.tsx`**

```typescript
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import type { ModuleTreeNode } from './moduleTreeUtils';
import '@/styles/components/module-tree-card.css';

interface ModuleTreeCardProps {
  subtree: ModuleTreeNode[];
  position: { x: number; y: number };
  onSelect: (path: string) => void;
  onClose: () => void;
}

interface FlatNode {
  node: ModuleTreeNode;
  depth: number;
}

function flattenVisible(root: ModuleTreeNode[], expanded: Set<string>, depth = 0): FlatNode[] {
  const result: FlatNode[] = [];
  for (const child of root) {
    result.push({ node: child, depth });
    if (child.isDir && expanded.has(child.path)) {
      result.push(...flattenVisible(child.children, expanded, depth + 1));
    }
  }
  return result;
}

export const ModuleTreeCard = React.memo(function ModuleTreeCard({
  subtree,
  position,
  onSelect,
  onClose,
}: ModuleTreeCardProps) {
  const { t } = useTCopy();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const flatNodes = flattenVisible(subtree, expanded);

  // Adjust position so card doesn't overflow viewport
  const cardStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 360),
    top: Math.min(position.y, window.innerHeight - 400),
  };

  return createPortal(
    <div className="adl-module-tree-card" ref={cardRef} style={cardStyle}>
      <div className="adl-module-tree-card__tree">
        {flatNodes.map(({ node, depth }) => (
          <div
            key={node.path}
            className={cn(
              'adl-module-tree-card__row',
              selectedPath === node.path && 'adl-module-tree-card__row--selected',
            )}
            style={{ paddingLeft: 12 + depth * 16 }}
            onClick={() => setSelectedPath(node.path)}
          >
            {node.isDir ? (
              <button
                className="adl-module-tree-card__toggle"
                onClick={(e) => { e.stopPropagation(); toggleExpand(node.path); }}
              >
                <span className={cn('adl-module-tree-card__chevron', expanded.has(node.path) && 'adl-module-tree-card__chevron--open')}>
                  ▶
                </span>
              </button>
            ) : (
              <span className="adl-module-tree-card__spacer" />
            )}
            <span className="adl-module-tree-card__icon">
              {node.isDir ? '📁' : '📄'}
            </span>
            <span className="adl-module-tree-card__name">{node.name}</span>
            {selectedPath === node.path && (
              <span className="adl-module-tree-card__check">✓</span>
            )}
          </div>
        ))}
      </div>
      <div className="adl-module-tree-card__actions">
        <button className="adl-module-tree-card__btn adl-module-tree-card__btn--cancel" onClick={onClose}>
          {t.gitVisModuleCancel}
        </button>
        <button
          className="adl-module-tree-card__btn adl-module-tree-card__btn--confirm"
          disabled={selectedPath === null}
          onClick={() => { if (selectedPath) onSelect(selectedPath); }}
        >
          {t.gitVisModuleConfirm}
        </button>
      </div>
    </div>,
    document.body,
  );
});
```

- [ ] **Step 2: Create `module-tree-card.css`**

```css
.adl-module-tree-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  z-index: calc(var(--z-popover) + 10);
  min-width: 280px;
  max-width: 360px;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.adl-module-tree-card__tree {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  padding: 4px 0;
}

.adl-module-tree-card__row {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  cursor: pointer;
  white-space: nowrap;
  gap: 4px;
  transition: background-color 0.1s;
}

.adl-module-tree-card__row:hover {
  background: var(--bg-hover);
}

.adl-module-tree-card__row--selected {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}

.adl-module-tree-card__toggle {
  background: none;
  border: none;
  padding: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.adl-module-tree-card__chevron {
  font-size: 8px;
  color: var(--text-muted);
  transition: transform 0.15s;
  display: inline-block;
}

.adl-module-tree-card__chevron--open {
  transform: rotate(90deg);
}

.adl-module-tree-card__spacer {
  width: 16px;
  flex-shrink: 0;
}

.adl-module-tree-card__icon {
  font-size: 12px;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}

.adl-module-tree-card__name {
  font-size: var(--text-xs);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
}

.adl-module-tree-card__check {
  margin-left: auto;
  color: var(--accent);
  font-size: 12px;
  flex-shrink: 0;
}

.adl-module-tree-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-subtle);
}

.adl-module-tree-card__btn {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: var(--text-xs);
  cursor: pointer;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
  color: var(--text-primary);
  transition: background-color 0.15s;
}

.adl-module-tree-card__btn:hover {
  background: var(--bg-hover);
}

.adl-module-tree-card__btn--confirm {
  background: var(--accent);
  color: var(--accent-foreground);
  border-color: var(--accent);
}

.adl-module-tree-card__btn--confirm:hover {
  filter: brightness(1.1);
}

.adl-module-tree-card__btn--confirm:disabled {
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 3: Write unit tests**

Create `ModuleTreeCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModuleTreeCard } from './ModuleTreeCard';
import type { ModuleTreeNode } from './moduleTreeUtils';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: { gitVisModuleCancel: 'Cancel', gitVisModuleConfirm: 'Confirm' },
    locale: 'en',
  }),
}));

const mockSubtree: ModuleTreeNode[] = [
  {
    name: 'src',
    path: 'src',
    isDir: true,
    children: [
      { name: 'components', path: 'src/components', isDir: true, children: [
        { name: 'bar.tsx', path: 'src/components/bar.tsx', isDir: false, children: [] },
      ]},
      { name: 'utils', path: 'src/utils', isDir: true, children: [] },
    ],
  },
  {
    name: 'docs',
    path: 'docs',
    isDir: true,
    children: [
      { name: 'readme.md', path: 'docs/readme.md', isDir: false, children: [] },
    ],
  },
];

describe('ModuleTreeCard', () => {
  it('should render tree nodes', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('docs')).toBeInTheDocument();
  });

  it('should expand directory on chevron click', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const toggles = screen.getAllByRole('button');
    const chevron = toggles[0]; // first toggle (src ▶)
    fireEvent.click(chevron);
    expect(screen.getByText('components')).toBeInTheDocument();
    expect(screen.getByText('utils')).toBeInTheDocument();
  });

  it('should select a row on click', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('src'));
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('should call onSelect with selected path on confirm', () => {
    const onSelect = vi.fn();
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('src'));
    fireEvent.click(screen.getByText('Confirm'));
    expect(onSelect).toHaveBeenCalledWith('src');
  });

  it('should call onClose on Cancel', () => {
    const onClose = vi.fn();
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd ai-digital-life/frontend && npx vitest run --reporter=verbose src/app/features/git-visualization/ModuleTreeCard.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd ai-digital-life && git add -A && git commit -m "feat(frontend): add ModuleTreeCard for right-click path picker"
```

---

### Task 6: Frontend — ContributorModuleHeatmap Refactor

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/ContributorModuleHeatmap.tsx`
- Modify: `frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts`
- Test: `frontend/src/app/features/git-visualization/charts/ContributorModuleHeatmap.test.tsx`

**Interfaces:**
- Consumes: `ModuleTreeCard`, `ModuleBreadcrumb`, `moduleTreeUtils`, HeatmapChart with new XAxis props
- Produces: fully integrated drill-down heatmap

- [ ] **Step 1: Rewrite `ContributorModuleHeatmap.tsx`**

```typescript
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
  buildHeatmapFillScale,
  HEATMAP_DEFAULT_LEVEL_STYLES,
} from '@/components/charts/heatmap';
import type { ChartStatus } from '@/components/charts/chart-phase';
import { ModuleBreadcrumb } from '../ModuleBreadcrumb';
import { ModuleTreeCard } from '../ModuleTreeCard';
import { buildModuleTree, getChildrenAtPath, childrenToHeatmapColumns } from '../moduleTreeUtils';
import type { ModuleTreeNode } from '../moduleTreeUtils';
import { contributorModulesToHeatmapColumns } from '../adapters/chartDataAdapters';

interface ContributorModuleHeatmapProps {
  data?: {
    author: string;
    authorEmail: string;
    modules: { module: string; count: number }[];
  }[];
  allPaths?: string[];
  status?: ChartStatus;
  loadingLabel?: string;
}

export const ContributorModuleHeatmap = React.memo(function ContributorModuleHeatmap({
  data,
  allPaths,
  status = 'ready',
  loadingLabel,
}: ContributorModuleHeatmapProps) {
  const { t, locale } = useTCopy();
  const [drillPath, setDrillPath] = useState<string[]>([]);
  const [treeCard, setTreeCard] = useState<{
    subtree: ModuleTreeNode[];
    position: { x: number; y: number };
  } | null>(null);

  const treeRef = useRef<ModuleTreeNode | null>(null);
  const drillCacheRef = useRef<Map<string, { columns: HeatmapColumn[]; rowLabels: string[] }>>(new Map());

  const customFillScale = useMemo(() => buildHeatmapFillScale(HEATMAP_DEFAULT_LEVEL_STYLES), []);

  const { columns, rowLabels } = useMemo(() => {
    if (!data || !allPaths) {
      return { columns: [], rowLabels: [] };
    }

    // Build tree once
    if (!treeRef.current) {
      treeRef.current = buildModuleTree(allPaths);
    }

    const cacheKey = drillPath.join('/');
    const cached = drillCacheRef.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    const children = getChildrenAtPath(treeRef.current, drillPath);
    if (children.length === 0) {
      return { columns: [], rowLabels: [] };
    }
    const result = childrenToHeatmapColumns(children, data);
    drillCacheRef.current.set(cacheKey, result);
    return result;
  }, [data, allPaths, drillPath]);

  const handleColumnClick = useCallback((label: string) => {
    setDrillPath((prev) => [...prev, label]);
  }, []);

  const handleColumnContextMenu = useCallback((label: string, x: number, y: number) => {
    if (!treeRef.current) return;
    // Find the subtree for the clicked column
    const children = getChildrenAtPath(treeRef.current, drillPath);
    const node = children.find((c) => c.name === label);
    if (node && node.children.length > 0) {
      setTreeCard({ subtree: node.children, position: { x, y } });
    }
  }, [drillPath]);

  const handleBreadcrumbNavigate = useCallback((level: number) => {
    if (level === -1) {
      setDrillPath([]);
    } else {
      setDrillPath((prev) => prev.slice(0, level + 1));
    }
  }, []);

  const handleTreeSelect = useCallback((path: string) => {
    const segments = path.split('/');
    setDrillPath(segments);
    setTreeCard(null);
  }, []);

  // Collect all unique module names for x-axis label rotation calculation
  const colCount = columns.length;
  const rotateAngle = colCount > 8 ? 45 : 0;

  const { labelTop, marginTop } = useMemo(() => {
    if (colCount <= 8) {
      return { labelTop: 0, marginTop: 28 };
    }
    const maxLabelLen = columns.reduce((max, col) => {
      const len = (col.columnLabel ?? '').length;
      return len > max ? len : max;
    }, 0);
    if (maxLabelLen === 0) return { labelTop: 0, marginTop: 28 };
    const maxTextWidth = maxLabelLen * 7.5;
    const upwardExtent = Math.ceil(
      maxTextWidth * Math.abs(Math.sin((rotateAngle * Math.PI) / 180)),
    );
    const top = upwardExtent + 4;
    const margin = top + 20;
    return { labelTop: top, marginTop: margin };
  }, [columns, colCount, rotateAngle]);

  return (
    <div className="adl-contributor-module-heatmap">
      {allPaths && allPaths.length > 0 && (
        <ModuleBreadcrumb pathSegments={drillPath} onNavigate={handleBreadcrumbNavigate} />
      )}
      <HeatmapChart
        data={columns}
        locale={locale}
        rowLabels={rowLabels}
        margin={{ top: marginTop, right: 16, bottom: 0, left: 80 }}
        gap={2}
        binSize={36}
        layout="fluid"
        animate={true}
        fillScale={customFillScale}
        status={status}
        loadingLabel={loadingLabel}
      >
        <HeatmapCells cornerRadius={2} />
        <HeatmapXAxis
          rotateAngle={rotateAngle}
          top={labelTop}
          onColumnClick={handleColumnClick}
          onColumnContextMenu={handleColumnContextMenu}
        />
        <HeatmapYAxis tickFilter="all" />
        <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
      </HeatmapChart>
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

Add the `formatLabel` callback inside the component (before the return):

```typescript
const formatLabel = useCallback(
  (count: number) => {
    const word = count === 1 ? t.gitVisContribution : t.gitVisContributions;
    return `${count} ${word}`;
  },
  [t],
);
```

- [ ] **Step 2: Update `chartDataAdapters.ts`**

Add the `RawContributorModules` type update to include `allPaths`:

In the `RawContributorModules` interface in `chartDataAdapters.ts`, add:

```typescript
export interface RawContributorModules {
  matrix: {
    author: string;
    authorEmail: string;
    modules: { module: string; count: number }[];
  }[];
  allPaths?: string[];
}
```

Keep `contributorModulesToHeatmapColumns` unchanged for backward compat (used if `allPaths` is not available).

- [ ] **Step 3: Update `GitVisualizationView.tsx`**

Pass `allPaths` and `status`/`loadingLabel` to `ContributorModuleHeatmap`:

In `GitVisualizationView.tsx`, update the contributorModules data extraction:

```typescript
const contributorModules = useChartData(CHART_IDS.CONTRIBUTOR_MODULES);

// In the HeatmapCardGroup props:
<HeatmapCardGroup
  onRefresh={handleRefreshHeatmap}
  commitStats={...}
  contributorModules={
    (contributorModulesData.data as RawContributorModules | undefined)?.matrix
  }
  contributorModuleAllPaths={
    (contributorModulesData.data as RawContributorModules | undefined)?.allPaths
  }
  contributorModuleStatus={contributorModulesData.loading ? 'loading' : 'ready'}
  yearBounds={yearBounds}
/>
```

Also update `HeatmapCardGroup` props and pass-through to `ContributorModuleHeatmap`.

- [ ] **Step 4: Update `HeatmapCardGroup.tsx`**

Add new props:

```typescript
interface HeatmapCardGroupProps {
  onRefresh?: () => Promise<void>;
  commitStats?: RawCommitStats;
  contributorModules?: {
    author: string;
    authorEmail: string;
    modules: { module: string; count: number }[];
  }[];
  contributorModuleAllPaths?: string[];
  contributorModuleStatus?: ChartStatus;
  yearBounds?: { min: number; max: number } | null;
}
```

Pass through to `ContributorModuleHeatmap`:

```typescript
{activeHeatmapTab === 'module' && (
  <ContributorModuleHeatmap
    data={contributorModules}
    allPaths={contributorModuleAllPaths}
    status={contributorModuleStatus}
    loadingLabel={t.gitVisLoadingModules}
  />
)}
```

- [ ] **Step 5: Write/update tests for `ContributorModuleHeatmap`**

Update `ContributorModuleHeatmap.test.tsx` to test drill-down behavior:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContributorModuleHeatmap } from './ContributorModuleHeatmap';
import { TCProvider } from '@i18n/TCopyContext';

// Wrapper with i18n context
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <TCProvider value={{ locale: 'en', t: {} as any, formatT: (s: string) => s } as any}>
      {children}
    </TCProvider>
  );
}

const mockData = [
  {
    author: 'Alice',
    authorEmail: 'alice@test.com',
    modules: [
      { module: 'src/components/bar.tsx', count: 3 },
      { module: 'src/components/foo.tsx', count: 2 },
      { module: 'src/utils/helpers.ts', count: 1 },
    ],
  },
  {
    author: 'Bob',
    authorEmail: 'bob@test.com',
    modules: [
      { module: 'src/components/bar.tsx', count: 1 },
      { module: 'docs/readme.md', count: 4 },
    ],
  },
];

const mockAllPaths = [
  'src/components/bar.tsx',
  'src/components/foo.tsx',
  'src/utils/helpers.ts',
  'docs/readme.md',
];

describe('ContributorModuleHeatmap', () => {
  it('should render breadcrumb at root', () => {
    render(<Wrapper><ContributorModuleHeatmap data={mockData} allPaths={mockAllPaths} /></Wrapper>);
    expect(screen.getByText('Root')).toBeInTheDocument();
  });

  it('should render heatmap columns at root level', () => {
    const { container } = render(
      <Wrapper><ContributorModuleHeatmap data={mockData} allPaths={mockAllPaths} /></Wrapper>
    );
    // svg should be present (heatmap rendered)
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should show loading label when status is loading', () => {
    render(
      <Wrapper>
        <ContributorModuleHeatmap data={mockData} allPaths={mockAllPaths} status="loading" loadingLabel="Loading..." />
      </Wrapper>
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run lint + tests**

```bash
cd ai-digital-life/frontend && npx eslint src/app/features/git-visualization/ --fix && npx vitest run --reporter=verbose src/app/features/git-visualization/charts/ContributorModuleHeatmap.test.tsx
```

Expected: no lint errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
cd ai-digital-life && git add -A && git commit -m "feat(frontend): integrate drill-down into ContributorModuleHeatmap"
```

---

### Task 7: Frontend — i18n + CSS + Final Integration

**Files:**
- Modify: `frontend/src/app/i18n/zh-CN/changes.ts`
- Modify: `frontend/src/app/i18n/en-US/changes.ts`
- Modify: `frontend/src/styles/regions/rightpanel/git-visualization.css`
- Check: `frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx` (already updated in Task 6)
- Check: `frontend/src/app/features/git-visualization/GitVisualizationView.tsx` (already updated in Task 6)

- [ ] **Step 1: Add i18n keys**

In `frontend/src/app/i18n/en-US/changes.ts`:

```typescript
gitVisLoadingModules: 'Loading modules...',
gitVisModuleRoot: 'Root',
gitVisModuleConfirm: 'Confirm',
gitVisModuleCancel: 'Cancel',
gitVisBreadcrumbNav: 'Module breadcrumb',
```

In `frontend/src/app/i18n/zh-CN/changes.ts`:

```typescript
gitVisLoadingModules: '正在加载模块...',
gitVisModuleRoot: '根目录',
gitVisModuleConfirm: '确认跳转',
gitVisModuleCancel: '取消',
gitVisBreadcrumbNav: '模块路径导航',
```

- [ ] **Step 2: Add CSS for the container**

In `frontend/src/styles/regions/rightpanel/git-visualization.css`, add:

```css
.adl-contributor-module-heatmap {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
```

- [ ] **Step 3: Remove unused import**

In `ContributorModuleHeatmap.tsx`, the old import of `contributorModulesToHeatmapColumns` may no longer be needed if `childrenToHeatmapColumns` fully replaces it. Remove unused imports.

- [ ] **Step 4: Run the full frontend lint + test suite**

```bash
cd ai-digital-life/frontend && npx eslint . && npx tsc --noEmit
```

```bash
cd ai-digital-life/frontend && npx vitest run --reporter=verbose
```

Expected: no errors, all existing tests pass.

- [ ] **Step 5: Commit**

```bash
cd ai-digital-life && git add -A && git commit -m "feat(frontend): add i18n keys and CSS for module drill-down"
```

---

### Task 8: Backend Tests for Full Path Storage

**Files:**
- Modify: `crates/workspace/src/git/git_vis/contributor.rs` (add test module)

- [ ] **Step 1: Add test module to `contributor.rs`**

Add at the bottom:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_path_parsing_full_paths() {
        let mut author_modules: HashMap<String, (String, HashMap<String, i32>)> = HashMap::new();
        let files = vec![
            "alice|alice@test.com",
            "src/components/bar.tsx",
            "src/components/foo.tsx",
            "src/utils/helpers.ts",
        ];

        let mut current_author: Option<String> = None;
        let mut current_email = String::new();

        for line in &files {
            let trimmed = line.trim();
            if let Some(_pipe_idx) = trimmed.find('|') {
                let parts: Vec<&str> = trimmed.splitn(2, '|').collect();
                current_author = Some(parts[0].to_string());
                current_email = parts.get(1).unwrap_or(&"").to_string();
            } else if let Some(ref author) = current_author {
                let entry = author_modules
                    .entry(author.clone())
                    .or_insert_with(|| (current_email.clone(), HashMap::new()));
                // Store full path
                *entry.1.entry(trimmed.to_string()).or_insert(0) += 1;
            }
        }

        let alice = author_modules.get("alice").unwrap();
        assert_eq!(alice.1.len(), 3);
        assert!(alice.1.contains_key("src/components/bar.tsx"));
        assert!(alice.1.contains_key("src/components/foo.tsx"));
        assert!(alice.1.contains_key("src/utils/helpers.ts"));
        assert_eq!(alice.1.get("src/components/bar.tsx").unwrap(), &1);
    }

    #[test]
    fn test_all_paths_collection() {
        let mut all_paths_set: HashSet<String> = HashSet::new();
        let paths = ["src/a.ts", "src/b.ts", "docs/readme.md", "src/a.ts"];

        for p in &paths {
            all_paths_set.insert(p.to_string());
        }

        assert_eq!(all_paths_set.len(), 3);
        assert!(all_paths_set.contains("src/a.ts"));
        assert!(all_paths_set.contains("src/b.ts"));
        assert!(all_paths_set.contains("docs/readme.md"));
    }
}
```

- [ ] **Step 2: Run Rust tests**

```bash
cd ai-digital-life && cargo test --package adl-workspace -- git_vis::contributor
```

Expected: compilation passes, both new tests PASS.

- [ ] **Step 3: Final Rust quality gate**

```bash
cd ai-digital-life && cargo clippy --workspace --all-targets
```

Expected: no warnings.

- [ ] **Step 4: Commit**

```bash
cd ai-digital-life && git add -A && git commit -m "test(backend): add tests for full path storage and all_paths collection"
```

---

## Self-Review

After the plan is written, verify:
1. Every spec requirement maps to at least one task
2. No placeholder/TODO remains
3. All types and signatures are consistent across tasks
4. Each task has independently testable deliverables
