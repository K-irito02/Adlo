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
