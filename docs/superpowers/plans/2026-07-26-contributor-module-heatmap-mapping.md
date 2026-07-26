# 贡献者模块热力图 — 自定义映射系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 5 hardcoded module categories with a dynamic directory-driven system supporting custom mapping rules via a visual editor.

**Architecture:** Backend collects directory tree stats from `git log --name-only`. Frontend applies mapping rules (glob patterns with override support) via a new `applyModuleMapping` adapter. A visual editor lets users drag directory nodes to module cards. x-axis labels use rotation + truncation to handle crowding.

**Tech Stack:** Rust (backend), TypeScript/React (frontend), @visx heatmap, Zustand, i18n TCopyContext

## Global Constraints

- All new feature i18n keys must be added to both `en-US/changes.ts` and `zh-CN/changes.ts`
- Backend structs use `#[derive(Debug, Clone, Serialize, Deserialize, TS)]` with `#[serde(rename_all = "camelCase")]`
- Frontend types follow existing patterns in `gitVisMockData.ts` and `chartDataAdapters.ts`
- No new runtime dependencies — use existing @visx, motion, react-dom portal

---

### Task 0: Backend — workspace_write_file Tauri command

**Context:** Mapping config needs to be persisted at `{workspace}/.git-vis/module-mapping.json`. Existing `workspace_create_file` rejects existing files. Need a write command that always overwrites.

**Files:**
- Create: `crates/workspace/src/fs.rs` — add `write_file` function
- Modify: `src-tauri/src/commands/workspace.rs` — add `workspace_write_file` Tauri command
- Modify: `src-tauri/src/main.rs` — register command
- Modify: `frontend/src/shared/ipc/workspace.ts` — add IPC type
- Modify: `frontend/src/tauri-bridge/tauri-workspace.ts` — add bridge method
- Modify: `frontend/dev/previewWorkspaceService/gitVisualization.ts` — update preview server mock handler

**Interfaces:**
- Produces: `workspace_write_file(relativePath, content) → WorkspaceFileDocument`

- [ ] **Step 1: Add `write_file` to `crates/workspace/src/fs.rs`**

```rust
pub fn write_file(
    root: &Path,
    relative_path: &str,
    content: &str,
) -> Result<WorkspaceFileDocument, AppError> {
    let path = adl_fs_ops::resolve_workspace_path(root, relative_path)?;
    // Create parent dirs if they don't exist
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }
    adl_fs_ops::atomic_write(root, relative_path, content)?;
    Ok(WorkspaceFileDocument {
        path: relative_path.replace('\\', "/"),
        content: content.to_string(),
        last_modified_at: file_modified_at(&path),
    })
}
```

Export `write_file` in `crates/workspace/src/lib.rs` if needed (check if `fs::create_file` is re-exported there):

```rust
pub use fs::write_file;
```

- [ ] **Step 2: Add `workspace_write_file` Tauri command in `workspace.rs`**

```rust
#[tauri::command]
pub async fn workspace_write_file(
    app: tauri::AppHandle,
    relative_path: String,
    content: String,
) -> Result<IpcResult<WorkspaceFileDocument>, AppError> {
    let state = app.state::<AppState>();
    let ws = current_workspace(&state)?;
    let root_path = ws.root_path;
    let result = tokio::task::spawn_blocking(move || {
        adl_workspace::write_file(PathBuf::from(root_path).as_path(), &relative_path, &content)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking failed: {e}")))??;
    Ok(ipc(Ok(result)))
}
```

- [ ] **Step 3: Register command in `main.rs`**

```rust
commands::workspace::workspace_write_file,
```

Add after `workspace_read_file,` line.

- [ ] **Step 4: Add IPC type in `frontend/src/shared/ipc/workspace.ts`**

```typescript
/**
 * @command workspace_write_file
 */
writeFile: (relativePath: string, content: string) => Promise<IpcResult<WorkspaceFileDocument>>,
```

Add to the workspace bridge interface.

- [ ] **Step 5: Add bridge method in `frontend/src/tauri-bridge/tauri-workspace.ts`**

```typescript
writeFile: (relativePath: string, content: string) =>
  invokeIpc<WorkspaceFileDocument>('workspace_write_file', { relativePath, content }),
```

- [ ] **Step 6: Add preview bridge mock handler in `frontend/dev/previewWorkspaceService/gitVisualization.ts`**

```typescript
// Add a write handler for dev server (mock: persist to a simple map or localStorage)
```

- [ ] **Step 7: Run tests to verify no regressions**

Run: `cargo test --workspace && pnpm --dir frontend run test`
Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add crates/workspace/src/fs.rs src-tauri/src/commands/workspace.rs src-tauri/src/main.rs frontend/src/shared/ipc/workspace.ts frontend/src/tauri-bridge/tauri-workspace.ts frontend/dev/previewWorkspaceService/gitVisualization.ts
git commit -m "feat(core): add workspace_write_file Tauri command for overwriting workspace files"
```

---

### Task 1: Backend — DirectoryEntry struct + directory tree collection

**Files:**
- Modify: `crates/types/src/types/git_visualization.rs`
- Modify: `crates/workspace/src/git/git_vis/contributor.rs`
- Modify: `frontend/dev/previewWorkspaceService/gitVisualization.ts`
- Test: run `cargo test --workspace`

**Interfaces:**
- Produces: `DirectoryEntry { path: String, depth: u32, commit_count: u32 }` and `GitVisContributorModules { matrix: Vec<GitVisContributorModule>, all_directories: Vec<DirectoryEntry> }`

- [ ] **Step 1: Add DirectoryEntry struct to `git_visualization.rs`**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryEntry {
    pub path: String,
    pub depth: u32,
    pub commit_count: u32,
}
```

