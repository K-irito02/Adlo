import type {
  AppInfo,
  ConversationSessionRecord,
  RecentWorkspaceEntry,
  TaskCenterSnapshot,
} from '@ai-digital-life/kernel';

export type SessionVisualStatus =
  | 'processing'
  | 'pending-approval'
  | 'abnormal'
  | 'completed'
  | 'read';

export interface SidebarSessionItem {
  session: ConversationSessionRecord;
  status: SessionVisualStatus;
  isUnread: boolean;
}

export interface SidebarWorkspaceItem {
  workspace: RecentWorkspaceEntry;
  isCurrent: boolean;
  sessions: SidebarSessionItem[];
  archivedSessions: SidebarSessionItem[];
  rollupStatus: SessionVisualStatus;
  statusCounts: Record<SessionVisualStatus, number>;
}

export interface SidebarViewModel {
  workspaces: SidebarWorkspaceItem[];
  standaloneSessions: SidebarSessionItem[];
  standaloneArchivedSessions: SidebarSessionItem[];
}

export interface VisibleSidebarSessions {
  items: SidebarSessionItem[];
  hiddenCount: number;
  limit: number;
}

export const SIDEBAR_SESSION_PREVIEW_LIMIT = 5;

/** 路径去重 key：与后端 workspace_sidebar.rs path_dedup_key 对齐（分隔符统一 + 小写 + 去尾部斜杠）。
 *  后端已在出站数据（currentWorkspace / recentWorkspaces）剥除 verbatim 前缀，故前端无需处理 `\\?\`。 */
function pathDedupKey(path: string): string {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  const trimmed = normalized.replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : normalized;
}

const STATUS_PRIORITY: SessionVisualStatus[] = [
  'abnormal',
  'pending-approval',
  'processing',
  'completed',
  'read',
];

function isSessionUnread(session: ConversationSessionRecord): boolean {
  if (session.manualUnread) {
    return true;
  }
  if (typeof session.lastReadAt !== 'number') {
    return true;
  }
  return session.lastReadAt < session.lastMessageAt;
}

export function computeSessionVisualStatus(
  session: ConversationSessionRecord,
  streamingActiveRunId: string | undefined,
  hasPendingApproval: boolean,
): SessionVisualStatus {
  if (session.status === 'archived') {
    return 'read';
  }
  if (hasPendingApproval && isSessionUnread(session)) {
    return 'pending-approval';
  }
  if (streamingActiveRunId && session.status === 'active') {
    return 'processing';
  }
  if (session.updatedAt >= session.lastMessageAt && session.lastMessageAt >= Date.now() - 60_000) {
    return 'completed';
  }
  return 'read';
}

function emptyStatusCounts(): Record<SessionVisualStatus, number> {
  return {
    processing: 0,
    'pending-approval': 0,
    abnormal: 0,
    completed: 0,
    read: 0,
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
  // 工作区真实身份是路径：id 可能因历史/归一化差异而不稳定。
  // 当前工作区已在列表中（id 或归一化 path 命中）则不再插入，避免同一路径重复显示。
  if (
    currentWorkspace &&
    !entries.some(
      (entry) =>
        entry.id === currentWorkspace.id ||
        pathDedupKey(entry.path) === pathDedupKey(currentWorkspace.path),
    )
  ) {
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
      available: true,
      hiddenFromRightPanels: false,
    });
  }

  const hasPendingApproval = (input.taskCenter?.pendingApprovals.length ?? 0) > 0;
  const visibleEntries = entries.filter((entry) => !entry.removedFromSidebar);
  const knownWorkspaceIds = new Set(visibleEntries.map((entry) => entry.id));

  const workspaceSessionBuckets = new Map<
    string,
    {
      activeSessions: SidebarSessionItem[];
      archivedSessions: SidebarSessionItem[];
      statusCounts: Record<SessionVisualStatus, number>;
    }
  >();
  for (const workspace of visibleEntries) {
    workspaceSessionBuckets.set(workspace.id, {
      activeSessions: [],
      archivedSessions: [],
      statusCounts: emptyStatusCounts(),
    });
  }

  const standaloneSessions: SidebarSessionItem[] = [];
  const standaloneArchivedSessions: SidebarSessionItem[] = [];
  for (const session of input.sessions) {
    const item: SidebarSessionItem = {
      session,
      status: computeSessionVisualStatus(session, input.streamingActiveRunId, hasPendingApproval),
      isUnread: isSessionUnread(session),
    };
    const bucket = knownWorkspaceIds.has(session.workspaceId)
      ? workspaceSessionBuckets.get(session.workspaceId)
      : undefined;
    if (!bucket) {
      if (session.archivedAt) {
        standaloneArchivedSessions.push(item);
      } else {
        standaloneSessions.push(item);
      }
      continue;
    }
    if (session.archivedAt) {
      bucket.archivedSessions.push(item);
      continue;
    }
    bucket.activeSessions.push(item);
    bucket.statusCounts[item.status] += 1;
  }

  const workspaces = visibleEntries.map((workspace) => {
    const isCurrent =
      currentWorkspace != null &&
      (currentWorkspace.id === workspace.id ||
        pathDedupKey(workspace.path) === pathDedupKey(currentWorkspace.path));
    const bucket = workspaceSessionBuckets.get(workspace.id);
    const activeSessions = bucket?.activeSessions ?? [];
    const archivedSessions = bucket?.archivedSessions ?? [];
    const statusCounts = bucket?.statusCounts ?? emptyStatusCounts();
    const rollupStatus = STATUS_PRIORITY.find((status) => statusCounts[status] > 0) ?? 'read';

    return {
      workspace,
      isCurrent,
      sessions: activeSessions,
      archivedSessions,
      rollupStatus,
      statusCounts,
    };
  });

  return {
    workspaces,
    standaloneSessions,
    standaloneArchivedSessions,
  };
}

export function getVisibleSidebarSessions(
  sessions: SidebarSessionItem[],
  expanded: boolean,
  limit = SIDEBAR_SESSION_PREVIEW_LIMIT,
): VisibleSidebarSessions {
  if (expanded || sessions.length <= limit) {
    return { items: sessions, hiddenCount: 0, limit };
  }

  return {
    items: sessions.slice(0, limit),
    hiddenCount: sessions.length - limit,
    limit,
  };
}
