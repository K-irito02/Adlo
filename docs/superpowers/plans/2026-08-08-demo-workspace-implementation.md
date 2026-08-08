# Demo Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增独立演示工作区入口，内含完整覆盖所有 block 类型与 run 活动事件类型的静态模拟对话 + 可选流式交互模拟，让用户在真实渲染管线下观察中间对话区域的 UI/UX。

**Architecture:** 一个前端演示数据层（`frontend/src/mock/demo/`，数据独立、不污染 `mock-shared-*`）+ 一个演示感知的 Bridge 包装器 `withDemoMode(baseBridge)`，在 `main.tsx`（Tauri）与 `preview-bridge/index.ts`（浏览器）两处注册。打开演示路径时激活 `demoState`，其余方法透传 `baseBridge`。

**Tech Stack:** React 19 + TypeScript + Zustand + Vitest（fake timers）；模拟器用原生 `window.setTimeout`，不引入新依赖。

## Global Constraints

- 数据层文件位于 `ai-digital-life/frontend/src/mock/demo/`；所有路径相对该目录（工作目录 `ai-digital-life/frontend`）。
- 测试命令：`npx vitest run <file>`；全量门禁 `pnpm --dir frontend run lint`（0 errors）、`pnpm --dir frontend run test`、`npx tsc --noEmit`。
- 模拟对话内容（用户消息/Agent 回复/block 摘要）用简体中文 mock 数据，不走 i18n；产品 UI 文本（工作区名、会话标题、入口标签）必须走 i18n key（zh-CN + en-US 双份，`__tests__/keys.test.ts` 奇偶校验自动覆盖）。
- 演示数据必须独立于 `mock-shared-*` 模块级全局状态（不复用 `sessions`/`messagesBySession`/`documents`/`recentWorkspaces`），避免污染普通会话。
- 零 Rust 改动、无新 IPC、无新增 capability、不引入新依赖。
- 双端一致：浏览器（`setupPreviewBridge` 包 `withDemoMode`）与 Tauri（`withDemoMode(createTauriBridge())`）都能进入演示工作区。
- 禁止 `console.log`/`[ADL-DEBUG]` 遗留生产代码；UI 变更后必须补红绿测试。
- 提交信息用 Conventional Commit（`feat(demo): ...`）；分支命名 kebab-case 最多 3 词（如 `demo-workspace`）。

---

### Task 1: i18n 演示 key（zh-CN + en-US + index 合并 + 奇偶校验）

**Files:**
- Create: `src/app/i18n/zh-CN/demo.ts`
- Create: `src/app/i18n/en-US/demo.ts`
- Modify: `src/app/i18n/zh-CN/index.ts`（import + spread）
- Modify: `src/app/i18n/en-US/index.ts`（import + spread）
- Modify: `src/app/i18n/__tests__/keys.test.ts`

**Interfaces:**
- Consumes: 现有 i18n 合并模式（各 domain 模块 `as const` 后展开进 `zhCN`/`enUS`）。
- Produces: `demoWorkspaceName`、`demoSessionCompleteTitle`、`demoSessionPlanTitle`、`demoSessionToolsTitle` 四个 key，供 Task 6（demo 数据 name/title 标记）与 Task 9（渲染解析器）使用。

- [ ] **Step 1: Write the failing test**

向 `src/app/i18n/__tests__/keys.test.ts` 追加（`describe('i18n demo keys', ...)` 块）：

```ts
describe('i18n demo keys', () => {
  it('includes demo workspace name and session title keys in both locales', () => {
    expect(enUS).toHaveProperty('demoWorkspaceName');
    expect(zhCN).toHaveProperty('demoWorkspaceName');
    expect(enUS).toHaveProperty('demoSessionCompleteTitle');
    expect(zhCN).toHaveProperty('demoSessionCompleteTitle');
    expect(enUS).toHaveProperty('demoSessionPlanTitle');
    expect(zhCN).toHaveProperty('demoSessionPlanTitle');
    expect(enUS).toHaveProperty('demoSessionToolsTitle');
    expect(zhCN).toHaveProperty('demoSessionToolsTitle');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/i18n/__tests__/keys.test.ts`
Expected: FAIL — `expect(enUS).toHaveProperty('demoWorkspaceName')` 未通过（key 尚不存在）。

- [ ] **Step 3: Write minimal implementation**

`src/app/i18n/zh-CN/demo.ts`：

```ts
export const demoZh = {
  demoWorkspaceName: '演示工作区',
  demoSessionCompleteTitle: '综合演示 · 代码修改',
  demoSessionPlanTitle: '计划与审批',
  demoSessionToolsTitle: '搜索与工具',
} as const;
```

`src/app/i18n/en-US/demo.ts`：

```ts
export const demoEn = {
  demoWorkspaceName: 'Demo Workspace',
  demoSessionCompleteTitle: 'Demo · Code Edit',
  demoSessionPlanTitle: 'Plan & Approval',
  demoSessionToolsTitle: 'Search & Tools',
} as const;
```

`src/app/i18n/zh-CN/index.ts`（在 `notificationZh` 导入后追加）：

```ts
import { demoZh } from './demo';
```

并把 `demoZh` 加入 `export const zhCN = { ... }` 的展开列表末尾（`...notificationZh,` 之后一行）：

```ts
  ...notificationZh,
  ...demoZh,
} as const;
```

`src/app/i18n/en-US/index.ts` 同样处理：`import { demoEn } from './demo';`，并在 `...notificationEn,` 后追加 `...demoEn,`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/i18n/__tests__/keys.test.ts`
Expected: PASS（新 key 断言 + 既有奇偶校验「zh-CN 与 en-US 顶层 key 一致」均通过）。

- [ ] **Step 5: Commit**

```bash
git add src/app/i18n/zh-CN/demo.ts src/app/i18n/en-US/demo.ts src/app/i18n/zh-CN/index.ts src/app/i18n/en-US/index.ts src/app/i18n/__tests__/keys.test.ts
git commit -m "feat(demo): add demo workspace i18n keys"
```

---

### Task 2: demo-constants 常量

**Files:**
- Create: `src/mock/demo/demo-constants.ts`
- Test: `src/mock/demo/demo-constants.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces（供 Task 3/6 使用）:
  - `export const DEMO_WORKSPACE_ID = 'workspace-demo'`
  - `export const DEMO_WORKSPACE_PATH = 'demo://workspace'`
  - `export const DEMO_WORKSPACE_NAME_MARKER = 'i18n:demoWorkspaceName'`
  - `export const DEMO_SESSION_IDS = { complete: 'demo-session-complete', plan: 'demo-session-plan', tools: 'demo-session-tools' } as const`
  - `export const DEMO_SESSION_TITLE_MARKERS = { complete: 'i18n:demoSessionCompleteTitle', plan: 'i18n:demoSessionPlanTitle', tools: 'i18n:demoSessionToolsTitle' } as const`
  - `export const DEMO_DOCUMENTS: Record<string, string>`（虚拟文件路径 → 内容）
  - `export const DEMO_NOW = Date.now()`

- [ ] **Step 1: Write the failing test**

`src/mock/demo/demo-constants.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  DEMO_WORKSPACE_ID,
  DEMO_WORKSPACE_PATH,
  DEMO_WORKSPACE_NAME_MARKER,
  DEMO_SESSION_IDS,
  DEMO_DOCUMENTS,
} from './demo-constants';

describe('demo-constants', () => {
  it('defines the demo workspace identity', () => {
    expect(DEMO_WORKSPACE_ID).toBe('workspace-demo');
    expect(DEMO_WORKSPACE_PATH).toBe('demo://workspace');
    expect(DEMO_WORKSPACE_NAME_MARKER).toBe('i18n:demoWorkspaceName');
  });

  it('defines three demo session ids', () => {
    expect(DEMO_SESSION_IDS.complete).toBe('demo-session-complete');
    expect(DEMO_SESSION_IDS.plan).toBe('demo-session-plan');
    expect(DEMO_SESSION_IDS.tools).toBe('demo-session-tools');
  });

  it('seeds virtual documents that match message content references', () => {
    expect(DEMO_DOCUMENTS['frontend/src/main.tsx']).toBeTruthy();
    expect(DEMO_DOCUMENTS['README.md']).toBeTruthy();
    expect(DEMO_DOCUMENTS['Resume/index.html']).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/mock/demo/demo-constants.test.ts`
Expected: FAIL — module 不存在（导入错误）。

- [ ] **Step 3: Write minimal implementation**

`src/mock/demo/demo-constants.ts`：

```ts
export const DEMO_WORKSPACE_ID = 'workspace-demo';
export const DEMO_WORKSPACE_PATH = 'demo://workspace';
export const DEMO_WORKSPACE_NAME_MARKER = 'i18n:demoWorkspaceName';

export const DEMO_SESSION_IDS = {
  complete: 'demo-session-complete',
  plan: 'demo-session-plan',
  tools: 'demo-session-tools',
} as const;

export const DEMO_SESSION_TITLE_MARKERS = {
  complete: 'i18n:demoSessionCompleteTitle',
  plan: 'i18n:demoSessionPlanTitle',
  tools: 'i18n:demoSessionToolsTitle',
} as const;

export const DEMO_NOW = Date.now();

export const DEMO_DOCUMENTS: Record<string, string> = {
  'frontend/src/main.tsx': `import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const container = document.getElementById('app');
if (!container) throw new Error('App root not found.');
createRoot(container).render(<App />);
`,
  'frontend/src/app/App.tsx': `export function App() {
  return <main>AI Digital Life</main>;
}
`,
  'README.md': `# AI Digital Life

一个基于 Rust + Tauri 的桌面应用。
`,
  'Resume/index.html': `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8"><title>简历</title></head>
  <body><h1>个人简历</h1></body>
</html>
`,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/mock/demo/demo-constants.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/mock/demo/demo-constants.ts src/mock/demo/demo-constants.test.ts
git commit -m "feat(demo): add demo constants"
```

---

### Task 3: demo-workspace 数据（meta / recent 条目 / 文档树 / git 快照 / patch 集）

**Files:**
- Create: `src/mock/demo/demo-workspace.ts`
- Test: `src/mock/demo/demo-workspace.test.ts`

**Interfaces:**
- Consumes: Task 1 keys 常量、Task 2 `DEMO_WORKSPACE_ID/PATH/NAME_MARKER/DEMO_DOCUMENTS/DEMO_NOW`。
- Produces（供 Task 6 包装器使用，签名必须与 `@ai-digital-life/kernel` 类型一致）:
  - `export function buildDemoWorkspaceMeta(): WorkspaceMeta`
  - `export function buildDemoRecentEntry(): RecentWorkspaceEntry`
  - `export function buildDemoTree(): WorkspaceTreeNode[]`
  - `export function buildDemoGitSnapshot(): GitSnapshot`
  - `export function buildDemoChangePreview(relativePath: string): WorkspaceChangePreview`
  - `export function getDemoPatchSet(patchSetId: string): PatchSet | undefined`
  - `export function buildDemoPatchSet(sessionId: string, runId: string): PatchSet`

- [ ] **Step 1: Write the failing test**

`src/mock/demo/demo-workspace.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  buildDemoWorkspaceMeta,
  buildDemoRecentEntry,
  buildDemoTree,
  buildDemoGitSnapshot,
  buildDemoChangePreview,
  getDemoPatchSet,
  buildDemoPatchSet,
} from './demo-workspace';
import {
  DEMO_WORKSPACE_ID,
  DEMO_WORKSPACE_PATH,
  DEMO_WORKSPACE_NAME_MARKER,
  DEMO_SESSION_IDS,
} from './demo-constants';

describe('demo-workspace', () => {
  it('builds a WorkspaceMeta for the demo path', () => {
    const meta = buildDemoWorkspaceMeta();
    expect(meta.id).toBe(DEMO_WORKSPACE_ID);
    expect(meta.path).toBe(DEMO_WORKSPACE_PATH);
    expect(meta.name).toBe(DEMO_WORKSPACE_NAME_MARKER);
    expect(meta.type).toBe('node');
    expect(meta.status).toBe('ready');
  });

  it('builds a pinned, available RecentWorkspaceEntry', () => {
    const entry = buildDemoRecentEntry();
    expect(entry.id).toBe(DEMO_WORKSPACE_ID);
    expect(entry.isPinned).toBe(true);
    expect(entry.pinnedOrder).toBe(0);
    expect(entry.available).toBe(true);
    expect(entry.removedFromSidebar).toBe(false);
    expect(entry.hiddenFromRightPanels).toBe(false);
  });

  it('builds a tree containing virtual documents', () => {
    const tree = buildDemoTree();
    const names = tree.map((node) => node.name);
    expect(names).toContain('frontend');
    expect(names).toContain('README.md');
  });

  it('builds a git snapshot with unstaged changes', () => {
    const snapshot = buildDemoGitSnapshot();
    expect(snapshot.isRepo).toBe(true);
    expect(snapshot.branch).toBe('main');
    expect(snapshot.unstaged).toContain('frontend/src/main.tsx');
  });

  it('builds a change preview for a document', () => {
    const preview = buildDemoChangePreview('frontend/src/main.tsx');
    expect(preview.changeKind).toBe('modified');
    expect(preview.currentContent).toContain('createRoot');
  });

  it('returns a patch set for the complete demo session run', () => {
    const patchSet = getDemoPatchSet('patchset-demo-complete');
    expect(patchSet?.id).toBe('patchset-demo-complete');
    expect(patchSet?.filePatches[0]?.relativePath).toBe('frontend/src/main.tsx');
  });

  it('returns undefined for unknown patch set ids', () => {
    expect(getDemoPatchSet('nope')).toBeUndefined();
  });

  it('builds a new patch set scoped to a session', () => {
    const ps = buildDemoPatchSet(DEMO_SESSION_IDS.complete, 'run-demo-1');
    expect(ps.sessionId).toBe(DEMO_SESSION_IDS.complete);
    expect(ps.runId).toBe('run-demo-1');
    expect(ps.filePatches.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/mock/demo/demo-workspace.test.ts`
