import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppInfo,
  ConversationSessionRecord,
  RecentWorkspaceEntry,
  ReorderSessionsInput,
  ReorderWorkspacesInput,
  TaskCenterSnapshot
} from "@ai-digital-life/kernel";
import type { CopyDict, Locale } from "../copy";
import {
  IconArchive,
  IconCheck,
  IconCheckCheck,
  IconChevronDown,
  IconChevronRight,
  IconCollapseRows,
  IconDownload,
  IconExpandRows,
  IconFolder,
  IconFolderOpen,
  IconMail,
  IconMoreVertical,
  IconPencil,
  IconPin,
  IconPinOff,
  IconPlug,
  IconSparkles,
  IconTrash,
  IconCopy,
  IconPlus
} from "../icons";
import { buildSidebarViewModel, getVisibleSidebarSessions, type SessionVisualStatus, type SidebarSessionItem } from "../sidebarViewModel";
import { useUiStore } from "../ui-store";
import { TooltipSimple } from "../components/Tooltip";

const CONVERSATION_PANEL_HEIGHT_KEY = "adl-ui:conversation-panel-height";
const DEFAULT_CONVERSATION_PANEL_HEIGHT = 180;
const MIN_CONVERSATION_PANEL_HEIGHT = 120;
const MAX_CONVERSATION_PANEL_HEIGHT = 9_999;
const DROP_FLASH_DURATION_MS = 900;

