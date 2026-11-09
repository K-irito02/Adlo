import { describe, expect, it, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import { useAppStore } from '@stores/slicedStore';
import { terminalXtermPool } from '../terminalXtermPool';

const xtermMock = vi.hoisted(() => ({ writes: [] as string[], disposed: 0 }));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    options: Record<string, unknown> = {};
    loadAddon(): void {}
    open(): void {}
    write(data: string): void {
      xtermMock.writes.push(data);
    }
    resize(): void {}
    dispose(): void {
      xtermMock.disposed += 1;
    }
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit(): void {}
    proposeDimensions(): { cols: number; rows: number } {
      return { cols: 80, rows: 24 };
    }
  },
}));

vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));

function fakeTerminal(): Terminal {
  return { write: vi.fn() } as unknown as Terminal;
}

function flushPending(sessionId: string, terminal: Terminal): void {
  (
    terminalXtermPool as unknown as { flushPending: (id: string, t: Terminal) => void }
  ).flushPending(sessionId, terminal);
}

describe('terminalXtermPool 输出缓冲与尺寸测量', () => {
  it('池条目不存在时缓冲输出，flush 时一次性补写并清空', () => {
    const sessionId = 'pool-test-buffer';
    const terminal = fakeTerminal();

    terminalXtermPool.write(sessionId, 'PS ');
    terminalXtermPool.write(sessionId, '> ');
    expect(terminal.write).not.toHaveBeenCalled();

    flushPending(sessionId, terminal);
    expect(terminal.write).toHaveBeenCalledTimes(1);
    expect(terminal.write).toHaveBeenCalledWith('PS > ');

    // 已清空：再次 flush 不重复补写
    flushPending(sessionId, terminal);
    expect(terminal.write).toHaveBeenCalledTimes(1);
  });

  it('rekey 把旧会话实例改名给新会话并用 RIS 清屏，避免重建 xterm', () => {
    const entry = {
      terminal: { reset: vi.fn(), write: vi.fn() },
      fitAddon: {},
      hostEl: document.createElement('div'),
      sessionId: 'pool-test-rekey-old',
    };
    const internals = terminalXtermPool as unknown as {
      pool: Map<string, typeof entry>;
    };
    internals.pool.set('pool-test-rekey-old', entry);

    expect(terminalXtermPool.rekey('pool-test-rekey-old', 'pool-test-rekey-new')).toBe(true);
    expect(entry.terminal.reset).not.toHaveBeenCalled();
    expect(entry.terminal.write).toHaveBeenCalledWith('\x1bc');
    expect(entry.sessionId).toBe('pool-test-rekey-new');
    expect(internals.pool.get('pool-test-rekey-new')).toBe(entry);
    expect(internals.pool.has('pool-test-rekey-old')).toBe(false);

    internals.pool.delete('pool-test-rekey-new');
  });

  it('rekey 找不到旧实例时返回 false（调用方走新建路径）', () => {
    expect(terminalXtermPool.rekey('pool-test-missing', 'pool-test-missing-2')).toBe(false);
  });

  it('acquire 把池条目建立前的缓冲补写到新实例（公共路径）', () => {
    const sessionId = 'pool-test-acquire';
    xtermMock.writes.length = 0;
    const container = document.createElement('div');
    document.body.appendChild(container);

    terminalXtermPool.write(sessionId, 'hello');
    terminalXtermPool.acquire(sessionId, container);

    expect(xtermMock.writes).toContain('hello');
    terminalXtermPool.release(sessionId);
    container.remove();
  });

  it('dropPending 丢弃缓冲后 acquire 不再补写', () => {
    const sessionId = 'pool-test-drop';
    xtermMock.writes.length = 0;
    const container = document.createElement('div');
    document.body.appendChild(container);

    terminalXtermPool.write(sessionId, 'stale');
    terminalXtermPool.dropPending(sessionId);
    terminalXtermPool.acquire(sessionId, container);

    expect(xtermMock.writes).not.toContain('stale');
    terminalXtermPool.release(sessionId);
    container.remove();
  });

  it('rekey 找不到旧条目时清掉旧 key 缓冲（旧 key acquire 不再补写）', () => {
    const from = 'pool-test-rekey-missing-old';
    const to = 'pool-test-rekey-missing-new';
    xtermMock.writes.length = 0;
    const container = document.createElement('div');
    document.body.appendChild(container);

    terminalXtermPool.write(from, 'stale');
    expect(terminalXtermPool.rekey(from, to)).toBe(false);
    terminalXtermPool.acquire(from, container);

    expect(xtermMock.writes).not.toContain('stale');
    terminalXtermPool.release(from);
    container.remove();
  });

  it('acquire 命中已存在条目时补写缓冲（rekey 竞态）', () => {
    const oldId = 'pool-test-existing-old';
    const newId = 'pool-test-existing-new';
    xtermMock.writes.length = 0;
    const container = document.createElement('div');
    document.body.appendChild(container);

    terminalXtermPool.acquire(oldId, container);
    terminalXtermPool.write(newId, 'late-first-prompt');
    terminalXtermPool.rekey(oldId, newId);
    terminalXtermPool.acquire(newId, container);

    expect(xtermMock.writes).toContain('late-first-prompt');
    terminalXtermPool.release(newId);
    container.remove();
  });

  it('measureDimensions 复用离屏宿主、同步字号并在字号变化时重建', () => {
    const internals = terminalXtermPool as unknown as {
      measureEntry: {
        hostEl: HTMLDivElement;
        fontSize: number;
        terminal: { options: Record<string, unknown> };
      } | null;
    };
    const first = terminalXtermPool.measureDimensions(640, 480);
    expect(first).toEqual({ cols: 80, rows: 24 });
    const hostEl = internals.measureEntry?.hostEl;
    expect(hostEl).toBeTruthy();

    const second = terminalXtermPool.measureDimensions(320, 240);
    expect(second).toEqual({ cols: 80, rows: 24 });
    expect(internals.measureEntry?.hostEl).toBe(hostEl);

    terminalXtermPool.setFontSize(18);
    expect(internals.measureEntry?.terminal.options.fontSize).toBe(18);
    expect(internals.measureEntry?.fontSize).toBe(18);

    // store 字号变化 → measureDimensions 重建离屏实例（旧宿主释放 + 新宿主）
    const hostBeforeFontChange = internals.measureEntry?.hostEl;
    const disposedBefore = xtermMock.disposed;
    useAppStore.setState({ terminalFontSize: 20 });
    terminalXtermPool.measureDimensions(640, 480);
    expect(internals.measureEntry?.hostEl).not.toBe(hostBeforeFontChange);
    expect(hostBeforeFontChange?.isConnected).toBe(false);
    expect(xtermMock.disposed).toBe(disposedBefore + 1);
    expect(internals.measureEntry?.fontSize).toBe(20);
  });

  it('池条目已存在时 write 直接写入实例（不进入缓冲）', () => {
    const sessionId = 'pool-test-direct';
    xtermMock.writes.length = 0;
    const container = document.createElement('div');
    document.body.appendChild(container);
    terminalXtermPool.acquire(sessionId, container);

    terminalXtermPool.write(sessionId, 'direct');

    expect(xtermMock.writes).toContain('direct');
    terminalXtermPool.release(sessionId);
    container.remove();
  });

  it('非法/零尺寸直接返回 null，不触碰测量终端', () => {
    expect(terminalXtermPool.measureDimensions(0, 100)).toBeNull();
    expect(terminalXtermPool.measureDimensions(100, 0)).toBeNull();
    expect(terminalXtermPool.measureDimensions(Number.NaN, 100)).toBeNull();
  });
});