Update `GitVisContributorModules`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisContributorModules {
    pub matrix: Vec<GitVisContributorModule>,
    pub all_directories: Vec<DirectoryEntry>,
}
```

- [ ] **Step 2: Add directory tree collection to `contributor.rs`**

After the current loop that builds `author_modules`, add a pass to collect directory tree stats:

```rust
use std::collections::BTreeMap; // for sorted directory entries

// Collect directory tree statistics
let mut dir_stats: BTreeMap<String, (u32, u32)> = BTreeMap::new(); // path -> (depth, count)
for line in raw.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.contains('|') {
        continue;
    }
    if let Some(ref _author) = current_author {
        // Build all ancestor paths
        let parts: Vec<&str> = trimmed.split('/').collect();
        for i in 0..parts.len() {
            let ancestor = parts[..=i].join("/");
            let depth = (i + 1) as u32;
            let entry = dir_stats.entry(ancestor).or_insert((depth, 0));
            entry.1 += 1;
        }
    }
}

let all_directories: Vec<DirectoryEntry> = dir_stats
    .into_iter()
    .map(|(path, (depth, commit_count))| DirectoryEntry { path, depth, commit_count })
    .collect();
```

Return in the result struct:

```rust
Ok(GitVisContributorModules { matrix, all_directories })
```

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `cargo test --workspace`
Expected: all tests pass

- [ ] **Step 4: Update preview dev server to return `allDirectories`**

In `frontend/dev/previewWorkspaceService/gitVisualization.ts`, update `handleContributorModules` to collect directory tree stats:

```typescript
export async function handleContributorModules(rootPath: string, since?: string, until?: string) {
  // ... existing parsing code ...

  // Collect directory tree statistics
  const dirStats = new Map<string, number>(); // path -> commit count
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes('|')) continue;
    const parts = trimmed.split('/');
    for (let i = 0; i < parts.length; i++) {
      const ancestor = parts.slice(0, i + 1).join('/');
      dirStats.set(ancestor, (dirStats.get(ancestor) || 0) + 1);
    }
  }

  return {
    matrix: Array.from(authorModules, ([author, v]) => ({
      author, authorEmail: v.email,
      modules: Array.from(v.modules, ([module, count]) => ({ module, count })),
    })),
    allDirectories: Array.from(dirStats, ([path, count]) => ({
      path,
      depth: path.split('/').length,
      commitCount: count,
    })),
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add crates/types/src/types/git_visualization.rs crates/workspace/src/git/git_vis/contributor.rs frontend/dev/previewWorkspaceService/gitVisualization.ts
git commit -m "feat(core): add DirectoryEntry struct and directory tree collection"
```

---

### Task 2: Frontend — TypeScript types for mapping config

**Files:**
- Create: `frontend/src/app/features/git-visualization/types/module-mapping.ts`
- Modify: `frontend/src/app/i18n/en-US/changes.ts`
- Modify: `frontend/src/app/i18n/zh-CN/changes.ts`

**Interfaces:**
- Produces: `MappingRule`, `ModuleMappingConfig`, `DirectoryEntry` types

- [ ] **Step 1: Create `module-mapping.ts`**

```typescript
export interface MappingRule {
  path: string;
  module: string;
  type: 'glob';
  override?: boolean;
}

export interface ModuleMappingOptions {
  enableOtherBucket: boolean;
  unmappedStrategy: 'keep_original';
}

export interface ModuleMappingConfig {
  version: number;
  rules: MappingRule[];
  options: ModuleMappingOptions;
}

export interface DirectoryEntry {
  path: string;
  depth: number;
  commitCount: number;
}

export const DEFAULT_MAPPING_OPTIONS: ModuleMappingOptions = {
  enableOtherBucket: false,
  unmappedStrategy: 'keep_original',
};

export const MODULE_MAPPING_FILENAME = 'module-mapping.json';
```

- [ ] **Step 2: Add i18n keys for mapping editor**

In `en-US/changes.ts` after line 137 (`gitVisHeatmapTabModule`):

```typescript
  gitVisModuleMappingManage: 'Module Mapping',
  gitVisModuleMappingDirTree: 'Directory Tree',
  gitVisModuleMappingDefinedModules: 'Defined Modules',
  gitVisModuleMappingNewModule: 'New Module',
  gitVisModuleMappingSave: 'Save & Apply',
  gitVisModuleMappingReset: 'Reset to Default',
  gitVisModuleMappingUnmapped: 'Unmapped',
  gitVisModuleMappingEnableOther: 'Merge unmapped into "Other"',
  gitVisModuleMappingKeepOriginal: 'Keep unmapped directory names',
  gitVisModuleMappingConfigCorrupted: 'Module mapping config is corrupted. Falling back to dynamic directories.',
  gitVisLabelModeCompact: 'Compact',
  gitVisLabelModeReadable: 'Readable',
  gitVisColumnWidth: 'Column Width',
```

Add the same keys with Chinese translations in `zh-CN/changes.ts`.

- [ ] **Step 3: Add `allDirectories` to kernel `GitVisContributorModules` type**

In `frontend/src/kernel/types.ts`, add the `allDirectories` field:

```typescript
export interface GitVisDirectoryEntry {
  path: string;
  depth: number;
  commitCount: number;
}

export interface GitVisContributorModules {
  matrix: GitVisContributorModule[];
  allDirectories: GitVisDirectoryEntry[];
}
```

Also update `frontend/src/mock/mock-workspace.ts` to include mock directory tree in the mock data:

```typescript
gitVisContributorModules: async () => ({
  ok: true as const,
  data: {
    matrix: contributorNames.map((author, ci) => ({
      author, authorEmail: `${author.toLowerCase()}@example.com`,
      modules: moduleNames.map((module, mi) => ({ module, count: contributorModuleMatrix[ci][mi] })),
    })),
    allDirectories: mockDirectoryTree,
  },
}),
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/git-visualization/types/module-mapping.ts frontend/src/app/i18n/en-US/changes.ts frontend/src/app/i18n/zh-CN/changes.ts frontend/src/kernel/types.ts frontend/src/mock/mock-workspace.ts
git commit -m "feat(frontend): add module mapping types and i18n keys"
```

---

### Task 3: Frontend — useModuleMapping hook

**Files:**
- Create: `frontend/src/app/features/git-visualization/hooks/useModuleMapping.ts`

**Interfaces:**
- Consumes: `MappingRule`, `ModuleMappingConfig`, `DirectoryEntry`, `MODULE_MAPPING_FILENAME` from Task 2
- Produces: `useModuleMapping(workspaceId: string)` → `{ rules, saveRules, resetToDefault, isLoading, error }`

- [ ] **Step 1: Create `useModuleMapping.ts`**

```typescript
import { useCallback, useEffect, useState } from 'react';
import type { MappingRule, ModuleMappingConfig } from '../types/module-mapping';
import { DEFAULT_MAPPING_OPTIONS, MODULE_MAPPING_FILENAME } from '../types/module-mapping';

interface UseModuleMappingResult {
  rules: MappingRule[];
  saveRules: (rules: MappingRule[]) => Promise<void>;
  resetToDefault: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

const MAPPING_RELATIVE_PATH = `.git-vis/${MODULE_MAPPING_FILENAME}`;

async function readMappingConfig(activeWorkspaceTab: string): Promise<ModuleMappingConfig | null> {
  try {
    const workspace = window.digitalLife?.workspace;
    if (!workspace) return null;
    const result = await workspace.readFileForWorkspace(activeWorkspaceTab, MAPPING_RELATIVE_PATH);
    if (!result.ok || !result.data?.content) return null;
    return JSON.parse(result.data.content);
  } catch {
    return null;
  }
}

async function writeMappingConfig(activeWorkspaceTab: string, config: ModuleMappingConfig): Promise<void> {
  const content = JSON.stringify(config, null, 2);
  const workspace = window.digitalLife?.workspace;
  if (!workspace) return;
  await workspace.writeFile(MAPPING_RELATIVE_PATH, content);
}

export function useModuleMapping(activeWorkspaceTab: string): UseModuleMappingResult {
  const [rules, setRules] = useState<MappingRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setIsLoading(true);
        setError(null);
        const config = await readMappingConfig(activeWorkspaceTab);
        if (!cancelled) {
          setRules(config?.rules ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [activeWorkspaceTab]);

  const saveRules = useCallback(async (newRules: MappingRule[]) => {
    const config: ModuleMappingConfig = {
      version: 1,
      rules: newRules,
      options: DEFAULT_MAPPING_OPTIONS,
    };
    await writeMappingConfig(activeWorkspaceTab, config);
    setRules(newRules);
  }, [activeWorkspaceTab]);

  const resetToDefault = useCallback(async () => {
    setRules([]);
  }, []);

  return { rules, saveRules, resetToDefault, isLoading, error };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/features/git-visualization/hooks/useModuleMapping.ts
git commit -m "feat(frontend): add useModuleMapping hook for mapping config CRUD"
```

---

### Task 4: Frontend — applyModuleMapping adapter

**Files:**
- Modify: `frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts`
- Modify: `frontend/src/test-fixtures/gitVisMockData.ts`

**Interfaces:**
- Consumes: `MappingRule`, `ModuleMappingOptions` from Task 2; `RawContributorModules['matrix']`
- Produces: `applyModuleMapping(matrix, rules, options)` → mapped matrix

- [ ] **Step 1: Add `applyModuleMapping` function to `chartDataAdapters.ts`**

Insert after line 169 (before `contributorModulesToHeatmapColumns`):

```typescript
import type { MappingRule, ModuleMappingOptions } from '../types/module-mapping';

export function applyModuleMapping(
  matrix: RawContributorModules['matrix'],
  rules: MappingRule[],
  options?: { enableOtherBucket?: boolean },
): RawContributorModules['matrix'] {
  if (rules.length === 0) {
    // No rules = pure dynamic directory: keep original module names
    return matrix;
  }

  // Sort rules by specificity descending (longest path first, exact before glob)
  const sortedRules = [...rules].sort((a, b) => {
    const aLen = a.path.length;
    const bLen = b.path.length;
    if (aLen !== bLen) return bLen - aLen;
    return 0;
  });

  const matchRule = (moduleName: string): string | null => {
    for (const rule of sortedRules) {
      if (rule.type === 'glob') {
        // Convert glob pattern to regex (simple implementation)
        const pattern = rule.path
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '##GLOBSTAR##')
          .replace(/\*/g, '[^/]*')
          .replace(/##GLOBSTAR##/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(moduleName)) {
          return rule.module;
        }
      }
    }
    return null;
  };

  const enableOther = options?.enableOtherBucket ?? false;

  return matrix.map((contributor) => {
    const moduleMap = new Map<string, number>();
    let otherTotal = 0;
    for (const entry of contributor.modules) {
      const mapped = matchRule(entry.module);
      if (mapped) {
        moduleMap.set(mapped, (moduleMap.get(mapped) ?? 0) + entry.count);
      } else if (enableOther) {
        otherTotal += entry.count;
      } else {
        moduleMap.set(entry.module, (moduleMap.get(entry.module) ?? 0) + entry.count);
      }
    }
    if (otherTotal > 0) {
      moduleMap.set('Other', otherTotal);
    }

    const modules = [...moduleMap.entries()]
      .map(([module, count]) => ({ module, count }))
      .sort((a, b) => a.module.localeCompare(b.module));

    return {
      ...contributor,
      modules,
    };
  });
}
```

- [ ] **Step 2: Update mock data in `gitVisMockData.ts`**

Replace the static `moduleNames` (line 621) with dynamic directory-style names:

```typescript
export const moduleNames = ['frontend', 'backend', 'database', 'testing', 'docs'];

export const mockDirectoryTree: { path: string; depth: number; commitCount: number }[] = [
  { path: 'frontend', depth: 1, commitCount: 110 },
  { path: 'frontend/src', depth: 2, commitCount: 80 },
  { path: 'frontend/pages', depth: 2, commitCount: 30 },
  { path: 'backend', depth: 1, commitCount: 70 },
  { path: 'backend/api', depth: 2, commitCount: 40 },
  { path: 'database', depth: 1, commitCount: 40 },
  { path: 'testing', depth: 1, commitCount: 30 },
  { path: 'docs', depth: 1, commitCount: 20 },
];
```

Also update `generateContributorModuleData` to use raw directory names as `columnLabel`, and export the `mockDirectoryTree` so it can be included in mock responses.

- [ ] **Step 3: Write unit test for `applyModuleMapping`**

Create `frontend/src/app/features/git-visualization/adapters/chartDataAdapters.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyModuleMapping } from './chartDataAdapters';
import type { MappingRule } from '../types/module-mapping';

describe('applyModuleMapping', () => {
  const sampleMatrix = [
    {
      author: 'Alice',
      authorEmail: 'alice@example.com',
      modules: [
        { module: 'frontend/src', count: 30 },
        { module: 'frontend/pages', count: 20 },
        { module: 'backend/api', count: 10 },
        { module: 'docs/guide', count: 5 },
      ],
    },
  ];

  it('returns original matrix when no rules', () => {
    const result = applyModuleMapping(sampleMatrix, []);
    expect(result).toEqual(sampleMatrix);
  });

  it('maps directories to modules via glob rules', () => {
    const rules: MappingRule[] = [
      { path: 'frontend/**', module: 'Frontend', type: 'glob' },
      { path: 'backend/**', module: 'Backend', type: 'glob' },
    ];
    const result = applyModuleMapping(sampleMatrix, rules);
    expect(result[0].modules).toContainEqual({ module: 'Frontend', count: 50 });
    expect(result[0].modules).toContainEqual({ module: 'Backend', count: 10 });
  });

  it('merge same module counts', () => {
    const matrix = [{
      author: 'Bob',
      authorEmail: 'bob@x.com',
      modules: [
        { module: 'src/button', count: 5 },
        { module: 'src/input', count: 3 },
      ],
    }];
    const rules: MappingRule[] = [
      { path: 'src/**', module: 'UI', type: 'glob' },
    ];
    const result = applyModuleMapping(matrix, rules);
    expect(result[0].modules).toContainEqual({ module: 'UI', count: 8 });
  });

  it('keeps original module name when no rule matches', () => {
    const matrix = [{
      author: 'Charlie',
      authorEmail: 'c@x.com',
      modules: [{ module: 'vendor/lib', count: 7 }],
    }];
    const rules: MappingRule[] = [
      { path: 'src/**', module: 'Source', type: 'glob' },
    ];
    const result = applyModuleMapping(matrix, rules);
    expect(result[0].modules).toContainEqual({ module: 'vendor/lib', count: 7 });
  });

  it('override rule takes priority over broader glob', () => {
    const matrix = [{
      author: 'Dave',
      authorEmail: 'd@x.com',
      modules: [
        { module: 'frontend/workers/thread', count: 5 },
        { module: 'frontend/src/app', count: 10 },
      ],
    }];
    const rules: MappingRule[] = [
      { path: 'frontend/**', module: 'Frontend', type: 'glob' },
      { path: 'frontend/workers/**', module: 'Backend Service', type: 'glob', override: true },
    ];
    const result = applyModuleMapping(matrix, rules);
    expect(result[0].modules).toContainEqual({ module: 'Backend Service', count: 5 });
    expect(result[0].modules).toContainEqual({ module: 'Frontend', count: 10 });
  });
});
```

- [ ] **Step 4: Run adapter tests**

Run: `pnpm --dir frontend run test`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts frontend/src/test-fixtures/gitVisMockData.ts frontend/src/app/features/git-visualization/adapters/chartDataAdapters.test.ts
git commit -m "feat(frontend): add applyModuleMapping adapter with unit tests"
```

---

### Task 5: Frontend — HeatmapXAxis label rotation + truncation enhancement

**Files:**
- Modify: `frontend/src/components/charts/heatmap/heatmap-x-axis.tsx`
- Modify: `frontend/src/components/charts/heatmap/heatmap-context.tsx` (no changes needed, but verify)

**Interfaces:**
- Consumes: `HeatmapXAxisProps` with new props: `rotateAngle`, `maxLabelWidth`, `labelMode`
- Produces: Rotated/truncated x-axis labels with hover tooltip

- [ ] **Step 1: Add new props to `HeatmapXAxisProps`**

```typescript
export interface HeatmapXAxisProps {
  className?: string;
  tickEvery?: number;
  labelFormat?: 'short' | 'numeric';
  top?: number;
  /** Label rotation angle in degrees. Default: 0 */
  rotateAngle?: number;
  /** Max label width in px before truncation. Default: undefined (no truncation) */
  maxLabelWidth?: number;
  /** Label display mode. Default: 'normal' */
  labelMode?: 'normal' | 'compact' | 'readable';
}
```

- [ ] **Step 2: Add rotation and truncation logic**

In the `createPortal` render section, modify the individual label rendering:

```typescript
const isCompact = labelMode === 'compact';
const isReadable = labelMode === 'readable';

return createPortal(
  labels.map((tick) => {
    const isRotated = rotateAngle !== undefined && rotateAngle !== 0;
    const shouldTruncate = maxLabelWidth !== undefined && !isReadable;

    const labelStyle: React.CSSProperties = {
      top,
      left: tick.x,
      width: isRotated ? 'auto' : (shouldTruncate ? maxLabelWidth : 'auto'),
      display: 'flex',
      justifyContent: isReadable ? 'center' : 'flex-start',
      overflow: 'visible',
      position: 'absolute',
    };

    return (
      <div
        className="pointer-events-none absolute"
        key={tick.key}
        style={labelStyle}
      >
        <span
          className={cn(
            'text-chart-label text-xs whitespace-nowrap',
            shouldTruncate && 'truncate inline-block',
            isReadable && 'whitespace-normal text-center leading-tight',
            className,
          )}
          title={shouldTruncate ? tick.label : undefined}
          style={{
            ...(isRotated ? {
              transform: `rotate(${rotateAngle}deg)`,
              transformOrigin: 'left center',
            } : {}),
            ...(isReadable ? {
              maxWidth: maxLabelWidth ?? 80,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
              fontSize: '10px',
            } : {}),
            ...(shouldTruncate ? { maxWidth: maxLabelWidth, display: 'inline-block' } : {}),
          }}
        >
          {tick.label}
        </span>
      </div>
    );
  }),
  container,
);
```

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `pnpm --dir frontend run test`
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/charts/heatmap/heatmap-x-axis.tsx
git commit -m "feat(heatmap): add label rotation, truncation, and readable mode to XAxis"
```

---

### Task 6: Frontend — ContributorModuleHeatmap cleanup + wire up mapping

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/ContributorModuleHeatmap.tsx`

**Interfaces:**
- Consumes: `MappingRule[]` from `useModuleMapping`, `applyModuleMapping` from Task 4
- Consumes: `heatmap-x-axis.tsx` new props from Task 5
- Produces: Clean module heatmap with dynamic columns

- [ ] **Step 1: Rewrite `ContributorModuleHeatmap.tsx`**

Remove `MODULE_KEYS` constant. Add props for `rules`, `directoryTree`, and label mode controls:

```typescript
import React, { useCallback, useMemo } from 'react';
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
import { contributorModulesToHeatmapColumns, applyModuleMapping } from '../adapters/chartDataAdapters';
import type { MappingRule } from '../types/module-mapping';

interface ContributorModuleHeatmapProps {
  data?: {
    author: string;
    authorEmail: string;
    modules: { module: string; count: number }[];
  }[];
  rules?: MappingRule[];
  labelMode?: 'normal' | 'compact' | 'readable';
  columnWidth?: number;
}

export const ContributorModuleHeatmap = React.memo(function ContributorModuleHeatmap({
  data,
  rules = [],
  labelMode = 'compact',
  columnWidth = 36,
}: ContributorModuleHeatmapProps) {
  const { t, locale } = useTCopy();

  const customFillScale = useMemo(() => buildHeatmapFillScale(HEATMAP_DEFAULT_LEVEL_STYLES), []);

  const { columns, rowLabels } = useMemo(() => {
    if (!data) {
      return { columns: [], rowLabels: [] };
    }
    const mappedData = applyModuleMapping(data, rules);
    const result = contributorModulesToHeatmapColumns(mappedData);
    return result;
  }, [data, rules]);

  const formatLabel = useCallback(
    (count: number) => {
      const word = count === 1 ? t.gitVisContribution : t.gitVisContributions;
      return `${count} ${word}`;
    },
    [t],
  );

  const colCount = columns.length;

  // Compute rotation and label props based on column count and mode
  const rotateAngle = labelMode === 'compact' && colCount > 8 ? 30 : 0;
  const maxLabelWidth = labelMode === 'compact'
    ? (colCount > 15 ? 60 : colCount > 8 ? 80 : undefined)
    : (colCount > 8 ? 80 : undefined);

  return (
    <HeatmapChart
      data={columns}
      locale={locale}
      rowLabels={rowLabels}
      margin={{ top: 28, right: 16, bottom: 0, left: 80 }}
      gap={2}
      binSize={columnWidth}
      animate={true}
      fillScale={customFillScale}
    >
      <HeatmapCells cornerRadius={2} />
      <HeatmapXAxis
        rotateAngle={rotateAngle}
        maxLabelWidth={maxLabelWidth}
        labelMode={colCount > 8 ? labelMode : 'normal'}
        tickEvery={colCount > 20 ? 2 : 1}
      />
      <HeatmapYAxis tickFilter="all" />
      <HeatmapTooltip showDelay={150} hideDelay={100} formatLabel={formatLabel} />
    </HeatmapChart>
  );
});
```

- [ ] **Step 2: Run existing tests**

Run: `pnpm --dir frontend run test`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/charts/ContributorModuleHeatmap.tsx
git commit -m "feat(frontend): remove hardcoded MODULE_KEYS, wire up dynamic mapping pipeline"
```

---

### Task 7: Frontend — ModuleMappingEditor component

**Files:**
- Create: `frontend/src/app/features/git-visualization/ModuleMappingEditor.tsx`

**Interfaces:**
- Consumes: `DirectoryEntry[]`, `MappingRule[]`, `saveRules`, `resetToDefault` from Task 3
- Produces: Modal editor UI with directory tree, module cards, drag-to-map interaction

- [ ] **Step 1: Create `ModuleMappingEditor.tsx`**

```typescript
import React, { useCallback, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import type { MappingRule, DirectoryEntry } from '../types/module-mapping';

interface ModuleMappingEditorProps {
  isOpen: boolean;
  onClose: () => void;
  directoryTree: DirectoryEntry[];
  rules: MappingRule[];
  onSave: (rules: MappingRule[]) => Promise<void>;
  onReset: () => Promise<void>;
}

interface TreeNode {
  path: string;
  depth: number;
  commitCount: number;
  children: TreeNode[];
  mappedModule?: string;
}

function buildTree(entries: DirectoryEntry[], existingRules: MappingRule[]): TreeNode[] {
  const rootMap = new Map<string, TreeNode>();
  for (const entry of entries) {
    const parts = entry.path.split('/');
    let current = rootMap;
    for (let i = 0; i < parts.length; i++) {
      const part = parts.slice(0, i + 1).join('/');
      if (!current.has(part)) {
        current.set(part, {
          path: part,
          depth: i + 1,
          commitCount: 0,
          children: [],
        });
      }
      const node = current.get(part)!;
      node.commitCount += entry.commitCount;
      current = new Map(node.children.map((c) => [c.path, c]));
    }
  }

  // Assign parent-child relationships
  const sorted = [...rootMap.values()].sort((a, b) => a.path.localeCompare(b.path));
  for (const node of sorted) {
    const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
    if (parentPath && rootMap.has(parentPath)) {
      rootMap.get(parentPath)!.children.push(node);
    }
  }

  // Attach mapped module info
  const findModule = (path: string): string | undefined => {
    for (const rule of existingRules) {
      if (rule.type === 'glob') {
        const pattern = rule.path.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
        if (new RegExp(`^${pattern}$`).test(path)) return rule.module;
      }
    }
    return undefined;
  };
  for (const node of rootMap.values()) {
    const dirPath = node.path.endsWith('/') ? node.path : node.path + '/';
    node.mappedModule = findModule(dirPath + '**') || findModule(node.path);
  }

  return sorted.filter((n) => n.depth === 1);
}

function TreeNodeRow({ node, onDragStart, expanded, onToggle }: {
  node: TreeNode; onDragStart: (path: string) => void;
  expanded: boolean; onToggle: () => void;
}) {
  const hasChildren = node.children.length > 0;
  return (
    <div style={{ marginLeft: (node.depth - 1) * 16 }}>
      <div
        draggable
        onDragStart={() => onDragStart(node.path)}
        style={{ cursor: 'grab', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0' }}
      >
        {hasChildren ? (
          <span onClick={onToggle} style={{ cursor: 'pointer', width: 16, textAlign: 'center' }}>
            {expanded ? '▼' : '▶'}
          </span>
        ) : <span style={{ width: 16 }} />}
        <span>📁 {node.path}</span>
        <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 4 }}>({node.commitCount})</span>
        {node.mappedModule && (
          <span style={{ fontSize: 10, color: 'var(--accent-color)', marginLeft: 4 }}>
            → {node.mappedModule}
          </span>
        )}
      </div>
      {expanded && hasChildren && node.children.map((child) => (
        <TreeNodeRow
          key={child.path}
          node={child}
          onDragStart={onDragStart}
          expanded={false}
          onToggle={() => {}}
        />
      ))}
    </div>
  );
}

export const ModuleMappingEditor = React.memo(function ModuleMappingEditor({
  isOpen,
  onClose,
  directoryTree,
  rules: initialRules,
  onSave,
  onReset,
}: ModuleMappingEditorProps) {
  const { t } = useTCopy();
  const [rules, setRules] = useState<MappingRule[]>(initialRules);
  const [newModuleName, setNewModuleName] = useState('');
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const tree = React.useMemo(() => buildTree(directoryTree, rules), [directoryTree, rules]);

  const definedModules = React.useMemo(() => {
    const map = new Map<string, MappingRule[]>();
    for (const rule of rules) {
      const existing = map.get(rule.module) ?? [];
      existing.push(rule);
      map.set(rule.module, existing);
    }
    return map;
  }, [rules]);

  const handleDrop = useCallback((targetModule: string) => {
    if (!draggedPath) return;
    setRules((prev) => {
      const filtered = prev.filter((r) => !(r.path === draggedPath + '/**' || r.path === draggedPath));
      return [...filtered, { path: draggedPath + '/**', module: targetModule, type: 'glob' }];
    });
    setDraggedPath(null);
  }, [draggedPath]);

  const handleDeleteModule = useCallback((moduleName: string) => {
    setRules((prev) => prev.filter((r) => r.module !== moduleName));
  }, []);

  const handleAddModule = useCallback(() => {
    const name = newModuleName.trim();
    if (!name || definedModules.has(name)) return;
    setNewModuleName('');
  }, [newModuleName, definedModules]);

  const handleRenameModule = useCallback((oldName: string, newName: string) => {
    setRules((prev) => prev.map((r) => r.module === oldName ? { ...r, module: newName } : r));
  }, []);

  const topLevelDirs = React.useMemo(() =>
    directoryTree.filter((d) => d.depth === 1),
  [directoryTree]);
  const unmappedDirs = topLevelDirs.filter(
    (d) => !rules.some((r) => {
      const rulePath = r.path.replace('/**', '');
      return d.path === rulePath || d.path.startsWith(rulePath + '/');
    }),
  );

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface-color)', borderRadius: 8,
        width: 800, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottom: '1px solid var(--border-color)' }}>
          <h2>{t.gitVisModuleMappingManage}</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: 12, borderRight: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: 12, marginBottom: 8 }}>{t.gitVisModuleMappingDirTree}</h3>
            {tree.map((node) => (
              <TreeNodeRow
                key={node.path}
                node={node}
                onDragStart={setDraggedPath}
                expanded={expandedPaths.has(node.path)}
                onToggle={() => {
                  setExpandedPaths((prev) => {
                    const next = new Set(prev);
                    if (next.has(node.path)) next.delete(node.path);
                    else next.add(node.path);
                    return next;
                  });
                }}
              />
            ))}
          </div>
          <div style={{ width: 300, overflow: 'auto', padding: 12 }}>
            <h3 style={{ fontSize: 12, marginBottom: 8 }}>{t.gitVisModuleMappingDefinedModules}</h3>
            {[...definedModules.entries()].map(([moduleName, moduleRules]) => (
              <div
                key={moduleName}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(moduleName)}
                style={{
                  padding: 8, marginBottom: 4, borderRadius: 4,
                  border: '1px solid var(--border-color)',
                  background: draggedPath ? 'var(--hover-color)' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <input
                    defaultValue={moduleName}
                    onBlur={(e) => handleRenameModule(moduleName, e.target.value)}
                    style={{ border: 'none', background: 'transparent', fontWeight: 600, fontSize: 13 }}
                  />
                  <button onClick={() => handleDeleteModule(moduleName)}>✕</button>
                </div>
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>
                  {moduleRules.map((r) => r.path).join(', ')}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              <input
                value={newModuleName}
                onChange={(e) => setNewModuleName(e.target.value)}
                placeholder={t.gitVisModuleMappingNewModule}
                style={{ flex: 1, fontSize: 12, padding: '2px 4px' }}
              />
              <button onClick={handleAddModule} disabled={!newModuleName.trim()}>+</button>
            </div>
          </div>
        </div>
        {unmappedDirs.length > 0 && (
          <div style={{ padding: '4px 12', fontSize: 11, opacity: 0.5 }}>
            {t.gitVisModuleMappingUnmapped}: {unmappedDirs.map((d) => d.path).join(', ')}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 12, borderTop: '1px solid var(--border-color)' }}>
          <button onClick={onReset}>{t.gitVisModuleMappingReset}</button>
          <button onClick={() => onSave(rules)} style={{ fontWeight: 600 }}>{t.gitVisModuleMappingSave}</button>
        </div>
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/features/git-visualization/ModuleMappingEditor.tsx
git commit -m "feat(frontend): add ModuleMappingEditor component with directory tree and drag-to-map"
```

---

### Task 8: Frontend — Integration: gear button + wire up mapping pipeline in HeatmapCardGroup

**Files:**
- Modify: `frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx`
- Modify: `frontend/src/app/features/git-visualization/GitVisualizationView.tsx`

- [ ] **Step 1: Add gear button to module tab in `HeatmapCardGroup.tsx`**

After the tab nav buttons (line 205), add a gear icon button when module tab is active:

```typescript
{activeHeatmapTab === 'module' && (
  <button
    className="adl-git-vis__heatmap-gear"
    onClick={() => setMappingEditorOpen(true)}
    aria-label={t.gitVisModuleMappingManage}
    title={t.gitVisModuleMappingManage}
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  </button>
)}
```

Add state: `const [mappingEditorOpen, setMappingEditorOpen] = useState(false);`
Add import: `import { ModuleMappingEditor } from './ModuleMappingEditor';`
Add rendering below the legend:

```typescript
{activeHeatmapTab === 'module' && (
  <ModuleMappingEditor
    isOpen={mappingEditorOpen}
    onClose={() => setMappingEditorOpen(false)}
    directoryTree={allDirectories}
    rules={mappingRules}
    onSave={saveMappingRules}
    onReset={resetMapping}
  />
)}
```

- [ ] **Step 2: Wire up useModuleMapping in `HeatmapCardGroup.tsx`**

Add import and hook usage at top level of the component:

```typescript
import { useModuleMapping } from './hooks/useModuleMapping';

// Inside component:
const { rules: mappingRules, saveRules: saveMappingRules, resetToDefault: resetMapping, isLoading: mappingLoading } = useModuleMapping(activeWorkspaceTab);
// directoryTree is extracted from contributorModules (backend returns all_directories alongside matrix)
const allDirectories = useMemo(() => {
  const dirs = (contributorModules as { allDirectories?: { path: string; depth: number; commitCount: number }[] })?.allDirectories ?? [];
  return dirs;
}, [contributorModules]);
```

Pass `rules` and `labelMode` to `ContributorModuleHeatmap`:

```typescript
{activeHeatmapTab === 'module' && (
  <ContributorModuleHeatmap
    data={contributorModules}
    rules={mappingRules}
    labelMode={labelMode}
    columnWidth={columnWidth}
  />
)}
```

Add state for label mode toggle + column width slider near the gear button, inside the card-header area:

```typescript
// State declarations at top of component
const [labelMode, setLabelMode] = useState<'compact' | 'readable'>('compact');
const [columnWidth, setColumnWidth] = useState(36);

// Render controls next to the gear button, inside the same container
{activeHeatmapTab === 'module' && (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
    <button
      className={`adl-git-vis__label-mode-btn${labelMode === 'compact' ? ' active' : ''}`}
      onClick={() => setLabelMode('compact')}
      title={t.gitVisLabelModeCompact}
    >
      {t.gitVisLabelModeCompact}
    </button>
    <button
      className={`adl-git-vis__label-mode-btn${labelMode === 'readable' ? ' active' : ''}`}
      onClick={() => setLabelMode('readable')}
      title={t.gitVisLabelModeReadable}
    >
      {t.gitVisLabelModeReadable}
    </button>
    <input
      type="range"
      min="24"
      max="60"
      value={columnWidth}
      onChange={(e) => setColumnWidth(Number(e.target.value))}
      aria-label={t.gitVisColumnWidth}
      style={{ width: 60 }}
    />
  </div>
)}
```

- [ ] **Step 3: Update HeatmapCardGroupProps to accept allDirectories**

In `HeatmapCardGroup.tsx`, update the `contributorModules` prop type to include the `allDirectories` field:

```typescript
interface HeatmapCardGroupProps {
  onRefresh?: () => Promise<void>;
  commitStats?: RawCommitStats;
  contributorModules?: {
    author: string;
    authorEmail: string;
    modules: { module: string; count: number }[];
    allDirectories?: { path: string; depth: number; commitCount: number }[];
  }[];
  yearBounds?: { min: number; max: number } | null;
}
```

This is already passed from `GitVisualizationView.tsx` via the `useChartData` hook. Verify `chartDataAdapters.ts` preserves the `allDirectories` field when transforming backend data:

```typescript
// In the data fetching path: ensure allDirectories is passed through
// The backend returns GitVisContributorModules { matrix, all_directories }
// The IPC layer in workspace.ts should receive both fields
// The mock data in gitVisMockData.ts should include allDirectories
```

- [ ] **Step 4: Run tests**

Run: `pnpm --dir frontend run test`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx frontend/src/app/features/git-visualization/GitVisualizationView.tsx
git commit -m "feat(frontend): integrate mapping editor gear button and wire up mapping pipeline"
```

---

### Task 9: Tests — ModuleMappingEditor component test + visual regression

**Files:**
- Create: `frontend/src/app/features/git-visualization/ModuleMappingEditor.test.tsx`

- [ ] **Step 1: Editor component tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModuleMappingEditor } from './ModuleMappingEditor';
import type { MappingRule, DirectoryEntry } from './types/module-mapping';

describe('ModuleMappingEditor', () => {
  const mockTree: DirectoryEntry[] = [
    { path: 'frontend', depth: 1, commitCount: 100 },
    { path: 'frontend/src', depth: 2, commitCount: 80 },
    { path: 'backend', depth: 1, commitCount: 60 },
    { path: 'docs', depth: 1, commitCount: 20 },
  ];

  const mockRules: MappingRule[] = [
    { path: 'frontend/**', module: 'Frontend', type: 'glob' },
    { path: 'backend/**', module: 'Backend', type: 'glob' },
  ];

  it('renders directory tree and module cards', () => {
    render(
      <ModuleMappingEditor
        isOpen={true}
        onClose={vi.fn()}
        directoryTree={mockTree}
        rules={mockRules}
        onSave={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByText('frontend')).toBeDefined();
    expect(screen.getByText('Frontend')).toBeDefined();
    expect(screen.getByText('Backend')).toBeDefined();
  });

  it('calls onSave with updated rules when Save clicked', () => {
    const onSave = vi.fn();
    render(
      <ModuleMappingEditor
        isOpen={true}
        onClose={vi.fn()}
        directoryTree={mockTree}
        rules={mockRules}
        onSave={onSave}
        onReset={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Save & Apply'));
    expect(onSave).toHaveBeenCalled();
  });

  it('shows unmapped directories', () => {
    render(
      <ModuleMappingEditor
        isOpen={true}
        onClose={vi.fn()}
        directoryTree={mockTree}
        rules={mockRules}
        onSave={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByText('docs')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `pnpm --dir frontend run test`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/ModuleMappingEditor.test.tsx
git commit -m "test(frontend): add ModuleMappingEditor component tests"
```