Expected: FAIL — module 不存在。

- [ ] **Step 3: Write minimal implementation**

`src/mock/demo/demo-workspace.ts`：

```ts
import type {
  GitSnapshot,
  PatchSet,
  RecentWorkspaceEntry,
  WorkspaceChangePreview,
  WorkspaceMeta,
  WorkspaceTreeNode,
} from '@ai-digital-life/kernel';
import {
  DEMO_DOCUMENTS,
  DEMO_NOW,
  DEMO_WORKSPACE_ID,
  DEMO_WORKSPACE_NAME_MARKER,
  DEMO_WORKSPACE_PATH,
} from './demo-constants';

function demoNode(path: string): WorkspaceTreeNode {
  const name = path.split('/').pop() ?? path;
  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : undefined;
  return { path, name, kind: 'file', children: [], parent };
}

export function buildDemoTree(): WorkspaceTreeNode[] {
  const docs = Object.keys(DEMO_DOCUMENTS);
  const files = docs.map(demoNode);
  const dirSet = new Set<string>();
  for (const doc of docs) {
    const parts = doc.split('/');
    let acc = '';
    for (let i = 0; i < parts.length - 1; i += 1) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      dirSet.add(acc);
    }
  }
  const dirs = [...dirSet].sort().map((path) => {
    const name = path.split('/').pop() ?? path;
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : undefined;
    return { path, name, kind: 'directory', children: [], parent };
  });
  return [...dirs, ...files].sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1,
  );
}

export function buildDemoWorkspaceMeta(): WorkspaceMeta {
  return {
    id: DEMO_WORKSPACE_ID,
    path: DEMO_WORKSPACE_PATH,
    rootPath: DEMO_WORKSPACE_PATH,
    name: DEMO_WORKSPACE_NAME_MARKER,
    type: 'node',
    status: 'ready',
    createdAt: DEMO_NOW - 60_000,
    updatedAt: DEMO_NOW,
    lastOpenedAt: DEMO_NOW,
    gitSnapshot: buildDemoGitSnapshot(),
  };
}

export function buildDemoRecentEntry(): RecentWorkspaceEntry {
  return {
    id: DEMO_WORKSPACE_ID,
    path: DEMO_WORKSPACE_PATH,
    rootPath: DEMO_WORKSPACE_PATH,
    name: DEMO_WORKSPACE_NAME_MARKER,
    lastOpenedAt: DEMO_NOW,
    isPinned: true,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
    hiddenFromRightPanels: false,
  };
}

export function buildDemoGitSnapshot(): GitSnapshot {
  return {
    isRepo: true,
    branch: 'main',
    head: 'abc1234',
    staged: [],
    unstaged: ['frontend/src/main.tsx', 'README.md'],
    untracked: [],
    conflicts: [],
    capturedAt: DEMO_NOW,
  };
}

export function buildDemoChangePreview(relativePath: string): WorkspaceChangePreview {
  const currentContent = DEMO_DOCUMENTS[relativePath] ?? '';
  const isModified = relativePath === 'frontend/src/main.tsx';
  return {
    path: relativePath,
    changeKind: currentContent ? 'modified' : 'added',
    status: isModified ? 'modified' : 'untracked',
    baseExists: isModified,
    currentExists: Boolean(currentContent),
    baseContent: isModified ? `import { App } from './app/App';\n// (old)\n` : '',
    currentContent,
  };
}

function demoPatchSet(sessionId: string, runId: string): PatchSet {
  const relativePath = 'frontend/src/main.tsx';
  const before = DEMO_DOCUMENTS[relativePath] ?? '';
  const after = `// AI Digital Life\n${before}`;
  return {
    id: `patchset-demo-${runId}`,
    workspaceId: DEMO_WORKSPACE_ID,
    sessionId,
    runId,
    title: `Update ${relativePath}`,
    summary: '在 main.tsx 顶部加入项目说明注释。',
    status: 'ready',
    createdAt: DEMO_NOW,
    updatedAt: DEMO_NOW,
    filePatches: [
      {
        id: `filepatch-demo-${runId}`,
        patchSetId: `patchset-demo-${runId}`,
        relativePath,
        beforeContent: before,
        afterContent: after,
        hunks: [
          {
            id: `hunk-demo-${runId}`,
            filePatchId: `filepatch-demo-${runId}`,
            patchSetId: `patchset-demo-${runId}`,
            relativePath,
            oldStart: 1,
            oldLines: before.split(/\r?\n/).length,
            newStart: 1,
            newLines: after.split(/\r?\n/).length,
            preview: 'Add project note to main.tsx',
            beforeText: before,
            afterText: after,
            decision: 'accepted',
          },
        ],
      },
    ],
  };
}

export function buildDemoPatchSet(sessionId: string, runId: string): PatchSet {
  return demoPatchSet(sessionId, runId);
}

export function getDemoPatchSet(patchSetId: string): PatchSet | undefined {
  if (patchSetId === 'patchset-demo-complete') {
    return demoPatchSet('demo-session-complete', 'complete');
  }
  if (patchSetId === 'patchset-demo-plan') {
    return demoPatchSet('demo-session-plan', 'plan');
  }
  return undefined;
}
```

> 说明：`WorkspaceTreeNode` 若实际类型不含 `parent` 字段，从 `patchSet.filePatches[0]` 相关字段照抄相邻 mock（`buildWorkspaceTreeFromPaths`）去掉 `parent`。以 `npx tsc --noEmit` 报错为准调整。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/mock/demo/demo-workspace.test.ts`
Expected: PASS。

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors（若 `WorkspaceTreeNode` 无 `parent`，按 Step 3 说明调整）。

- [ ] **Step 6: Commit**

```bash
git add src/mock/demo/demo-workspace.ts src/mock/demo/demo-workspace.test.ts
git commit -m "feat(demo): add demo workspace data"
```

---

### Task 4: demo-run-activity 数据（每个 runId 的活动事件 + token 用量）

**Files:**
- Create: `src/mock/demo/demo-run-activity.ts`
- Test: `src/mock/demo/demo-run-activity.test.ts`

**Interfaces:**
- Consumes: Task 2 `DEMO_SESSION_IDS`、`DEMO_NOW`。
- Produces（供 Task 6 包装器与 Task 5 模拟器使用）:
  - `export const DEMO_RUN_ACTIVITY: Record<string, DigitalLifeRunActivityEventV1[]>`（key = runId）
  - `export function getDemoRunActivity(runId: string, limit?: number): DigitalLifeRunActivityEventV1[]`
  - `export function appendLiveRunActivity(runId: string, event: DigitalLifeRunActivityEventV1): void`（流式模拟时追加实时事件）
  - `export function resetLiveRunActivity(): void`（测试用）

- [ ] **Step 1: Write the failing test**

`src/mock/demo/demo-run-activity.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDemoRunActivity,
  appendLiveRunActivity,
  resetLiveRunActivity,
} from './demo-run-activity';
import { DEMO_SESSION_IDS } from './demo-constants';

describe('demo-run-activity', () => {
  beforeEach(() => {
    resetLiveRunActivity();
  });

  it('covers every activity event type across all static runs', () => {
    const allEvents = Object.values(getAllStaticRunIds()).flatMap((runId) =>
      getDemoRunActivity(runId),
    );
    const types = new Set(allEvents.map((e) => e.type));
    for (const expected of [
      'run-start',
      'context-added',
      'file-read',
      'search',
      'command',
      'patch',
      'approval',
      'model',
      'error',
      'run-done',
    ]) {
      expect(types.has(expected as never)).toBe(true);
    }
  });

  it('returns an empty array for an unknown runId', () => {
    expect(getDemoRunActivity('run-unknown')).toEqual([]);
  });

  it('respects the limit parameter', () => {
    const runId = DEMO_RUN_IDS.complete;
    const events = getDemoRunActivity(runId, 2);
    expect(events.length).toBeLessThanOrEqual(2);
  });

  it('appends live events to a run and returns them', () => {
    const runId = 'run-demo-live-1';
    appendLiveRunActivity(runId, { v: 1, runId, seq: 1, ts: Date.now(), type: 'run-start', scenario: 'chat' });
    appendLiveRunActivity(runId, { v: 1, runId, seq: 2, ts: Date.now(), type: 'run-done', status: 'succeeded' });
    expect(getDemoRunActivity(runId).length).toBe(2);
    resetLiveRunActivity();
    expect(getDemoRunActivity(runId).length).toBe(0);
  });

  it('provides run ids for all three demo sessions', () => {
    expect(DEMO_RUN_IDS.complete).toBeTruthy();
    expect(DEMO_RUN_IDS.plan).toBeTruthy();
    expect(DEMO_RUN_IDS.tools).toBeTruthy();
  });
});

// 供测试取值的导出（从模块读取）
import { DEMO_RUN_IDS, getAllStaticRunIds } from './demo-run-activity';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/mock/demo/demo-run-activity.test.ts`
Expected: FAIL — module 不存在。

- [ ] **Step 3: Write minimal implementation**

`src/mock/demo/demo-run-activity.ts`：

