import { describe, expect, it, afterEach } from 'vitest';
import { createPtyWsClient, type PtyWsClient } from '../pty-ws';

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

    // pb 仍挂起：与已结算标记竞速，应判为 pending
    const race = await Promise.race([pb.then(() => 'settled'), Promise.resolve('pending')]);
    expect(race).toBe('pending');

    sock.serverPush({ kind: 'created', sessionId: 's9' });
    await expect(pb).resolves.toEqual({ ok: true, data: { sessionId: 's9' } });
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
});
