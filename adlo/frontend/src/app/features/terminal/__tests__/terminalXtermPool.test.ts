import { describe, expect, it, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import { terminalXtermPool } from '../terminalXtermPool';

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

  it('rekey 把旧会话实例改名给新会话并清屏，避免重建 xterm', () => {
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
    expect(entry.terminal.reset).toHaveBeenCalledTimes(1);
    expect(entry.sessionId).toBe('pool-test-rekey-new');
    expect(internals.pool.get('pool-test-rekey-new')).toBe(entry);
    expect(internals.pool.has('pool-test-rekey-old')).toBe(false);

    internals.pool.delete('pool-test-rekey-new');
  });

  it('rekey 找不到旧实例时返回 false（调用方走新建路径）', () => {
    expect(terminalXtermPool.rekey('pool-test-missing', 'pool-test-missing-2')).toBe(false);
  });

  it('非法/零尺寸直接返回 null，不触碰测量终端', () => {
    expect(terminalXtermPool.measureDimensions(0, 100)).toBeNull();
    expect(terminalXtermPool.measureDimensions(100, 0)).toBeNull();
    expect(terminalXtermPool.measureDimensions(Number.NaN, 100)).toBeNull();
  });
});