```ts
import type { DigitalLifeRunActivityEventV1 } from '@ai-digital-life/kernel';
import { DEMO_NOW, DEMO_SESSION_IDS } from './demo-constants';

export const DEMO_RUN_IDS = {
  complete: 'run-demo-complete',
  plan: 'run-demo-plan',
  tools: 'run-demo-tools',
} as const;

const completeEvents: DigitalLifeRunActivityEventV1[] = [
  { v: 1, runId: DEMO_RUN_IDS.complete, seq: 1, ts: DEMO_NOW - 50_000, type: 'run-start', scenario: 'code-edit' },
  { v: 1, runId: DEMO_RUN_IDS.complete, seq: 2, ts: DEMO_NOW - 49_000, type: 'context-added', contextType: 'file', label: 'frontend/src/main.tsx', path: 'frontend/src/main.tsx', tokenEstimate: 320 },
  { v: 1, runId: DEMO_RUN_IDS.complete, seq: 3, ts: DEMO_NOW - 48_000, type: 'context-added', contextType: 'file', label: 'README.md', path: 'README.md', tokenEstimate: 80 },
  { v: 1, runId: DEMO_RUN_IDS.complete, seq: 4, ts: DEMO_NOW - 47_000, type: 'file-read', path: 'frontend/src/main.tsx', bytes: 512, tokenEstimate: 300, truncated: false },
  { v: 1, runId: DEMO_RUN_IDS.complete, seq: 5, ts: DEMO_NOW - 45_000, type: 'search', query: 'createRoot', hitCount: 3, samplePaths: ['frontend/src/main.tsx', 'frontend/src/app/App.tsx'] },
  { v: 1, runId: DEMO_RUN_IDS.complete, seq: 6, ts: DEMO_NOW - 42_000, type: 'model', phase: 'route', providerId: 'deepseek', modelId: 'deepseek-chat', reason: 'code-edit 场景路由' },
  { v: 1, runId: DEMO_RUN_IDS.complete, seq: 7, ts: DEMO_NOW - 38_000, type: 'command', phase: 'start', command: 'npm', args: ['run', 'lint'] },
  { v: 1, runId: DEMO_RUN_IDS.complete, seq: 8, ts: DEMO_NOW - 37_000, type: 'command', phase: 'done', command: 'npm', args: ['run', 'lint'], exitCode: 0 },
  { v: 1, runId: DEMO_RUN_IDS.complete, seq: 9, ts: DEMO_NOW - 30_000, type: 'patch', phase: 'proposed', patchSetId: 'patchset-demo-complete', fileCount: 1, hunkCount: 1 },
  { v: 1, runId: DEMO_RUN_IDS.complete, seq: 10, ts: DEMO_NOW - 25_000, type: 'patch', phase: 'applied', patchSetId: 'patchset-demo-complete', fileCount: 1, hunkCount: 1 },
  { v: 1, runId: DEMO_RUN_IDS.complete, seq: 11, ts: DEMO_NOW - 20_000, type: 'model', phase: 'done', providerId: 'deepseek', modelId: 'deepseek-chat', usage: { promptTokens: 1200, completionTokens: 480, totalTokens: 1680 } },
  { v: 1, runId: DEMO_RUN_IDS.complete, seq: 12, ts: DEMO_NOW - 15_000, type: 'run-done', status: 'succeeded' },
];

const planEvents: DigitalLifeRunActivityEventV1[] = [
  { v: 1, runId: DEMO_RUN_IDS.plan, seq: 1, ts: DEMO_NOW - 90_000, type: 'run-start', scenario: 'plan' },
  { v: 1, runId: DEMO_RUN_IDS.plan, seq: 2, ts: DEMO_NOW - 89_000, type: 'context-added', contextType: 'file', label: 'frontend/src/app/App.tsx', path: 'frontend/src/app/App.tsx', tokenEstimate: 150 },
  { v: 1, runId: DEMO_RUN_IDS.plan, seq: 3, ts: DEMO_NOW - 80_000, type: 'model', phase: 'route', providerId: 'minimax', modelId: 'MiniMax-M2.7', reason: 'plan 场景路由' },
  { v: 1, runId: DEMO_RUN_IDS.plan, seq: 4, ts: DEMO_NOW - 70_000, type: 'patch', phase: 'proposed', patchSetId: 'patchset-demo-plan', fileCount: 1, hunkCount: 1 },
  { v: 1, runId: DEMO_RUN_IDS.plan, seq: 5, ts: DEMO_NOW - 68_000, type: 'approval', phase: 'requested', approvalId: 'approval-demo-plan-1' },
  { v: 1, runId: DEMO_RUN_IDS.plan, seq: 6, ts: DEMO_NOW - 65_000, type: 'approval', phase: 'decided', approvalId: 'approval-demo-plan-1', decision: 'rejected', reason: '用户希望先调整方案' },
  { v: 1, runId: DEMO_RUN_IDS.plan, seq: 7, ts: DEMO_NOW - 60_000, type: 'error', message: '未获得审批，回滚所有变更' },
  { v: 1, runId: DEMO_RUN_IDS.plan, seq: 8, ts: DEMO_NOW - 55_000, type: 'patch', phase: 'rolled-back', patchSetId: 'patchset-demo-plan', fileCount: 1, hunkCount: 1 },
  { v: 1, runId: DEMO_RUN_IDS.plan, seq: 9, ts: DEMO_NOW - 50_000, type: 'model', phase: 'done', providerId: 'minimax', modelId: 'MiniMax-M2.7', usage: { promptTokens: 900, completionTokens: 150, totalTokens: 1050 } },
  { v: 1, runId: DEMO_RUN_IDS.plan, seq: 10, ts: DEMO_NOW - 45_000, type: 'run-done', status: 'rolled-back' },
];

const toolsEvents: DigitalLifeRunActivityEventV1[] = [
  { v: 1, runId: DEMO_RUN_IDS.tools, seq: 1, ts: DEMO_NOW - 30_000, type: 'run-start', scenario: 'chat' },
  { v: 1, runId: DEMO_RUN_IDS.tools, seq: 2, ts: DEMO_NOW - 29_000, type: 'context-added', contextType: 'search-hit', label: 'Rust 异步编程最佳实践', tokenEstimate: 60 },
  { v: 1, runId: DEMO_RUN_IDS.tools, seq: 3, ts: DEMO_NOW - 27_000, type: 'search', query: 'rust async best practices', hitCount: 3, samplePaths: ['docs/async.md'] },
  { v: 1, runId: DEMO_RUN_IDS.tools, seq: 4, ts: DEMO_NOW - 25_000, type: 'model', phase: 'route', providerId: 'deepseek', modelId: 'deepseek-chat', reason: 'chat 场景路由' },
  { v: 1, runId: DEMO_RUN_IDS.tools, seq: 5, ts: DEMO_NOW - 20_000, type: 'command', phase: 'start', command: 'git', args: ['status'] },
  { v: 1, runId: DEMO_RUN_IDS.tools, seq: 6, ts: DEMO_NOW - 19_000, type: 'command', phase: 'done', command: 'git', args: ['status'], exitCode: 0 },
  { v: 1, runId: DEMO_RUN_IDS.tools, seq: 7, ts: DEMO_NOW - 10_000, type: 'model', phase: 'done', providerId: 'deepseek', modelId: 'deepseek-chat', usage: { promptTokens: 700, completionTokens: 320, totalTokens: 1020 } },
  { v: 1, runId: DEMO_RUN_IDS.tools, seq: 8, ts: DEMO_NOW - 5_000, type: 'run-done', status: 'succeeded' },
];

export const DEMO_RUN_ACTIVITY: Record<string, DigitalLifeRunActivityEventV1[]> = {
  [DEMO_RUN_IDS.complete]: completeEvents,
  [DEMO_RUN_IDS.plan]: planEvents,
  [DEMO_RUN_IDS.tools]: toolsEvents,
};

export function getAllStaticRunIds(): string[] {
  return Object.keys(DEMO_RUN_ACTIVITY);
}

const liveEvents = new Map<string, DigitalLifeRunActivityEventV1[]>();

export function appendLiveRunActivity(runId: string, event: DigitalLifeRunActivityEventV1): void {
  const list = liveEvents.get(runId) ?? [];
  list.push(event);
  liveEvents.set(runId, list);
}

export function resetLiveRunActivity(): void {
  liveEvents.clear();
}

export function getDemoRunActivity(
  runId: string,
  limit?: number,
): DigitalLifeRunActivityEventV1[] {
  const staticList = DEMO_RUN_ACTIVITY[runId] ?? [];
  const liveList = liveEvents.get(runId) ?? [];
  const merged = [...staticList, ...liveList].sort((a, b) => a.seq - b.seq);
  return typeof limit === 'number' ? merged.slice(0, limit) : merged;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/mock/demo/demo-run-activity.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/mock/demo/demo-run-activity.ts src/mock/demo/demo-run-activity.test.ts
git commit -m "feat(demo): add demo run activity events"
```

---

### Task 5: demo-conversation 数据（3 个演示会话 + 全覆盖 block 类型）

**Files:**
- Create: `src/mock/demo/demo-conversation.ts`
- Test: `src/mock/demo/demo-conversation.test.ts`

**Interfaces:**
- Consumes: Task 2 常量、Task 3 `buildDemoPatchSet`。
- Produces（供 Task 6 与 Task 5 模拟器使用）:
  - `export function getDemoSessions(): ConversationSessionRecord[]`
  - `export function getDemoSessionDetail(sessionId: string): ConversationDetail | undefined`
  - `export function appendDemoUserMessage(sessionId: string, content: string): void`
  - `export function appendDemoAssistantMessage(sessionId: string, message: ConversationMessageRecord): void`
  - `export function getDemoRunDetail(runId: string): AgentRunDetail | undefined`
  - `export function buildDemoSendResult(sessionId: string, content: string): ConversationSendResult`
  - `export function resetDemoConversation(): void`（测试用，恢复初始数据）

- [ ] **Step 1: Write the failing test**

`src/mock/demo/demo-conversation.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDemoSessions,
  getDemoSessionDetail,
  resetDemoConversation,
} from './demo-conversation';
import { DEMO_SESSION_IDS } from './demo-constants';

const ALL_BLOCK_TYPES = [
  'markdown',
  'plan',
  'tool-call',
  'approval',
  'patch-summary',
  'validation-result',
  'final-summary',
  'execution-step',
  'execution-summary',
  'command-output',
] as const;

describe('demo-conversation', () => {
  beforeEach(() => {
    resetDemoConversation();
  });

  it('provides three demo sessions', () => {
    expect(getDemoSessions().map((s) => s.id).sort()).toEqual(
      Object.values(DEMO_SESSION_IDS).sort(),
    );
  });

  it('covers every conversation block type across all messages', () => {
    const seen = new Set<string>();
    for (const sessionId of Object.values(DEMO_SESSION_IDS)) {
      const detail = getDemoSessionDetail(sessionId);
      for (const message of detail?.messages ?? []) {
        for (const block of message.blocks) {
          seen.add(block.type);
        }
      }
    }
    for (const type of ALL_BLOCK_TYPES) {
      expect(seen.has(type)).toBe(true);
    }
  });

  it('assigns a runId to every assistant message', () => {
    for (const sessionId of Object.values(DEMO_SESSION_IDS)) {
      const detail = getDemoSessionDetail(sessionId);
      for (const message of detail?.messages ?? []) {
        if (message.role === 'assistant') {
          expect(message.runId).toBeTruthy();
        }
      }
    }
  });

  it('returns a patch-set reference on the complete session', () => {
    const detail = getDemoSessionDetail(DEMO_SESSION_IDS.complete);
    const hasPatchSummary = (detail?.messages ?? []).some((m) =>
      m.blocks.some((b) => b.type === 'patch-summary'),
    );
    expect(hasPatchSummary).toBe(true);
  });

  it('returns undefined for an unknown session', () => {
    expect(getDemoSessionDetail('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/mock/demo/demo-conversation.test.ts`
Expected: FAIL — module 不存在。

- [ ] **Step 3: Write minimal implementation**

`src/mock/demo/demo-conversation.ts`（内容较长，一次性完整给出）：

