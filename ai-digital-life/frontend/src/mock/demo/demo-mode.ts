import type {
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  RecentWorkspaceEntry,
  ReorderWorkspacesInput,
} from '@ai-digital-life/kernel';
import type { DigitalLifeBridge } from '../../shared/ipc/digital-life';
import {
  DEMO_DOCUMENTS,
  DEMO_SESSION_IDS,
  DEMO_WORKSPACE_ID,
  DEMO_WORKSPACE_PATH,
} from './demo-constants';
import {
  buildDemoChangePreview,
  buildDemoGitSnapshot,
  buildDemoRecentEntry,
  buildDemoTree,
  buildDemoWorkspaceMeta,
  getDemoPatchSet,
} from './demo-workspace';
import { getDemoRunActivity } from './demo-run-activity';
import { getDemoSessions, getDemoSessionDetail } from './demo-conversation';
import { createDemoStreamSimulator } from './demo-stream-simulator';

const demoState = {
  active: false,
  modelListeners: new Set<(e: DigitalLifeModelStreamEventV1) => void>(),
  activityListeners: new Set<(e: DigitalLifeRunActivityEventV1) => void>(),
  simulator: null as ReturnType<typeof createDemoStreamSimulator> | null,
};

function emitModel(e: DigitalLifeModelStreamEventV1): void {
  for (const listener of demoState.modelListeners) {
    listener(e);
  }
}

function emitActivity(e: DigitalLifeRunActivityEventV1): void {
  for (const listener of demoState.activityListeners) {
    listener(e);
  }
}

function getSimulator() {
  if (!demoState.simulator) {
    demoState.simulator = createDemoStreamSimulator({ emitModel, emitActivity });
  }
  return demoState.simulator;
}

export function isDemoActive(): boolean {
  return demoState.active;
}

export function resetDemoModeForTest(): void {
  demoState.active = false;
  demoState.simulator = null;
  demoState.modelListeners.clear();
  demoState.activityListeners.clear();
}

