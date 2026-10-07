import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { useTerminalPtyLifecycle } from '../useTerminalPtyLifecycle';
import { terminalPtyRuntime } from '../terminalPtyRuntime';
import { terminalXtermPool, type PooledXterm } from '../terminalXtermPool';

interface PtyEvent {
  sessionId: string;
  data: string;
  terminated: boolean;
}

const initialActiveRightTool = useAppStore.getState().activeRightTool;

let emitPtyOutput: ((event: PtyEvent) => void) | null;
let subscribeSpy: ReturnType<typeof vi.fn>;
let writeSpy: ReturnType<typeof vi.fn>;

function fakePooledEntry(): PooledXterm {
  return {
    terminal: { write: writeSpy, cols: 80 } as unknown as PooledXterm['terminal'],
    fitAddon: {} as PooledXterm['fitAddon'],
    hostEl: document.createElement('div'),
    sessionId: 's1',
  };
}

beforeEach(() => {
  terminalPtyRuntime.reset();
  emitPtyOutput = null;
  writeSpy = vi.fn();
  vi.spyOn(terminalXtermPool, 'get').mockImplementation(() => fakePooledEntry());
  subscribeSpy = vi.fn((cb: (event: PtyEvent) => void) => {
    emitPtyOutput = cb;
    return () => {};
  });
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    subscribePtyOutput: subscribeSpy,
    pty: {
      create: vi.fn(async () => ({ ok: true, data: { sessionId: 's1' } })),
      input: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    },
    systemMonitor: { snapshot: vi.fn(async () => ({ ok: false })) },
  };
  useAppStore.setState({
    activeRightTool: 'files',
    terminalTabs: [],
    terminalTabsById: {},
    terminalActiveTabId: '',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  terminalPtyRuntime.reset();
  delete (window as unknown as { digitalLife?: unknown }).digitalLife;
  useAppStore.setState({ activeRightTool: initialActiveRightTool });
});

describe('terminalPtyRuntime 应用级单例', () => {
  it('右面板未停在终端工具时也订阅输出，并把输出写入 pooled xterm（门控已移除）', () => {
    renderHook(() => useTerminalPtyLifecycle({ activeTab: undefined }));

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    emitPtyOutput?.({ sessionId: 's1', data: 'hello', terminated: false });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith('hello');
  });

  it('面板 + 中心双挂载时全局只订阅一次，单事件只写一次', () => {
    renderHook(() => useTerminalPtyLifecycle({ activeTab: undefined }));
    renderHook(() => useTerminalPtyLifecycle({ activeTab: undefined }));

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    emitPtyOutput?.({ sessionId: 's1', data: 'x', terminated: false });
    emitPtyOutput?.({ sessionId: 's1', data: 'y', terminated: false });

    expect(writeSpy).toHaveBeenCalledTimes(2);
  });
});