```ts
import type {
  AgentRunDetail,
  ConversationDetail,
  ConversationMessageRecord,
  ConversationSendResult,
  ConversationSessionRecord,
  ExecutionStepConversationBlock,
} from '@ai-digital-life/kernel';
import {
  DEMO_NOW,
  DEMO_SESSION_IDS,
  DEMO_SESSION_TITLE_MARKERS,
  DEMO_WORKSPACE_ID,
} from './demo-constants';
import { buildDemoPatchSet, getDemoPatchSet } from './demo-workspace';
import { DEMO_RUN_IDS } from './demo-run-activity';

function session(id: string, title: string, order: number): ConversationSessionRecord {
  return {
    id,
    workspaceId: DEMO_WORKSPACE_ID,
    title,
    status: 'active',
    isPinned: true,
    pinnedOrder: order,
    unpinnedOrder: 0,
    manualUnread: false,
    lastReadAt: DEMO_NOW,
    archivedAt: undefined,
    titleUpdatedAt: DEMO_NOW,
    createdAt: DEMO_NOW - 120_000,
    updatedAt: DEMO_NOW,
    lastMessageAt: DEMO_NOW,
  };
}

function msg(
  id: string,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  blocks: ConversationMessageRecord['blocks'],
  runId?: string,
  createdAt?: number,
): ConversationMessageRecord {
  return { id, sessionId, role, content, blocks, runId, createdAt: createdAt ?? DEMO_NOW };
}

// ── 综合演示：单 Agent 代码修改流程 ──────────────────────────
const completeSession = session(DEMO_SESSION_IDS.complete, DEMO_SESSION_TITLE_MARKERS.complete, 0);

const completeMessages: ConversationMessageRecord[] = [
  msg(
    'demo-msg-complete-user',
    completeSession.id,
    'user',
    '请帮我在 main.tsx 顶部加入项目说明注释，并运行 lint 验证。',
    [],
    undefined,
    DEMO_NOW - 60_000,
  ),
  msg(
    'demo-msg-complete-assistant',
    completeSession.id,
    'assistant',
    '已生成计划并完成修改。',
    [
      { id: 'demo-block-complete-plan', type: 'plan', title: '代码修改执行计划', items: [
        { id: 'plan-step-analyze', title: '分析入口文件', detail: '识别 main.tsx 结构', status: 'completed' },
        { id: 'plan-step-search', title: '检索 createRoot 引用', status: 'completed' },
        { id: 'plan-step-read', title: '读取目标文件', status: 'completed' },
        { id: 'plan-step-edit', title: '添加注释', detail: '在顶部插入说明', status: 'completed' },
        { id: 'plan-step-command', title: '运行 lint', status: 'completed' },
        { id: 'plan-step-verify', title: '验证通过', status: 'completed' },
      ] },
      { id: 'demo-block-complete-tool1', type: 'tool-call', toolName: 'webSearch', summary: '搜索 createRoot 用法', status: 'completed' },
      { id: 'demo-block-complete-tool2', type: 'tool-call', toolName: 'webFetch', summary: '获取 React 官方文档', status: 'completed' },
      { id: 'demo-block-complete-tool3', type: 'tool-call', toolName: 'readFile', summary: '读取 frontend/src/main.tsx', status: 'completed' },
      {
        id: 'demo-block-complete-step1', type: 'execution-step', stepId: 'demo-step-1',
        title: '读取入口文件', stepType: 'read', status: 'completed', summary: '读取 512 字节', riskLevel: 'low',
        toolCalls: [{ id: 'demo-tool-read', toolName: 'readFile', inputSummary: 'main.tsx', outputSummary: '512 bytes', status: 'completed' }],
      },
      {
        id: 'demo-block-complete-step2', type: 'execution-step', stepId: 'demo-step-2',
        title: '修改文件', stepType: 'edit', status: 'completed', summary: '插入 1 行注释', riskLevel: 'medium',
        toolCalls: [{ id: 'demo-tool-edit', toolName: 'editFile', inputSummary: '顶部插入注释', status: 'completed' }],
      },
      {
        id: 'demo-block-complete-step3', type: 'execution-step', stepId: 'demo-step-3',
        title: '运行 lint', stepType: 'command', status: 'completed', summary: 'exit 0', riskLevel: 'high',
        toolCalls: [{ id: 'demo-tool-lint', toolName: 'command', inputSummary: 'npm run lint', outputSummary: '0 errors', status: 'completed' }],
      },
      {
        id: 'demo-block-complete-step4', type: 'execution-step', stepId: 'demo-step-4',
        title: '验证构建', stepType: 'verify', status: 'failed', summary: 'tsc 报错', error: 'TS6133: 未使用变量',
        toolCalls: [{ id: 'demo-tool-tsc', toolName: 'command', inputSummary: 'npx tsc --noEmit', outputSummary: '1 error', status: 'failed' }],
      },
      { id: 'demo-block-complete-cmd1', type: 'command-output', command: 'npm', args: ['run', 'lint'], exitCode: 0, stdout: 'All files pass lint.\n', stderr: '', truncated: false },
      { id: 'demo-block-complete-cmd2', type: 'command-output', command: 'npx', args: ['tsc', '--noEmit'], exitCode: 1, stdout: '', stderr: 'error TS6133: "foo" is declared but never read.\n', truncated: false },
      { id: 'demo-block-complete-patch', type: 'patch-summary', patchSetId: 'patchset-demo-complete', summary: '在 main.tsx 顶部加入项目说明注释。', fileCount: 1, hunkCount: 1 },
      {
        id: 'demo-block-complete-validation', type: 'validation-result', summary: '类型检查 2 项，1 项未通过', status: 'failed',
        diagnostics: [
          { id: 'diag-1', source: 'typescript', severity: 'error', message: '"foo" 声明后未使用', path: 'frontend/src/main.tsx', line: 2, column: 5 },
          { id: 'diag-2', source: 'eslint', severity: 'warning', message: '建议使用 const', path: 'frontend/src/main.tsx', line: 5 },
        ],
      },
      {
        id: 'demo-block-complete-exec-summary', type: 'execution-summary', status: 'succeeded',
        filesModified: ['frontend/src/main.tsx'],
        commandsExecuted: ['npm run lint', 'npx tsc --noEmit'],
        validationPassed: 1,
        validationFailed: 0,
        tokenUsage: { promptTokens: 1200, completionTokens: 480, totalTokens: 1680 },
      },
      { id: 'demo-block-complete-final', type: 'final-summary', summary: '已完成 main.tsx 的注释添加，lint 通过，构建验证成功。' },
    ],
    DEMO_RUN_IDS.complete,
    DEMO_NOW - 55_000,
  ),
];

// ── 计划与审批：plan 场景 + 审批流 ──────────────────────────
const planSession = session(DEMO_SESSION_IDS.plan, DEMO_SESSION_TITLE_MARKERS.plan, 1);

const planMessages: ConversationMessageRecord[] = [
  msg(
    'demo-msg-plan-user',
    planSession.id,
    'user',
    '规划一个重构方案：把 App.tsx 的渲染逻辑拆分到独立组件。',
    [],
    undefined,
    DEMO_NOW - 95_000,
  ),
  msg(
    'demo-msg-plan-assistant',
    planSession.id,
    'assistant',
    '方案已规划，但审批被拒绝，已回滚。',
    [
      { id: 'demo-block-plan-plan', type: 'plan', title: '重构执行计划', items: [
        { id: 'plan-p-analyze', title: '分析渲染逻辑', status: 'pending' },
        { id: 'plan-p-search', title: '定位依赖', status: 'pending' },
        { id: 'plan-p-read', title: '读取 App.tsx', status: 'completed' },
        { id: 'plan-p-edit', title: '拆分为 Header/Footer', status: 'pending' },
        { id: 'plan-p-command', title: '运行测试', status: 'pending' },
        { id: 'plan-p-verify', title: '验收', status: 'pending' },
      ] },
      { id: 'demo-block-plan-approval-low', type: 'approval', title: '创建 Header 组件', riskLevel: 'low', summary: '新增组件文件，可逆。' },
      { id: 'demo-block-plan-approval-medium', type: 'approval', title: '修改 App.tsx 引入方式', riskLevel: 'medium', summary: '改动公共入口，影响面中等。' },
      { id: 'demo-block-plan-approval-high', type: 'approval', title: '删除旧渲染函数', riskLevel: 'high', summary: '删除代码不可恢复，需审批。' },
      {
        id: 'demo-block-plan-validation', type: 'validation-result', summary: '重构校验失败：旧渲染函数仍被引用', status: 'failed',
        diagnostics: [
          { id: 'diag-plan-1', source: 'typescript', severity: 'error', message: '找不到旧渲染函数', path: 'frontend/src/app/App.tsx', line: 12 },
        ],
      },
      {
        id: 'demo-block-plan-exec-summary', type: 'execution-summary', status: 'rolled-back',
        filesModified: [],
        commandsExecuted: [],
        rollbackReason: '审批被拒绝，所有变更已回滚。',
        tokenUsage: { promptTokens: 900, completionTokens: 150, totalTokens: 1050 },
      },
      { id: 'demo-block-plan-final', type: 'final-summary', summary: '重构未执行：用户拒绝了高风险审批。' },
    ],
    DEMO_RUN_IDS.plan,
    DEMO_NOW - 90_000,
  ),
];

// ── 搜索与工具：chat 场景 + 网络搜索 ─────────────────────────
const toolsSession = session(DEMO_SESSION_IDS.tools, DEMO_SESSION_TITLE_MARKERS.tools, 2);

const toolsMessages: ConversationMessageRecord[] = [
  msg(
    'demo-msg-tools-user',
    toolsSession.id,
    'user',
    '请搜索 Rust 异步编程的最佳实践，并检查当前 git 状态。',
    [],
    undefined,
    DEMO_NOW - 35_000,
  ),
  msg(
    'demo-msg-tools-assistant',
    toolsSession.id,
    'assistant',
    '已汇总搜索结果为 markdown 答复。',
    [
      { id: 'demo-block-tools-md', type: 'markdown', text: '## Rust 异步最佳实践\n\n- 优先使用 tokio。\n- 避免阻塞调用。\n- 合理拆分任务。' },
      { id: 'demo-block-tools-tool1', type: 'tool-call', toolName: 'webSearch', summary: 'rust async best practices，命中 3 条', status: 'completed' },
      { id: 'demo-block-tools-cmd', type: 'command-output', command: 'git', args: ['status'], exitCode: 0, stdout: 'On branch main\nChanges not staged:\n  frontend/src/main.tsx\n', stderr: '', truncated: false },
      {
        id: 'demo-block-tools-validation', type: 'validation-result', summary: '验证工具输出', status: 'passed',
        diagnostics: [],
      },
      {
        id: 'demo-block-tools-exec-summary', type: 'execution-summary', status: 'succeeded',
        filesModified: [],
        commandsExecuted: ['git status'],
        validationPassed: 1,
        validationFailed: 0,
        tokenUsage: { promptTokens: 700, completionTokens: 320, totalTokens: 1020 },
      },
    ],
    DEMO_RUN_IDS.tools,
    DEMO_NOW - 30_000,
  ),
];

const messagesBySession = new Map<string, ConversationMessageRecord[]>([
  [completeSession.id, completeMessages],
  [planSession.id, planMessages],
  [toolsSession.id, toolsMessages],
]);

const demoSessions = [completeSession, planSession, toolsSession];

const demoRunDetails = new Map<string, AgentRunDetail>([
  [
    DEMO_RUN_IDS.complete,
    {
      run: {
        id: DEMO_RUN_IDS.complete,
        workspaceId: DEMO_WORKSPACE_ID,
        sessionId: completeSession.id,
        prompt: completeMessages[0].content,
        scenario: 'code-edit',
        status: 'succeeded',
        summary: '已完成注释添加与验证。',
        patchSetId: 'patchset-demo-complete',
        createdAt: DEMO_NOW - 60_000,
        updatedAt: DEMO_NOW - 55_000,
        completedAt: DEMO_NOW - 54_000,
      },
      steps: [
        { id: 'plan-step-analyze', runId: DEMO_RUN_IDS.complete, title: '分析入口文件', status: 'completed', createdAt: DEMO_NOW - 59_000, updatedAt: DEMO_NOW - 58_000 },
        { id: 'plan-step-edit', runId: DEMO_RUN_IDS.complete, title: '添加注释', status: 'completed', createdAt: DEMO_NOW - 57_000, updatedAt: DEMO_NOW - 56_000 },
      ],
    },
  ],
  [
    DEMO_RUN_IDS.plan,
    {
      run: {
        id: DEMO_RUN_IDS.plan,
        workspaceId: DEMO_WORKSPACE_ID,
        sessionId: planSession.id,
        prompt: planMessages[0].content,
        scenario: 'plan',
        status: 'rolled-back',
        summary: '审批被拒绝，已回滚。',
        patchSetId: 'patchset-demo-plan',
        createdAt: DEMO_NOW - 95_000,
        updatedAt: DEMO_NOW - 90_000,
        completedAt: DEMO_NOW - 89_000,
      },
      steps: [
        { id: 'plan-p-read', runId: DEMO_RUN_IDS.plan, title: '读取 App.tsx', status: 'completed', createdAt: DEMO_NOW - 92_000, updatedAt: DEMO_NOW - 91_000 },
        { id: 'plan-p-edit', runId: DEMO_RUN_IDS.plan, title: '拆分为组件', status: 'failed', createdAt: DEMO_NOW - 91_000, updatedAt: DEMO_NOW - 90_000 },
      ],
    },
  ],
  [
    DEMO_RUN_IDS.tools,
    {
      run: {
        id: DEMO_RUN_IDS.tools,
        workspaceId: DEMO_WORKSPACE_ID,
        sessionId: toolsSession.id,
        prompt: toolsMessages[0].content,
        scenario: 'chat',
        status: 'succeeded',
        summary: '已完成搜索并给出答复。',
        createdAt: DEMO_NOW - 35_000,
        updatedAt: DEMO_NOW - 30_000,
        completedAt: DEMO_NOW - 29_000,
      },
      steps: [],
    },
  ],
]);

export function getDemoSessions(): ConversationSessionRecord[] {
  return demoSessions;
}

export function getDemoSessionDetail(sessionId: string): ConversationDetail | undefined {
  const session = demoSessions.find((s) => s.id === sessionId);
  if (!session) {
    return undefined;
  }
  return { session, messages: messagesBySession.get(sessionId) ?? [] };
}

export function getDemoRunDetail(runId: string): AgentRunDetail | undefined {
  return demoRunDetails.get(runId);
}

export function appendDemoUserMessage(sessionId: string, content: string): void {
  const list = messagesBySession.get(sessionId);
  if (!list) {
    return;
  }
  const message = msg(`demo-msg-user-${Date.now()}`, sessionId, 'user', content, []);
  list.push(message);
  messagesBySession.set(sessionId, list);
  const session = demoSessions.find((s) => s.id === sessionId);
  if (session) {
    session.updatedAt = Date.now();
    session.lastMessageAt = Date.now();
    session.manualUnread = false;
    session.lastReadAt = Date.now();
  }
}

export function appendDemoAssistantMessage(
  sessionId: string,
  message: ConversationMessageRecord,
): void {
  const list = messagesBySession.get(sessionId) ?? [];
  list.push(message);
  messagesBySession.set(sessionId, list);
  const session = demoSessions.find((s) => s.id === sessionId);
  if (session) {
    session.updatedAt = message.createdAt;
    session.lastMessageAt = message.createdAt;
    session.manualUnread = false;
    session.lastReadAt = message.createdAt;
  }
}

export function buildDemoSendResult(
  sessionId: string,
  content: string,
): ConversationSendResult {
  const session = demoSessions.find((s) => s.id === sessionId)!;
  const runId = `run-demo-${Date.now()}`;
  const userMessage: ConversationMessageRecord = {
    id: `demo-msg-user-${Date.now()}`,
    sessionId,
    role: 'user',
    content,
    blocks: [],
    createdAt: Date.now(),
  };
  const assistantMessage: ConversationMessageRecord = {
    id: `demo-msg-assistant-${Date.now()}`,
    sessionId,
    role: 'assistant',
    content: '已生成演示回复。',
    blocks: [{ id: `demo-block-md-${Date.now()}`, type: 'markdown', text: '这是流式模拟生成的演示回复。' }],
    runId,
    createdAt: Date.now(),
  };
  const runDetail: AgentRunDetail = {
    run: {
      id: runId,
      workspaceId: DEMO_WORKSPACE_ID,
      sessionId,
      prompt: content,
      scenario: 'chat',
      status: 'succeeded',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: Date.now(),
    },
    steps: [],
  };
  return {
    session,
    userMessage,
    assistantMessage,
    runDetail,
    patchSet: undefined,
  };
}

export function resetDemoConversation(): void {
  messagesBySession.clear();
  messagesBySession.set(completeSession.id, completeMessages);
  messagesBySession.set(planSession.id, planMessages);
  messagesBySession.set(toolsSession.id, toolsMessages);
}
```