export function withDemoMode(baseBridge: DigitalLifeBridge): DigitalLifeBridge {
  const demoEntry = buildDemoRecentEntry();

  const listRecentWithDemo = (list: RecentWorkspaceEntry[]): RecentWorkspaceEntry[] => {
    const withoutDemo = list.filter((entry) => entry.id !== DEMO_WORKSPACE_ID);
    return [demoEntry, ...withoutDemo];
  };

  const workspaceBridge = {
    ...baseBridge.workspace,
    listRecent: async () => {
      const result = await baseBridge.workspace.listRecent();
      if (result.ok) {
        return { ok: true as const, data: listRecentWithDemo(result.data) };
      }
      return result;
    },
    open: async (workspacePath: string) => {
      if (workspacePath === DEMO_WORKSPACE_PATH) {
        demoState.active = true;
        return { ok: true as const, data: buildDemoWorkspaceMeta() };
      }
      demoState.active = false;
      return baseBridge.workspace.open(workspacePath);
    },
    clearCurrent: async () => {
      demoState.active = false;
      return baseBridge.workspace.clearCurrent();
    },
    pin: async (workspaceId: string) => {
      if (workspaceId === DEMO_WORKSPACE_ID) {
        const result = await baseBridge.workspace.listRecent();
        return { ok: true as const, data: result.ok ? listRecentWithDemo(result.data) : [demoEntry] };
      }
      return baseBridge.workspace.pin(workspaceId);
    },
    unpin: async (workspaceId: string) => {
      if (workspaceId === DEMO_WORKSPACE_ID) {
        const result = await baseBridge.workspace.listRecent();
        return { ok: true as const, data: result.ok ? listRecentWithDemo(result.data) : [demoEntry] };
      }
      return baseBridge.workspace.unpin(workspaceId);
    },
    removeFromSidebar: async (workspaceId: string) => {
      if (workspaceId === DEMO_WORKSPACE_ID) {
        const result = await baseBridge.workspace.listRecent();
        return { ok: true as const, data: result.ok ? listRecentWithDemo(result.data) : [demoEntry] };
      }
      return baseBridge.workspace.removeFromSidebar(workspaceId);
    },
    restoreToSidebar: async (workspaceId: string) => {
      if (workspaceId === DEMO_WORKSPACE_ID) {
        const result = await baseBridge.workspace.listRecent();
        return { ok: true as const, data: result.ok ? listRecentWithDemo(result.data) : [demoEntry] };
      }
      return baseBridge.workspace.restoreToSidebar(workspaceId);
    },
    hideFromRightPanels: async (workspaceId: string) => {
      if (workspaceId === DEMO_WORKSPACE_ID) {
        const result = await baseBridge.workspace.listRecent();
        return { ok: true as const, data: result.ok ? listRecentWithDemo(result.data) : [demoEntry] };
      }
      return baseBridge.workspace.hideFromRightPanels(workspaceId);
    },
    showInRightPanels: async (workspaceId: string) => {
      if (workspaceId === DEMO_WORKSPACE_ID) {
        const result = await baseBridge.workspace.listRecent();
        return { ok: true as const, data: result.ok ? listRecentWithDemo(result.data) : [demoEntry] };
      }
      return baseBridge.workspace.showInRightPanels(workspaceId);
    },
    reorder: async (input: ReorderWorkspacesInput) => {
      const result = await baseBridge.workspace.reorder(input);
      if (result.ok) {
        return { ok: true as const, data: listRecentWithDemo(result.data) };
      }
      return result;
    },
    listTree: async () => {
      if (!demoState.active) {
        return baseBridge.workspace.listTree();
      }
      return { ok: true as const, data: buildDemoTree() };
    },
    listTreeForWorkspace: async (workspacePath: string) => {
      if (demoState.active && workspacePath === DEMO_WORKSPACE_PATH) {
        return { ok: true as const, data: buildDemoTree() };
      }
      return baseBridge.workspace.listTreeForWorkspace(workspacePath);
    },
    readFile: async (relativePath: string) => {
      if (!demoState.active) {
        return baseBridge.workspace.readFile(relativePath);
      }
      const content = DEMO_DOCUMENTS[relativePath] ?? '';
      return { ok: true as const, data: { path: relativePath, content, lastModifiedAt: Date.now() } };
    },
    readFileForWorkspace: async (workspacePath: string, relativePath: string) => {
      if (demoState.active && workspacePath === DEMO_WORKSPACE_PATH) {
        const content = DEMO_DOCUMENTS[relativePath] ?? '';
        return { ok: true as const, data: { path: relativePath, content, lastModifiedAt: Date.now() } };
      }
      return baseBridge.workspace.readFileForWorkspace(workspacePath, relativePath);
    },
    getChangePreview: async (relativePath: string) => {
      if (!demoState.active) {
        return baseBridge.workspace.getChangePreview(relativePath);
      }
      return { ok: true as const, data: buildDemoChangePreview(relativePath) };
    },
    getChangePreviewForWorkspace: async (workspacePath: string, relativePath: string) => {
      if (demoState.active && workspacePath === DEMO_WORKSPACE_PATH) {
        return { ok: true as const, data: buildDemoChangePreview(relativePath) };
      }
      return baseBridge.workspace.getChangePreviewForWorkspace(workspacePath, relativePath);
    },
    getGitStatus: async () => {
      if (!demoState.active) {
        return baseBridge.workspace.getGitStatus();
      }
      return { ok: true as const, data: buildDemoGitSnapshot() };
    },
    listGitStatusForWorkspace: async (workspacePath: string) => {
      if (demoState.active && workspacePath === DEMO_WORKSPACE_PATH) {
        return { ok: true as const, data: buildDemoGitSnapshot() };
      }
      return baseBridge.workspace.listGitStatusForWorkspace(workspacePath);
    },
  };

  const isDemoSession = (sessionId: string): boolean =>
    Object.values(DEMO_SESSION_IDS).includes(sessionId as never);

  const demoSessionRecord = (sessionId: string) =>
    getDemoSessions().find((session) => session.id === sessionId);

  const demoSessionMutation = async (
    sessionId: string,
    mutate: (record: NonNullable<ReturnType<typeof demoSessionRecord>>) => void,
  ) => {
    if (demoState.active && isDemoSession(sessionId)) {
      const record = demoSessionRecord(sessionId);
      if (!record) {
        return { ok: false as const, error: { code: 'not_found' as const, message: 'Demo session not found' } };
      }
      mutate(record);
      return { ok: true as const, data: record };
    }
    return undefined;
  };

  const conversationBridge = {
    ...baseBridge.conversation,
    listSessions: async () => {
      if (!demoState.active) {
        return baseBridge.conversation.listSessions();
      }
      return { ok: true as const, data: getDemoSessions() };
    },
    getSession: async (sessionId: string) => {
      if (demoState.active && isDemoSession(sessionId)) {
        return { ok: true as const, data: getDemoSessionDetail(sessionId) };
      }
      return baseBridge.conversation.getSession(sessionId);
    },
    markSessionRead: async (input: { sessionId: string; readAt?: number }) => {
      const demo = await demoSessionMutation(input.sessionId, (record) => {
        record.manualUnread = false;
        record.lastReadAt = input.readAt ?? Date.now();
      });
      if (demo) {
        return demo;
      }
      return baseBridge.conversation.markSessionRead(input);
    },
    markSessionUnread: async (sessionId: string) => {
      const demo = await demoSessionMutation(sessionId, (record) => {
        record.manualUnread = true;
      });
      if (demo) {
        return demo;
      }
      return baseBridge.conversation.markSessionUnread(sessionId);
    },
    pinSession: async (sessionId: string) => {
      const demo = await demoSessionMutation(sessionId, (record) => {
        record.isPinned = true;
      });
      if (demo) {
        return demo;
      }
      return baseBridge.conversation.pinSession(sessionId);
    },
    unpinSession: async (sessionId: string) => {
      const demo = await demoSessionMutation(sessionId, (record) => {
        record.isPinned = false;
      });
      if (demo) {
        return demo;
      }
      return baseBridge.conversation.unpinSession(sessionId);
    },
    archiveSession: async (sessionId: string) => {
      const demo = await demoSessionMutation(sessionId, (record) => {
        record.status = 'archived';
        record.archivedAt = Date.now();
      });
      if (demo) {
        return demo;
      }
      return baseBridge.conversation.archiveSession(sessionId);
    },
    deleteSession: async (sessionId: string) => {
      if (demoState.active && isDemoSession(sessionId)) {
        return { ok: true as const, data: true };
      }
      return baseBridge.conversation.deleteSession(sessionId);
    },
    sendMessage: async (input: {
      sessionId: string;
      content: string;
      scenario?: 'chat' | 'plan' | 'code-edit';
      providerId?: string;
      modelId?: string;
    }) => {
      if (demoState.active && Object.values(DEMO_SESSION_IDS).includes(input.sessionId as never)) {
        const result = await getSimulator().sendMessage(input);
        return { ok: true as const, data: result };
      }
      return baseBridge.conversation.sendMessage(input);
    },
    cancelMessage: async (runId: string) => {
      if (demoState.active) {
        getSimulator().cancelActiveStream();
        return { ok: true as const, data: await getSimulator().cancelMessage(runId) };
      }
      return baseBridge.conversation.cancelMessage(runId);
    },
  };

  const runActivityBridge = {
    ...baseBridge.runActivity,
    listByRunId: async (runId: string, limit?: number) => {
      if (demoState.active) {
        return { ok: true as const, data: getDemoRunActivity(runId, limit) };
      }
      return baseBridge.runActivity.listByRunId(runId, limit);
    },
  };

  const patchBridge = {
    ...baseBridge.patch,
    getPatchSet: async (patchSetId: string) => {
      if (demoState.active) {
        return { ok: true as const, data: getDemoPatchSet(patchSetId) };
      }
      return baseBridge.patch.getPatchSet(patchSetId);
    },
  };

  return {
    ...baseBridge,
    workspace: workspaceBridge,
    conversation: conversationBridge,
    runActivity: runActivityBridge,
    patch: patchBridge,
    subscribeModelStream: (listener) => {
      demoState.modelListeners.add(listener);
      return () => {
        demoState.modelListeners.delete(listener);
      };
    },
    subscribeRunActivity: (listener) => {
      demoState.activityListeners.add(listener);
      return () => {
        demoState.activityListeners.delete(listener);
      };
    },
  };
}
