import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createDemoStreamSimulator, type DemoStreamSimulator } from './demo-stream-simulator';
import type { DigitalLifeModelStreamEventV1, DigitalLifeRunActivityEventV1 } from '@ai-digital-life/kernel';
import { resetDemoConversation, getDemoSessionDetail } from './demo-conversation';
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

  it('emits done only after the final delta and appends no duplicate run-done', async () => {
    const promise = simulator.sendMessage({
      sessionId: DEMO_SESSION_IDS.tools,
      content: '时序测试',
    });
    await vi.advanceTimersByTimeAsync(6000);
    await promise;

    const doneIndex = modelEvents.findIndex((e) => e.type === 'done');
    expect(doneIndex).toBeGreaterThan(-1);
    const deltas = modelEvents.filter((e) => e.type === 'delta');
    expect(deltas.length).toBeGreaterThan(0);
    let lastDeltaIndex = -1;
    modelEvents.forEach((e, i) => {
      if (e.type === 'delta') {
        lastDeltaIndex = i;
      }
    });
    expect(doneIndex).toBeGreaterThan(lastDeltaIndex);

    const runDoneEvents = activityEvents.filter((e) => e.type === 'run-done');
    expect(runDoneEvents.length).toBe(1);
  });

  it('cancelMessage returns an aborted detail without creating a phantom run or mutating sessions', async () => {
    const sessionBefore = getDemoSessionDetail(DEMO_SESSION_IDS.tools)!.messages.length;
    const aborted = await simulator.cancelMessage('run-demo-1234567890');
    await vi.advanceTimersByTimeAsync(6000);

    expect(aborted?.run.id).toBe('run-demo-1234567890');
    expect(aborted?.run.status).toBe('aborted');
    expect(getDemoSessionDetail(DEMO_SESSION_IDS.tools)!.messages.length).toBe(sessionBefore);
    expect(modelEvents.some((e) => e.type === 'done')).toBe(false);
  });

  it('persists the user message in the demo conversation after a send', async () => {
    const promise = simulator.sendMessage({
      sessionId: DEMO_SESSION_IDS.tools,
      content: '会留在会话里的用户消息',
    });
    await vi.advanceTimersByTimeAsync(6000);
    await promise;

    const detail = getDemoSessionDetail(DEMO_SESSION_IDS.tools)!;
    const lastUser = [...detail.messages].reverse().find((m) => m.role === 'user');
    expect(lastUser?.content).toBe('会留在会话里的用户消息');
    const lastMessage = detail.messages[detail.messages.length - 1];
    expect(lastMessage.role).toBe('assistant');
  });
});