> 说明：`ExecutionStepConversationBlock` 类型在本任务只是被引入以确保类型正确，实际由 `blocks` 推断；若 lint 报未使用，可删除该 import。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/mock/demo/demo-conversation.test.ts`
Expected: PASS。

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors。

- [ ] **Step 6: Commit**

```bash
git add src/mock/demo/demo-conversation.ts src/mock/demo/demo-conversation.test.ts
git commit -m "feat(demo): add demo conversation data covering all block types"
```

---

### Task 6: demo-stream-simulator 时序流式模拟器

**Files:**
- Create: `src/mock/demo/demo-stream-simulator.ts`
- Test: `src/mock/demo/demo-stream-simulator.test.ts`

**Interfaces:**
- Consumes: Task 2 常量、Task 4 `appendLiveRunActivity`、Task 5 `appendDemoUserMessage`/`appendDemoAssistantMessage`/`buildDemoSendResult`。
- Produces（供 Task 7 包装器使用）:
  - `export interface DemoStreamSimulator { sendMessage(input: { sessionId: string; content: string }): Promise<ConversationSendResult>; cancelMessage(runId: string): Promise<AgentRunDetail | undefined>; cancelActiveStream(): void; }`
  - `export function createDemoStreamSimulator(options: { emitModel: (e: DigitalLifeModelStreamEventV1) => void; emitActivity: (e: DigitalLifeRunActivityEventV1) => void; }): DemoStreamSimulator`

- [ ] **Step 1: Write the failing test**

`src/mock/demo/demo-stream-simulator.test.ts`（vitest fake timers）：

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createDemoStreamSimulator, type DemoStreamSimulator } from './demo-stream-simulator';
import type { DigitalLifeModelStreamEventV1, DigitalLifeRunActivityEventV1 } from '@ai-digital-life/kernel';
import { resetDemoConversation } from './demo-conversation';
import { resetLiveRunActivity } from './demo-run-activity';
import { DEMO_SESSION_IDS } from './demo-constants';

describe('demo-stream-simulator', () => {
  let simulator: DemoStreamSimulator;
  let modelEvents: DigitalLifeModelStreamEventV1[];
  let activityEvents: DigitalLifeRunActivityEventV1[];

  beforeEach(() => {
    resetDemoConversation();
    resetLiveRunActivity();
    vi.useFakeTimers();
    modelEvents = [];
    activityEvents = [];
    simulator = createDemoStreamSimulator({
      emitModel: (e) => modelEvents.push(e),
      emitActivity: (e) => activityEvents.push(e),
    });
  });

  afterEach(() => {
    simulator.cancelActiveStream();
    vi.useRealTimers();
  });

  it('emits a route event, then a done event, and appends the final message', async () => {
    const promise = simulator.sendMessage({
      sessionId: DEMO_SESSION_IDS.tools,
      content: '你好',
    });
    await vi.advanceTimersByTimeAsync(6000);

    const result = await promise;
    expect(result.runDetail.run.status).toBe('succeeded');
    expect(modelEvents.some((e) => e.type === 'route')).toBe(true);
    expect(modelEvents.some((e) => e.type === 'done')).toBe(true);
    expect(modelEvents.filter((e) => e.type === 'delta').length).toBeGreaterThan(0);
  });

  it('emits run-activity events in timeline order', async () => {
    const promise = simulator.sendMessage({
      sessionId: DEMO_SESSION_IDS.tools,
      content: '搜索一下',
    });
    await vi.advanceTimersByTimeAsync(6000);
    await promise;

    const types = activityEvents.map((e) => e.type);
    expect(types[0]).toBe('run-start');
    expect(types).toContain('context-added');
    expect(types).toContain('search');
    expect(types[types.length - 1]).toBe('run-done');
  });

  it('cancelActiveStream clears pending timers without appending a done event', async () => {
    const promise = simulator.sendMessage({
      sessionId: DEMO_SESSION_IDS.tools,
      content: '会被取消',
    });
    simulator.cancelActiveStream();
    await vi.advanceTimersByTimeAsync(6000);

    expect(modelEvents.some((e) => e.type === 'done')).toBe(false);
    const result = await promise;
    expect(result.runDetail.run.status).toBe('aborted');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/mock/demo/demo-stream-simulator.test.ts`
Expected: FAIL — module 不存在。

- [ ] **Step 3: Write minimal implementation**

`src/mock/demo/demo-stream-simulator.ts`：

```ts
import type {
  AgentRunDetail,
  ConversationSendResult,
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
} from '@ai-digital-life/kernel';
import { DEMO_SESSION_IDS } from './demo-constants';
import { appendLiveRunActivity } from './demo-run-activity';
import { appendDemoUserMessage, buildDemoSendResult } from './demo-conversation';

export interface DemoStreamSimulator {
  sendMessage(input: {
    sessionId: string;
    content: string;
  }): Promise<ConversationSendResult>;
  cancelMessage(runId: string): Promise<AgentRunDetail | undefined>;
  cancelActiveStream(): void;
}

interface TimerHandle {
  timer: ReturnType<typeof setTimeout>;
}

export function createDemoStreamSimulator(options: {
  emitModel: (e: DigitalLifeModelStreamEventV1) => void;
  emitActivity: (e: DigitalLifeRunActivityEventV1) => void;
}): DemoStreamSimulator {
  const { emitModel, emitActivity } = options;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const activeRunIds = new Set<string>();
  const cancelledRunIds = new Set<string>();
  let settledResolvers = new Set<(r: ConversationSendResult) => void>();

  const schedule = (ms: number, fn: () => void) => {
    const timer = window.setTimeout(() => {
      const idx = timers.indexOf(timer);
      if (idx >= 0) {
        timers.splice(idx, 1);
      }
      fn();
    }, ms);
    timers.push(timer);
  };

  const clearAll = () => {
    for (const timer of timers) {
      window.clearTimeout(timer);
    }
    timers.length = 0;
  };

  const resolveAll = (result: ConversationSendResult) => {
    for (const resolve of settledResolvers) {
      resolve(result);
    }
    settledResolvers.clear();
  };

  return {
    sendMessage: async ({ sessionId, content }) => {
      appendDemoUserMessage(sessionId, content);
      const runId = `run-demo-${Date.now()}`;
      activeRunIds.add(runId);

      const settle = (result: ConversationSendResult) => {
        activeRunIds.delete(runId);
        resolveAll(result);
        return result;
      };

      let seq = 0;
      const emitA = (e: Omit<DigitalLifeRunActivityEventV1, 'v' | 'runId' | 'seq' | 'ts'>) => {
        seq += 1;
        emitActivity({ v: 1, runId, seq, ts: Date.now(), ...e } as DigitalLifeRunActivityEventV1);
      };
      const emitM = (
        e: Omit<DigitalLifeModelStreamEventV1, 'v' | 'runId' | 'seq'>,
      ) => {
        seq += 1;
        emitModel({ v: 1, runId, seq, ...e } as DigitalLifeModelStreamEventV1);
      };

      const result = buildDemoSendResult(sessionId, content);
      const runDetail = result.runDetail;
      const finalRunId = runDetail.run.id;

      const finalize = () => {
        appendLiveRunActivity(finalRunId, { v: 1, runId: finalRunId, seq: seq + 1, ts: Date.now(), type: 'run-done', status: 'succeeded' });
        const doneMessage = { ...result.assistantMessage };
        appendDemoAssistantMessage(sessionId, doneMessage);
        return settle({ ...result, assistantMessage: doneMessage });
      };

      const abort = (runIdToAbort: string) => {
        cancelledRunIds.add(runIdToAbort);
        if (activeRunIds.has(runIdToAbort)) {
          activeRunIds.delete(runIdToAbort);
        }
      };

      return new Promise<ConversationSendResult>((resolve) => {
        settledResolvers.add(resolve);

        emitM({ type: 'route', providerId: 'deepseek', modelId: 'deepseek-chat', reason: '演示场景路由' });

        schedule(300, () => {
          if (cancelledRunIds.has(finalRunId)) {
            return;
          }
          emitA({ type: 'run-start', scenario: 'chat' });
          emitA({ type: 'context-added', contextType: 'file', label: 'README.md', path: 'README.md', tokenEstimate: 80 });
          emitA({ type: 'file-read', path: 'README.md', bytes: 64, tokenEstimate: 60 });
        });

        schedule(800, () => {
          if (cancelledRunIds.has(finalRunId)) {
            return;
          }
          emitA({ type: 'search', query: 'demo', hitCount: 3, samplePaths: ['README.md'] });
          emitM({ type: 'route', providerId: 'deepseek', modelId: 'deepseek-chat', reason: '搜索完成' });
        });

        schedule(1200, () => {
          if (cancelledRunIds.has(finalRunId)) {
            return;
          }
          emitA({ type: 'command', phase: 'start', command: 'git', args: ['status'] });
          emitA({ type: 'command', phase: 'done', command: 'git', args: ['status'], exitCode: 0 });
        });

        schedule(1600, () => {
          if (cancelledRunIds.has(finalRunId)) {
            return;
          }
          const text = '这是一个流式模拟的演示回复，用于观察逐字输出效果。';
          for (let i = 0; i < text.length; i += 1) {
            const char = text[i];
            const index = i;
            schedule(80 * index + 1600, () => {
              if (cancelledRunIds.has(finalRunId)) {
                return;
              }
              emitM({ type: 'delta', text: char });
            });
          }
        });

        const total = 1600 + 80 * 12 + 800;
        schedule(total, () => {
          if (cancelledRunIds.has(finalRunId)) {
            emitA({ type: 'run-done', status: 'aborted' });
            const abortedDetail = {
              ...runDetail,
              run: { ...runDetail.run, status: 'aborted' as const, completedAt: Date.now() },
            };
            resolveAll({
              ...result,
              runDetail: abortedDetail,
              assistantMessage: result.assistantMessage,
            });
            return;
          }
          emitM({ type: 'usage', usage: { promptTokens: 60, completionTokens: 40, totalTokens: 100 } });
          emitM({ type: 'done' });
          finalize();
        });

        schedule(999999, () => {
          /* 兜底计时器：保证 cancelActiveStream 后仍有已登记计时器可清，测试可安全推进。 */
        });
      });
    },

    cancelActiveStream: () => {
      for (const runId of activeRunIds) {
        cancelledRunIds.add(runId);
      }
      activeRunIds.clear();
      clearAll();
    },

    cancelMessage: async (runId: string) => {
      cancelledRunIds.add(runId);
      activeRunIds.delete(runId);
      clearAll();
      const base = buildDemoSendResult(DEMO_SESSION_IDS.tools, 'cancelled');
      return {
        run: { ...base.runDetail.run, id: runId, status: 'aborted' as const, completedAt: Date.now() },
        steps: [],
      };
    },
  };
}
```

> 说明：`seq` 同时用于 model 与 activity 事件计数，仅作演示用；`window.setTimeout` 在测试中由 `vi.advanceTimersByTimeAsync` 驱动。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/mock/demo/demo-stream-simulator.test.ts`
Expected: PASS（若 `emitA` 类型断言报错，将 `run-done` 的 `status` 显式按 `as const` 断言）。

- [ ] **Step 5: Commit**

```bash
git add src/mock/demo/demo-stream-simulator.ts src/mock/demo/demo-stream-simulator.test.ts
git commit -m "feat(demo): add demo stream simulator"
```

---

### Task 7: demo-mode 包装器 withDemoMode

**Files:**
- Create: `src/mock/demo/demo-mode.ts`
- Test: `src/mock/demo/demo-mode.test.ts`

**Interfaces:**
- Consumes: Task 2-6 全部（常量、workspace、run-activity、conversation、simulator）；`DigitalLifeBridge` 类型（`src/shared/ipc/digital-life`）。
- Produces（供 Task 8 接线）:
  - `export function withDemoMode(baseBridge: DigitalLifeBridge): DigitalLifeBridge`
  - `export function isDemoActive(): boolean`
  - `export function resetDemoModeForTest(): void`

- [ ] **Step 1: Write the failing test**

`src/mock/demo/demo-mode.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { DigitalLifeBridge } from '../../shared/ipc/digital-life';
import { withDemoMode, isDemoActive, resetDemoModeForTest } from './demo-mode';
import { DEMO_WORKSPACE_ID, DEMO_WORKSPACE_PATH } from './demo-constants';
import { DEMO_SESSION_IDS } from './demo-constants';

