import { describe, it, expect } from 'vitest';
import { createSessionSlice } from '../sessionSlice';
import type { SessionSlice } from '../sessionSlice';

function createMockStore() {
  let state: Record<string, unknown> = {};
  const get = () => state;
  const set = (partial: unknown) => {
    if (typeof partial === 'function') {
      const next = (partial as (s: Record<string, unknown>) => Record<string, unknown>)(state);
      state = { ...state, ...next };
    } else {
      state = { ...state, ...(partial as Record<string, unknown>) };
    }
  };
  state = { ...createSessionSlice(set as never, get as never) };
  return { get };
}

describe('sessionSlice', () => {
  it('setSessions sets sessions array', () => {
    const { get } = createMockStore();
    const sessions = [{ id: 's1' }] as never[];
    (get() as SessionSlice).setSessions(sessions);
    expect((get() as SessionSlice).sessions).toEqual(sessions);
  });

  it('setActiveSessionId sets active session id', () => {
    const { get } = createMockStore();
    (get() as SessionSlice).setActiveSessionId('s1');
    expect((get() as SessionSlice).activeSessionId).toBe('s1');
  });

  it('setActiveSessionId with undefined clears active session id', () => {
    const { get } = createMockStore();
    (get() as SessionSlice).setActiveSessionId(undefined);
    expect((get() as SessionSlice).activeSessionId).toBeUndefined();
  });

  it('setSessionDetail adds a session detail', () => {
    const { get } = createMockStore();
    const detail = { messages: [] } as never;
    (get() as SessionSlice).setSessionDetail('s1', detail);
    expect((get() as SessionSlice).sessionDetails['s1']).toBe(detail);
  });

  it('setSessionDetail replaces existing detail for same id', () => {
    const { get } = createMockStore();
    (get() as SessionSlice).setSessionDetail('s1', { messages: ['a'] } as never);
    (get() as SessionSlice).setSessionDetail('s1', { messages: ['b'] } as never);
    expect((get() as SessionSlice).sessionDetails['s1'].messages).toEqual(['b']);
  });

  it('setSessionDetails merges multiple details', () => {
    const { get } = createMockStore();
    (get() as SessionSlice).setSessionDetail('s1', { messages: ['a'] } as never);
    (get() as SessionSlice).setSessionDetails({ s2: { messages: ['b'] } } as never);
    expect((get() as SessionSlice).sessionDetails['s1'].messages).toEqual(['a']);
    expect((get() as SessionSlice).sessionDetails['s2'].messages).toEqual(['b']);
  });

  it('removeSessionDetail removes a session detail', () => {
    const { get } = createMockStore();
    (get() as SessionSlice).setSessionDetail('s1', { messages: [] } as never);
    (get() as SessionSlice).removeSessionDetail('s1');
    expect((get() as SessionSlice).sessionDetails['s1']).toBeUndefined();
  });

  it('setActiveRun sets the active run', () => {
    const { get } = createMockStore();
    const run = { id: 'r1' } as never;
    (get() as SessionSlice).setActiveRun(run);
    expect((get() as SessionSlice).activeRun).toBe(run);
  });

  it('setActiveRun with undefined clears the active run', () => {
    const { get } = createMockStore();
    (get() as SessionSlice).setActiveRun(undefined);
    expect((get() as SessionSlice).activeRun).toBeUndefined();
  });

  it('setStreamingText sets streaming text', () => {
    const { get } = createMockStore();
    (get() as SessionSlice).setStreamingText('hello');
    expect((get() as SessionSlice).streamingAssistantText).toBe('hello');
  });

  it('setStreamingText overwrites previous text', () => {
    const { get } = createMockStore();
    (get() as SessionSlice).setStreamingText('hello');
    (get() as SessionSlice).setStreamingText('world');
    expect((get() as SessionSlice).streamingAssistantText).toBe('world');
  });

  it('setStreamingRunId sets the streaming run id', () => {
    const { get } = createMockStore();
    (get() as SessionSlice).setStreamingRunId('r1');
    expect((get() as SessionSlice).streamingActiveRunId).toBe('r1');
  });

  it('setStreamingRunId with undefined clears streaming run id', () => {
    const { get } = createMockStore();
    (get() as SessionSlice).setStreamingRunId(undefined);
    expect((get() as SessionSlice).streamingActiveRunId).toBeUndefined();
  });

  it('clearStreaming clears streaming text and run id', () => {
    const { get } = createMockStore();
    (get() as SessionSlice).setStreamingText('hello');
    (get() as SessionSlice).setStreamingRunId('r1');
    (get() as SessionSlice).clearStreaming();
    expect((get() as SessionSlice).streamingAssistantText).toBe('');
    expect((get() as SessionSlice).streamingActiveRunId).toBeUndefined();
  });

  it('flushStreamingText does nothing when buffer is empty', () => {
    const { get } = createMockStore();
    (get() as SessionSlice).setStreamingText('existing');
    (get() as SessionSlice).flushStreamingText();
    expect((get() as SessionSlice).streamingAssistantText).toBe('existing');
  });

  it('setRunUsage updates usage for a run id', () => {
    const { get } = createMockStore();
    const usage = { promptTokens: 10, completionTokens: 20, totalTokens: 30 };
    (get() as SessionSlice).setRunUsage('r1', usage as never);
    expect((get() as SessionSlice).runUsageByRunId['r1']).toEqual(usage);
  });

  it('runActivityByRunId initializes as empty', () => {
    const { get } = createMockStore();
    expect((get() as SessionSlice).runActivityByRunId).toEqual({});
  });

  it('runUsageByRunId initializes as empty', () => {
    const { get } = createMockStore();
    expect((get() as SessionSlice).runUsageByRunId).toEqual({});
  });
});
