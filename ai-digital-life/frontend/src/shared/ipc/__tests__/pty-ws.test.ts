import { describe, expect, it, afterEach, vi } from 'vitest';
import { createPtyWsClient, CREATE_TIMEOUT_MS, type PtyWsClient } from '../pty-ws';

/** 可编程的假 WebSocket：构造即 OPEN，直发直收，由测试逐帧喂服务端回复。 */
class FakeSocket {
  readyState = 1;
  sent: string[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  send(text: string): void {
    this.sent.push(text);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  serverPush(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

let client: PtyWsClient | null = null;
let socket: FakeSocket | null = null;

function makeClient(): void {
  socket = new FakeSocket();
  const sock = socket;
  client = createPtyWsClient('http://127.0.0.1:1', {
    wsFactory: () => sock as unknown as WebSocket,
  });
}

afterEach(() => {
  client?.close();
  client = null;
  socket = null;
});

describe('pty-ws concurrent creates (FIFO)', () => {
  it('4 个并发 create 按序各自 resolve 到不同会话（重启恢复多窗格回归）', async () => {
    makeClient();
    const sock = socket as unknown as FakeSocket;
    const cl = client as unknown as PtyWsClient;

    const p1 = cl.pty.create({ cols: 80, rows: 24 });
    const p2 = cl.pty.create({ cols: 80, rows: 24 });
    const p3 = cl.pty.create({ cols: 80, rows: 24 });
    const p4 = cl.pty.create({ cols: 80, rows: 24 });
    expect(sock.sent).toHaveLength(4);

    // 服务端保序回复（见 pty_ws.rs 单读循环串行处理）
    sock.serverPush({ kind: 'created', sessionId: 's1' });
    sock.serverPush({ kind: 'created', sessionId: 's2' });
    sock.serverPush({ kind: 'created', sessionId: 's3' });
    sock.serverPush({ kind: 'created', sessionId: 's4' });

    await expect(p1).resolves.toEqual({ ok: true, data: { sessionId: 's1' } });
    await expect(p2).resolves.toEqual({ ok: true, data: { sessionId: 's2' } });
    await expect(p3).resolves.toEqual({ ok: true, data: { sessionId: 's3' } });
    await expect(p4).resolves.toEqual({ ok: true, data: { sessionId: 's4' } });
  });

  it('error 帧只结算队首，其余 create 不受影响', async () => {
    makeClient();
    const sock = socket as unknown as FakeSocket;
    const cl = client as unknown as PtyWsClient;

    const pa = cl.pty.create({ cols: 80, rows: 24 });
    const pb = cl.pty.create({ cols: 80, rows: 24 });

    sock.serverPush({ kind: 'error', message: 'boom' });
    await expect(pa).resolves.toMatchObject({ ok: false });

    // pb 仍挂起：settled 标记 + 一轮宏任务后仍未结算
    let pbSettled = false;
    void pb.then(() => {
      pbSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pbSettled).toBe(false);

    sock.serverPush({ kind: 'created', sessionId: 's9' });
    await expect(pb).resolves.toEqual({ ok: true, data: { sessionId: 's9' } });
  });

  it('带 sessionId 的 error 帧不归因到排队中的 create', async () => {
    makeClient();
    const sock = socket as unknown as FakeSocket;
    const cl = client as unknown as PtyWsClient;

    const pa = cl.pty.create({ cols: 80, rows: 24 });
    // 来自点对点操作（如向已死会话写）的错误：必须只记录，不结算排队请求
    sock.serverPush({ kind: 'error', sessionId: 'dead-session', message: 'write failed' });

    let paSettled = false;
    void pa.then(() => {
      paSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(paSettled).toBe(false);

    sock.serverPush({ kind: 'created', sessionId: 's1' });
    await expect(pa).resolves.toEqual({ ok: true, data: { sessionId: 's1' } });
  });

  it('超时只移除自己，其余排队项照常结算', async () => {
    vi.useFakeTimers();
    try {
      makeClient();
      const sock = socket as unknown as FakeSocket;
      const cl = client as unknown as PtyWsClient;

      const p1 = cl.pty.create({ cols: 80, rows: 24 });
      const p2 = cl.pty.create({ cols: 80, rows: 24 });
      const p3 = cl.pty.create({ cols: 80, rows: 24 });

      // 三者 timer 同批到期：全部超时，各自独立结算，无连带
      const results = [p1, p2, p3].map((p) => p.then((result) => result));
      await vi.advanceTimersByTimeAsync(CREATE_TIMEOUT_MS);
      for (const result of await Promise.all(results)) {
        expect(result).toMatchObject({ ok: false });
      }

      // 超时清空后新请求不受影响
      const p4 = cl.pty.create({ cols: 80, rows: 24 });
      sock.serverPush({ kind: 'created', sessionId: 's4' });
      await expect(p4).resolves.toEqual({ ok: true, data: { sessionId: 's4' } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('中间项超时不影响其余项（交错到期）', async () => {
    vi.useFakeTimers();
    try {
      makeClient();
      const sock = socket as unknown as FakeSocket;
      const cl = client as unknown as PtyWsClient;

      const p1 = cl.pty.create({ cols: 80, rows: 24 });
      await vi.advanceTimersByTimeAsync(10_000);
      const p2 = cl.pty.create({ cols: 80, rows: 24 });
      // 再推进 20s：p1 满 30s 超时，p2 仅 20s 仍挂起
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(p1).resolves.toMatchObject({ ok: false });

      let p2Settled = false;
      void p2.then(() => {
        p2Settled = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(p2Settled).toBe(false);

      sock.serverPush({ kind: 'created', sessionId: 's2' });
      await expect(p2).resolves.toEqual({ ok: true, data: { sessionId: 's2' } });
    } finally {
      vi.useRealTimers();
    }
  });

  it.todo('超时后迟到的 created 不应错配给队首（当前无 ID 协议下会错配，已在实现注释声明接受）');

  it('超限（32 个挂起）直接拒绝第 33 个，不建连副作用', async () => {
    makeClient();
    const cl = client as unknown as PtyWsClient;

    const pendings = Array.from({ length: 32 }, () => cl.pty.create({ cols: 80, rows: 24 }));
    const over = await cl.pty.create({ cols: 80, rows: 24 });
    // 调用方可编程断言的拒绝（与超时/关闭同一 IpcResult 通道）
    expect(over).toMatchObject({ ok: false });

    // 前 32 个仍有效：回一个即结算一个
    const sock = socket as unknown as FakeSocket;
    sock.serverPush({ kind: 'created', sessionId: 's1' });
    await expect(pendings[0]).resolves.toEqual({ ok: true, data: { sessionId: 's1' } });
  });

  it('close() 结算全部挂起的 create，不永久挂起', async () => {
    makeClient();
    const cl = client as unknown as PtyWsClient;

    const pa = cl.pty.create({ cols: 80, rows: 24 });
    const pb = cl.pty.create({ cols: 80, rows: 24 });
    cl.close();

    await expect(pa).resolves.toMatchObject({ ok: false });
    await expect(pb).resolves.toMatchObject({ ok: false });
  });

  it('空 sessionId 的 created 被丢弃，不结算排队项', async () => {
    makeClient();
    const sock = socket as unknown as FakeSocket;
    const cl = client as unknown as PtyWsClient;

    const pa = cl.pty.create({ cols: 80, rows: 24 });
    sock.serverPush({ kind: 'created', sessionId: '' });

    let paSettled = false;
    void pa.then(() => {
      paSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(paSettled).toBe(false);

    sock.serverPush({ kind: 'created', sessionId: 's1' });
    await expect(pa).resolves.toEqual({ ok: true, data: { sessionId: 's1' } });
  });

  it('无主 created 被丢弃，不进 knownSessions', async () => {
    makeClient();
    const sock = socket as unknown as FakeSocket;
    const cl = client as unknown as PtyWsClient;

    sock.serverPush({ kind: 'created', sessionId: 'ghost' });
    const list = await cl.pty.list();
    expect(list).toEqual({ ok: true, data: [] });
  });
});