function makeBaseBridge(): DigitalLifeBridge {
  const conversation: DigitalLifeBridge['conversation'] = {
    createSession: async () => ({ ok: true, data: { id: 'session-real', workspaceId: 'ws-real', title: 'real', status: 'active', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 } }),
    listSessions: async () => ({ ok: true, data: [{ id: 'session-real', workspaceId: 'ws-real', title: 'real', status: 'active', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 }] }),
    getSession: async () => ({ ok: true, data: undefined }),
    renameSession: async (input) => ({ ok: true, data: { id: input.sessionId, workspaceId: 'ws', title: input.title, status: 'active', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 } }),
    pinSession: async (id) => ({ ok: true, data: { id, workspaceId: 'ws', title: 't', status: 'active', isPinned: true, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 } }),
    unpinSession: async (id) => ({ ok: true, data: { id, workspaceId: 'ws', title: 't', status: 'active', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 } }),
    reorderSessions: async () => ({ ok: true, data: [] }),
    markSessionRead: async (input) => ({ ok: true, data: { id: input.sessionId, workspaceId: 'ws', title: 't', status: 'active', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 } }),
    markSessionUnread: async (id) => ({ ok: true, data: { id, workspaceId: 'ws', title: 't', status: 'active', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 } }),
    archiveSession: async (id) => ({ ok: true, data: { id, workspaceId: 'ws', title: 't', status: 'archived', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, archivedAt: 0, createdAt: 0, updatedAt: 0, lastMessageAt: 0 } }),
    archiveAllInWorkspace: async () => ({ ok: true, data: [] }),
    deleteSession: async () => ({ ok: true, data: true }),
    sendMessage: async (input) => ({ ok: true, data: { session: { id: input.sessionId, workspaceId: 'ws', title: 't', status: 'active', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 }, userMessage: { id: 'u', sessionId: input.sessionId, role: 'user', content: input.content, blocks: [], createdAt: 0 }, assistantMessage: { id: 'a', sessionId: input.sessionId, role: 'assistant', content: 'a', blocks: [], createdAt: 0 }, runDetail: { run: { id: 'r', workspaceId: 'ws', sessionId: input.sessionId, prompt: '', scenario: 'chat', status: 'succeeded', createdAt: 0, updatedAt: 0 }, steps: [] } } }),
    cancelMessage: async () => ({ ok: true, data: undefined }),
  };
  return {
    subscribeModelStream: () => () => {},
    subscribeRunActivity: () => () => {},
    subscribeTerminalStream: () => () => {},
    subscribePtyOutput: () => () => {},
    setLogMode: async () => {},
    window: {} as DigitalLifeBridge['window'],
    app: { getInfo: async () => ({ ok: true, data: { appName: 'real', version: '0', config: {} } as never }), getHealth: async () => ({ ok: true, data: {} as never }), getDiagnostics: async () => ({ ok: true, data: {} as never }), getModelHealth: async () => ({ ok: true, data: {} as never }), updatePreferences: async () => ({ ok: true, data: {} as never }) },
    workspace: {
      listRecent: async () => ({ ok: true, data: [{ id: 'ws-real', path: '/real', rootPath: '/real', name: 'real', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false }] }),
      open: async () => ({ ok: true, data: { id: 'ws-real', path: '/real', rootPath: '/real', name: 'real', type: 'node', status: 'ready', createdAt: 0, updatedAt: 0, lastOpenedAt: 0 } }),
      clearCurrent: async () => ({ ok: true, data: true }),
      pickDirectory: async () => ({ ok: true, data: undefined }),
      pin: async (id) => ({ ok: true, data: [{ id, path: '/real', rootPath: '/real', name: 'real', lastOpenedAt: 0, isPinned: true, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false }] }),
      unpin: async (id) => ({ ok: true, data: [{ id, path: '/real', rootPath: '/real', name: 'real', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false }] }),
      reorder: async () => ({ ok: true, data: [] }),
      removeFromSidebar: async (id) => ({ ok: true, data: [{ id, path: '/real', rootPath: '/real', name: 'real', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: true, available: true, hiddenFromRightPanels: true }] }),
      restoreToSidebar: async (id) => ({ ok: true, data: [{ id, path: '/real', rootPath: '/real', name: 'real', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false }] }),
      listTreeForWorkspace: async () => ({ ok: true, data: [] }),
      listGitStatusForWorkspace: async () => ({ ok: true, data: { isRepo: false, staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 } }),
      hideFromRightPanels: async (id) => ({ ok: true, data: [{ id, path: '/real', rootPath: '/real', name: 'real', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: true }] }),
      showInRightPanels: async (id) => ({ ok: true, data: [{ id, path: '/real', rootPath: '/real', name: 'real', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false }] }),
      revealInFileManager: async () => ({ ok: true, data: true }),
      createFile: async () => ({ ok: true, data: { path: 'x', content: '', lastModifiedAt: 0 } }),
      createFolder: async () => ({ ok: true, data: true }),
      readFile: async () => ({ ok: true, data: { path: 'x', content: '', lastModifiedAt: 0 } }),
      readFileForWorkspace: async () => ({ ok: true, data: { path: 'x', content: '', lastModifiedAt: 0 } }),
      getChangePreview: async () => ({ ok: true, data: { path: 'x', changeKind: 'modified', status: 'modified', baseExists: true, currentExists: true, baseContent: '', currentContent: '' } }),
      getChangePreviewForWorkspace: async () => ({ ok: true, data: { path: 'x', changeKind: 'modified', status: 'modified', baseExists: true, currentExists: true, baseContent: '', currentContent: '' } }),
      listTree: async () => ({ ok: true, data: [] }),
      search: async () => ({ ok: true, data: [] }),
      outline: async () => ({ ok: true, data: [] }),
      setEditorDirtyPaths: async () => ({ ok: true, data: true }),
      renameFile: async () => ({ ok: true, data: true }),
      deleteFile: async () => ({ ok: true, data: true }),
      duplicateFile: async () => ({ ok: true, data: true }),
      getAbsolutePath: async () => ({ ok: true, data: '' }),
      moveFile: async () => ({ ok: true, data: true }),
      getGitStatus: async () => ({ ok: true, data: { isRepo: false, staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 } }),
      listGitBranches: async () => ({ ok: true, data: [] }),
      switchGitBranch: async () => ({ ok: true, data: { workspace: { id: 'ws', path: '/r', rootPath: '/r', name: 'r', type: 'node', status: 'ready', createdAt: 0, updatedAt: 0, lastOpenedAt: 0 }, gitSnapshot: { isRepo: false, staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 }, currentBranch: 'main', stashedChanges: false, hasRestored: false } }),
      createGitBranch: async () => ({ ok: true, data: { workspace: { id: 'ws', path: '/r', rootPath: '/r', name: 'r', type: 'node', status: 'ready', createdAt: 0, updatedAt: 0, lastOpenedAt: 0 }, gitSnapshot: { isRepo: false, staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 }, currentBranch: 'main', stashedChanges: false, hasRestored: false } }),
      stageFile: async () => ({ ok: true, data: undefined }),
      unstageFile: async () => ({ ok: true, data: undefined }),
      discardFile: async () => ({ ok: true, data: undefined }),
      gitVisCommitStats: async () => ({ ok: true, data: {} as never }),
      gitVisCodeEvolution: async () => ({ ok: true, data: {} as never }),
      gitVisContributorModules: async () => ({ ok: true, data: {} as never }),
      gitVisBranchGraph: async () => ({ ok: true, data: {} as never }),
      gitVisFileHotspots: async () => ({ ok: true, data: {} as never }),
      gitVisFirstCommitYear: async () => ({ ok: true, data: 0 }),
      onFileChanged: () => () => {},
    },
    retrieval: {} as DigitalLifeBridge['retrieval'],
    conversation,
    agent: {} as DigitalLifeBridge['agent'],
    subagent: {} as DigitalLifeBridge['subagent'],
    mcp: {} as DigitalLifeBridge['mcp'],
    patch: {
      getPatchSet: async () => ({ ok: true, data: undefined }),
      setHunkDecision: async () => ({ ok: true, data: { id: 'p', workspaceId: 'w', sessionId: 's', title: 't', summary: 's', status: 'ready', createdAt: 0, updatedAt: 0, filePatches: [] } }),
      applyPatchSet: async () => ({ ok: true, data: { patchSet: { id: 'p', workspaceId: 'w', sessionId: 's', title: 't', summary: 's', status: 'applied', createdAt: 0, updatedAt: 0, filePatches: [] }, rolledBack: false } }),
      rollbackPatchSet: async () => ({ ok: true, data: { id: 'p', workspaceId: 'w', sessionId: 's', title: 't', summary: 's', status: 'rolled-back', createdAt: 0, updatedAt: 0, filePatches: [] } }),
    },
    provider: {} as DigitalLifeBridge['provider'],
    command: {} as DigitalLifeBridge['command'],
    pty: {} as DigitalLifeBridge['pty'],
    task: {} as DigitalLifeBridge['task'],
    runActivity: { listByRunId: async () => ({ ok: true, data: [] }) },
    browser: {} as DigitalLifeBridge['browser'],
    github: {} as DigitalLifeBridge['github'],
    snapshot: {} as DigitalLifeBridge['snapshot'],
    webTools: { webFetch: async () => ({ ok: true, data: { url: '', status: 200, content_type: null, content: '', truncated: false, format: 'markdown', error: null } }), webSearch: async () => ({ ok: true, data: { query: '', results: [], error: null } }) },
    commandsConfig: {} as DigitalLifeBridge['commandsConfig'],
    permission: {} as DigitalLifeBridge['permission'],
    compaction: {} as DigitalLifeBridge['compaction'],
    sessionFork: {} as DigitalLifeBridge['sessionFork'],
    lsp: {} as DigitalLifeBridge['lsp'],
    reference: {} as DigitalLifeBridge['reference'],
    durable: {} as DigitalLifeBridge['durable'],
    reserved: {} as DigitalLifeBridge['reserved'],
    customAgent: {} as DigitalLifeBridge['customAgent'],
  };
}

describe('withDemoMode', () => {
  beforeEach(() => {
    resetDemoModeForTest();
  });

  it('passes through when inactive', async () => {
    const bridge = withDemoMode(makeBaseBridge());
    expect(isDemoActive()).toBe(false);
    const recent = await bridge.workspace.listRecent();
    expect(recent.ok && recent.data[0]?.id).toBe('ws-real');
  });

  it('prepends the demo entry to listRecent even when inactive', async () => {
    const bridge = withDemoMode(makeBaseBridge());
    const recent = await bridge.workspace.listRecent();
    expect(recent.ok && recent.data[0]?.id).toBe(DEMO_WORKSPACE_ID);
    expect(recent.ok && recent.data[0]?.name).toContain('i18n:');
  });

  it('activates demo mode when opening the demo path and returns demo data', async () => {
    const bridge = withDemoMode(makeBaseBridge());
    const result = await bridge.workspace.open(DEMO_WORKSPACE_PATH);
    expect(result.ok && result.data.id).toBe(DEMO_WORKSPACE_ID);
    expect(isDemoActive()).toBe(true);

    const sessions = await bridge.conversation.listSessions();
    expect(sessions.ok && sessions.data.map((s) => s.id)).toEqual(
      expect.arrayContaining(Object.values(DEMO_SESSION_IDS)),
    );

    const detail = await bridge.conversation.getSession(DEMO_SESSION_IDS.complete);
    expect(detail.ok && detail.data?.session.id).toBe(DEMO_SESSION_IDS.complete);
    expect(detail.ok && (detail.data?.messages.length ?? 0)).toBeGreaterThan(0);
  });

  it('deactivates demo mode when opening a non-demo path', async () => {
    const bridge = withDemoMode(makeBaseBridge());
    await bridge.workspace.open(DEMO_WORKSPACE_PATH);
    expect(isDemoActive()).toBe(true);
    await bridge.workspace.open('/real/other');
    expect(isDemoActive()).toBe(false);
  });

  it('ignores demo-mode toggling when clearCurrent is called', async () => {
    const bridge = withDemoMode(makeBaseBridge());
    await bridge.workspace.open(DEMO_WORKSPACE_PATH);
    expect(isDemoActive()).toBe(true);
    const cleared = await bridge.workspace.clearCurrent();
    expect(cleared.ok).toBe(true);
    expect(isDemoActive()).toBe(false);
  });

  it('returns demo run activity when active', async () => {
    const bridge = withDemoMode(makeBaseBridge());
    await bridge.workspace.open(DEMO_WORKSPACE_PATH);
    const activity = await bridge.runActivity.listByRunId('run-demo-complete');
    expect(activity.ok && activity.data.length).toBeGreaterThan(0);
  });

  it('returns demo patch sets when active', async () => {
    const bridge = withDemoMode(makeBaseBridge());
    await bridge.workspace.open(DEMO_WORKSPACE_PATH);
    const patchSet = await bridge.patch.getPatchSet('patchset-demo-complete');
    expect(patchSet.ok && patchSet.data?.id).toBe('patchset-demo-complete');
  });
});
```

> 提示：`makeBaseBridge` 很长，但一次性给出可保证 `withDemoMode` 测试完全独立（不依赖真 `mockDigitalLifeBridge`）。若某字段类型不匹配导致 tsc 报错，用 `as never` 兜底。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/mock/demo/demo-mode.test.ts`
Expected: FAIL — module 不存在。

- [ ] **Step 3: Write minimal implementation**

`src/mock/demo/demo-mode.ts`：

