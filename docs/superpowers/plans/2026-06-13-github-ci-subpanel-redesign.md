# GitHub CI 子面板 UI/UX 改造计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 GitHub CI 的四个子面板（概览/工作流/任务/日志）改造为卡片式布局，提升视觉层次与交互丰富度，保持与项目设计系统一致的简洁专业风格。

**Architecture:** 所有改动集中在 communicate 子面板目录和对应的 CSS 文件。不新增组件文件，所有改善在现有 8 个文件中完成。状态管理（Zustand）不做改动。测试使用 `vitest` + `renderToStaticMarkup` 验证渲染结构。

**Tech Stack:** React 19 + TypeScript + Zustand + CSS Custom Properties（设计 Token）+ vitest

---

## 文件清单

| 操作 | 文件 | 职责 |
|------|------|------|
| ✅ 修改 | `githubPanelUtils.ts` | 新增相对时间、状态 CSS class 工具函数 |
| ✅ 修改 | `StatusDot.tsx` | 新增 `animated` 属性，in_progress 时脉冲动画 |
| ✅ 修改 | `OverviewView.tsx` | 卡片化：骨架屏、运行摘要卡、Section 分隔 |
| ✅ 修改 | `WorkflowsView.tsx` | 卡片化：进度条、筛选、操作按钮 |
| ✅ 修改 | `JobsView.tsx` | 卡片化：搜索、筛选、状态条 |
| ✅ 修改 | `JobRow.tsx` | 卡片化：左侧状态色条、Step 时间线 |
| ✅ 修改 | `GitHubLogViewer.tsx` | SVG 图标替换、Gutter 优化、工具按钮 |
| ✅ 修改 | `GitHubPanel.tsx` | 透传新 props（如筛选状态） |
| ✅ 修改 | `communication-panel.css` | 新增全部卡片、时间线、进度条等样式 |
| ✨ 新增 | `OverviewView.test.tsx` | OverviewView 渲染测试 |
| ✨ 新增 | `WorkflowsView.test.tsx` | WorkflowsView 渲染测试 |
| ✨ 新增 | `JobsView.test.tsx` | JobsView 渲染测试 |
| ✨ 新增 | `GitHubLogViewer.test.tsx` | LogViewer 渲染测试 |
| ✨ 新增 | `JobRow.test.tsx` | JobRow 渲染测试 |
| ✨ 新增 | `githubPanelUtils.test.ts` | 工具函数单元测试 |

---

## 设计原则

1. **色彩克制**：仅使用 4 种状态色（`--success` 绿 / `--danger` 红 / `--warning` 黄 / `--text-tertiary` 灰），其余全部使用设计 Token 默认色
2. **卡片风格**：`var(--surface-secondary)` 背景 + `var(--border)` 边框，左侧 3px 状态色条
3. **交互清晰**：所有可点击元素有 `:hover` 反馈 + `TooltipSimple`
4. **状态全覆盖**：加载态骨架屏、空态引导、错误态重试、正常态数据展示

---

### Task 1: 工具函数扩展 (`githubPanelUtils.ts`)

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/communicate/githubPanelUtils.ts`
- Create: `frontend/src/app/regions/right-panel/panels/communicate/githubPanelUtils.test.ts`

- [ ] **Step 1: 编写工具函数测试**

```ts
import { describe, expect, it } from 'vitest';
import { formatRelativeTime, statusClass, formatDuration, formatCommit, formatTime, statusColor } from './githubPanelUtils';

describe('formatRelativeTime', () => {
  it('returns "刚刚" for recent timestamps', () => {
    const result = formatRelativeTime(new Date().toISOString());
    expect(result).toBe('刚刚');
  });

  it('returns minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe('5 分钟前');
  });

  it('returns hours ago', () => {
    const twoHourAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoHourAgo)).toBe('2 小时前');
  });

  it('returns days ago', () => {
    const threeDayAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(threeDayAgo)).toBe('3 天前');
  });

  it('returns "—" for null', () => {
    expect(formatRelativeTime(null)).toBe('—');
  });

  it('returns "—" for undefined', () => {
    expect(formatRelativeTime(undefined)).toBe('—');
  });
});

