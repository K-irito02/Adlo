import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  registerNativeFileDropHandler,
  resetNativeFileDropHandlersForTest,
} from '../fileDropRouter';
import { useDragDropWorkspace } from '../useDragDropWorkspace';

interface DropPayload {
  type?: string;
  paths?: string[];
}

const channel = vi.hoisted(() => ({
  name: null as string | null,
  listener: null as ((payload: DropPayload) => void) | null,
}));

vi.mock('../../../tauri-bridge', () => ({ isTauriShell: () => true }));

vi.mock('../../../tauri-bridge/tauri-shared', () => ({
  subscribeChannel: (name: string, listener: (payload: DropPayload) => void) => {
    channel.name = name;
    channel.listener = listener;
    return () => {
      channel.listener = null;
    };
  },
}));

function mountHook() {
  const openWorkspace = vi.fn(async () => ({ ok: true }));
  const actions = { openWorkspace };
  const view = renderHook(() => useDragDropWorkspace(actions));
  return { openWorkspace, view };
}

function emitDrop(paths: string[]) {
  act(() => {
    channel.listener?.({ type: 'drop', paths });
  });
}

describe('useDragDropWorkspace（adl:file-drop 主通道）', () => {
  afterEach(() => {
    resetNativeFileDropHandlersForTest();
    channel.name = null;
    channel.listener = null;
    vi.clearAllMocks();
  });

  it('覆盖层消费落点后不得再打开工作区', () => {
    const { openWorkspace } = mountHook();
    expect(channel.name).toBe('adl:file-drop');
    registerNativeFileDropHandler(() => true);

    emitDrop(['C:/wall.png']);

    expect(openWorkspace).not.toHaveBeenCalled();
  });

  it('无覆盖层消费时把第一条路径交给工作区', () => {
    const { openWorkspace } = mountHook();

    emitDrop(['C:/folder', 'C:/other']);

    expect(openWorkspace).toHaveBeenCalledTimes(1);
    expect(openWorkspace).toHaveBeenCalledWith('C:/folder');
  });

  it('非 drop 类型与空路径不触发打开', () => {
    const { openWorkspace } = mountHook();

    act(() => {
      channel.listener?.({ type: 'enter', paths: ['C:/folder'] });
    });
    emitDrop([]);

    expect(openWorkspace).not.toHaveBeenCalled();
  });
});