```ts
import type {
  ConversationSessionRecord,
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  PatchSet,
  RecentWorkspaceEntry,
  WorkspaceChangePreview,
  WorkspaceMeta,
} from '@ai-digital-life/kernel';
import type { DigitalLifeBridge } from '../../shared/ipc/digital-life';
import {
  DEMO_SESSION_IDS,
  DEMO_WORKSPACE_ID,
  DEMO_WORKSPACE_PATH,
} from './demo-constants';
import {
  buildDemoChangePreview,
  buildDemoGitSnapshot,
  buildDemoPatchSet,
  buildDemoRecentEntry,
  buildDemoTree,
  buildDemoWorkspaceMeta,
  getDemoPatchSet,
} from './demo-workspace';
import { getDemoRunActivity, appendLiveRunActivity } from './demo-run-activity';
import {
  getDemoSessions,
  getDemoSessionDetail,
  buildDemoSendResult,
} from './demo-conversation';
import { createDemoStreamSimulator } from './demo-stream-simulator';

const demoState = {
  active: false,
  modelListeners: new Set<(e: DigitalLifeModelStreamEventV1) => void>(),
  activityListeners: new Set<(e: DigitalLifeRunActivityEventV1) => void>(),
  simulator: null as ReturnType<typeof createDemoStreamSimulator> | null,
};

function emitModel(e: DigitalLifeModelStreamEventV1): void {
  for (const listener of demoState.modelListeners) {
    listener(e);
  }
}

function emitActivity(e: DigitalLifeRunActivityEventV1): void {
  for (const listener of demoState.activityListeners) {
    listener(e);
  }
}

function getSimulator() {
  if (!demoState.simulator) {
    demoState.simulator = createDemoStreamSimulator({ emitModel, emitActivity });
  }
  return demoState.simulator;
}

export function isDemoActive(): boolean {
  return demoState.active;
}

export function resetDemoModeForTest(): void {
  demoState.active = false;
  demoState.simulator = null;
  demoState.modelListeners.clear();
  demoState.activityListeners.clear();
}

export function withDemoMode(baseBridge: DigitalLifeBridge): DigitalLifeBridge {
  const demoEntry = buildDemoRecentEntry();

  const listRecentWithDemo = (list: RecentWorkspaceEntry[]): RecentWorkspaceEntry[] => {
    const withoutDemo = list.filter((entry) => entry.id !== DEMO_WORKSPACE_ID);
    return [demoEntry, ...withoutDemo];
  };

  const workspaceBridge = {
    ...baseBridge.workspace,
    listRecent: async () => {
      const result = await baseBridge.workspace.listRecent();
      if (result.ok) {
        return { ok: true as const, data: listRecentWithDemo(result.data) };
      }
      return result;
    },
    open: async (workspacePath: string) => {
      if (workspacePath === DEMO_WORKSPACE_PATH) {
        demoState.active = true;
        return { ok: true as const, data: buildDemoWorkspaceMeta() };
      }
      demoState.active = false;
      return baseBridge.workspace.open(workspacePath);
    },
    clearCurrent: async () => {
      demoState.active = false;
      return baseBridge.workspace.clearCurrent();
    },
    pin: async (workspaceId: string) => {
      if (workspaceId === DEMO_WORKSPACE_ID) {
        const result = await baseBridge.workspace.listRecent();
        return { ok: true as const, data: result.ok ? listRecentWithDemo(result.data) : [demoEntry] };
      }
      return baseBridge.workspace.pin(workspaceId);
    },
    unpin: async (workspaceId: string) => {
      if (workspaceId === DEMO_WORKSPACE_ID) {
        const result = await baseBridge.workspace.listRecent();
        return { ok: true as const, data: result.ok ? listRecentWithDemo(result.data) : [demoEntry] };
      }
      return baseBridge.workspace.unpin(workspaceId);
    },
    removeFromSidebar: async (workspaceId: string) => {
      if (workspaceId === DEMO_WORKSPACE_ID) {
        const result = await baseBridge.workspace.listRecent();
        return { ok: true as const, data: result.ok ? listRecentWithDemo(result.data) : [demoEntry] };
      }
      return baseBridge.workspace.removeFromSidebar(workspaceId);
    },
    restoreToSidebar: async (workspaceId: string) => {
      if (workspaceId === DEMO_WORKSPACE_ID) {
        const result = await baseBridge.workspace.listRecent();
        return { ok: true as const, data: result.ok ? listRecentWithDemo(result.data) : [demoEntry] };
      }
      return baseBridge.workspace.restoreToSidebar(workspaceId);
    },
    hideFromRightPanels: async (workspaceId: string) => {
      if (workspaceId === DEMO_WORKSPACE_ID) {
        const result = await baseBridge.workspace.listRecent();
        return { ok: true as const, data: result.ok ? listRecentWithDemo(result.data) : [demoEntry] };
      }
      return baseBridge.workspace.hideFromRightPanels(workspaceId);
    },
    showInRightPanels: async (workspaceId: string) => {
      if (workspaceId === DEMO_WORKSPACE_ID) {
        const result = await baseBridge.workspace.listRecent();
        return { ok: true as const, data: result.ok ? listRecentWithDemo(result.data) : [demoEntry] };
      }
      return baseBridge.workspace.showInRightPanels(workspaceId);
    },
    reorder: async (input) => {
      const result = await baseBridge.workspace.reorder(input);
      if (result.ok) {
        return { ok: true as const, data: listRecentWithDemo(result.data) };
      }
      return result;
    },
    listTree: async () => {
      if (!demoState.active) {
        return baseBridge.workspace.listTree();
      }
      return { ok: true as const, data: buildDemoTree() };
    },
    listTreeForWorkspace: async (workspacePath: string) => {
      if (demoState.active && workspacePath === DEMO_WORKSPACE_PATH) {
        return { ok: true as const, data: buildDemoTree() };
      }
      return baseBridge.workspace.listTreeForWorkspace(workspacePath);
    },
    readFile: async (relativePath: string) => {
      if (!demoState.active) {
        return baseBridge.workspace.readFile(relativePath);
      }
      const content =
        (await import('./demo-constants')).DEMO_DOCUMENTS[relativePath] ?? '';
      return { ok: true as const, data: { path: relativePath, content, lastModifiedAt: Date.now() } };
    },
    readFileForWorkspace: async (workspacePath: string, relativePath: string) => {
      if (demoState.active && workspacePath === DEMO_WORKSPACE_PATH) {
        const content =
          (await import('./demo-constants')).DEMO_DOCUMENTS[relativePath] ?? '';
        return { ok: true as const, data: { path: relativePath, content, lastModifiedAt: Date.now() } };
      }
      return baseBridge.workspace.readFileForWorkspace(workspacePath, relativePath);
    },
    getChangePreview: async (relativePath: string) => {
      if (!demoState.active) {
        return baseBridge.workspace.getChangePreview(relativePath);
      }
      return { ok: true as const, data: buildDemoChangePreview(relativePath) };
    },
    getChangePreviewForWorkspace: async (workspacePath: string, relativePath: string) => {
      if (demoState.active && workspacePath === DEMO_WORKSPACE_PATH) {
        return { ok: true as const, data: buildDemoChangePreview(relativePath) };
      }
      return baseBridge.workspace.getChangePreviewForWorkspace(workspacePath, relativePath);
    },
    getGitStatus: async () => {
      if (!demoState.active) {
        return baseBridge.workspace.getGitStatus();
      }
      return { ok: true as const, data: buildDemoGitSnapshot() };
    },
    listGitStatusForWorkspace: async (workspacePath: string) => {
      if (demoState.active && workspacePath === DEMO_WORKSPACE_PATH) {
        return { ok: true as const, data: buildDemoGitSnapshot() };
      }
      return baseBridge.workspace.listGitStatusForWorkspace(workspacePath);
    },
  };

  const conversationBridge = {
    ...baseBridge.conversation,
    listSessions: async () => {
      if (!demoState.active) {
        return baseBridge.conversation.listSessions();
      }
      return { ok: true as const, data: getDemoSessions() };
    },
    getSession: async (sessionId: string) => {
      if (demoState.active && Object.values(DEMO_SESSION_IDS).includes(sessionId as never)) {
        return { ok: true as const, data: getDemoSessionDetail(sessionId) };
      }
      return baseBridge.conversation.getSession(sessionId);
    },
    sendMessage: async (input) => {
      if (demoState.active && Object.values(DEMO_SESSION_IDS).includes(input.sessionId as never)) {
        const result = await getSimulator().sendMessage(input);
        return { ok: true as const, data: result };
      }
      return baseBridge.conversation.sendMessage(input);
    },
    cancelMessage: async (runId: string) => {
      if (demoState.active) {
        getSimulator().cancelActiveStream();
        return { ok: true as const, data: await getSimulator().cancelMessage(runId) };
      }
      return baseBridge.conversation.cancelMessage(runId);
    },
  };

  const runActivityBridge = {
    ...baseBridge.runActivity,
    listByRunId: async (runId: string, limit?: number) => {
      if (demoState.active) {
        return { ok: true as const, data: getDemoRunActivity(runId, limit) };
      }
      return baseBridge.runActivity.listByRunId(runId, limit);
    },
  };

  const patchBridge = {
    ...baseBridge.patch,
    getPatchSet: async (patchSetId: string) => {
      if (demoState.active) {
        return { ok: true as const, data: getDemoPatchSet(patchSetId) };
      }
      return baseBridge.patch.getPatchSet(patchSetId);
    },
  };

  return {
    ...baseBridge,
    workspace: workspaceBridge,
    conversation: conversationBridge,
    runActivity: runActivityBridge,
    patch: patchBridge,
    subscribeModelStream: (listener) => {
      demoState.modelListeners.add(listener);
      return () => demoState.modelListeners.delete(listener);
    },
    subscribeRunActivity: (listener) => {
      demoState.activityListeners.add(listener);
      return () => demoState.activityListeners.delete(listener);
    },
  };
}
```

> 说明：`readFile` 里用动态 `import('./demo-constants')` 避免循环依赖（demo-constants 不依赖本模块，改为顶层 `import` 亦可；若改顶层 import，须确认无循环）。`DEMO_DOCUMENTS` 建议改为模块顶层导入，此处写法保守。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/mock/demo/demo-mode.test.ts`
Expected: PASS。

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors（测试文件若报多余字段错误用 `as never` 调整）。

- [ ] **Step 6: Commit**

```bash
git add src/mock/demo/demo-mode.ts src/mock/demo/demo-mode.test.ts
git commit -m "feat(demo): add withDemoMode bridge wrapper"
```

---

### Task 8: 接线 main.tsx + preview-bridge/index.ts

**Files:**
- Modify: `src/main.tsx`（Tauri 分支包 `withDemoMode`）
- Modify: `src/preview-bridge/index.ts`（组装完 `previewBridge` 后包 `withDemoMode`）

**Interfaces:**
- Consumes: Task 7 `withDemoMode`；`createTauriBridge()`（`src/tauri-bridge`）；`previewBridge`（本任务内组装）。
- Produces: `window.digitalLife` 为 `withDemoMode(createTauriBridge())`（Tauri）或 `withDemoMode(previewBridge)`（浏览器）。

- [ ] **Step 1: Write the failing test**

本任务为纯接线，无独立新逻辑，通过「浏览器预览可进演示工作区」的集成断言覆盖。在 `src/app/components/MessageStream.test.tsx` 追加一个用演示会话数据渲染的集成用例（也服务于 Task 10 的 UI 覆盖；此处先写占位断言，证明演示数据可渲染）：

向 `src/app/components/MessageStream.test.tsx` 末尾追加：

```ts
import { getDemoSessionDetail } from '../../mock/demo/demo-conversation';
import { DEMO_SESSION_IDS } from '../../mock/demo/demo-constants';

