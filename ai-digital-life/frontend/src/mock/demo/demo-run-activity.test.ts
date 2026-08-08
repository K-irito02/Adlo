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
