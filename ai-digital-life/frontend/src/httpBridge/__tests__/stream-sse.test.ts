import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Task 8 TDD — SSE event bridge over EventSource.
 *
 * The ad-server `/event` stream carries `SessionPartEvent` JSON (camelCase,
 * `type` discriminator). The bridge maps/filters those records into the v1
 * stream contracts: `DigitalLifeModelStreamEventV1` (message.part.delta /
 * message.updated), `DigitalLifeRunActivityEventV1` (tool-part run phases),
 * `DigitalLifeTerminalStreamEventV1` (bash tool output), and `PtyOutputEvent`
 * (reused `/pty` WebSocket client from Task 6).
 */
class FakeEventSource {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  addEventListener(_: string, _fn: () => void) {}
  close() {}
  emit(data: string, recordId?: string) {
    this.onmessage?.({ data, lastEventId: recordId } as unknown as MessageEvent);
  }
}

class FakeWebSocket {
  url: string;
  sent: string[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  emit(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

function makeBridge(fake?: FakeEventSource) {
  const fakeES = fake ?? new FakeEventSource();
  const esFactory = vi.fn(() => fakeES as unknown as EventSource);
  return { fakeES, esFactory };
}

/** Factory that mints a fresh FakeEventSource per subscribe call (each
 *  `subscribe*` opens its own `/event` connection, like the real bridge). */
function makeMintingFactory() {
  const sources: FakeEventSource[] = [];
  const esFactory = vi.fn(() => {
    const fake = new FakeEventSource();
    sources.push(fake);
    return fake as unknown as EventSource;
  });
  return { sources, esFactory };
}

describe('httpBridge SSE event bridge', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('yields a mapped model delta on a message.part.delta SSE event', async () => {
    const { fakeES, esFactory } = makeBridge();
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({
      baseUrl: 'http://127.0.0.1:9999',
      eventSourceFactory: esFactory,
    });
    const got: unknown[] = [];
    bridge.subscribeModelStream((e) => got.push(e));

    fakeES.emit(
      JSON.stringify({
        type: 'message.part.delta',
        sessionID: 's1',
        messageID: 'run-1',
        partID: 'p1',
        field: 'text',
        delta: 'hi',
      }),
    );

    expect(got[0]).toMatchObject({ v: 1, runId: 'run-1', type: 'delta', text: 'hi' });
    expect(esFactory).toHaveBeenCalledWith('http://127.0.0.1:9999/event?after=latest');
  });

  it('uses ?after= for the initial lastEventId (resume-from replay)', async () => {
    const { esFactory } = makeBridge();
    const { createHttpBridge } = await import('../../httpBridge');
    createHttpBridge({
      baseUrl: 'http://127.0.0.1:9999/',
      eventSourceFactory: esFactory,
      lastEventId: 42,
    }).subscribeModelStream(() => {});

    expect(esFactory).toHaveBeenCalledWith('http://127.0.0.1:9999/event?after=42');
  });

  it('ignores SSE records that do not map to the model stream', async () => {
    const { fakeES, esFactory } = makeBridge();
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({
      baseUrl: 'http://127.0.0.1:9999',
      eventSourceFactory: esFactory,
    });
    const got: unknown[] = [];
    bridge.subscribeModelStream((e) => got.push(e));

    fakeES.emit(JSON.stringify({ type: 'session.status', sessionID: 's1', status: 'busy' }));

    expect(got).toHaveLength(0);
  });

  it('maps message.updated error to a model-stream error event', async () => {
    const { fakeES } = makeBridge();
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({
      baseUrl: 'http://127.0.0.1:9999',
      eventSourceFactory: () => fakeES as unknown as EventSource,
    });
    const got: unknown[] = [];
    bridge.subscribeModelStream((e) => got.push(e));

    fakeES.emit(
      JSON.stringify({
        type: 'message.updated',
        sessionID: 's1',
        info: { id: 'run-1', finish: 'error', error: 'boom' },
      }),
    );

    expect(got[0]).toMatchObject({ v: 1, runId: 'run-1', type: 'error', message: 'boom' });
  });

  it('maps message.updated completed to a model-stream done event', async () => {
    const { fakeES } = makeBridge();
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({
      baseUrl: 'http://127.0.0.1:9999',
      eventSourceFactory: () => fakeES as unknown as EventSource,
    });
    const got: unknown[] = [];
    bridge.subscribeModelStream((e) => got.push(e));

    fakeES.emit(
      JSON.stringify({
        type: 'message.updated',
        sessionID: 's1',
        info: { id: 'run-1', finish: 'completed' },
      }),
    );

    expect(got[0]).toMatchObject({ v: 1, runId: 'run-1', type: 'done' });
  });

  it('returns a synchronous unsubscribe that closes the EventSource', async () => {
    const { fakeES, esFactory } = makeBridge();
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({
      baseUrl: 'http://127.0.0.1:9999',
      eventSourceFactory: esFactory,
    });
    const closeSpy = vi.spyOn(fakeES, 'close');

    const unsubscribe = bridge.subscribeModelStream(() => {});

    expect(typeof unsubscribe).toBe('function');
    expect((unsubscribe as unknown as { then?: unknown }).then).toBeUndefined();
    unsubscribe();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('maps a completed bash tool part to run-activity command + terminal stdout/done', async () => {
    const { sources, esFactory } = makeMintingFactory();
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({
      baseUrl: 'http://127.0.0.1:9999',
      eventSourceFactory: esFactory,
    });
    const activity: unknown[] = [];
    const terminal: unknown[] = [];
    bridge.subscribeRunActivity((e) => activity.push(e));
    bridge.subscribeTerminalStream((e) => terminal.push(e));

    const wire = {
      type: 'message.part.updated',
      sessionID: 's1',
      messageID: 'run-1',
      partID: 'p1',
      part: {
        id: 'part_1',
        messageID: 'run-1',
        sessionID: 's1',
        type: 'tool',
        ordinal: 1,
        timeCreated: 1700000000000,
        data: {
          type: 'tool',
          tool: 'bash',
          callID: 'call_1',
          state: {
            status: 'completed',
            input: { command: 'npm run lint', workdir: '/repo' },
            output: 'lint ok',
            title: 'bash',
            metadata: { exitCode: 0, truncated: false },
            time: { start: 1700000000000, end: 1700000000500 },
          },
        },
      },
    };

    // Each subscription has its own EventSource connection, mirroring the real
    // bridge; the same wire record reaches both subscribers.
    sources[0].emit(JSON.stringify(wire));
    sources[1].emit(JSON.stringify(wire));

    expect(activity[0]).toMatchObject({
      v: 1,
      runId: 'run-1',
      type: 'command',
      phase: 'done',
      command: 'npm run lint',
    });
    expect(terminal[0]).toMatchObject({
      v: 1,
      executionId: 'call_1',
      type: 'stdout',
      text: 'lint ok',
    });
    expect(terminal[1]).toMatchObject({
      v: 1,
      executionId: 'call_1',
      type: 'done',
      exitCode: 0,
      success: true,
    });
  });

  it('subscribePtyOutput reuses the /pty WebSocket client (not SSE)', async () => {
    const { fakeES } = makeBridge();
    const fakeWs = new FakeWebSocket('ws://127.0.0.1:9999/pty');
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({
      baseUrl: 'http://127.0.0.1:9999',
      eventSourceFactory: () => fakeES as unknown as EventSource,
      ptyWsOptions: { wsFactory: () => fakeWs as unknown as WebSocket },
    });
    const listener = vi.fn();
    const unsubscribe = bridge.subscribePtyOutput(listener);

    fakeWs.open();
    fakeWs.emit({ kind: 'output', sessionId: 'p1', data: 'out' });

    expect(listener).toHaveBeenCalledWith({ sessionId: 'p1', data: 'out' });
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});

describe('Task 8 fix wave — live-only subscribe / reasoning-aware mapping / run-activity parity', () => {
  it('a cold subscribe opens ?after=latest (live-only) instead of replaying the whole event_log', async () => {
    const { esFactory } = makeBridge();
    const { createHttpBridge } = await import('../../httpBridge');
    createHttpBridge({
      baseUrl: 'http://127.0.0.1:9999',
      eventSourceFactory: esFactory,
    }).subscribeModelStream(() => {});

    expect(esFactory).toHaveBeenCalledWith('http://127.0.0.1:9999/event?after=latest');
  });

  it('a fresh subscribe resumes from the last seen seq (?after=) and never re-delivers pre-subscribe records', async () => {
    const { sources, esFactory } = makeMintingFactory();
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({
      baseUrl: 'http://127.0.0.1:9999',
      eventSourceFactory: esFactory,
    });
    const got: unknown[] = [];

    // First subscription consumes events up to event_log seq 7.
    const unsub1 = bridge.subscribeModelStream((e) => got.push(e));
    sources[0]!.emit(
      JSON.stringify({
        type: 'message.part.delta',
        sessionID: 's1',
        messageID: 'run-1',
        partID: 'p1',
        field: 'text',
        delta: 'hi',
      }),
      '7',
    );
    expect(got).toHaveLength(1);
    unsub1();

    // A fresh subscribe must open ?after=7 so the server replays nothing.
    const unsub2 = bridge.subscribeModelStream((e) => got.push(e));
    expect(esFactory).toHaveBeenLastCalledWith('http://127.0.0.1:9999/event?after=7');

    // Pre-subscribe records (seq <= 7) are never delivered even if replayed.
    sources[1]!.emit(
      JSON.stringify({
        type: 'message.part.delta',
        sessionID: 's1',
        messageID: 'run-1',
        partID: 'p2',
        field: 'text',
        delta: 'STALE',
      }),
      '5',
    );
    expect(got).toHaveLength(1);

    // Post-subscribe records still flow.
    sources[1]!.emit(
      JSON.stringify({
        type: 'message.part.delta',
        sessionID: 's1',
        messageID: 'run-1',
        partID: 'p2',
        field: 'text',
        delta: 'yo',
      }),
      '8',
    );
    expect(got).toHaveLength(2);
    expect(got[1]).toMatchObject({ v: 1, runId: 'run-1', type: 'delta', text: 'yo' });
    unsub2();
  });

  it('drops reasoning deltas so reasoning never leaks into the chat text', async () => {
    const { fakeES, esFactory } = makeBridge();
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({
      baseUrl: 'http://127.0.0.1:9999',
      eventSourceFactory: esFactory,
    });
    const got: unknown[] = [];
    bridge.subscribeModelStream((e) => got.push(e));

    // A reasoning part is announced via message.part.updated (data.type
    // "reasoning"), then streamed as message.part.delta with field "text".
    fakeES.emit(
      JSON.stringify({
        type: 'message.part.updated',
        sessionID: 's1',
        messageID: 'run-1',
        partID: 'r1',
        part: {
          id: 'r1',
          messageID: 'run-1',
          sessionID: 's1',
          type: 'reasoning',
          ordinal: 1,
          timeCreated: 1,
          data: { type: 'reasoning', text: '' },
        },
      }),
    );
    fakeES.emit(
      JSON.stringify({
        type: 'message.part.delta',
        sessionID: 's1',
        messageID: 'run-1',
        partID: 'r1',
        field: 'text',
        delta: 'thinking out loud',
      }),
    );
    expect(got).toHaveLength(0);

    // A text part still maps to a text delta.
    fakeES.emit(
      JSON.stringify({
        type: 'message.part.updated',
        sessionID: 's1',
        messageID: 'run-1',
        partID: 't1',
        part: {
          id: 't1',
          messageID: 'run-1',
          sessionID: 's1',
          type: 'text',
          ordinal: 2,
          timeCreated: 1,
          data: { type: 'text', text: '' },
        },
      }),
    );
    fakeES.emit(
      JSON.stringify({
        type: 'message.part.delta',
        sessionID: 's1',
        messageID: 'run-1',
        partID: 't1',
        field: 'text',
        delta: 'hello',
      }),
    );
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ v: 1, runId: 'run-1', type: 'delta', text: 'hello' });
  });

  it('emits a model run-activity event for message.updated usage (setRunUsage path)', async () => {
    const { fakeES } = makeBridge();
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({
      baseUrl: 'http://127.0.0.1:9999',
      eventSourceFactory: () => fakeES as unknown as EventSource,
    });
    const got: unknown[] = [];
    bridge.subscribeRunActivity((e) => got.push(e));

    fakeES.emit(
      JSON.stringify({
        type: 'message.updated',
        sessionID: 's1',
        info: {
          id: 'run-1',
          finish: 'completed',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        },
      }),
    );

    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({
      v: 1,
      runId: 'run-1',
      type: 'model',
      phase: 'done',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });
  });

  it('emits run-done for a busy→terminal session.status transition only', async () => {
    const { fakeES } = makeBridge();
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({
      baseUrl: 'http://127.0.0.1:9999',
      eventSourceFactory: () => fakeES as unknown as EventSource,
    });
    const got: unknown[] = [];
    bridge.subscribeRunActivity((e) => got.push(e));

    fakeES.emit(JSON.stringify({ type: 'session.status', sessionID: 's1', status: 'busy' }));
    expect(got).toHaveLength(0);

    fakeES.emit(JSON.stringify({ type: 'session.status', sessionID: 's1', status: 'active' }));
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ v: 1, runId: 's1', type: 'run-done', status: 'succeeded' });

    // A resting session's terminal status without a prior busy emits nothing.
    fakeES.emit(JSON.stringify({ type: 'session.status', sessionID: 's2', status: 'active' }));
    expect(got).toHaveLength(1);
  });

  it('keys run-done by the run id learned from the loop message events (Finding 3)', async () => {
    const { fakeES } = makeBridge();
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({
      baseUrl: 'http://127.0.0.1:9999',
      eventSourceFactory: () => fakeES as unknown as EventSource,
    });
    const got: unknown[] = [];
    bridge.subscribeRunActivity((e) => got.push(e));

    // The loop goes busy, then publishes message events carrying the run id
    // (assistant message id == run id), then a terminal session.status.
    fakeES.emit(JSON.stringify({ type: 'session.status', sessionID: 's1', status: 'busy' }));
    fakeES.emit(
      JSON.stringify({
        type: 'message.part.delta',
        sessionID: 's1',
        messageID: 'run-1',
        partID: 'p1',
        field: 'text',
        delta: 'hi',
      }),
    );
    fakeES.emit(JSON.stringify({ type: 'session.status', sessionID: 's1', status: 'active' }));

    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({
      v: 1,
      runId: 'run-1',
      type: 'run-done',
      status: 'succeeded',
    });
  });

  it('emits an approval decided run-activity event for question.replied', async () => {
    const { fakeES } = makeBridge();
    const { createHttpBridge } = await import('../../httpBridge');
    const bridge = createHttpBridge({
      baseUrl: 'http://127.0.0.1:9999',
      eventSourceFactory: () => fakeES as unknown as EventSource,
    });
    const got: unknown[] = [];
    bridge.subscribeRunActivity((e) => got.push(e));

    fakeES.emit(
      JSON.stringify({
        type: 'question.replied',
        sessionID: 's1',
        requestID: 'q1',
        answers: [{ value: 'yes' }],
      }),
    );

    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({
      v: 1,
      runId: 's1',
      type: 'approval',
      phase: 'decided',
      approvalId: 'q1',
    });
  });
});
