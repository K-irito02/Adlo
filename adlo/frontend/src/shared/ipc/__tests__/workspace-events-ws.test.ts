import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceEventsClient, toWorkspaceWsUrl } from '../workspace-events-ws';

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  readyState = 0;
  closeCalled = false;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  close() {
    this.closeCalled = true;
    this.readyState = 3;
  }
  serverOpen() {
    this.readyState = 1;
    this.onopen?.({});
  }
  serverSend(data: string) {
    this.onmessage?.({ data });
  }
  serverClose() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

const wsFactory = (url: string) => new FakeSocket(url) as unknown as WebSocket;

describe('toWorkspaceWsUrl', () => {
  it('maps http/https bases and trims slashes', () => {
    expect(toWorkspaceWsUrl('http://127.0.0.1:3080')).toBe('ws://127.0.0.1:3080/ws/workspace');
    expect(toWorkspaceWsUrl('https://h/')).toBe('wss://h/ws/workspace');
    expect(toWorkspaceWsUrl('')).toBe('/ws/workspace');
  });
});

describe('createWorkspaceEventsClient', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('dispatches valid frames and sanitizes dirty ones', () => {
    const client = createWorkspaceEventsClient('http://h', {
      wsFactory,
      reconnectDelayMs: 10,
    });
    const received: unknown[] = [];
    const unsubscribe = client.onFilesChanged((batch) => received.push(batch));
    const socket = FakeSocket.instances[0];
    socket.serverOpen();
    socket.serverSend('not json');
    socket.serverSend(JSON.stringify({ kind: 'other' }));
    socket.serverSend(JSON.stringify({ kind: 'files-changed', changed: 'x', removed: [1] }));
    socket.serverSend(
      JSON.stringify({ kind: 'files-changed', changed: ['a.md'], removed: [], overflow: true }),
    );
    expect(received).toEqual([
      { changed: [], removed: [], overflow: false },
      { changed: ['a.md'], removed: [], overflow: true },
    ]);
    unsubscribe();
    client.dispose();
  });

  it('carries the batch rootPath so consumers can route to one workspace', () => {
    const client = createWorkspaceEventsClient('http://h', {
      wsFactory,
      reconnectDelayMs: 10,
    });
    const received: unknown[] = [];
    const unsubscribe = client.onFilesChanged((batch) => received.push(batch));
    const socket = FakeSocket.instances[0];
    socket.serverOpen();
    socket.serverSend(
      JSON.stringify({
        kind: 'files-changed',
        rootPath: 'E:/repo',
        changed: ['a.md'],
        removed: [],
        overflow: false,
      }),
    );
    socket.serverSend(
      JSON.stringify({
        kind: 'files-changed',
        rootPath: '',
        changed: ['b.md'],
        removed: [],
        overflow: false,
      }),
    );
    expect(received).toEqual([
      { rootPath: 'E:/repo', changed: ['a.md'], removed: [], overflow: false },
      { changed: ['b.md'], removed: [], overflow: false },
    ]);
    unsubscribe();
    client.dispose();
  });

  it('ignores null frames without throwing', () => {
    const client = createWorkspaceEventsClient('http://h', {
      wsFactory,
      reconnectDelayMs: 10,
    });
    const received: unknown[] = [];
    const unsubscribe = client.onFilesChanged((batch) => received.push(batch));
    FakeSocket.instances[0].serverOpen();
    FakeSocket.instances[0].serverSend('null');
    expect(received).toEqual([]);
    unsubscribe();
    client.dispose();
  });

  it('unsubscribe closes the socket in any readyState', () => {
    const client = createWorkspaceEventsClient('http://h', {
      wsFactory,
      reconnectDelayMs: 10,
    });
    const unsubscribe = client.onFilesChanged(() => {});
    const socket = FakeSocket.instances[0];
    socket.readyState = 2; // CLOSING: old code would leak it forever
    unsubscribe();
    expect(socket.closeCalled).toBe(true);
    client.dispose();
  });

  it('emits an overflow batch on reconnect', () => {
    const client = createWorkspaceEventsClient('http://h', {
      wsFactory,
      reconnectDelayMs: 10,
    });
    const received: { overflow?: boolean }[] = [];
    const unsubscribe = client.onFilesChanged((batch) => received.push(batch));
    FakeSocket.instances[0].serverOpen();
    FakeSocket.instances[0].serverClose();
    vi.advanceTimersByTime(50);
    expect(FakeSocket.instances.length).toBe(2);
    FakeSocket.instances[1].serverOpen();
    expect(received).toEqual([{ changed: [], removed: [], overflow: true }]);
    unsubscribe();
    client.dispose();
  });

  it('routes clipboard-changed frames to clipboard listeners', () => {
    const client = createWorkspaceEventsClient('http://h', { wsFactory, reconnectDelayMs: 10 });
    const onFiles = vi.fn();
    const onClip = vi.fn();
    client.onFilesChanged(onFiles);
    client.onClipboardChanged(onClip);
    const socket = FakeSocket.instances[0];
    socket.serverOpen();
    socket.serverSend(JSON.stringify({ kind: 'clipboard-changed' }));
    expect(onClip).toHaveBeenCalledTimes(1);
    expect(onFiles).not.toHaveBeenCalled();
    client.dispose();
  });
});