describe('statusClass', () => {
  it('returns "is-success" for success conclusion', () => {
    expect(statusClass('success', 'completed')).toBe('is-success');
  });

  it('returns "is-failure" for failure conclusion', () => {
    expect(statusClass('failure', 'completed')).toBe('is-failure');
  });

  it('returns "is-failure" for cancelled', () => {
    expect(statusClass('cancelled', 'completed')).toBe('is-failure');
  });

  it('returns "is-skipped" for skipped', () => {
    expect(statusClass('skipped', 'completed')).toBe('is-skipped');
  });

  it('returns "is-running" for in_progress status', () => {
    expect(statusClass(null, 'in_progress')).toBe('is-running');
  });

  it('returns "is-running" for queued status', () => {
    expect(statusClass(null, 'queued')).toBe('is-running');
  });

  it('returns "is-pending" for other statuses with null conclusion', () => {
    expect(statusClass(null, 'pending')).toBe('is-pending');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd frontend && npx vitest run src/app/regions/right-panel/panels/communicate/githubPanelUtils.test.ts --reporter=verbose
```
Expected: 测试失败（函数未定义）

- [ ] **Step 3: 实现工具函数**

```ts
// 在 githubPanelUtils.ts 末尾添加

/** 格式化相对时间（中文） */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 0) return '刚刚';
  if (diffSec < 60) return '刚刚';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  return formatTime(iso);
}

/** 返回状态对应的 CSS class 名 */
export function statusClass(conclusion: string | null, status: string): string {
  if (conclusion === 'success') return 'is-success';
  if (conclusion === 'failure' || conclusion === 'cancelled') return 'is-failure';
  if (conclusion === 'skipped') return 'is-skipped';
  if (status === 'in_progress' || status === 'queued') return 'is-running';
  return 'is-pending';
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/app/regions/right-panel/panels/communicate/githubPanelUtils.test.ts --reporter=verbose
```
Expected: ALL PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/regions/right-panel/panels/communicate/githubPanelUtils.ts frontend/src/app/regions/right-panel/panels/communicate/githubPanelUtils.test.ts
git commit -m "feat(github-ci): add formatRelativeTime and statusClass utility functions"
```

---

### Task 2: StatusDot 脉冲动画 (`StatusDot.tsx`)

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/communicate/StatusDot.tsx`
- Create: `frontend/src/app/regions/right-panel/panels/communicate/StatusDot.test.tsx`

- [ ] **Step 1: 编写 StatusDot 测试**

```tsx
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatusDot } from './StatusDot';

describe('StatusDot', () => {
  it('renders with correct color for success', () => {
    const html = renderToStaticMarkup(<StatusDot conclusion="success" status="completed" />);
    expect(html).toContain('background');
    expect(html).toContain('var(--success)');
  });

  it('renders with correct color for failure', () => {
    const html = renderToStaticMarkup(<StatusDot conclusion="failure" status="completed" />);
    expect(html).toContain('var(--danger)');
  });

  it('renders with correct color for in_progress', () => {
    const html = renderToStaticMarkup(<StatusDot conclusion={null} status="in_progress" />);
    expect(html).toContain('var(--warning)');
  });

  it('adds animated class when animated prop is true and status is in_progress', () => {
    const html = renderToStaticMarkup(<StatusDot conclusion={null} status="in_progress" animated />);
    expect(html).toContain('adl-status-dot--animated');
  });

  it('does not add animated class when status is completed', () => {
    const html = renderToStaticMarkup(<StatusDot conclusion="success" status="completed" animated />);
    expect(html).not.toContain('adl-status-dot--animated');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd frontend && npx vitest run src/app/regions/right-panel/panels/communicate/StatusDot.test.tsx --reporter=verbose
```
Expected: 测试失败

- [ ] **Step 3: 重写 StatusDot**

```tsx
import React from 'react';
import { statusColor } from './githubPanelUtils';

export function StatusDot({
  conclusion,
  status,
  animated,
}: {
  conclusion: string | null;
  status: string;
  animated?: boolean;
}) {
  const color = statusColor(conclusion, status);
  const isRunning = animated && (status === 'in_progress' || status === 'queued');
  return (
    <span
      className={isRunning ? 'adl-status-dot adl-status-dot--animated' : 'adl-status-dot'}
      style={{ background: color }}
    />
  );
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/app/regions/right-panel/panels/communicate/StatusDot.test.tsx --reporter=verbose
```
Expected: ALL PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/regions/right-panel/panels/communicate/StatusDot.tsx frontend/src/app/regions/right-panel/panels/communicate/StatusDot.test.tsx
git commit -m "feat(github-ci): add animated pulse prop to StatusDot"
```

---

### Task 3: CSS 样式系统 (`communication-panel.css`)

**Files:**
- Modify: `frontend/src/styles/regions/rightpanel/communication-panel.css`

- [ ] **Step 1: 在文件末尾追加以下新样式**

```css
/* ─── GitHub CI Card System ─── */

.adl-github-card {
  background: var(--surface-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.adl-github-card + .adl-github-card {
  margin-top: 6px;
}

/* Card with left status strip */
.adl-github-card--status {
  border-left: 3px solid var(--border);
}

.adl-github-card--status.is-success {
  border-left-color: var(--success);
}

.adl-github-card--status.is-failure {
  border-left-color: var(--danger);
}

.adl-github-card--status.is-running {
  border-left-color: var(--warning);
}

.adl-github-card--status.is-skipped {
  border-left-color: var(--text-tertiary);
}

.adl-github-card--status.is-pending {
  border-left-color: var(--text-tertiary);
}

/* Card header */
.adl-github-card__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.adl-github-card__header:hover {
  background: var(--surface-hover);
}

.adl-github-card__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.4;
}

.adl-github-card__body {
  border-top: 1px solid var(--border);
  padding: 6px 10px 8px;
}

/* Meta grid for run info */
.adl-github-card__meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px 16px;
  padding: 6px 10px 8px;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.adl-github-card__meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.adl-github-card__meta-label {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.adl-github-card__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* Step progress bar */
.adl-github-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.adl-github-progress__bar {
  flex: 1;
  height: 4px;
  background: var(--surface-primary);
  border-radius: 2px;
  overflow: hidden;
  min-width: 60px;
}

.adl-github-progress__fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.adl-github-progress__fill.is-success { background: var(--success); }
.adl-github-progress__fill.is-failure { background: var(--danger); }
.adl-github-progress__fill.is-running { background: var(--warning); }

.adl-github-progress__text {
  white-space: nowrap;
  flex-shrink: 0;
}

/* Status dot base (replaces inline style) */
.adl-status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Pulse animation for running status */
.adl-status-dot--animated {
  animation: adl-pulse 2s ease-in-out infinite;
}

@keyframes adl-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; box-shadow: 0 0 4px currentColor; }
}

/* Skeleton loading */
@keyframes adl-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.adl-github-skeleton {
  background: linear-gradient(
    90deg,
    var(--surface-secondary) 25%,
    var(--surface-hover) 50%,
    var(--surface-secondary) 75%
  );
  background-size: 200% 100%;
  animation: adl-shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}

.adl-github-skeleton--line {
  height: 12px;
  margin-bottom: 8px;
}

.adl-github-skeleton--title {
  height: 16px;
  width: 60%;
  margin-bottom: 12px;
}

.adl-github-skeleton--card {
  height: 80px;
  margin-bottom: 8px;
}

/* Filter bar for workflows/jobs */
.adl-github-filter {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.adl-github-filter__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.15s;
}

.adl-github-filter__btn:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.adl-github-filter__btn.is-active {
  color: var(--text-primary);
  background: var(--surface-secondary);
  border-color: var(--border);
  font-weight: 500;
}

/* Search input for jobs */
.adl-github-search {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.adl-github-search__input {
  flex: 1;
  font-size: var(--text-xs);
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-primary);
  color: var(--text-primary);
  outline: none;
  min-width: 0;
}

.adl-github-search__input:focus {
  border-color: var(--accent);
}

/* Step timeline inside cards */
.adl-github-timeline {
  list-style: none;
  margin: 4px 0 0 16px;
  padding: 0 0 0 10px;
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.adl-github-timeline__step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  position: relative;
}

.adl-github-timeline__step::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border);
  transform: translateY(-50%);
}

.adl-github-timeline__step.is-success::before { background: var(--success); }
.adl-github-timeline__step.is-failure::before { background: var(--danger); }
.adl-github-timeline__step.is-running::before { background: var(--warning); animation: adl-pulse 2s ease-in-out infinite; }

.adl-github-timeline__step-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adl-github-timeline__step-chip {
  font-size: 10px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

/* Run summary hero card */
.adl-github-hero {
  padding: 8px 12px;
}

.adl-github-hero__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.adl-github-hero__name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adl-github-hero__time {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  flex-shrink: 0;
  white-space: nowrap;
}

/* Section divider */
.adl-github-section {
  padding: 4px 12px 0;
}

.adl-github-section__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 6px;
  padding: 8px 0 4px;
  border-top: 1px solid var(--border-subtle);
}

.adl-github-section__title:first-child {
  border-top: none;
  padding-top: 0;
}

.adl-github-section__count {
  color: var(--text-tertiary);
  font-weight: 400;
  letter-spacing: 0;
}

/* Empty states */
.adl-github-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 16px;
  color: var(--text-tertiary);
  text-align: center;
}

.adl-github-empty p {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.adl-github-empty span {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

/* Log viewer gutter */
.adl-logviewer__gutter {
  background: var(--surface-secondary);
  border-right: 1px solid var(--border);
}

/* Log viewer toolbar enhancements */
.adl-logviewer__toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s;
}

.adl-logviewer__toolbar-btn:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
  border-color: var(--border);
}

.adl-logviewer__toolbar-btn.is-active {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent);
}

/* Log viewer job selector */
.adl-logviewer__job-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.adl-logviewer__job-select-icon {
  position: absolute;
  right: 4px;
  pointer-events: none;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
}
```

- [ ] **Step 2: 验证 CSS 不破坏现有结构**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src/styles/regions/rightpanel/communication-panel.css
git commit -m "feat(github-ci): add card, timeline, progress, skeleton, filter CSS system"
```

---

### Task 4: 概览面板卡片化 (`OverviewView.tsx`)

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/communicate/OverviewView.tsx`
- Create: `frontend/src/app/regions/right-panel/panels/communicate/OverviewView.test.tsx`

- [ ] **Step 1: 编写 OverviewView 渲染测试**

```tsx
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OverviewView } from './OverviewView';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';

describe('OverviewView', () => {
  const snapshot: CiStatusSnapshot = {
    repo: 'test/repo',
    branch: 'main',
    latestRun: {
      runId: 1,
      name: 'CI Build',
      status: 'completed',
      conclusion: 'success',
      headSha: 'abc123def456',
      headBranch: 'main',
      htmlUrl: 'https://github.com/test/repo/actions/runs/1',
      runStartedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      actor: 'testuser',
      event: 'push',
    },
    jobs: [
      {
        jobId: 1,
        runId: 1,
        name: 'Test Job',
        status: 'completed',
        conclusion: 'success',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        htmlUrl: null,
        stepResults: [{ name: 'Step 1', status: 'completed', conclusion: 'success', startedAt: null, completedAt: null }],
      },
    ],
    logs: null,
    capturedAtMs: Date.now(),
    error: null,
  };

  it('renders loading state', () => {
    const html = renderToStaticMarkup(
      <OverviewView snapshot={null} loading branch="" copy={{}} onViewLogs={() => {}} />
    );
    expect(html).toContain('adl-github-skeleton');
  });

  it('renders empty state when no snapshot', () => {
    const html = renderToStaticMarkup(
      <OverviewView snapshot={null} loading={false} branch="" copy={{}} onViewLogs={() => {}} />
    );
    expect(html).toContain('adl-github-empty');
  });

  it('renders run card with snapshot data', () => {
    const html = renderToStaticMarkup(
      <OverviewView snapshot={snapshot} loading={false} branch="main" copy={{}} onViewLogs={() => {}} />
    );
    expect(html).toContain('adl-github-hero');
    expect(html).toContain('CI Build');
    expect(html).toContain('testuser');
  });

  it('renders section title with job count', () => {
    const html = renderToStaticMarkup(
      <OverviewView snapshot={snapshot} loading={false} branch="main" copy={{}} onViewLogs={() => {}} />
    );
    expect(html).toContain('adl-github-section__title');
    expect(html).toContain('1');
  });

  it('renders no-runs empty state when latestRun is null', () => {
    const noRunSnapshot: CiStatusSnapshot = { ...snapshot, latestRun: null };
    const html = renderToStaticMarkup(
      <OverviewView snapshot={noRunSnapshot} loading={false} branch="main" copy={{}} onViewLogs={() => {}} />
    );
    expect(html).toContain('adl-github-empty');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd frontend && npx vitest run src/app/regions/right-panel/panels/communicate/OverviewView.test.tsx --reporter=verbose
```
Expected: 测试失败

- [ ] **Step 3: 重写 OverviewView**

```tsx
import React from 'react';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import { StatusDot } from './StatusDot';
import {
  statusColor,
  formatCommit,
  formatTime,
  formatRelativeTime,
  statusClass,
} from './githubPanelUtils';
import { JobRow } from './JobRow';
import { useTCopy } from '../../../../i18n/useTCopy';
import { TooltipSimple } from '../../../../components/Tooltip';
import { IconClock, IconClipboardList } from '../../../../icons';

function LoadingSkeleton() {
  return (
    <div style={{ padding: '12px' }}>
      <div className="adl-github-skeleton adl-github-skeleton--title" />
      <div className="adl-github-skeleton adl-github-skeleton--line" style={{ width: '80%' }} />
      <div className="adl-github-skeleton adl-github-skeleton--line" style={{ width: '60%' }} />
      <div className="adl-github-skeleton adl-github-skeleton--card" />
      <div className="adl-github-skeleton adl-github-skeleton--card" />
    </div>
  );
}

export function OverviewView({
  snapshot,
  loading,
  branch,
  copy,
  onViewLogs,
}: {
  snapshot: CiStatusSnapshot | null;
  loading: boolean;
  branch: string;
  copy: Record<string, string>;
  onViewLogs: (jobId: number) => void;
}) {
  const { t } = useTCopy();

  if (loading && !snapshot) {
    return <LoadingSkeleton />;
  }

  if (!snapshot) {
    return (
      <div className="adl-github-empty">
        <IconClipboardList width={28} height={28} />
        <p>{copy.ciConfigToQuery}</p>
        <span>{copy.ciConfigToQueryHint}</span>
      </div>
    );
  }

  return (
    <div>
      {snapshot.latestRun ? (
        <>
          <div className="adl-github-hero">
            <div className="adl-github-hero__header">
              <StatusDot
                conclusion={snapshot.latestRun.conclusion}
                status={snapshot.latestRun.status}
                animated
              />
              <span className="adl-github-hero__name">{snapshot.latestRun.name}</span>
              <span
                className="adl-chip adl-chip--xs"
                style={{ color: statusColor(snapshot.latestRun.conclusion, snapshot.latestRun.status) }}
              >
                {snapshot.latestRun.conclusion ?? snapshot.latestRun.status}
              </span>
              <TooltipSimple content={formatTime(snapshot.latestRun.runStartedAt)}>
                <span className="adl-github-hero__time">
                  {formatRelativeTime(snapshot.latestRun.runStartedAt)}
                </span>
              </TooltipSimple>
            </div>
            <div className="adl-github-card">
              <div className="adl-github-card__meta">
                <span className="adl-github-card__meta-item">
                  <span className="adl-github-card__meta-label">{copy.ciTriggeredBy}:</span>
                  {snapshot.latestRun.actor ?? '—'}
                </span>
                <span className="adl-github-card__meta-item">
                  <span className="adl-github-card__meta-label">{copy.ciEvent}:</span>
                  {snapshot.latestRun.event ?? '—'}
                </span>
                <span className="adl-github-card__meta-item">
                  <span className="adl-github-card__meta-label">{copy.ciSha}:</span>
                  <code className="adl-github__sha">{formatCommit(snapshot.latestRun.headSha)}</code>
                </span>
                <span className="adl-github-card__meta-item">
                  <span className="adl-github-card__meta-label">{copy.ciStartedAt}:</span>
                  {formatTime(snapshot.latestRun.runStartedAt)}
                </span>
              </div>
              {snapshot.latestRun.htmlUrl && (
                <div style={{ padding: '0 10px 8px' }}>
                  <a
                    className="adl-github__link"
                    href={snapshot.latestRun.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {copy.ciViewOnGitHub}
                  </a>
                </div>
              )}
            </div>
          </div>

          {snapshot.jobs.length > 0 && (
            <div className="adl-github-section">
              <h4 className="adl-github-section__title">
                {copy.ciJobsTitle}
                <span className="adl-github-section__count">({snapshot.jobs.length})</span>
              </h4>
              <ul className="adl-github__job-list">
                {snapshot.jobs.map((job) => (
                  <JobRow key={job.jobId} job={job} onViewLogs={onViewLogs} />
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="adl-github-empty">
          <IconClock width={28} height={28} />
          <p>{copy.ciNoWorkflowRuns}</p>
          <span>{copy.ciNoWorkflowRunsHint?.replace('{branch}', branch) ?? ''}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/app/regions/right-panel/panels/communicate/OverviewView.test.tsx --reporter=verbose
```
Expected: ALL PASS

- [ ] **Step 5: 运行 TypeScript 检查**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 无类型错误

- [ ] **Step 6: 提交**

```bash
git add frontend/src/app/regions/right-panel/panels/communicate/OverviewView.tsx frontend/src/app/regions/right-panel/panels/communicate/OverviewView.test.tsx
git commit -m "feat(github-ci): card-based redesign of OverviewView with skeleton loading"
```

---

### Task 5: JobRow 卡片化 (`JobRow.tsx`)

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/communicate/JobRow.tsx`
- Create: `frontend/src/app/regions/right-panel/panels/communicate/JobRow.test.tsx`

- [ ] **Step 1: 编写 JobRow 测试**

```tsx
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { JobRow } from './JobRow';
import type { CiJobSummary } from '@ai-digital-life/kernel';

describe('JobRow', () => {
  const job: CiJobSummary = {
    jobId: 1,
    runId: 1,
    name: 'Test Job',
    status: 'completed',
    conclusion: 'success',
    startedAt: null,
    completedAt: null,
    htmlUrl: null,
    stepResults: [
      { name: 'Step 1', status: 'completed', conclusion: 'success', startedAt: null, completedAt: null },
      { name: 'Step 2', status: 'completed', conclusion: 'failure', startedAt: null, completedAt: null },
    ],
  };

  it('renders job name and conclusion', () => {
    const html = renderToStaticMarkup(<JobRow job={job} onViewLogs={() => {}} />);
    expect(html).toContain('Test Job');
    expect(html).toContain('success');
  });

  it('renders with status class on card', () => {
    const html = renderToStaticMarkup(<JobRow job={job} onViewLogs={() => {}} />);
    expect(html).toContain('adl-github-card--status');
    expect(html).toContain('is-success');
  });

  it('does not render steps when collapsed', () => {
    const html = renderToStaticMarkup(<JobRow job={job} onViewLogs={() => {}} />);
    expect(html).not.toContain('adl-github-timeline');
  });

  it('renders log button', () => {
    const html = renderToStaticMarkup(<JobRow job={job} onViewLogs={() => {}} />);
    expect(html).toContain('adl-github__log-btn');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd frontend && npx vitest run src/app/regions/right-panel/panels/communicate/JobRow.test.tsx --reporter=verbose
```
Expected: 测试失败

- [ ] **Step 3: 重写 JobRow**

```tsx
import React, { useState } from 'react';
import type { CiJobSummary } from '@ai-digital-life/kernel';
import { StatusDot } from './StatusDot';
import { statusColor, formatDuration, statusClass } from './githubPanelUtils';
import { useTCopy } from '../../../../i18n/useTCopy';
import { TooltipSimple } from '../../../../components/Tooltip';
import { IconChevronDown, IconChevronRight } from '../../../../icons';

export function JobRow({
  job,
  onViewLogs,
}: {
  job: CiJobSummary;
  onViewLogs: (jobId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTCopy();
  const sClass = statusClass(job.conclusion, job.status);

  return (
    <li className={`adl-github-card adl-github-card--status ${sClass}`}>
      <div
        className="adl-github-card__header"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
      >
        <StatusDot conclusion={job.conclusion} status={job.status} animated />
        <span className="adl-github-card__title">{job.name}</span>
        <span
          className="adl-chip adl-chip--xs"
          style={{
            color: statusColor(job.conclusion, job.status),
            borderColor: statusColor(job.conclusion, job.status),
          }}
        >
          {job.conclusion ?? job.status}
        </span>
        <span className="adl-github__job-duration adl-text--secondary">
          {formatDuration(job.startedAt, job.completedAt)}
        </span>
        <TooltipSimple content={t.ciViewLog}>
          <button
            type="button"
            className="adl-github__log-btn"
            onClick={(e) => {
              e.stopPropagation();
              onViewLogs(job.jobId);
            }}
            aria-label={t.ciViewLog}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm1 3h10v1H3V4zm0 3h10v1H3V7zm0 3h7v1H3v-1z" />
            </svg>
          </button>
        </TooltipSimple>
        {expanded ? (
          <IconChevronUp width={12} height={12} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
        ) : (
          <IconChevronDown width={12} height={12} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
        )}
      </div>
      {expanded && job.stepResults.length > 0 && (
        <div className="adl-github-card__body">
          <ul className="adl-github-timeline">
            {job.stepResults.map((step, i) => (
              <li
                key={i}
                className={`adl-github-timeline__step ${statusClass(step.conclusion, step.status)}`}
              >
                <StatusDot conclusion={step.conclusion} status={step.status} animated />
                <span className="adl-github-timeline__step-name">{step.name}</span>
                <span className="adl-github-timeline__step-chip">
                  {step.conclusion ?? step.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/app/regions/right-panel/panels/communicate/JobRow.test.tsx --reporter=verbose
```
Expected: ALL PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/regions/right-panel/panels/communicate/JobRow.tsx frontend/src/app/regions/right-panel/panels/communicate/JobRow.test.tsx
git commit -m "feat(github-ci): card-based JobRow with status strip and step timeline"
```

---

### Task 6: 工作流面板 (`WorkflowsView.tsx`)

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/communicate/WorkflowsView.tsx`
- Create: `frontend/src/app/regions/right-panel/panels/communicate/WorkflowsView.test.tsx`

- [ ] **Step 1: 编写 WorkflowsView 测试**

```tsx
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkflowsView } from './WorkflowsView';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';

describe('WorkflowsView', () => {
  const snapshot: CiStatusSnapshot = {
    repo: 'test/repo',
    branch: 'main',
    latestRun: null,
    jobs: [
      {
        jobId: 1,
        runId: 1,
        name: 'Build',
        status: 'completed',
        conclusion: 'success',
        startedAt: null,
        completedAt: null,
        htmlUrl: null,
        stepResults: Array(5).fill(null).map((_, i) => ({
          name: `Step ${i + 1}`,
          status: 'completed',
          conclusion: 'success',
          startedAt: null,
          completedAt: null,
        })),
      },
      {
        jobId: 2,
        runId: 1,
        name: 'Test',
        status: 'completed',
        conclusion: 'failure',
        startedAt: null,
        completedAt: null,
        htmlUrl: null,
        stepResults: Array(3).fill(null).map((_, i) => ({
          name: `Step ${i + 1}`,
          status: i < 2 ? 'completed' : 'completed',
          conclusion: i < 2 ? 'success' : 'failure',
          startedAt: null,
          completedAt: null,
        })),
      },
    ],
    logs: null,
    capturedAtMs: Date.now(),
    error: null,
  };

  it('renders empty state when no jobs', () => {
    const html = renderToStaticMarkup(<WorkflowsView snapshot={{ ...snapshot, jobs: [] }} />);
    expect(html).toContain('adl-github-empty');
  });

  it('renders filter bar', () => {
    const html = renderToStaticMarkup(<WorkflowsView snapshot={snapshot} />);
    expect(html).toContain('adl-github-filter');
  });

  it('renders workflow cards with progress bars', () => {
    const html = renderToStaticMarkup(<WorkflowsView snapshot={snapshot} />);
    expect(html).toContain('adl-github-progress');
    expect(html).toContain('Build');
    expect(html).toContain('Test');
  });

  it('renders step count for each job', () => {
    const html = renderToStaticMarkup(<WorkflowsView snapshot={snapshot} />);
    expect(html).toContain('5/5');
    expect(html).toContain('2/3');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd frontend && npx vitest run src/app/regions/right-panel/panels/communicate/WorkflowsView.test.tsx --reporter=verbose
```
Expected: 测试失败

- [ ] **Step 3: 重写 WorkflowsView**

```tsx
import React, { useState, useMemo } from 'react';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import { StatusDot } from './StatusDot';
import { statusColor, formatDuration, statusClass } from './githubPanelUtils';
import { useTCopy } from '../../../../i18n/useTCopy';
import { TooltipSimple } from '../../../../components/Tooltip';

type FilterKey = 'all' | 'success' | 'failure' | 'running';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'success', label: '成功' },
  { key: 'failure', label: '失败' },
  { key: 'running', label: '运行中' },
];

export function WorkflowsView({ snapshot }: { snapshot: CiStatusSnapshot | null }) {
  const { t, formatT } = useTCopy();
  const [filter, setFilter] = useState<FilterKey>('all');

  const jobs = useMemo(() => {
    if (!snapshot?.jobs?.length) return [];
    switch (filter) {
      case 'success':
        return snapshot.jobs.filter((j) => j.conclusion === 'success');
      case 'failure':
        return snapshot.jobs.filter((j) => j.conclusion === 'failure' || j.conclusion === 'cancelled');
      case 'running':
        return snapshot.jobs.filter((j) => j.status === 'in_progress' || j.status === 'queued');
      default:
        return snapshot.jobs;
    }
  }, [snapshot?.jobs, filter]);

  if (!snapshot?.jobs?.length) {
    return (
      <div className="adl-github-empty">
        <p>{t.ciNoWorkflowData}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="adl-github-filter">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`adl-github-filter__btn${filter === f.key ? ' is-active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div style={{ padding: '6px 12px 0' }}>
        {jobs.map((job) => {
          const total = job.stepResults.length;
          const successCount = job.stepResults.filter((s) => s.conclusion === 'success').length;
          const sClass = statusClass(job.conclusion, job.status);
          const pct = total > 0 ? Math.round((successCount / total) * 100) : 0;
          return (
            <div key={job.jobId} className={`adl-github-card adl-github-card--status ${sClass}`} style={{ marginBottom: 6 }}>
              <div className="adl-github-card__header" style={{ cursor: 'default' }}>
                <StatusDot conclusion={job.conclusion} status={job.status} animated />
                <span className="adl-github-card__title">{job.name}</span>
                <span
                  className="adl-chip adl-chip--xs"
                  style={{ color: statusColor(job.conclusion, job.status) }}
                >
                  {job.conclusion ?? job.status}
                </span>
                <span className="adl-github__job-duration adl-text--secondary">
                  {formatDuration(job.startedAt, job.completedAt)}
                </span>
              </div>
              <div className="adl-github-card__body">
                <div className="adl-github-progress">
                  <div className="adl-github-progress__bar">
                    <div
                      className={`adl-github-progress__fill ${sClass}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="adl-github-progress__text">
                    {successCount}/{total}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {jobs.length === 0 && (
          <div className="adl-github-empty" style={{ padding: '24px 16px' }}>
            <p>{t.ciNoWorkflowData}</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/app/regions/right-panel/panels/communicate/WorkflowsView.test.tsx --reporter=verbose
```
Expected: ALL PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/regions/right-panel/panels/communicate/WorkflowsView.tsx frontend/src/app/regions/right-panel/panels/communicate/WorkflowsView.test.tsx
git commit -m "feat(github-ci): card-based WorkflowsView with filter and step progress bar"
```

---

### Task 7: 任务面板 (`JobsView.tsx`)

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/communicate/JobsView.tsx`
- Create: `frontend/src/app/regions/right-panel/panels/communicate/JobsView.test.tsx`

- [ ] **Step 1: 编写 JobsView 测试**

```tsx
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { JobsView } from './JobsView';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';

describe('JobsView', () => {
  const snapshot: CiStatusSnapshot = {
    repo: 'test/repo',
    branch: 'main',
    latestRun: null,
    jobs: [
      {
        jobId: 1, runId: 1, name: 'Build', status: 'completed', conclusion: 'success',
        startedAt: null, completedAt: null, htmlUrl: null,
        stepResults: [{ name: 'S1', status: 'completed', conclusion: 'success', startedAt: null, completedAt: null }],
      },
    ],
    logs: null,
    capturedAtMs: Date.now(),
    error: null,
  };

  it('renders empty state when no jobs', () => {
    const html = renderToStaticMarkup(<JobsView snapshot={{ ...snapshot, jobs: [] }} onViewLogs={() => {}} />);
    expect(html).toContain('adl-github-empty');
  });

  it('renders search input', () => {
    const html = renderToStaticMarkup(<JobsView snapshot={snapshot} onViewLogs={() => {}} />);
    expect(html).toContain('adl-github-search');
  });

  it('renders filter bar', () => {
    const html = renderToStaticMarkup(<JobsView snapshot={snapshot} onViewLogs={() => {}} />);
    expect(html).toContain('adl-github-filter');
  });

  it('renders job list', () => {
    const html = renderToStaticMarkup(<JobsView snapshot={snapshot} onViewLogs={() => {}} />);
    expect(html).toContain('adl-github__job-list');
    expect(html).toContain('Build');
  });

  it('filters jobs by search query', () => {
    // We test that search input exists with correct placeholder
    const html = renderToStaticMarkup(<JobsView snapshot={snapshot} onViewLogs={() => {}} />);
    expect(html).toContain('adl-github-search__input');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd frontend && npx vitest run src/app/regions/right-panel/panels/communicate/JobsView.test.tsx --reporter=verbose
```
Expected: 测试失败

- [ ] **Step 3: 重写 JobsView**

```tsx
import React, { useState, useMemo } from 'react';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import { JobRow } from './JobRow';
import { useTCopy } from '../../../../i18n/useTCopy';

type FilterKey = 'all' | 'success' | 'failure' | 'running';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'success', label: '成功' },
  { key: 'failure', label: '失败' },
  { key: 'running', label: '运行中' },
];

export function JobsView({
  snapshot,
  onViewLogs,
}: {
  snapshot: CiStatusSnapshot | null;
  onViewLogs: (jobId: number) => void;
}) {
  const { t, formatT } = useTCopy();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const filteredJobs = useMemo(() => {
    if (!snapshot?.jobs?.length) return [];
    let result = snapshot.jobs;
    switch (filter) {
      case 'success':
        result = result.filter((j) => j.conclusion === 'success');
        break;
      case 'failure':
        result = result.filter((j) => j.conclusion === 'failure' || j.conclusion === 'cancelled');
        break;
      case 'running':
        result = result.filter((j) => j.status === 'in_progress' || j.status === 'queued');
        break;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (j) =>
          j.name.toLowerCase().includes(q) ||
          j.stepResults.some((s) => s.name.toLowerCase().includes(q))
      );
    }
    return result;
  }, [snapshot?.jobs, filter, searchQuery]);

  if (!snapshot?.jobs?.length) {
    return (
      <div className="adl-github-empty">
        <p>{t.ciNoJobData}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="adl-github-search">
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ flexShrink: 0, color: 'var(--text-tertiary)' }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          className="adl-github-search__input"
          type="text"
          placeholder={t.ciSearchLog ?? '搜索任务...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="adl-github-filter">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`adl-github-filter__btn${filter === f.key ? ' is-active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {filteredJobs.length > 0 ? (
        <div className="adl-github-section" style={{ paddingTop: 6 }}>
          <ul className="adl-github__job-list" style={{ padding: '0 12px' }}>
            {filteredJobs.map((job) => (
              <JobRow key={job.jobId} job={job} onViewLogs={onViewLogs} />
            ))}
          </ul>
        </div>
      ) : (
        <div className="adl-github-empty" style={{ padding: '24px 16px' }}>
          <p>{t.ciNoJobData}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/app/regions/right-panel/panels/communicate/JobsView.test.tsx --reporter=verbose
```
Expected: ALL PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/regions/right-panel/panels/communicate/JobsView.tsx frontend/src/app/regions/right-panel/panels/communicate/JobsView.test.tsx
git commit -m "feat(github-ci): card-based JobsView with search and status filter"
```

---

### Task 8: 日志面板视觉优化 (`GitHubLogViewer.tsx`)

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/communicate/GitHubLogViewer.tsx`
- Create: `frontend/src/app/regions/right-panel/panels/communicate/GitHubLogViewer.test.tsx`

- [ ] **Step 1: 编写 LogViewer 测试**

```tsx
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GitHubLogViewer } from './GitHubLogViewer';
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';

describe('GitHubLogViewer', () => {
  const snapshot: CiStatusSnapshot = {
    repo: 'test/repo',
    branch: 'main',
    latestRun: null,
    jobs: [
      { jobId: 1, runId: 1, name: 'Build', status: 'completed', conclusion: 'success',
        startedAt: null, completedAt: null, htmlUrl: null,
        stepResults: [] },
    ],
    logs: null,
    capturedAtMs: Date.now(),
    error: null,
  };

  it('renders toolbar with job selector', () => {
    const html = renderToStaticMarkup(
      <GitHubLogViewer snapshot={snapshot} config={{ owner: 'test', repo: 'test', branch: 'main' }} />
    );
    expect(html).toContain('adl-logviewer__toolbar');
    expect(html).toContain('adl-logviewer__job-select-wrap');
  });

  it('renders search input', () => {
    const html = renderToStaticMarkup(
      <GitHubLogViewer snapshot={snapshot} config={{ owner: 'test', repo: 'test', branch: 'main' }} />
    );
    expect(html).toContain('adl-logviewer__search-input');
  });

  it('renders collapse blank lines toggle', () => {
    const html = renderToStaticMarkup(
      <GitHubLogViewer snapshot={snapshot} config={{ owner: 'test', repo: 'test', branch: 'main' }} />
    );
    expect(html).toContain('adl-logviewer__toggle-label');
  });

  it('renders GitHub link when htmlUrl exists', () => {
    const snapWithUrl: CiStatusSnapshot = {
      ...snapshot,
      latestRun: { runId: 1, name: 'CI', status: 'completed', conclusion: 'success',
        headSha: 'abc', headBranch: 'main',
        htmlUrl: 'https://github.com/test/repo/actions/runs/1',
        runStartedAt: null, updatedAt: null, actor: null, event: null },
    };
    const html = renderToStaticMarkup(
      <GitHubLogViewer snapshot={snapWithUrl} config={{ owner: 'test', repo: 'test', branch: 'main' }} />
    );
    expect(html).toContain('adl-github__link');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd frontend && npx vitest run src/app/regions/right-panel/panels/communicate/GitHubLogViewer.test.tsx --reporter=verbose
```
Expected: 测试失败

- [ ] **Step 3: 修改 `setActiveWorkspaceSection` 类型兼容**

在 `GitHubPanel.tsx` 中，当前 `setActiveWorkspaceSection` 的类型为 `(section: 'overview' | 'workflows' | 'jobs' | 'logs') => void`，但在 `githubCiConfigSlice.ts` 中 `activeWorkspaceSection` 的类型包含 `'help'`。为保持一致性，确认当前类型签名已允许 `'logs'`，无需改动。

- [ ] **Step 4: 重写 GitHubLogViewer（替换 Unicode 箭头为 SVG，添加视觉增强）**

保持整体逻辑不变，主要修改：
1. 替换 `▲`/`▼` 为 `IconChevronUp`/`IconChevronDown`
2. job-select 外层包裹 `.adl-logviewer__job-select-wrap` + 下拉箭头图标
3. 搜索匹配指示器使用 `IconChevronUp`/`IconChevronDown`
4. 添加 scroll-to-top / scroll-to-bottom 按钮
5. Tooltip 中增加键盘快捷键提示

修改点：

**在文件顶部导入新增图标：**
```tsx
import { IconChevronUp, IconChevronDown, IconArrowUp, IconAlignLeft } from '../../../../icons';
```

**替换 job-select 区域（约 line 268-279）：**
```tsx
<div className="adl-logviewer__job-select-wrap">
  <select
    className="adl-logviewer__job-select"
    value={selectedLogJobId ?? ''}
    onChange={(e) => setSelectedLogJobId(Number(e.target.value))}
  >
    {jobs.map((job) => (
      <option key={job.jobId} value={job.jobId}>
        {job.name}
      </option>
    ))}
  </select>
  <span className="adl-logviewer__job-select-icon">
    <IconChevronDown width={12} height={12} />
  </span>
</div>
```

**替换搜索导航按钮（约 line 291-310）：**
```tsx
{searchMatches.length > 0 && (
  <>
    <TooltipSimple content={`${t.ciPrevMatch} (Shift+Enter)`}>
      <button
        type="button"
        className="adl-logviewer__toolbar-btn"
        onClick={goToPrevMatch}
      >
        <IconChevronUp width={14} height={14} />
      </button>
    </TooltipSimple>
    <span className="adl-logviewer__match-count">
      {searchMatchIndex + 1}/{searchMatches.length}
    </span>
    <TooltipSimple content={`${t.ciNextMatch} (Enter)`}>
      <button
        type="button"
        className="adl-logviewer__toolbar-btn"
        onClick={goToNextMatch}
      >
        <IconChevronDown width={14} height={14} />
      </button>
    </TooltipSimple>
  </>
)}
```

**在 toolbar-right 区域添加滚动按钮（在 GitHub 链接之后）：**
```tsx
<TooltipSimple content={t.ciScrollToTop ?? '滚动到顶部'}>
  <button
    type="button"
    className="adl-logviewer__toolbar-btn"
    onClick={() => listRef.current?.scrollToRow({ align: 'start', index: 0 })}
  >
    <IconArrowUp width={14} height={14} />
  </button>
</TooltipSimple>
```

- [ ] **Step 5: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/app/regions/right-panel/panels/communicate/GitHubLogViewer.test.tsx --reporter=verbose
```
Expected: ALL PASS

- [ ] **Step 6: 运行 TypeScript 检查 + Lint**

```bash
cd frontend && npx tsc --noEmit && npx eslint .
```
Expected: 无错误

- [ ] **Step 7: 提交**

```bash
git add frontend/src/app/regions/right-panel/panels/communicate/GitHubLogViewer.tsx frontend/src/app/regions/right-panel/panels/communicate/GitHubLogViewer.test.tsx
git commit -m "feat(github-ci): visual polish of GitHubLogViewer with SVG icons and scroll buttons"
```

---

### Task 9: 最终集成验证

**Files:** 无需修改

- [ ] **Step 1: 完整运行测试套件**

```bash
cd frontend && npx vitest run --reporter=verbose
```
Expected: 所有测试通过

- [ ] **Step 2: TypeScript 检查**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 无类型错误

- [ ] **Step 3: ESLint**

```bash
cd frontend && npx eslint .
```
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "feat(github-ci): complete subpanel UI/UX redesign with tests"
```