it('renders demo session messages and plan/execution blocks', () => {
  const detail = getDemoSessionDetail(DEMO_SESSION_IDS.complete);
  expect(detail).toBeTruthy();
  const messages = detail?.messages ?? [];
  render(
    <TestProvider>
      <MessageStream messages={messages} />
    </TestProvider>,
  );
  expect(screen.getByText(/代码修改执行计划/)).toBeTruthy();
  expect(screen.getByText(/已完成 main.tsx 的注释添加/)).toBeTruthy();
});
```

> 说明：测试只依赖 demo 数据与 `MessageStream`，不依赖桥接线；真正的「双端接线」靠 Task 9 收尾时的手动双端验证 + 全量门禁确认编译无回归。

- [ ] **Step 2: Run test to verify it passes（接线本身无红；先确认既有用例不回归）**

Run: `npx vitest run src/app/components/MessageStream.test.tsx`
Expected: PASS（新用例 + 既有用例）。若 `getDemoSessionDetail` 返回 `undefined` 导致断言失败，说明 demo 数据有问题，回 Task 5 修。

- [ ] **Step 3: Implement wiring**

`src/main.tsx`（第 12 行）：

```ts
import { withDemoMode } from './mock/demo/demo-mode';
// ...
if (isTauriShell()) {
  window.digitalLife = withDemoMode(createTauriBridge());
  document.documentElement.dataset.shell = 'tauri';
}
```

`src/preview-bridge/index.ts`（组装完 `previewBridge` 后，`window.digitalLife = previewBridge` 改为）：

```ts
import { withDemoMode } from '../mock/demo/demo-mode';
// ...
(window as { digitalLife: DigitalLifeBridge }).digitalLife = withDemoMode(previewBridge);
```

- [ ] **Step 4: Run typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/main.tsx src/preview-bridge/index.ts`
Expected: 0 errors。

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx src/preview-bridge/index.ts src/app/components/MessageStream.test.tsx
git commit -m "feat(demo): wire withDemoMode into tauri and preview bridges"
```

---

### Task 9: MessageBlocks approval case + demo 实体文本 i18n 解析器

**Files:**
- Modify: `src/app/features/conversation/MessageBlocks.tsx`（补 `approval` case）
- Modify: `src/app/i18n/resolveDemoEntityText.ts`（新建解析器）
- Modify: 渲染站点（用解析器包装 `workspace.name` / `session.title` 展示）：
  - `src/app/regions/left-sidebar/WorkspaceList.tsx`（203、303、323 行附近）
  - `src/app/regions/left-sidebar/SessionListRow.tsx`（167、169 行附近）
  - `src/app/regions/StatusBar.tsx`（107、194、201 行附近）
  - `src/app/regions/center-pane/WelcomeState.tsx`（60、66 行附近）
  - `src/app/components/WelcomeState.tsx`（126 行附近）
  - `src/app/components/SessionManagement.tsx`（125、126、200、201 行附近）
  - `src/app/features/workspace-terminal/WorkspaceTerminalEntry.tsx`（124、127 行附近）
  - `src/app/features/workspace-settings/SortableWorkspaceList.tsx`（40、41、52 行附近）
  - `src/app/features/workspace-file-tree/WorkspaceFileTreeEntry.tsx`（149、150、217、220 行附近）
  - `src/app/features/workspace-changes-tree/WorkspaceChangesEntry.tsx`（139、142 行附近）
  - `src/app/features/workspace-changes-tree/WorkspaceChangesActions.ts`（114、115 行附近）
  - `src/app/features/terminal/TerminalEmptyState.tsx`（86 行附近）
  - `src/app/regions/LeftSidebar.tsx`（254 行附近）
  - `src/app/regions/left-sidebar/SidebarContextMenu.utils.tsx`（52 行附近）
- Test: `src/app/i18n/resolveDemoEntityText.test.ts` + `src/app/features/conversation/MessageBlocks.test.tsx`（新增）

**Interfaces:**
- Consumes: Task 1 i18n keys；`ApprovalConversationBlock` / `ApprovalRequestSummary` 类型。
- Produces:
  - `export function resolveDemoEntityText(value: string, t: Record<string, string>): string`（值以 `i18n:` 开头则返回 `t[key]`，否则原样返回）
  - `MessageBlocks` 渲染 `type === 'approval'` 的 block。

- [ ] **Step 1: Write the failing tests**

`src/app/i18n/resolveDemoEntityText.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { resolveDemoEntityText } from './resolveDemoEntityText';

describe('resolveDemoEntityText', () => {
  const t = { demoWorkspaceName: '演示工作区', demoSessionCompleteTitle: '综合演示' };

  it('returns the value unchanged when not an i18n marker', () => {
    expect(resolveDemoEntityText('OnlineEditing', t)).toBe('OnlineEditing');
  });

  it('resolves an i18n marker through the copy dict', () => {
    expect(resolveDemoEntityText('i18n:demoWorkspaceName', t)).toBe('演示工作区');
  });

  it('falls back to the marker when the key is missing', () => {
    expect(resolveDemoEntityText('i18n:missing.key', t)).toBe('i18n:missing.key');
  });
});
```

`src/app/features/conversation/MessageBlocks.test.tsx`（新增，复用 MessageStream 的 TCopyProvider 模式）：

```ts
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { MessageBlocks } from './MessageBlocks';
import type { ConversationMessageRecord } from '@shared/ipc';

afterEach(cleanup);

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
});

function wrap(children: React.ReactNode) {
  return (
    <TCopyProvider t={mockT as any} locale="zh-CN">
      {children}
    </TCopyProvider>
  );
}

function message(blocks: ConversationMessageRecord['blocks']): ConversationMessageRecord {
  return {
    id: 'm1',
    sessionId: 's1',
    role: 'assistant',
    content: 'content',
    blocks,
    createdAt: 1,
  };
}

describe('MessageBlocks approval block', () => {
  it('renders an approval block with title, risk and summary', () => {
    render(
      wrap(
        <MessageBlocks
          message={message([
            { id: 'a1', type: 'approval', title: '删除旧代码', riskLevel: 'high', summary: '不可恢复' },
          ])}
        />,
      ),
    );
    expect(screen.getByText('删除旧代码')).toBeTruthy();
    expect(screen.getByText('high')).toBeTruthy();
    expect(screen.getByText('不可恢复')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/i18n/resolveDemoEntityText.test.ts src/app/features/conversation/MessageBlocks.test.tsx`
Expected: 前者 FAIL（module 不存在）；后者 FAIL（approval case 渲染 null）。

- [ ] **Step 3: Write minimal implementation**

`src/app/i18n/resolveDemoEntityText.ts`：

```ts
const DEMO_MARKER_PREFIX = 'i18n:';

export function resolveDemoEntityText(value: string, t: Record<string, string>): string {
  if (!value.startsWith(DEMO_MARKER_PREFIX)) {
    return value;
  }
  const key = value.slice(DEMO_MARKER_PREFIX.length);
  return t[key] ?? value;
}
```

`src/app/features/conversation/MessageBlocks.tsx`：

- 顶部 import 增加：
```ts
import type { ApprovalConversationBlock } from '@shared/ipc';
import { ApprovalInlineCard } from '../../regions/center-pane/ApprovalInlineCard';
```
- 新增渲染函数（放在 `renderMarkdownBlock` 之前）：
```tsx
function renderApprovalBlock(block: ApprovalConversationBlock): React.ReactElement {
  return (
    <ApprovalInlineCard
      key={block.id}
      approval={{
        id: block.id,
        taskId: block.id,
        title: block.title,
        description: block.summary,
        riskLevel: block.riskLevel,
        impact: [],
        reversible: true,
        createdAt: Date.now(),
      }}
      onDecide={() => {
        /* 历史消息只读：审批决策由 TaskCenter 面板处理，此处不改变会话状态。 */
      }}
    />
  );
}
```
- `renderMessageBlock` 的 `switch` 增加 case：
```ts
case 'approval':
  return renderApprovalBlock(block);
```

渲染站点包装：在用到 `.workspace.name` / `.session.title` 的每个组件中 `import { resolveDemoEntityText } from '../../i18n/resolveDemoEntityText';` 与 `const { t } = useTCopy();`（若未引入），把 `{workspace.name}` → `{resolveDemoEntityText(workspace.name, t)}`、`{session.title}` → `{resolveDemoEntityText(session.title, t)}`，`title={workspace.name}` 属性同理。`SidebarContextMenu.utils.tsx` 与 `WorkspaceChangesActions.ts` 中 `copyToClipboard(workspace.name)` 包装为 `resolveDemoEntityText(workspace.name, t)`（需在函数作用域内拿 `t`，若该文件非组件，改用 `getAppCopy` 或透传 `t`）。

> 逐站点替换的精确行号以当前文件为准，替换逻辑统一为「name/title 展示处调用 `resolveDemoEntityText(value, t)`」。由于同一模式重复 14 处，这里只给出统一规则，不再逐行贴代码；每个文件替换后跑一次 `npx tsc --noEmit`。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/i18n/resolveDemoEntityText.test.ts src/app/features/conversation/MessageBlocks.test.tsx`
Expected: PASS。

- [ ] **Step 5: Run typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/features/conversation/MessageBlocks.tsx src/app/i18n/resolveDemoEntityText.ts`
Expected: 0 errors。

- [ ] **Step 6: Commit**

```bash
git add src/app/i18n/resolveDemoEntityText.ts src/app/i18n/resolveDemoEntityText.test.ts src/app/features/conversation/MessageBlocks.tsx src/app/features/conversation/MessageBlocks.test.tsx src/app/regions/left-sidebar/WorkspaceList.tsx src/app/regions/left-sidebar/SessionListRow.tsx src/app/regions/StatusBar.tsx src/app/regions/center-pane/WelcomeState.tsx src/app/components/WelcomeState.tsx src/app/components/SessionManagement.tsx src/app/features/workspace-terminal/WorkspaceTerminalEntry.tsx src/app/features/workspace-settings/SortableWorkspaceList.tsx src/app/features/workspace-file-tree/WorkspaceFileTreeEntry.tsx src/app/features/workspace-changes-tree/WorkspaceChangesEntry.tsx src/app/features/workspace-changes-tree/WorkspaceChangesActions.ts src/app/features/terminal/TerminalEmptyState.tsx src/app/regions/LeftSidebar.tsx src/app/regions/left-sidebar/SidebarContextMenu.utils.tsx
git commit -m "feat(demo): render approval blocks and resolve demo entity text"
```

---

### Task 10: 集成验证与质量门禁

**Files:**
- 不新增文件；全量验证。

**Interfaces:**
- Consumes: Task 1-9 全部交付物。

- [ ] **Step 1: Run demo + i18n + UI 全量前端测试**

Run: `pnpm --dir frontend run test`
Expected: 全部通过（含既有 1260+ 用例与新增 demo 用例）。

- [ ] **Step 2: Run lint + typecheck**

Run: `npx tsc --noEmit && npx eslint .`
Expected: 0 errors（允许既有 pre-existing warnings）。

- [ ] **Step 3: 浏览器模式手动验证**

运行浏览器预览（`pnpm --dir frontend run dev` 或 `run-project-surfaces` 技能），验证：
1. 左侧工作区列表出现置顶的「演示工作区」条目（名称经 i18n 解析显示「演示工作区」）。
2. 点击 WelcomeState 最近列表中的演示工作区 → 打开后会话列表出现 3 个演示会话。
3. 逐个打开会话：MessageBlocks 渲染 plan / tool-call / execution-step / command-output / patch-summary / validation-result / execution-summary / final-summary / markdown / approval 全部 block。
4. 每条 assistant 消息下方出现 RunSummaryBlock，展开后按组显示 context/files/search/model/commands/patch/approvals/errors 事件，TokenUsage 在实时模拟时显示。
5. 在演示会话发送消息 → 观察 streaming-message + streaming-run-summary 逐字输出 → 完成后平滑过渡到静态消息 + RunSummaryBlock。
6. 切换回普通工作区 → 演示模式恢复透传，普通会话无污染（`mock-shared-*` 会话不受影响）。

- [ ] **Step 4: Tauri 模式手动验证**

`cargo tauri dev`（或运行技能双端模式）重复 Step 3 的 1-6，确认双端行为一致。

- [ ] **Step 5: 全量门禁**

Run: `pnpm --dir frontend run lint && pnpm --dir frontend run test && npx tsc --noEmit`
Expected: 全绿。

- [ ] **Step 6: 提交收尾**

```bash
git add -A
git commit -m "feat(demo): finalize demo workspace integration"
```

---

## Self-Review Checklist

**1. Spec coverage：**
- 独立演示工作区入口（左侧列表 + WelcomeState）：Task 3 `buildDemoRecentEntry` + Task 7 `listRecent` 置顶 ✓
- 9 种 block 全覆盖：Task 5 `completeMessages`/`planMessages`/`toolsMessages` + Task 5 测试断言 ✓（实际 10 种含 markdown）
- RunSummary 全组 + 全事件类型：Task 4 静态事件覆盖 run-start/context-added/file-read/search/command/patch/approval/model/error/run-done ✓
- 模拟流式交互：Task 6 simulator（route/delta/done + run-activity 时间线 + cancel）✓
- Tauri + 浏览器双端：Task 8 接线两处 ✓
- i18n 策略（对话中文 mock + UI 文本 key）：Task 1 keys + Task 9 解析器 ✓
- 质量门禁：Task 10 ✓

**2. Placeholder scan：** 无 TBD/TODO；所有数据文件给出完整代码。

**3. Type consistency：**
- `getDemoSessionDetail(sessionId) → ConversationDetail | undefined` 在 Task 5 定义、Task 7 使用一致 ✓
- `getDemoRunActivity(runId, limit?) → DigitalLifeRunActivityEventV1[]` 在 Task 4 定义、Task 7 使用一致 ✓
- `buildDemoSendResult(sessionId, content) → ConversationSendResult` 在 Task 5 定义、Task 6 使用一致 ✓
- `createDemoStreamSimulator({ emitModel, emitActivity })` 在 Task 6 定义、Task 7 使用一致 ✓
- `DEMO_SESSION_IDS`/`DEMO_WORKSPACE_PATH`/`DEMO_WORKSPACE_ID` 全链一致 ✓
- i18n key `demoWorkspaceName`/`demoSessionCompleteTitle`/`demoSessionPlanTitle`/`demoSessionToolsTitle` 与 marker `i18n:demoXxx` 及解析器解析规则一致 ✓
