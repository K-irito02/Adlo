import type { AppInfo, ConversationSessionRecord, RecentWorkspaceEntry, TaskCenterSnapshot } from "@ai-digital-life/kernel";

export type SessionVisualStatus = "processing" | "pending-approval" | "abnormal" | "completed" | "read";

export type SidebarSessionItem = {
  session: ConversationSessionRecord;
  status: SessionVisualStatus;
  isUnread: boolean;
};

export type SidebarWorkspaceItem = {
  workspace: RecentWorkspaceEntry;
  isCurrent: boolean;
  sessions: SidebarSessionItem[];
  archivedSessions: SidebarSessionItem[];
  rollupStatus: SessionVisualStatus;
  statusCounts: Record<SessionVisualStatus, number>;
};

export type SidebarViewModel = {
  workspaces: SidebarWorkspaceItem[];
  standaloneSessions: SidebarSessionItem[];
  standaloneArchivedSessions: SidebarSessionItem[];
};

export type VisibleSidebarSessions = {
  items: SidebarSessionItem[];
  hiddenCount: number;
  limit: number;
};

export const SIDEBAR_SESSION_PREVIEW_LIMIT = 5;

const STATUS_PRIORITY: SessionVisualStatus[] = ["abnormal", "pending-approval", "processing", "completed", "read"];

function isSessionUnread(session: ConversationSessionRecord): boolean {
  if (session.manualUnread) {
    return true;
  }
  if (typeof session.lastReadAt !== "number") {
    return true;
  }
  return session.lastReadAt < session.lastMessageAt;
}

export function computeSessionVisualStatus(
  session: ConversationSessionRecord,
  streamingActiveRunId: string | undefined,
  hasPendingApproval: boolean
): SessionVisualStatus {
  if (session.status === "archived") {
    return "read";
  }
  if (hasPendingApproval && isSessionUnread(session)) {
    return "pending-approval";
  }
  if (streamingActiveRunId && session.status === "active") {
    return "processing";
  }
  if (session.updatedAt >= session.lastMessageAt && session.lastMessageAt >= Date.now() - 60_000) {
    return "completed";
  }
  return "read";
}

function emptyStatusCounts(): Record<SessionVisualStatus, number> {
  return {
    processing: 0,
    "pending-approval": 0,
    abnormal: 0,
    completed: 0,
    read: 0
  };
}

export function buildSidebarViewModel(input: {
  appInfo?: AppInfo;
  recentWorkspaces: RecentWorkspaceEntry[];
  sessions: ConversationSessionRecord[];
  streamingActiveRunId?: string;
  taskCenter?: TaskCenterSnapshot;
}): SidebarViewModel {
  const currentWorkspace = input.appInfo?.currentWorkspace;
  const entries = [...input.recentWorkspaces];
  if (currentWorkspace && !entries.some((entry) => entry.id === currentWorkspace.id)) {
    entries.unshift({
      id: currentWorkspace.id,
      path: currentWorkspace.path,
      rootPath: currentWorkspace.rootPath,
      name: currentWorkspace.name,
      lastOpenedAt: currentWorkspace.lastOpenedAt,
      isPinned: false,
      pinnedOrder: 0,
      unpinnedOrder: entries.filter((entry) => !entry.isPinned).length,
      removedFromSidebar: false,
      available: true
    });
  }

  const hasPendingApproval = (input.taskCenter?.pendingApprovals.length ?? 0) > 0;
  const visibleEntries = entries.filter((entry) => !entry.removedFromSidebar);
  const knownWorkspaceIds = new Set(visibleEntries.map((entry) => entry.id));
  const sessionItems = input.sessions.map((session) => ({
    session,
    status: computeSessionVisualStatus(session, input.streamingActiveRunId, hasPendingApproval),
    isUnread: isSessionUnread(session)
  }));

  const workspaces = visibleEntries.map((workspace) => {
    const isCurrent = currentWorkspace?.id === workspace.id;
    const workspaceSessionItems = sessionItems.filter((item) => item.session.workspaceId === workspace.id);
    const activeSessions = workspaceSessionItems.filter((item) => !item.session.archivedAt);
    const archivedSessions = workspaceSessionItems.filter((item) => Boolean(item.session.archivedAt));
    const statusCounts = emptyStatusCounts();
    for (const item of activeSessions) {
      statusCounts[item.status] += 1;
    }
    const rollupStatus =
      STATUS_PRIORITY.find((status) => statusCounts[status] > 0) ??
      (activeSessions.length > 0 ? "read" : "read");

    return {
      workspace,
      isCurrent,
      sessions: activeSessions,
      archivedSessions,
      rollupStatus,
      statusCounts
    };
  });

  const standaloneSessionItems = sessionItems.filter((item) => !knownWorkspaceIds.has(item.session.workspaceId));

  return {
    workspaces,
    standaloneSessions: standaloneSessionItems.filter((item) => !item.session.archivedAt),
    standaloneArchivedSessions: standaloneSessionItems.filter((item) => Boolean(item.session.archivedAt))
  };
}

export function getVisibleSidebarSessions(
  sessions: SidebarSessionItem[],
  expanded: boolean,
  limit = SIDEBAR_SESSION_PREVIEW_LIMIT
): VisibleSidebarSessions {
  if (expanded || sessions.length <= limit) {
    return { items: sessions, hiddenCount: 0, limit };
  }

  return {
    items: sessions.slice(0, limit),
    hiddenCount: sessions.length - limit,
    limit
  };
}
