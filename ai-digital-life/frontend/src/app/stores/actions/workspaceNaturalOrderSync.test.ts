import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../slicedStore';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';

vi.mock('@utils/theme', () => ({
  themeController: { setTheme: vi.fn(), hydrate: vi.fn() },
}));
vi.mock('@shared/resolveTheme', () => ({
  resolveCurrentTheme: vi.fn(() => 'light'),
}));

const mockUpdatePreferences = vi.fn();

function makeWorkspace(
  id: string,
  overrides: Partial<{
    removedFromSidebar: boolean;
    hiddenFromRightPanels: boolean;
    available: boolean;
  }> = {},
) {
  return {
    id,
    path: `/${id}`,
    rootPath: `/${id}`,
    name: id,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: overrides.removedFromSidebar ?? false,
    available: overrides.available ?? true,
    hiddenFromRightPanels: overrides.hiddenFromRightPanels ?? false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    app: {
      updatePreferences: mockUpdatePreferences.mockResolvedValue({ ok: true, data: {} }),
      getModelHealth: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    },
  };
  useAppStore.setState({
    appInfo: {
      appName: 'test',
      version: '0.0.0',
      config: {
        themeMode: 'light',
        resolvedTheme: 'light',
        logLevel: 'info',
        terminalLogMode: 'overwrite',
        debugLogMode: 'overwrite',
        maxRecentWorkspaces: 10,
        modelPreferences: { providers: {} },
        keybinds: {},
        fonts: {},
        language: 'zh-CN',
        maxConcurrentWorkspaces: 6,
        workspacePriorityIds: [],
        workspaceDeferredIds: [],
        workspaceNaturalOrder: [],
      },
      recentLogs: [],
    },
    recentWorkspaces: [],
    error: undefined,
    isFetching: {},
  });
});

describe('syncNewWorkspacesToNaturalOrder', () => {
  it('inserts new stray workspace IDs at head of naturalOrder', async () => {
    // Import after mocks are set up
    const { syncNewWorkspacesToNaturalOrder } = await import('./workspaceNaturalOrderSync');

    const baseAppInfo = useAppStore.getState().appInfo!;
    const baseConfig = baseAppInfo.config;
    useAppStore.setState({
      appInfo: {
        ...baseAppInfo,
        config: {
          ...baseConfig,
          workspacePriorityIds: ['ws-1'],
          workspaceNaturalOrder: ['ws-2'],
        },
      },
      recentWorkspaces: [
        makeWorkspace('ws-1'),
        makeWorkspace('ws-2'),
        // ws-3 is new — not in any list
        makeWorkspace('ws-3'),
      ],
    });

    syncNewWorkspacesToNaturalOrder();

    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.workspaceNaturalOrder).toEqual(['ws-3', 'ws-2']);
  });

  it('does nothing when no new strays appear', async () => {
    const { syncNewWorkspacesToNaturalOrder } = await import('./workspaceNaturalOrderSync');

    const baseAppInfo = useAppStore.getState().appInfo!;
    const baseConfig = baseAppInfo.config;
    useAppStore.setState({
      appInfo: {
        ...baseAppInfo,
        config: {
          ...baseConfig,
          workspacePriorityIds: ['ws-1'],
          workspaceNaturalOrder: ['ws-2'],
        },
      },
      recentWorkspaces: [makeWorkspace('ws-1'), makeWorkspace('ws-2')],
    });

    syncNewWorkspacesToNaturalOrder();
    expect(mockUpdatePreferences).not.toHaveBeenCalled();
  });

  it('filters out removed-from-sidebar workspaces from strays', async () => {
    const { syncNewWorkspacesToNaturalOrder } = await import('./workspaceNaturalOrderSync');

    useAppStore.setState({
      recentWorkspaces: [
        // ws-1 is removed from sidebar — should NOT be synced into naturalOrder
        makeWorkspace('ws-1', { removedFromSidebar: true }),
        // ws-2 is visible and not in any list — should be synced
        makeWorkspace('ws-2'),
      ],
    });

    syncNewWorkspacesToNaturalOrder();
    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.workspaceNaturalOrder).toEqual(['ws-2']);
  });

  it('filters out unavailable workspaces from strays', async () => {
    const { syncNewWorkspacesToNaturalOrder } = await import('./workspaceNaturalOrderSync');

    useAppStore.setState({
      recentWorkspaces: [
        // ws-1 is unavailable — should NOT be synced into naturalOrder
        makeWorkspace('ws-1', { available: false }),
        // ws-2 is available and not in any list — should be synced
        makeWorkspace('ws-2'),
      ],
    });

    syncNewWorkspacesToNaturalOrder();
    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.workspaceNaturalOrder).toEqual(['ws-2']);
  });

  it('prunes orphan IDs from priority/deferred/natural lists', async () => {
    const { syncNewWorkspacesToNaturalOrder } = await import('./workspaceNaturalOrderSync');

    const baseAppInfo = useAppStore.getState().appInfo!;
    const baseConfig = baseAppInfo.config;
    useAppStore.setState({
      appInfo: {
        ...baseAppInfo,
        config: {
          ...baseConfig,
          workspacePriorityIds: ['ghost'],
          workspaceDeferredIds: ['ws-1', 'phantom'],
          workspaceNaturalOrder: ['ws-2', 'spectre'],
        },
      },
      recentWorkspaces: [makeWorkspace('ws-1'), makeWorkspace('ws-2')],
    });

    syncNewWorkspacesToNaturalOrder();

    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.workspacePriorityIds).toEqual([]);
    expect(patch.workspaceDeferredIds).toEqual(['ws-1']);
    expect(patch.workspaceNaturalOrder).toEqual(['ws-2']);
  });
});
