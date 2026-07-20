import { describe, expect, it } from 'vitest';
import type {
  AppInfo,
  ConversationSessionRecord,
  RecentWorkspaceEntry,
} from '@ai-digital-life/kernel';
import { buildSidebarViewModel } from './sidebarViewModel';
import { GLOBAL_WORKSPACE_ID } from './workspaceScope';

const now = Date.now();

function buildWorkspace(id: string, path: string): RecentWorkspaceEntry {
  return {
    id,
    path,
    rootPath: path,
    name: path.split('/').pop() ?? path,
    lastOpenedAt: now,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
    hiddenFromRightPanels: false,
  };
}

function buildSession(id: string, workspaceId: string): ConversationSessionRecord {
  return {
    id,
    workspaceId,
    title: id,
    status: 'active',
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    manualUnread: false,
    lastReadAt: now,
    archivedAt: undefined,
    titleUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  };
}

describe('buildSidebarViewModel', () => {
  it('keeps global sessions in the standalone conversation section', () => {
    const recentWorkspaces = [buildWorkspace('workspace_a', 'E:/workspace-a')];
    const sessions = [
      buildSession('session-workspace', 'workspace_a'),
      buildSession('session-global', GLOBAL_WORKSPACE_ID),
    ];

    const viewModel = buildSidebarViewModel({
      recentWorkspaces,
      sessions,
      taskCenter: {
        tasks: [],
        pendingApprovals: [],
        policy: { mode: 'manual', summary: '', highRiskRules: [] },
      },
    });

    expect(viewModel.workspaces).toHaveLength(1);
    expect(viewModel.workspaces[0]?.sessions.map((item) => item.session.id)).toEqual([
      'session-workspace',
    ]);
    expect(viewModel.standaloneSessions.map((item) => item.session.id)).toEqual(['session-global']);
  });

  it('injects the current workspace into the project list when not yet in recent entries', () => {
    const appInfo: AppInfo = {
      appName: 'AI Digital Life',
      version: '0.1.0',
      config: {
        language: 'zh-CN',
        themeMode: 'system',
        resolvedTheme: 'light',
        logLevel: 'info',
        terminalLogMode: 'overwrite',
        debugLogMode: 'overwrite',
        maxRecentWorkspaces: 10,
        modelPreferences: {
          providers: {
            deepseek: { enabled: true, priority: 1, modelId: 'deepseek-v4-pro' },
            minimax: { enabled: true, priority: 2, modelId: 'MiniMax-M2.7' },
          },
        },
        keybinds: {},
        fonts: {},
        maxConcurrentWorkspaces: 6,
        workspacePriorityIds: [],
        workspaceDeferredIds: [],
        workspaceNaturalOrder: [],
      },
      currentWorkspace: {
        id: 'workspace_live',
        path: 'E:/live-workspace',
        rootPath: 'E:/live-workspace',
        name: 'live-workspace',
        type: 'node',
        status: 'ready',
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      },
      recentLogs: [],
    };

    const viewModel = buildSidebarViewModel({
      appInfo,
      recentWorkspaces: [],
      sessions: [buildSession('session-live', 'workspace_live')],
    });

    expect(viewModel.workspaces[0]?.workspace.id).toBe('workspace_live');
    expect(viewModel.workspaces[0]?.isCurrent).toBe(true);
  });

  it('groups large workspace and session lists without changing visible ordering', () => {
    const recentWorkspaces = Array.from({ length: 12 }, (_, index) =>
      buildWorkspace(`workspace_${index}`, `E:/workspace-${index}`),
    );
    const sessions = recentWorkspaces.flatMap((workspace, workspaceIndex) =>
      Array.from({ length: 8 }, (_, sessionIndex) =>
        buildSession(`session_${workspaceIndex}_${sessionIndex}`, workspace.id),
      ),
    );
    sessions.push(buildSession('session-global', GLOBAL_WORKSPACE_ID));
    sessions[3] = { ...sessions[3], archivedAt: now, status: 'archived' };

    const viewModel = buildSidebarViewModel({ recentWorkspaces, sessions });

    expect(viewModel.workspaces.map((item) => item.workspace.id)).toEqual(
      recentWorkspaces.map((workspace) => workspace.id),
    );
    expect(viewModel.workspaces[0]?.sessions.map((item) => item.session.id)).toEqual([
      'session_0_0',
      'session_0_1',
      'session_0_2',
      'session_0_4',
      'session_0_5',
      'session_0_6',
      'session_0_7',
    ]);
    expect(viewModel.workspaces[0]?.archivedSessions.map((item) => item.session.id)).toEqual([
      'session_0_3',
    ]);
    expect(viewModel.standaloneSessions.map((item) => item.session.id)).toEqual(['session-global']);
  });
});
