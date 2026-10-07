import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import type { TerminalTabState } from '@stores/slices/terminalSliceTypes';
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
let killSpy: ReturnType<typeof vi.fn>;

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
      kill: (killSpy = vi.fn()),
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

  it('handleCreatePane adds a pane and creates its PTY', async () => {
    useAppStore.getState().terminalCreateTab('powershell');
    const tabId = useAppStore.getState().terminalActiveTabId;
    await terminalPtyRuntime.handleCreatePane(tabId, 'bash');
    const tab = useAppStore.getState().terminalTabsById[tabId];
    expect(tab.panes).toHaveLength(2);
    expect(tab.panes[1].sessionId).toBeTruthy();
  });

  it('handleClosePane kills only that pane; last pane closes the tab', async () => {
    useAppStore.getState().terminalCreateTab('powershell');
    const tabId = useAppStore.getState().terminalActiveTabId;
    const paneId = useAppStore.getState().terminalAddPane(tabId, 'bash');
    terminalPtyRuntime.handleClosePane(tabId, paneId);
    expect(useAppStore.getState().terminalTabsById[tabId].panes).toHaveLength(1);
    const only = useAppStore.getState().terminalTabsById[tabId].panes[0].id;
    terminalPtyRuntime.handleClosePane(tabId, only);
    expect(useAppStore.getState().terminalTabsById[tabId]).toBeUndefined();
  });

  it('handleKillPane 杀死 PTY、标记窗格 terminated，但不释放 xterm 池（保留缓冲，Ruling C-7）', async () => {
    useAppStore.getState().terminalCreateTab('powershell');
    const tabId = useAppStore.getState().terminalActiveTabId;
    await terminalPtyRuntime.handleCreatePane(tabId, 'bash');
    const pane = useAppStore.getState().terminalTabsById[tabId].panes[1];
    expect(pane.sessionId).toBe('s1');
    expect(terminalPtyRuntime.hasLiveSession('s1')).toBe(true);
    const releaseSpy = vi.spyOn(terminalXtermPool, 'release');

    terminalPtyRuntime.handleKillPane({ tabId, paneId: pane.id, sessionId: pane.sessionId });

    expect(killSpy).toHaveBeenCalledWith('s1');
    // Ruling C-7：杀死进程 ≠ 关闭窗格，池条目（最后一段输出）必须保留。
    expect(releaseSpy).not.toHaveBeenCalled();
    expect(terminalPtyRuntime.hasLiveSession('s1')).toBe(false);
    const after = useAppStore
      .getState()
      .terminalTabsById[tabId].panes.find((p) => p.id === pane.id);
    expect(after?.status).toBe('terminated');
    expect(after?.sessionId).toBe('s1');
  });

  it('非初始标签变为活动时，其全部无会话窗格都重建 shell（spec §10）', async () => {
    // 恢复场景：应用重启后会话被 kill，持久化的窗格没有存活会话。
    useAppStore.getState().terminalCreateTab('powershell');
    const tabBId = useAppStore.getState().terminalActiveTabId;
    useAppStore.getState().terminalAddPane(tabBId, 'bash');
    const tabB = useAppStore.getState().terminalTabsById[tabBId];
    expect(tabB.panes).toHaveLength(2);
    expect(tabB.panes.every((pane) => !pane.sessionId)).toBe(true);

    const { rerender } = renderHook(
      ({ activeTab }: { activeTab: TerminalTabState | undefined }) =>
        useTerminalPtyLifecycle({ activeTab }),
      { initialProps: { activeTab: undefined as TerminalTabState | undefined } },
    );

    // 该标签成为活动标签：其每个无会话窗格都应被激活并拿到 sessionId。
    rerender({ activeTab: tabB });

    await waitFor(
      () => {
        const panes = useAppStore.getState().terminalTabsById[tabBId].panes;
        expect(panes.every((pane) => pane.sessionId)).toBe(true);
      },
      { timeout: 5000 },
    );
  });

  it('terminalSetActivePane 点按已活动窗格时不发通知，切换窗格时才通知', () => {
    useAppStore.getState().terminalCreateTab('powershell');
    const tabId = useAppStore.getState().terminalActiveTabId;
    const first = useAppStore.getState().terminalTabsById[tabId].panes[0].id;
    const second = useAppStore.getState().terminalAddPane(tabId, 'bash');

    let notifications = 0;
    const unsub = useAppStore.subscribe(() => {
      notifications += 1;
    });

    // addPane 刚把 second 置为活动窗格：再次点按它是彻底的无操作。
    useAppStore.getState().terminalSetActivePane(tabId, second);
    expect(notifications).toBe(0);

    // 切到另一个窗格是真实变化：恰好通知一次。
    useAppStore.getState().terminalSetActivePane(tabId, first);
    expect(notifications).toBe(1);

    unsub();
  });

  it('handleSelectPane 激活无会话的窗格（点击空白窗格重建 shell）', async () => {
    useAppStore.getState().terminalCreateTab('powershell');
    const tabId = useAppStore.getState().terminalActiveTabId;
    const paneId = useAppStore.getState().terminalAddPane(tabId, 'bash');
    expect(useAppStore.getState().terminalTabsById[tabId].panes[1].sessionId).toBeUndefined();

    terminalPtyRuntime.handleSelectPane(tabId, paneId);

    await waitFor(
      () => {
        const pane = useAppStore
          .getState()
          .terminalTabsById[tabId].panes.find((p) => p.id === paneId);
        expect(pane?.sessionId).toBeTruthy();
      },
      { timeout: 5000 },
    );
  });
});