function readConversationPanelHeight(): number {
  try {
    const raw = Number(window.localStorage.getItem(CONVERSATION_PANEL_HEIGHT_KEY));
    if (Number.isFinite(raw)) {
      return Math.max(MIN_CONVERSATION_PANEL_HEIGHT, Math.min(MAX_CONVERSATION_PANEL_HEIGHT, raw));
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_CONVERSATION_PANEL_HEIGHT;
}

function writeConversationPanelHeight(value: number): void {
  try {
    window.localStorage.setItem(CONVERSATION_PANEL_HEIGHT_KEY, String(value));
  } catch {
    /* ignore */
  }
}

function clampConversationPanelHeight(value: number, maxHeight: number): number {
  return Math.max(MIN_CONVERSATION_PANEL_HEIGHT, Math.min(maxHeight, value));
}

interface LeftSidebarProps {
  t: CopyDict;
  locale: Locale;
  appInfo?: AppInfo;
  collapsed: boolean;
  recentWorkspaces: RecentWorkspaceEntry[];
  sessions: ConversationSessionRecord[];
  activeSessionId?: string;
  streamingActiveRunId?: string;
  taskCenter?: TaskCenterSnapshot;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onPinWorkspace: (workspaceId: string) => void;
  onUnpinWorkspace: (workspaceId: string) => void;
  onRemoveWorkspace: (workspaceId: string) => void;
  onReorderWorkspaces: (input: ReorderWorkspacesInput) => void;
  onPinSession: (sessionId: string) => void;
  onUnpinSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onArchiveAllSessions: () => void;
  onMarkSessionRead: (sessionId: string) => void;
  onMarkSessionUnread: (sessionId: string) => void;
  onMarkAllSessionsRead: (sessionIds: string[]) => void;
  onReorderSessions: (input: ReorderSessionsInput) => void;
  onRevealWorkspace: (workspacePath: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenWorkspace: (path: string) => void;
  onTriggerCreateWorkspace: () => void;
}

type SidebarMenuState =
  | { type: "workspace"; workspaceId: string; x: number; y: number }
  | { type: "session"; sessionId: string; x: number; y: number };

const STATUS_LABEL: Record<SessionVisualStatus, keyof CopyDict> = {
  processing: "statusProcessing",
  "pending-approval": "statusPendingApproval",
  abnormal: "statusAbnormal",
  completed: "statusCompleted",
  read: "statusRead"
};

const WORKSPACE_STATUS_ORDER: SessionVisualStatus[] = ["abnormal", "pending-approval", "processing", "completed", "read"];

function buildMockStandaloneSessions(now = Date.now()): SidebarSessionItem[] {
  return [
    {
      session: {
        id: "mock-chat-1",
        workspaceId: "mock-conversation",
        title: "产品方向讨论",
        status: "active",
        isPinned: true,
        pinnedOrder: 0,
        unpinnedOrder: 0,
        manualUnread: true,
        lastReadAt: now - 50_000,
        archivedAt: undefined,
        titleUpdatedAt: now - 50_000,
        createdAt: now - 90_000,
        updatedAt: now - 50_000,
        lastMessageAt: now - 40_000
      },
      status: "pending-approval",
      isUnread: true
    },
    {
      session: {
        id: "mock-chat-2",
        workspaceId: "mock-conversation",
        title: "一次性问题排查",
        status: "active",
        isPinned: false,
        pinnedOrder: 0,
        unpinnedOrder: 1,
        manualUnread: false,
        lastReadAt: now - 30_000,
        archivedAt: undefined,
        titleUpdatedAt: now - 30_000,
        createdAt: now - 80_000,
        updatedAt: now - 30_000,
        lastMessageAt: now - 30_000
      },
      status: "processing",
      isUnread: false
    },
    {
      session: {
        id: "mock-chat-3",
        workspaceId: "mock-conversation",
        title: "灵感速记",
        status: "active",
        isPinned: false,
        pinnedOrder: 0,
        unpinnedOrder: 2,
        manualUnread: false,
        lastReadAt: now - 3_600_000,
        archivedAt: undefined,
        titleUpdatedAt: now - 3_600_000,
        createdAt: now - 7_200_000,
        updatedAt: now - 3_600_000,
        lastMessageAt: now - 3_600_000
      },
      status: "completed",
      isUnread: false
    },
    {
      session: {
        id: "mock-chat-4",
        workspaceId: "mock-conversation",
        title: "临时翻译助手",
        status: "active",
        isPinned: false,
        pinnedOrder: 0,
        unpinnedOrder: 3,
        manualUnread: true,
        lastReadAt: now - 10_000,
        archivedAt: undefined,
        titleUpdatedAt: now - 10_000,
        createdAt: now - 40_000,
        updatedAt: now - 10_000,
        lastMessageAt: now - 10_000
      },
      status: "read",
      isUnread: true
    },
    {
      session: {
        id: "mock-chat-5",
        workspaceId: "mock-conversation",
        title: "会议纪要整理",
        status: "active",
        isPinned: false,
        pinnedOrder: 0,
        unpinnedOrder: 4,
        manualUnread: false,
        lastReadAt: now - 7_200_000,
        archivedAt: undefined,
        titleUpdatedAt: now - 7_200_000,
        createdAt: now - 14_400_000,
        updatedAt: now - 7_200_000,
        lastMessageAt: now - 7_200_000
      },
      status: "read",
      isUnread: false
    },
    {
      session: {
        id: "mock-chat-6",
        workspaceId: "mock-conversation",
        title: "快速脚本生成",
        status: "active",
        isPinned: false,
        pinnedOrder: 0,
        unpinnedOrder: 5,
        manualUnread: false,
        lastReadAt: now - 86_400_000,
        archivedAt: undefined,
        titleUpdatedAt: now - 86_400_000,
        createdAt: now - 172_800_000,
        updatedAt: now - 86_400_000,
        lastMessageAt: now - 86_400_000
      },
      status: "abnormal",
      isUnread: false
    }
  ];
}

function isMockStandaloneSessionId(sessionId: string): boolean {
  return sessionId.startsWith("mock-chat-") || sessionId.startsWith("mock-standalone-");
}

function normalizeMockStandaloneSessions(items: SidebarSessionItem[]): SidebarSessionItem[] {
  let pinnedOrder = 0;
  let unpinnedOrder = 0;
  const pinned = items
    .filter((item) => item.session.isPinned)
    .map((item) => ({
      ...item,
      session: {
        ...item.session,
        pinnedOrder: pinnedOrder++,
        unpinnedOrder: 0
      }
    }));
  const unpinned = items
    .filter((item) => !item.session.isPinned)
    .map((item) => ({
      ...item,
      session: {
        ...item.session,
        pinnedOrder: 0,
        unpinnedOrder: unpinnedOrder++
      }
    }));
  return [...pinned, ...unpinned];
}

function StatusLamp({ status, title }: { status: SessionVisualStatus; title: string }) {
  return <span className={`adl-status-lamp adl-status-lamp--${status}`} role="img" aria-label={title} />;
}

function buildWorkspaceTooltip(t: CopyDict, counts: Record<SessionVisualStatus, number>): string {
  const parts = WORKSPACE_STATUS_ORDER.filter((status) => counts[status] > 0).map(
    (status) => `${t[STATUS_LABEL[status]]}: ${counts[status]}`
  );
  return parts.join(" · ") || (t[STATUS_LABEL.read] as string);
}

async function exportSessionMarkdown(session: ConversationSessionRecord): Promise<void> {
  const result = await window.digitalLife.conversation.getSession(session.id);
  const messages = result.ok && result.data ? result.data.messages : [];
  const markdown = [`# ${session.title}`, "", `- Session ID: ${session.id}`, `- Updated: ${new Date(session.updatedAt).toISOString()}`, ""];
  for (const message of messages) {
    markdown.push(`## ${message.role}`, "", message.content, "");
  }
  const blob = new Blob([markdown.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${session.title || session.id}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function moveIdWithinBucket(ids: string[], draggedId: string, targetId: string): string[] {
  const next = ids.filter((id) => id !== draggedId);
  const targetIndex = next.indexOf(targetId);
  if (targetIndex < 0) {
    next.push(draggedId);
    return next;
  }
  next.splice(targetIndex, 0, draggedId);
  return next;
}

function moveIdToBucketEnd(ids: string[], draggedId: string): string[] {
  const next = ids.filter((id) => id !== draggedId);
  next.push(draggedId);
  return next;
}

function moveIdAfterTarget(ids: string[], draggedId: string, targetId: string): string[] {
  const next = ids.filter((id) => id !== draggedId);
  const targetIndex = next.indexOf(targetId);
  if (targetIndex < 0) {
    next.push(draggedId);
    return next;
  }
  next.splice(targetIndex + 1, 0, draggedId);
  return next;
}

function mergeEphemeralVisibleSessions(
  allItems: SidebarSessionItem[],
  visibleItems: SidebarSessionItem[],
  ephemeralIds: string[]
): SidebarSessionItem[] {
  if (ephemeralIds.length === 0) {
    return visibleItems;
  }
  const visibleIds = new Set(visibleItems.map((item) => item.session.id));
  const extras = allItems.filter((item) => ephemeralIds.includes(item.session.id) && !visibleIds.has(item.session.id));
  return [...visibleItems, ...extras];
}

type SidebarMenuItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  action: () => void;
};

function SidebarContextMenu({
  items,
  x,
  y,
  onClose
}: {
  items: SidebarMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="adl-sidebar-menu"
      role="menu"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={`adl-sidebar-menu__item${item.danger ? " is-danger" : ""}`}
          onClick={() => {
            item.action();
            onClose();
          }}
        >
          <span className="adl-sidebar-menu__icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export function LeftSidebar({
  t,
  locale,
  appInfo,
  collapsed,
  recentWorkspaces,
  sessions,
  activeSessionId,
  streamingActiveRunId,
  taskCenter,
  onSelectSession,
  onCreateSession,
  onPinWorkspace,
  onUnpinWorkspace,
  onRemoveWorkspace,
  onReorderWorkspaces,
  onPinSession,
  onUnpinSession,
  onRenameSession,
  onArchiveSession,
  onArchiveAllSessions,
  onMarkSessionRead,
  onMarkSessionUnread,
  onMarkAllSessionsRead,
  onReorderSessions,
  onRevealWorkspace,
  onDeleteSession,
  onOpenWorkspace,
  onTriggerCreateWorkspace
}: LeftSidebarProps) {
  const { expandedSessionWorkspaces, toggleSessionWorkspace } = useUiStore();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [conversationsCollapsed, setConversationsCollapsed] = useState(false);
  const [hoveredSessionId, setHoveredSessionId] = useState<string>();
  const [menuState, setMenuState] = useState<SidebarMenuState>();
  const [renamingSessionId, setRenamingSessionId] = useState<string>();
  const [renameDraft, setRenameDraft] = useState("");
  const [dragWorkspaceId, setDragWorkspaceId] = useState<string>();
  const [dragSessionId, setDragSessionId] = useState<string>();
  const [dragOverSessionId, setDragOverSessionId] = useState<string>();
  const [droppedSessionId, setDroppedSessionId] = useState<string>();
  const [expandedSessionLists, setExpandedSessionLists] = useState<Record<string, boolean>>({});
  const [conversationPanelHeight, setConversationPanelHeight] = useState<number>(() => readConversationPanelHeight());
  const [mockStandaloneSessions, setMockStandaloneSessions] = useState<SidebarSessionItem[]>(() => buildMockStandaloneSessions());
  const [mockStandaloneArchivedSessions, setMockStandaloneArchivedSessions] = useState<SidebarSessionItem[]>([]);
  const [ephemeralVisibleSessionIds, setEphemeralVisibleSessionIds] = useState<Record<string, string[]>>({});

  const sidebarViewModel = useMemo(
    () =>
      buildSidebarViewModel({
        appInfo,
        recentWorkspaces,
        sessions,
        streamingActiveRunId,
        taskCenter
      }),
    [appInfo, recentWorkspaces, sessions, streamingActiveRunId, taskCenter]
  );
  const workspaceItems = sidebarViewModel.workspaces;
  const usingMockStandaloneSessions = sidebarViewModel.standaloneSessions.length === 0;
  const displayStandaloneSessions = usingMockStandaloneSessions ? mockStandaloneSessions : sidebarViewModel.standaloneSessions;
  const displayStandaloneArchivedSessions = usingMockStandaloneSessions
    ? mockStandaloneArchivedSessions
    : sidebarViewModel.standaloneArchivedSessions;

  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const cleanupDragRef = useRef<(() => void) | null>(null);
  const conversationResizeCleanupRef = useRef<(() => void) | null>(null);
  const dropFlashTimeoutRef = useRef<number | null>(null);
  const dragOverSessionIdRef = useRef<string | undefined>(undefined);
  const leftbarContentRef = useRef<HTMLDivElement | null>(null);
  const workspaceToolbarRef = useRef<HTMLDivElement | null>(null);
  const sessionItemsById = useMemo(() => {
    const items = new Map<string, SidebarSessionItem>();
    for (const workspaceItem of workspaceItems) {
      for (const sessionItem of workspaceItem.sessions) {
        items.set(sessionItem.session.id, sessionItem);
      }
      for (const sessionItem of workspaceItem.archivedSessions) {
        items.set(sessionItem.session.id, sessionItem);
      }
    }
    for (const sessionItem of displayStandaloneSessions) {
      items.set(sessionItem.session.id, sessionItem);
    }
    for (const sessionItem of displayStandaloneArchivedSessions) {
      items.set(sessionItem.session.id, sessionItem);
    }
    return items;
  }, [displayStandaloneArchivedSessions, displayStandaloneSessions, workspaceItems]);

  useEffect(() => {
    return () => {
      if (cleanupDragRef.current) {
        cleanupDragRef.current();
        cleanupDragRef.current = null;
      }
      if (conversationResizeCleanupRef.current) {
        conversationResizeCleanupRef.current();
        conversationResizeCleanupRef.current = null;
      }
      if (dropFlashTimeoutRef.current) {
        window.clearTimeout(dropFlashTimeoutRef.current);
        dropFlashTimeoutRef.current = null;
      }
    };
  }, []);

  const setDragOverSessionTarget = useCallback((nextSessionId: string | undefined) => {
    if (dragOverSessionIdRef.current === nextSessionId) {
      return;
    }
    dragOverSessionIdRef.current = nextSessionId;
    setDragOverSessionId(nextSessionId);
  }, []);

  const flashDroppedSession = useCallback((sessionId: string) => {
    if (dropFlashTimeoutRef.current) {
      window.clearTimeout(dropFlashTimeoutRef.current);
    }
    setDroppedSessionId(sessionId);
    dropFlashTimeoutRef.current = window.setTimeout(() => {
      setDroppedSessionId((current) => (current === sessionId ? undefined : current));
      dropFlashTimeoutRef.current = null;
    }, DROP_FLASH_DURATION_MS);
  }, []);

  const getConversationPanelMaxHeight = useCallback(() => {
    const contentRect = leftbarContentRef.current?.getBoundingClientRect();
    const workspaceToolbarRect = workspaceToolbarRef.current?.getBoundingClientRect();
    if (!contentRect || !workspaceToolbarRect) {
      return MAX_CONVERSATION_PANEL_HEIGHT;
    }
    return Math.max(MIN_CONVERSATION_PANEL_HEIGHT, Math.floor(contentRect.bottom - workspaceToolbarRect.bottom));
  }, []);

  useEffect(() => {
    const syncConversationPanelHeight = () => {
      const maxHeight = getConversationPanelMaxHeight();
      setConversationPanelHeight((current) => {
        const nextHeight = clampConversationPanelHeight(current, maxHeight);
        if (nextHeight !== current) {
          writeConversationPanelHeight(nextHeight);
        }
        return nextHeight;
      });
    };

    syncConversationPanelHeight();
    window.addEventListener("resize", syncConversationPanelHeight);
    return () => window.removeEventListener("resize", syncConversationPanelHeight);
  }, [getConversationPanelMaxHeight]);

  const renameMockStandaloneSession = useCallback((sessionId: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }
    const update = (items: SidebarSessionItem[]) =>
      items.map((item) =>
        item.session.id === sessionId
          ? {
              ...item,
              session: {
                ...item.session,
                title: nextTitle,
                titleUpdatedAt: Date.now(),
                updatedAt: Date.now()
              }
            }
          : item
      );
    setMockStandaloneSessions((current) => normalizeMockStandaloneSessions(update(current)));
    setMockStandaloneArchivedSessions((current) => normalizeMockStandaloneSessions(update(current)));
  }, []);

  const removeEphemeralVisibleSessionId = useCallback((listKey: string, sessionId: string) => {
    setEphemeralVisibleSessionIds((current) => {
      if (!(current[listKey] ?? []).includes(sessionId)) {
        return current;
      }
      return {
        ...current,
        [listKey]: (current[listKey] ?? []).filter((id) => id !== sessionId)
      };
    });
  }, []);

  const setMockStandaloneReadState = useCallback((sessionId: string, isUnread: boolean) => {
    const update = (items: SidebarSessionItem[]) =>
      items.map((item) =>
        item.session.id === sessionId
          ? {
              ...item,
              isUnread,
              session: {
                ...item.session,
                manualUnread: isUnread,
                lastReadAt: isUnread ? item.session.lastReadAt : Date.now(),
                updatedAt: Date.now()
              }
            }
          : item
      );
    setMockStandaloneSessions((current) => normalizeMockStandaloneSessions(update(current)));
    setMockStandaloneArchivedSessions((current) => normalizeMockStandaloneSessions(update(current)));
  }, []);

  const toggleMockStandalonePin = useCallback((sessionId: string) => {
    const update = (items: SidebarSessionItem[]) =>
      items.map((item) =>
        item.session.id === sessionId
          ? {
              ...item,
              session: {
                ...item.session,
                isPinned: !item.session.isPinned,
                updatedAt: Date.now()
              }
            }
          : item
      );
    setMockStandaloneSessions((current) => normalizeMockStandaloneSessions(update(current)));
    setMockStandaloneArchivedSessions((current) => normalizeMockStandaloneSessions(update(current)));
  }, []);

  const archiveMockStandaloneSession = useCallback((sessionId: string) => {
    const archivedAt = Date.now();
    setMockStandaloneSessions((current) => {
      const target = current.find((item) => item.session.id === sessionId);
      if (!target) {
        return current;
      }
      setMockStandaloneArchivedSessions((archived) =>
        normalizeMockStandaloneSessions([
          {
            ...target,
            isUnread: false,
            session: {
              ...target.session,
              status: "archived",
              archivedAt,
              updatedAt: archivedAt,
              manualUnread: false,
              lastReadAt: archivedAt
            }
          },
          ...archived
        ])
      );
      return normalizeMockStandaloneSessions(current.filter((item) => item.session.id !== sessionId));
    });
    removeEphemeralVisibleSessionId("standalone", sessionId);
  }, []);

  const deleteMockStandaloneSession = useCallback((sessionId: string) => {
    setMockStandaloneSessions((current) => current.filter((item) => item.session.id !== sessionId));
    setMockStandaloneArchivedSessions((current) => current.filter((item) => item.session.id !== sessionId));
    removeEphemeralVisibleSessionId("standalone", sessionId);
  }, [removeEphemeralVisibleSessionId]);

  const createMockStandaloneSession = useCallback(() => {
    const timestamp = Date.now();
    const nextIndex = mockStandaloneSessions.length + mockStandaloneArchivedSessions.length + 1;
    const nextSessionId = `mock-standalone-${timestamp}`;
    const nextItem: SidebarSessionItem = {
      session: {
        id: nextSessionId,
        workspaceId: "mock-conversation",
        title: `${t.newConversation} ${nextIndex}`,
        status: "active",
        isPinned: false,
        pinnedOrder: 0,
        unpinnedOrder: 0,
        manualUnread: false,
        lastReadAt: timestamp,
        archivedAt: undefined,
        titleUpdatedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastMessageAt: timestamp
      },
      status: "read",
      isUnread: false
    };
    setMockStandaloneSessions((current) => normalizeMockStandaloneSessions([nextItem, ...current]));
    setEphemeralVisibleSessionIds((current) => ({
      ...current,
      standalone: Array.from(new Set([...(current.standalone ?? []), nextSessionId]))
    }));
  }, [mockStandaloneArchivedSessions.length, mockStandaloneSessions.length, t.newConversation]);

  const exportMockStandaloneSession = useCallback((session: ConversationSessionRecord) => {
    const markdown = [`# ${session.title}`, "", `- Session ID: ${session.id}`, `- Updated: ${new Date(session.updatedAt).toISOString()}`, ""];
    const blob = new Blob([markdown.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${session.title || session.id}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleResizeMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const shellBody = document.querySelector(".adl-shell__body");
    if (!shellBody) {
      return;
    }
    draggingRef.current = true;
    shellBody.classList.add("is-resizing");
    const startX = event.clientX;
    const root = document.documentElement;
    const startWidth = parseFloat(getComputedStyle(root).getPropertyValue("--leftbar-width")) || 180;
    const minWidth = parseFloat(getComputedStyle(root).getPropertyValue("--leftbar-width-min")) || 180;
    const maxWidth = parseFloat(getComputedStyle(root).getPropertyValue("--leftbar-width-max")) || 360;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!draggingRef.current || rafRef.current) {
        return;
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
        root.style.setProperty("--leftbar-width", `${newWidth}px`);
      });
    };

    const cleanup = () => {
      draggingRef.current = false;
      shellBody.classList.remove("is-resizing");
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      cleanupDragRef.current = null;
    };

    const onBlur = () => cleanup();
    const onMouseUp = () => cleanup();

    cleanupDragRef.current = cleanup;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onBlur);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handleWorkspaceDrop = useCallback(
    (targetWorkspaceId: string, isPinnedBucket: boolean) => {
      if (!dragWorkspaceId || dragWorkspaceId === targetWorkspaceId) {
        return;
      }
      const bucketItems = workspaceItems.filter((item) => item.workspace.isPinned === isPinnedBucket).map((item) => item.workspace.id);
      if (!bucketItems.includes(dragWorkspaceId)) {
        return;
      }
      const nextIds = moveIdWithinBucket(bucketItems, dragWorkspaceId, targetWorkspaceId);
      const pinnedIds = isPinnedBucket
        ? nextIds
        : workspaceItems.filter((item) => item.workspace.isPinned).map((item) => item.workspace.id);
      const unpinnedIds = isPinnedBucket
        ? workspaceItems.filter((item) => !item.workspace.isPinned).map((item) => item.workspace.id)
        : nextIds;
      onReorderWorkspaces({ pinnedIds, unpinnedIds });
      setDragWorkspaceId(undefined);
    },
    [dragWorkspaceId, onReorderWorkspaces, workspaceItems]
  );

  const handleConversationResizeMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const shellBody = document.querySelector(".adl-shell__body");
    if (!shellBody) {
      return;
    }
    shellBody.classList.add("is-resizing");
    const startY = event.clientY;
    const startHeight = conversationPanelHeight;
    const maxHeight = getConversationPanelMaxHeight();
    let rafId = 0;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if ((moveEvent.buttons & 1) === 0) {
        cleanup();
        return;
      }
      if (rafId) {
        return;
      }
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const delta = startY - moveEvent.clientY;
        const nextHeight = clampConversationPanelHeight(startHeight + delta, maxHeight);
        setConversationPanelHeight(nextHeight);
        writeConversationPanelHeight(nextHeight);
      });
    };

    const cleanup = () => {
      shellBody.classList.remove("is-resizing");
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("mouseleave", onBlur);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      conversationResizeCleanupRef.current = null;
    };

    const onMouseUp = () => cleanup();
    const onBlur = () => cleanup();

    conversationResizeCleanupRef.current = cleanup;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("mouseleave", onBlur);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, [conversationPanelHeight, getConversationPanelMaxHeight]);

  const handleSessionDrop = useCallback(
    (workspaceId: string, targetSessionId: string, isPinnedBucket: boolean) => {
      if (!dragSessionId || dragSessionId === targetSessionId) {
        return;
      }
      const workspace = workspaceItems.find((item) => item.workspace.id === workspaceId);
      if (!workspace) {
        return;
      }
      const bucketItems = workspace.sessions
        .filter((item) => item.session.isPinned === isPinnedBucket)
        .map((item) => item.session.id);
      if (!bucketItems.includes(dragSessionId)) {
        return;
      }
      const nextIds = moveIdWithinBucket(bucketItems, dragSessionId, targetSessionId);
      const pinnedIds = isPinnedBucket
        ? nextIds
        : workspace.sessions.filter((item) => item.session.isPinned).map((item) => item.session.id);
      const unpinnedIds = isPinnedBucket
        ? workspace.sessions.filter((item) => !item.session.isPinned).map((item) => item.session.id)
        : nextIds;
      onReorderSessions({ workspaceId, pinnedIds, unpinnedIds });
      flashDroppedSession(dragSessionId);
      setDragSessionId(undefined);
      setDragOverSessionTarget(undefined);
    },
    [dragSessionId, flashDroppedSession, onReorderSessions, setDragOverSessionTarget, workspaceItems]
  );

  const handleStandaloneSessionDrop = useCallback(
    (targetSessionId: string, isPinnedBucket: boolean) => {
      if (!dragSessionId || dragSessionId === targetSessionId || !usingMockStandaloneSessions) {
        return;
      }

      const bucketItems = displayStandaloneSessions
        .filter((item) => item.session.isPinned === isPinnedBucket)
        .map((item) => item.session.id);

      if (!bucketItems.includes(dragSessionId)) {
        return;
      }

      const nextIds = moveIdWithinBucket(bucketItems, dragSessionId, targetSessionId);
      setMockStandaloneSessions((current) => {
        const pinnedIds = isPinnedBucket
          ? nextIds
          : current.filter((item) => item.session.isPinned).map((item) => item.session.id);
        const unpinnedIds = isPinnedBucket
          ? current.filter((item) => !item.session.isPinned).map((item) => item.session.id)
          : nextIds;
        const byId = new Map(current.map((item) => [item.session.id, item] as const));
        return normalizeMockStandaloneSessions([
          ...pinnedIds.map((id) => byId.get(id)!),
          ...unpinnedIds.map((id) => byId.get(id)!)
        ]);
      });
      flashDroppedSession(dragSessionId);
      setDragSessionId(undefined);
      setDragOverSessionTarget(undefined);
    },
    [displayStandaloneSessions, dragSessionId, flashDroppedSession, setDragOverSessionTarget, usingMockStandaloneSessions]
  );

  const handleSessionDropAfterVisibleTarget = useCallback(
    (workspaceId: string, targetSessionId: string, isPinnedBucket: boolean) => {
      if (!dragSessionId || dragSessionId === targetSessionId) {
        return;
      }
      const workspace = workspaceItems.find((item) => item.workspace.id === workspaceId);
      if (!workspace) {
        return;
      }
      const bucketItems = workspace.sessions
        .filter((item) => item.session.isPinned === isPinnedBucket)
        .map((item) => item.session.id);
      if (!bucketItems.includes(dragSessionId)) {
        return;
      }
      const nextIds = moveIdAfterTarget(bucketItems, dragSessionId, targetSessionId);
      const pinnedIds = isPinnedBucket
        ? nextIds
        : workspace.sessions.filter((item) => item.session.isPinned).map((item) => item.session.id);
      const unpinnedIds = isPinnedBucket
        ? workspace.sessions.filter((item) => !item.session.isPinned).map((item) => item.session.id)
        : nextIds;
      onReorderSessions({ workspaceId, pinnedIds, unpinnedIds });
      flashDroppedSession(dragSessionId);
      setDragSessionId(undefined);
      setDragOverSessionTarget(undefined);
    },
    [dragSessionId, flashDroppedSession, onReorderSessions, setDragOverSessionTarget, workspaceItems]
  );

  const handleStandaloneSessionDropAfterVisibleTarget = useCallback(
    (targetSessionId: string, isPinnedBucket: boolean) => {
      if (!dragSessionId || dragSessionId === targetSessionId || !usingMockStandaloneSessions) {
        return;
      }
      const bucketItems = displayStandaloneSessions
        .filter((item) => item.session.isPinned === isPinnedBucket)
        .map((item) => item.session.id);
      if (!bucketItems.includes(dragSessionId)) {
        return;
      }
      const nextIds = moveIdAfterTarget(bucketItems, dragSessionId, targetSessionId);
      setMockStandaloneSessions((current) => {
        const pinnedIds = isPinnedBucket
          ? nextIds
          : current.filter((item) => item.session.isPinned).map((item) => item.session.id);
        const unpinnedIds = isPinnedBucket
          ? current.filter((item) => !item.session.isPinned).map((item) => item.session.id)
          : nextIds;
        const byId = new Map(current.map((item) => [item.session.id, item] as const));
        return normalizeMockStandaloneSessions([
          ...pinnedIds.map((id) => byId.get(id)!),
          ...unpinnedIds.map((id) => byId.get(id)!)
        ]);
      });
      flashDroppedSession(dragSessionId);
      setDragSessionId(undefined);
      setDragOverSessionTarget(undefined);
    },
    [displayStandaloneSessions, dragSessionId, flashDroppedSession, setDragOverSessionTarget, usingMockStandaloneSessions]
  );

  const handleSessionDropToBucketEnd = useCallback(
    (workspaceId: string, isPinnedBucket: boolean) => {
      if (!dragSessionId) {
        return;
      }
      const workspace = workspaceItems.find((item) => item.workspace.id === workspaceId);
      if (!workspace) {
        return;
      }
      const bucketItems = workspace.sessions
        .filter((item) => item.session.isPinned === isPinnedBucket)
        .map((item) => item.session.id);
      if (!bucketItems.includes(dragSessionId)) {
        return;
      }
      const nextIds = moveIdToBucketEnd(bucketItems, dragSessionId);
      const pinnedIds = isPinnedBucket
        ? nextIds
        : workspace.sessions.filter((item) => item.session.isPinned).map((item) => item.session.id);
      const unpinnedIds = isPinnedBucket
        ? workspace.sessions.filter((item) => !item.session.isPinned).map((item) => item.session.id)
        : nextIds;
      onReorderSessions({ workspaceId, pinnedIds, unpinnedIds });
      flashDroppedSession(dragSessionId);
      setDragSessionId(undefined);
      setDragOverSessionTarget(undefined);
    },
    [dragSessionId, flashDroppedSession, onReorderSessions, setDragOverSessionTarget, workspaceItems]
  );

  const handleStandaloneSessionDropToBucketEnd = useCallback(
    (isPinnedBucket: boolean) => {
      if (!dragSessionId || !usingMockStandaloneSessions) {
        return;
      }
      const bucketItems = displayStandaloneSessions
        .filter((item) => item.session.isPinned === isPinnedBucket)
        .map((item) => item.session.id);
      if (!bucketItems.includes(dragSessionId)) {
        return;
      }
      const nextIds = moveIdToBucketEnd(bucketItems, dragSessionId);
      setMockStandaloneSessions((current) => {
        const pinnedIds = isPinnedBucket
          ? nextIds
          : current.filter((item) => item.session.isPinned).map((item) => item.session.id);
        const unpinnedIds = isPinnedBucket
          ? current.filter((item) => !item.session.isPinned).map((item) => item.session.id)
          : nextIds;
        const byId = new Map(current.map((item) => [item.session.id, item] as const));
        return normalizeMockStandaloneSessions([
          ...pinnedIds.map((id) => byId.get(id)!),
          ...unpinnedIds.map((id) => byId.get(id)!)
        ]);
      });
      flashDroppedSession(dragSessionId);
      setDragSessionId(undefined);
      setDragOverSessionTarget(undefined);
    },
    [displayStandaloneSessions, dragSessionId, flashDroppedSession, setDragOverSessionTarget, usingMockStandaloneSessions]
  );

  const renderWorkspaceMenu = (workspace: RecentWorkspaceEntry) => {
    const sessionIds = workspaceItems.find((item) => item.workspace.id === workspace.id)?.sessions.map((item) => item.session.id) ?? [];
    return [
      {
        id: "pin",
        label: workspace.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin,
        icon: workspace.isPinned ? <IconPinOff size={14} decorative /> : <IconPin size={14} decorative />,
        action: () => (workspace.isPinned ? onUnpinWorkspace(workspace.id) : onPinWorkspace(workspace.id))
      },
      {
        id: "mark-read",
        label: t.sessionMenuMarkRead,
        icon: <IconCheckCheck size={14} decorative />,
        action: () => onMarkAllSessionsRead(sessionIds)
      },
      {
        id: "archive-all",
        label: t.sessionMenuArchive,
        icon: <IconArchive size={14} decorative />,
        action: () => onArchiveAllSessions()
      },
      {
        id: "remove",
        label: t.sessionMenuRemove,
        icon: <IconTrash size={14} decorative />,
        action: () => onRemoveWorkspace(workspace.id)
      },
      {
        id: "reveal",
        label: t.sessionMenuRevealFolder,
        icon: <IconFolderOpen size={14} decorative />,
        action: () => onRevealWorkspace(workspace.path)
      }
    ];
  };

  const renderSessionMenu = (sessionItem: SidebarSessionItem) => {
    const session = sessionItem.session;
    const isMockSession = usingMockStandaloneSessions && isMockStandaloneSessionId(session.id);
    return [
      {
        id: "rename",
        label: t.sessionMenuRename,
        icon: <IconPencil size={14} decorative />,
        action: () => {
          setRenamingSessionId(session.id);
          setRenameDraft(session.title);
        }
      },
      {
        id: "read-state",
        label: sessionItem.isUnread ? t.sessionMenuMarkRead : t.sessionMenuMarkUnread,
        icon: sessionItem.isUnread ? <IconCheck size={14} decorative /> : <IconMail size={14} decorative />,
        action: () =>
          isMockSession
            ? setMockStandaloneReadState(session.id, !sessionItem.isUnread)
            : sessionItem.isUnread
              ? onMarkSessionRead(session.id)
              : onMarkSessionUnread(session.id)
      },
      {
        id: "archive",
        label: t.sessionMenuArchive,
        icon: <IconArchive size={14} decorative />,
        action: () => (isMockSession ? archiveMockStandaloneSession(session.id) : onArchiveSession(session.id))
      },
      {
        id: "copy-id",
        label: t.sessionMenuCopyId,
        icon: <IconCopy size={14} decorative />,
        action: () => void navigator.clipboard?.writeText(session.id)
      },
      {
        id: "export",
        label: t.sessionMenuExport,
        icon: <IconDownload size={14} decorative />,
        action: () => void (isMockSession ? exportMockStandaloneSession(session) : exportSessionMarkdown(session))
      },
      {
        id: "pin",
        label: session.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin,
        icon: session.isPinned ? <IconPinOff size={14} decorative /> : <IconPin size={14} decorative />,
        action: () => (isMockSession ? toggleMockStandalonePin(session.id) : session.isPinned ? onUnpinSession(session.id) : onPinSession(session.id))
      },
      {
        id: "delete",
        label: t.sessionMenuDelete,
        icon: <IconTrash size={14} decorative />,
        danger: true,
        action: () => (isMockSession ? deleteMockStandaloneSession(session.id) : onDeleteSession(session.id))
      }
    ];
  };

  const renderSessionLimitControl = (
    listKey: string,
    hiddenCount: number,
    options?: {
      canDropToTail?: boolean;
      isTailDropTarget?: boolean;
      onTailDragOver?: (event: React.DragEvent<HTMLLIElement>) => void;
      onTailDragLeave?: (event: React.DragEvent<HTMLLIElement>) => void;
      onTailDrop?: () => void;
    }
  ) => {
    const expanded = expandedSessionLists[listKey] ?? false;
    if (hiddenCount === 0 && !expanded) {
      return null;
    }

    return (
      <li
        className={`adl-session-list__limit-item${options?.canDropToTail ? " adl-session-row adl-session-row--tail adl-session-row--tail-control adl-session-row--reorder-zone" : ""}${options?.isTailDropTarget ? " is-drop-target is-reorderable-target" : ""}`}
        onDragOver={options?.onTailDragOver}
        onDragLeave={options?.onTailDragLeave}
        onDrop={options?.onTailDrop}
      >
        <button
          type="button"
          className="adl-session-list__limit"
          onClick={() =>
            setExpandedSessionLists((current) => ({
              ...current,
              [listKey]: !expanded
            }))
          }
        >
          {expanded ? t.collapseSessions : `${t.showMoreSessions} ${hiddenCount}`}
        </button>
      </li>
    );
  };

  const renderSessionRows = (
    sessionItems: SidebarSessionItem[],
    options: {
      listKey: string;
      workspaceId?: string;
      interactive?: boolean;
      allowStandaloneReorder?: boolean;
    }
  ) => {
    const expanded = expandedSessionLists[options.listKey] ?? false;
    const tailDropTargetId = `${options.listKey}::tail`;
    const visibleSessions = getVisibleSidebarSessions(sessionItems, expanded);
    const visibleItems = expanded
      ? visibleSessions.items
      : mergeEphemeralVisibleSessions(sessionItems, visibleSessions.items, ephemeralVisibleSessionIds[options.listKey] ?? []);
    const hiddenCount = Math.max(0, sessionItems.length - visibleItems.length);
    const interactive = options.interactive ?? true;
    const canReorder = interactive && (Boolean(options.workspaceId) || Boolean(options.allowStandaloneReorder));
    const draggedSessionItem = dragSessionId ? sessionItems.find((item) => item.session.id === dragSessionId) : undefined;
    const lastVisibleInBucket = draggedSessionItem
      ? [...visibleItems].reverse().find((item) => item.session.isPinned === draggedSessionItem.session.isPinned)
      : undefined;

    return (
      <>
        {visibleItems.map((sessionItem) => {
          const isHovered = hoveredSessionId === sessionItem.session.id;
          const statusLabel = t[STATUS_LABEL[sessionItem.status]] as string;
          const isMockStandaloneSession = usingMockStandaloneSessions && isMockStandaloneSessionId(sessionItem.session.id);
          const canReorderIntoTarget =
            Boolean(draggedSessionItem) &&
            draggedSessionItem?.session.id !== sessionItem.session.id &&
            draggedSessionItem?.session.isPinned === sessionItem.session.isPinned &&
            (Boolean(options.workspaceId) || Boolean(options.allowStandaloneReorder));
          const isDropTarget =
            dragOverSessionId === sessionItem.session.id &&
            canReorderIntoTarget;
          return (
            <li
              key={sessionItem.session.id}
              className={`adl-session-row${dragSessionId === sessionItem.session.id ? " is-dragging" : ""}${isDropTarget ? " is-drop-target" : ""}${canReorderIntoTarget ? " is-reorderable-target" : ""}`}
              draggable={canReorder}
              onDragStart={(event) => {
                if (interactive) {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", sessionItem.session.id);
                  setDragSessionId(sessionItem.session.id);
                  setDragOverSessionTarget(undefined);
                }
              }}
              onDragEnd={() => {
                setDragSessionId(undefined);
                setDragOverSessionTarget(undefined);
              }}
              onDragOver={(event) => {
                if (interactive) {
                  event.preventDefault();
                  if (canReorderIntoTarget) {
                    setDragOverSessionTarget(sessionItem.session.id);
                  }
                }
              }}
              onDrop={() =>
                interactive
                  ? options.workspaceId
                    ? handleSessionDrop(options.workspaceId, sessionItem.session.id, sessionItem.session.isPinned)
                    : options.allowStandaloneReorder
                      ? handleStandaloneSessionDrop(sessionItem.session.id, sessionItem.session.isPinned)
                      : undefined
                  : undefined
              }
            >
              <div
                role="button"
                tabIndex={0}
                className={`adl-session-item${sessionItem.session.id === activeSessionId ? " is-active" : ""}${dragSessionId === sessionItem.session.id ? " is-dragging" : ""}${isDropTarget ? " is-drop-target" : ""}${droppedSessionId === sessionItem.session.id ? " is-drop-flash" : ""}`}
                onMouseEnter={() => setHoveredSessionId(sessionItem.session.id)}
                onMouseLeave={() => setHoveredSessionId((current) => (current === sessionItem.session.id ? undefined : current))}
                onContextMenu={(event) => {
                  if (!interactive) {
                    return;
                  }
                  event.preventDefault();
                  setMenuState({ type: "session", sessionId: sessionItem.session.id, x: event.clientX, y: event.clientY });
                }}
                onClick={() => {
                  if (interactive && !isMockStandaloneSession) {
                    onSelectSession(sessionItem.session.id);
                  }
                }}
                onKeyDown={(event) => {
                  if (!interactive) {
                    return;
                  }
                  if (event.target !== event.currentTarget) {
                    return;
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (!isMockStandaloneSession) {
                      onSelectSession(sessionItem.session.id);
                    }
                  }
                }}
                onDoubleClick={() => {
                  if (!interactive) {
                    return;
                  }
                  setRenamingSessionId(sessionItem.session.id);
                  setRenameDraft(sessionItem.session.title);
                }}
              >
                {isHovered && interactive ? (
                  <button
                    type="button"
                    className="adl-session-item__indicator"
                    aria-label={sessionItem.session.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isMockStandaloneSession) {
                        toggleMockStandalonePin(sessionItem.session.id);
                        return;
                      }
                      sessionItem.session.isPinned ? onUnpinSession(sessionItem.session.id) : onPinSession(sessionItem.session.id);
                    }}
                  >
                    {sessionItem.session.isPinned ? <IconPinOff size={12} decorative /> : <IconPin size={12} decorative />}
                  </button>
                ) : (
                  <span className="adl-session-item__indicator adl-session-item__indicator--static" aria-hidden="true">
                    <StatusLamp status={sessionItem.status} title={statusLabel} />
                  </span>
                )}

                {renamingSessionId === sessionItem.session.id ? (
                  <input
                    className="adl-session-item__rename"
                    value={renameDraft}
                    autoFocus
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onBlur={() => {
                      const nextValue = renameDraft.trim();
                      if (nextValue && nextValue !== sessionItem.session.title) {
                        if (isMockStandaloneSession) {
                          renameMockStandaloneSession(sessionItem.session.id, nextValue);
                        } else {
                          onRenameSession(sessionItem.session.id, nextValue);
                        }
                      }
                      setRenamingSessionId(undefined);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        const nextValue = renameDraft.trim();
                        if (nextValue && nextValue !== sessionItem.session.title) {
                          if (isMockStandaloneSession) {
                            renameMockStandaloneSession(sessionItem.session.id, nextValue);
                          } else {
                            onRenameSession(sessionItem.session.id, nextValue);
                          }
                        }
                        setRenamingSessionId(undefined);
                      }
                      if (event.key === "Escape") {
                        setRenamingSessionId(undefined);
                      }
                    }}
                  />
                ) : (
                  <TooltipSimple content={sessionItem.session.title} placement="right">
                    <span className="adl-session-item__title">
                      <span className="adl-session-item__title-text">{sessionItem.session.title}</span>
                    </span>
                  </TooltipSimple>
                )}

                {isHovered && interactive ? (
                  <span className="adl-session-item__actions" onClick={(event) => event.stopPropagation()}>
                    <TooltipSimple content={t.sessionMenuArchive} placement="right">
                      <button
                        type="button"
                        className="adl-icon-btn adl-icon-btn--xs"
                        onClick={() =>
                          isMockStandaloneSession
                            ? archiveMockStandaloneSession(sessionItem.session.id)
                            : onArchiveSession(sessionItem.session.id)
                        }
                        aria-label={t.sessionMenuArchive}
                      >
                        <IconArchive size={12} decorative />
                      </button>
                    </TooltipSimple>
                    <TooltipSimple content={t.menuSettings} placement="right">
                      <button
                        type="button"
                        className="adl-icon-btn adl-icon-btn--xs"
                        onClick={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          setMenuState({ type: "session", sessionId: sessionItem.session.id, x: rect.right, y: rect.bottom + 4 });
                        }}
                        aria-label={t.menuSettings}
                      >
                        <IconMoreVertical size={12} decorative />
                      </button>
                    </TooltipSimple>
                  </span>
                ) : (
                  <span className="adl-session-item__meta">
                    {new Date(sessionItem.session.updatedAt).toLocaleString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                      month: "2-digit",
                      day: "2-digit"
                    })}
                  </span>
                )}
              </div>
            </li>
          );
        })}
        {canReorder && draggedSessionItem ? (
          <li
            className={`adl-session-row adl-session-row--tail${dragOverSessionId === tailDropTargetId ? " is-drop-target is-reorderable-target" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (lastVisibleInBucket) {
                setDragOverSessionTarget(tailDropTargetId);
              }
            }}
            onDrop={() => {
              if (options.workspaceId) {
                handleSessionDropToBucketEnd(options.workspaceId, draggedSessionItem.session.isPinned);
                return;
              }
              if (options.allowStandaloneReorder) {
                handleStandaloneSessionDropToBucketEnd(draggedSessionItem.session.isPinned);
              }
            }}
          />
        ) : null}
        {renderSessionLimitControl(options.listKey, hiddenCount, canReorder && draggedSessionItem ? {
          canDropToTail: true,
          isTailDropTarget: dragOverSessionId === tailDropTargetId,
          onTailDragOver: (event) => {
            event.preventDefault();
            setDragOverSessionTarget(tailDropTargetId);
          },
          onTailDrop: () => {
            const shouldDropAfterVisibleTail = !expanded && hiddenCount > 0 && lastVisibleInBucket;
            if (options.workspaceId) {
              if (shouldDropAfterVisibleTail) {
                handleSessionDropAfterVisibleTarget(
                  options.workspaceId,
                  lastVisibleInBucket.session.id,
                  draggedSessionItem.session.isPinned
                );
              } else {
                handleSessionDropToBucketEnd(options.workspaceId, draggedSessionItem.session.isPinned);
              }
              return;
            }
            if (options.allowStandaloneReorder) {
              if (shouldDropAfterVisibleTail) {
                handleStandaloneSessionDropAfterVisibleTarget(
                  lastVisibleInBucket.session.id,
                  draggedSessionItem.session.isPinned
                );
              } else {
                handleStandaloneSessionDropToBucketEnd(draggedSessionItem.session.isPinned);
              }
            }
          },
          onTailDragLeave: undefined
        } : undefined)}
      </>
    );
  };

  return (
    <aside
      className={`adl-leftbar${collapsed ? " adl-leftbar--collapsed" : ""}`}
      aria-label="Workspace and session navigator"
      aria-hidden={collapsed}
    >
      <div className="adl-leftbar__content" ref={leftbarContentRef}>
      <section className="adl-leftbar__quick">
        <TooltipSimple content={`${t.quickSkills} · ${t.quickSkillsComingSoon}`} placement="right">
          <button type="button" className="adl-quick-btn" disabled>
            <IconSparkles size={16} decorative />
            <span className="adl-quick-btn__label">{t.quickSkills}</span>
          </button>
        </TooltipSimple>
        <TooltipSimple content={`${t.quickMcp} · ${t.quickSkillsComingSoon}`} placement="right">
          <button type="button" className="adl-quick-btn" disabled>
            <IconPlug size={16} decorative />
            <span className="adl-quick-btn__label">{t.quickMcp}</span>
            <span className="adl-status-lamp adl-status-lamp--read" aria-hidden="true" />
          </button>
        </TooltipSimple>
      </section>

      <section className="adl-leftbar__nav" aria-label={t.workspaces}>
        <div className="adl-workspace-toolbar" ref={workspaceToolbarRef}>
          <div className="adl-section-toolbar__title">
            <span className="adl-section-toolbar__label">{t.projects}</span>
            <TooltipSimple
              content={
                workspaceItems.every((item) => expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent)
                  ? t.collapseSessions
                  : t.expand
              }
              placement="right"
            >
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={() => {
                  const allExpanded = workspaceItems.every((item) => expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent);
                  for (const item of workspaceItems) {
                    const shouldBeExpanded = !allExpanded;
                    if (shouldBeExpanded !== (expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent)) {
                      toggleSessionWorkspace(item.workspace.path);
                    }
                  }
                }}
                aria-label={
                  workspaceItems.every((item) => expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent)
                    ? t.collapseSessions
                    : t.expand
                }
              >
                {workspaceItems.every((item) => expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent) ? (
                  <IconCollapseRows size={14} decorative />
                ) : (
                  <IconExpandRows size={14} decorative />
                )}
              </button>
            </TooltipSimple>
          </div>
          <TooltipSimple content={t.quickNewWorkspace} placement="right">
            <button type="button" className="adl-icon-btn adl-icon-btn--xs" onClick={onTriggerCreateWorkspace} aria-label={t.quickNewWorkspace}>
              <IconPlus size={14} decorative />
            </button>
          </TooltipSimple>
        </div>

        <ul className="adl-workspace-list" role="tree">
          {workspaceItems.length === 0 ? <li className="adl-empty-hint">{t.workspaceEmpty}</li> : null}
          {workspaceItems.map((item) => {
            const expanded = expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent;
            const workspaceStatusLabel = t[STATUS_LABEL[item.rollupStatus]] as string;

            return (
              <li
                key={item.workspace.id}
                className={`adl-workspace-item${item.isCurrent ? " is-current" : ""}`}
                draggable
                onDragStart={() => setDragWorkspaceId(item.workspace.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleWorkspaceDrop(item.workspace.id, item.workspace.isPinned)}
              >
                <div
                  className="adl-workspace-row"
                  role="treeitem"
                  aria-expanded={expanded}
                  onClick={() => {
                    if (!item.isCurrent) {
                      onOpenWorkspace(item.workspace.path);
                      return;
                    }
                    toggleSessionWorkspace(item.workspace.path);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenuState({ type: "workspace", workspaceId: item.workspace.id, x: event.clientX, y: event.clientY });
                  }}
                >
                  <span className="adl-workspace-row__leading">
                    {expanded ? (
                      <TooltipSimple content={t.workspaces} placement="right">
                        <span className="adl-workspace-row__kind" aria-hidden="true">
                          <IconFolder size={12} decorative />
                        </span>
                      </TooltipSimple>
                    ) : (
                      <TooltipSimple content={buildWorkspaceTooltip(t, item.statusCounts)} placement="right">
                        <span className="adl-workspace-row__indicator adl-workspace-row__indicator--static">
                          <StatusLamp status={item.rollupStatus} title={workspaceStatusLabel} />
                        </span>
                      </TooltipSimple>
                    )}
                  </span>

                  <TooltipSimple content={item.workspace.path} placement="right">
                    <button
                      type="button"
                      className="adl-workspace-row__label"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!item.isCurrent) {
                          onOpenWorkspace(item.workspace.path);
                        } else {
                          toggleSessionWorkspace(item.workspace.path);
                        }
                      }}
                    >
                      <span>{item.workspace.name}</span>
                    </button>
                  </TooltipSimple>

                  <div className="adl-workspace-row__tail">
                    <span className="adl-workspace-row__secondary">
                      <TooltipSimple content={item.workspace.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin} placement="right">
                        <button
                          type="button"
                          className="adl-workspace-row__pin"
                          onClick={(event) => {
                            event.stopPropagation();
                            item.workspace.isPinned ? onUnpinWorkspace(item.workspace.id) : onPinWorkspace(item.workspace.id);
                          }}
                          aria-label={item.workspace.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin}
                        >
                          {item.workspace.isPinned ? <IconPinOff size={12} decorative /> : <IconPin size={12} decorative />}
                        </button>
                      </TooltipSimple>
                    </span>

                    <div className="adl-workspace-row__actions">
                      <TooltipSimple content={expanded ? t.collapseSessions : t.expand} placement="right">
                        <button
                          type="button"
                          className="adl-icon-btn adl-icon-btn--xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleSessionWorkspace(item.workspace.path);
                          }}
                          aria-label={expanded ? t.collapseSessions : t.expand}
                        >
                          {expanded ? <IconChevronDown size={12} decorative /> : <IconChevronRight size={12} decorative />}
                        </button>
                      </TooltipSimple>
                      <TooltipSimple content={t.newSession} placement="right">
                        <button
                          type="button"
                          className="adl-icon-btn adl-icon-btn--xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (item.isCurrent) {
                              onCreateSession();
                            }
                          }}
                          disabled={!item.isCurrent}
                          aria-label={t.newSession}
                        >
                          <IconPlus size={12} decorative />
                        </button>
                      </TooltipSimple>
                      <TooltipSimple content={t.menuSettings} placement="right">
                        <button
                          type="button"
                          className="adl-icon-btn adl-icon-btn--xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            const rect = event.currentTarget.getBoundingClientRect();
                            setMenuState({ type: "workspace", workspaceId: item.workspace.id, x: rect.right, y: rect.bottom + 4 });
                          }}
                          aria-label={t.menuSettings}
                        >
                          <IconMoreVertical size={12} decorative />
                        </button>
                      </TooltipSimple>
                    </div>
                  </div>
                </div>

                {expanded ? (
                  <div className="adl-session-wrapper">
                    <ul className="adl-session-list" role="group">
                      {item.sessions.length === 0 ? <li className="adl-empty-hint adl-empty-hint--nested">{t.sessionEmpty}</li> : null}
                      {renderSessionRows(item.sessions, { listKey: `workspace:${item.workspace.id}`, workspaceId: item.workspace.id })}
                    </ul>

                    {item.archivedSessions.length > 0 ? (
                      <details className="adl-archive" open={archiveOpen} onToggle={(event) => setArchiveOpen(event.currentTarget.open)}>
                        <summary>
                          <IconArchive size={12} decorative />
                          <span>{t.sessionMenuArchive}</span>
                          <span className="adl-badge">{item.archivedSessions.length}</span>
                        </summary>
                        <ul>
                          {item.archivedSessions.map((sessionItem) => (
                            <li key={sessionItem.session.id}>
                              <button
                                type="button"
                                className="adl-session-item adl-session-item--archived"
                                onClick={() => onSelectSession(sessionItem.session.id)}
                              >
                                <span className="adl-session-item__indicator" aria-hidden="true">
                                  <StatusLamp status="read" title={t.statusRead} />
                                </span>
                                <span className="adl-session-item__title">
                                  <span className="adl-session-item__title-text">{sessionItem.session.title}</span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section
        className={`adl-leftbar__nav adl-leftbar__nav--conversations${conversationsCollapsed ? " is-collapsed" : ""}`}
        aria-label={t.conversations}
        style={{ "--leftbar-conversation-height": `${conversationPanelHeight}px` } as React.CSSProperties}
      >
        <div
          className="adl-leftbar__conversation-resize"
          onMouseDown={handleConversationResizeMouseDown}
          role="separator"
          aria-orientation="horizontal"
          aria-label="调整对话区域高度"
        />
        <div className="adl-workspace-toolbar adl-workspace-toolbar--conversation">
          <div className="adl-section-toolbar__title">
            <span className="adl-section-toolbar__label">{t.conversations}</span>
            <TooltipSimple content={conversationsCollapsed ? t.expand : t.collapseSessions} placement="right">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={() => setConversationsCollapsed((current) => !current)}
                aria-label={conversationsCollapsed ? t.expand : t.collapseSessions}
              >
                {conversationsCollapsed ? <IconExpandRows size={14} decorative /> : <IconCollapseRows size={14} decorative />}
              </button>
            </TooltipSimple>
          </div>
          <TooltipSimple content={t.newConversation} placement="right">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              aria-label={t.newConversation}
              onClick={() => {
                if (usingMockStandaloneSessions) {
                  createMockStandaloneSession();
                }
              }}
              disabled={!usingMockStandaloneSessions}
            >
              <IconPlus size={14} decorative />
            </button>
          </TooltipSimple>
        </div>
        {!conversationsCollapsed ? (
          <div className="adl-leftbar__conversation-body">
            <ul className="adl-session-list adl-session-list--standalone" role="list">
              {renderSessionRows(displayStandaloneSessions, {
                listKey: "standalone",
                allowStandaloneReorder: usingMockStandaloneSessions
              })}
            </ul>
            {displayStandaloneArchivedSessions.length > 0 ? (
              <details className="adl-archive" open={archiveOpen} onToggle={(event) => setArchiveOpen(event.currentTarget.open)}>
                <summary>
                  <IconArchive size={12} decorative />
                  <span>{t.sessionMenuArchive}</span>
                  <span className="adl-badge">{displayStandaloneArchivedSessions.length}</span>
                </summary>
                <ul>{renderSessionRows(displayStandaloneArchivedSessions, { listKey: "standalone-archive" })}</ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </section>

      </div>

      {menuState ? (
        menuState.type === "workspace" ? (
          <SidebarContextMenu
            items={renderWorkspaceMenu(workspaceItems.find((item) => item.workspace.id === menuState.workspaceId)!.workspace)}
            x={menuState.x}
            y={menuState.y}
            onClose={() => setMenuState(undefined)}
          />
        ) : sessionItemsById.has(menuState.sessionId) ? (
          <SidebarContextMenu
            items={renderSessionMenu(sessionItemsById.get(menuState.sessionId)!)}
            x={menuState.x}
            y={menuState.y}
            onClose={() => setMenuState(undefined)}
          />
        ) : null
      ) : null}

      <div className="adl-leftbar__resize-handle" onMouseDown={handleResizeMouseDown} role="separator" aria-orientation="vertical" aria-label="调整侧边栏宽度" />
    </aside>
  );
}
