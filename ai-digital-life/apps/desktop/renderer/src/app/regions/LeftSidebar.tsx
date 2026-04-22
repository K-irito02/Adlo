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
  IconDownload,
  IconFolder,
  IconFolderOpen,
  IconLangEn,
  IconLangZh,
  IconMail,
  IconMonitor,
  IconMoon,
  IconMoreVertical,
  IconPencil,
  IconPin,
  IconPinOff,
  IconPlug,
  IconSparkles,
  IconSun,
  IconTrash,
  IconCopy,
  IconPlus
} from "../icons";
import { buildSidebarViewModel, type SessionVisualStatus } from "../sidebarViewModel";
import { useUiStore } from "../ui-store";
import { TooltipSimple } from "../components/Tooltip";

interface LeftSidebarProps {
  t: CopyDict;
  locale: Locale;
  appInfo?: AppInfo;
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
  onCycleTheme: () => void;
  onSelectLanguage: (language: AppInfo["config"]["language"]) => void;
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

function StatusLamp({ status, title }: { status: SessionVisualStatus; title: string }) {
  return <span className={`adl-status-lamp adl-status-lamp--${status}`} role="img" aria-label={title} />;
}

function ThemeIcon({ mode }: { mode: AppInfo["config"]["themeMode"] | undefined }) {
  switch (mode) {
    case "dark":
      return <IconMoon size={16} decorative />;
    case "light":
      return <IconSun size={16} decorative />;
    default:
      return <IconMonitor size={16} decorative />;
  }
}

function LanguageIcon({ language }: { language: AppInfo["config"]["language"] | undefined }) {
  switch (language) {
    case "en-US":
      return <IconLangEn size={16} decorative />;
    case "zh-CN":
    default:
      return <IconLangZh size={16} decorative />;
  }
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
  onTriggerCreateWorkspace,
  onCycleTheme,
  onSelectLanguage
}: LeftSidebarProps) {
  const { expandedSessionWorkspaces, toggleSessionWorkspace } = useUiStore();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [hoveredSessionId, setHoveredSessionId] = useState<string>();
  const [menuState, setMenuState] = useState<SidebarMenuState>();
  const [renamingSessionId, setRenamingSessionId] = useState<string>();
  const [renameDraft, setRenameDraft] = useState("");
  const [dragWorkspaceId, setDragWorkspaceId] = useState<string>();
  const [dragSessionId, setDragSessionId] = useState<string>();

  const sidebarItems = useMemo(
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

  const language = appInfo?.config.language ?? "zh-CN";
  const nextLanguage = language === "zh-CN" ? "en-US" : "zh-CN";

  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const cleanupDragRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (cleanupDragRef.current) {
        cleanupDragRef.current();
        cleanupDragRef.current = null;
      }
    };
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
      const bucketItems = sidebarItems.filter((item) => item.workspace.isPinned === isPinnedBucket).map((item) => item.workspace.id);
      if (!bucketItems.includes(dragWorkspaceId)) {
        return;
      }
      const nextIds = moveIdWithinBucket(bucketItems, dragWorkspaceId, targetWorkspaceId);
      const pinnedIds = isPinnedBucket
        ? nextIds
        : sidebarItems.filter((item) => item.workspace.isPinned).map((item) => item.workspace.id);
      const unpinnedIds = isPinnedBucket
        ? sidebarItems.filter((item) => !item.workspace.isPinned).map((item) => item.workspace.id)
        : nextIds;
      onReorderWorkspaces({ pinnedIds, unpinnedIds });
      setDragWorkspaceId(undefined);
    },
    [dragWorkspaceId, onReorderWorkspaces, sidebarItems]
  );

  const handleSessionDrop = useCallback(
    (workspaceId: string, targetSessionId: string, isPinnedBucket: boolean) => {
      if (!dragSessionId || dragSessionId === targetSessionId) {
        return;
      }
      const workspace = sidebarItems.find((item) => item.workspace.id === workspaceId);
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
      setDragSessionId(undefined);
    },
    [dragSessionId, onReorderSessions, sidebarItems]
  );

  const renderWorkspaceMenu = (workspace: RecentWorkspaceEntry) => {
    const sessionIds = sidebarItems.find((item) => item.workspace.id === workspace.id)?.sessions.map((item) => item.session.id) ?? [];
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

  const renderSessionMenu = (session: ConversationSessionRecord) => [
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
      label: session.manualUnread || (session.lastReadAt ?? 0) < session.lastMessageAt ? t.sessionMenuMarkRead : t.sessionMenuMarkUnread,
      icon:
        session.manualUnread || (session.lastReadAt ?? 0) < session.lastMessageAt ? (
          <IconCheck size={14} decorative />
        ) : (
          <IconMail size={14} decorative />
        ),
      action: () =>
        session.manualUnread || (session.lastReadAt ?? 0) < session.lastMessageAt
          ? onMarkSessionRead(session.id)
          : onMarkSessionUnread(session.id)
    },
    {
      id: "archive",
      label: t.sessionMenuArchive,
      icon: <IconArchive size={14} decorative />,
      action: () => onArchiveSession(session.id)
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
      action: () => void exportSessionMarkdown(session)
    },
    {
      id: "pin",
      label: session.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin,
      icon: session.isPinned ? <IconPinOff size={14} decorative /> : <IconPin size={14} decorative />,
      action: () => (session.isPinned ? onUnpinSession(session.id) : onPinSession(session.id))
    },
    {
      id: "delete",
      label: t.sessionMenuDelete,
      icon: <IconTrash size={14} decorative />,
      danger: true,
      action: () => onDeleteSession(session.id)
    }
  ];

  return (
    <aside className="adl-leftbar" aria-label="Workspace and session navigator">
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
        <div className="adl-workspace-toolbar">
          <TooltipSimple content={t.workspaces} placement="right">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={() => {
                const allExpanded = sidebarItems.every((item) => expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent);
                for (const item of sidebarItems) {
                  const shouldBeExpanded = !allExpanded;
                  if (shouldBeExpanded !== (expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent)) {
                    toggleSessionWorkspace(item.workspace.path);
                  }
                }
              }}
              aria-label={t.workspaces}
            >
              {sidebarItems.every((item) => expandedSessionWorkspaces[item.workspace.path] ?? item.isCurrent) ? (
                <IconChevronDown size={14} decorative />
              ) : (
                <IconChevronRight size={14} decorative />
              )}
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.quickNewWorkspace} placement="right">
            <button type="button" className="adl-icon-btn adl-icon-btn--xs" onClick={onTriggerCreateWorkspace} aria-label={t.quickNewWorkspace}>
              <IconPlus size={14} decorative />
            </button>
          </TooltipSimple>
        </div>

        <ul className="adl-workspace-list" role="tree">
          {sidebarItems.length === 0 ? <li className="adl-empty-hint">{t.workspaceEmpty}</li> : null}
          {sidebarItems.map((item) => {
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
                      <TooltipSimple content={expanded ? "Collapse" : "Expand"} placement="right">
                        <button
                          type="button"
                          className="adl-icon-btn adl-icon-btn--xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleSessionWorkspace(item.workspace.path);
                          }}
                          aria-label={expanded ? "Collapse" : "Expand"}
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

                {expanded && item.isCurrent ? (
                  <div className="adl-session-wrapper">
                    <ul className="adl-session-list" role="group">
                      {item.sessions.length === 0 ? <li className="adl-empty-hint adl-empty-hint--nested">{t.sessionEmpty}</li> : null}
                      {item.sessions.map((sessionItem) => {
                        const isHovered = hoveredSessionId === sessionItem.session.id;
                        const statusLabel = t[STATUS_LABEL[sessionItem.status]] as string;
                        return (
                          <li
                            key={sessionItem.session.id}
                            draggable
                            onDragStart={() => setDragSessionId(sessionItem.session.id)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() =>
                              handleSessionDrop(item.workspace.id, sessionItem.session.id, sessionItem.session.isPinned)
                            }
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              className={`adl-session-item${sessionItem.session.id === activeSessionId ? " is-active" : ""}`}
                              onMouseEnter={() => setHoveredSessionId(sessionItem.session.id)}
                              onMouseLeave={() => setHoveredSessionId((current) => (current === sessionItem.session.id ? undefined : current))}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                setMenuState({ type: "session", sessionId: sessionItem.session.id, x: event.clientX, y: event.clientY });
                              }}
                              onClick={() => onSelectSession(sessionItem.session.id)}
                              onKeyDown={(event) => {
                                if (event.target !== event.currentTarget) {
                                  return;
                                }
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  onSelectSession(sessionItem.session.id);
                                }
                              }}
                              onDoubleClick={() => {
                                setRenamingSessionId(sessionItem.session.id);
                                setRenameDraft(sessionItem.session.title);
                              }}
                            >
                              {isHovered ? (
                                <button
                                  type="button"
                                  className="adl-session-item__indicator"
                                  aria-label={sessionItem.session.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    sessionItem.session.isPinned
                                      ? onUnpinSession(sessionItem.session.id)
                                      : onPinSession(sessionItem.session.id);
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
                                      onRenameSession(sessionItem.session.id, nextValue);
                                    }
                                    setRenamingSessionId(undefined);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      const nextValue = renameDraft.trim();
                                      if (nextValue && nextValue !== sessionItem.session.title) {
                                        onRenameSession(sessionItem.session.id, nextValue);
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
                                    {sessionItem.isUnread ? <span className="adl-session-item__unread" /> : null}
                                  </span>
                                </TooltipSimple>
                              )}

                              {isHovered ? (
                                <span className="adl-session-item__actions" onClick={(event) => event.stopPropagation()}>
                                  <TooltipSimple content={t.sessionMenuArchive} placement="right">
                                    <button
                                      type="button"
                                      className="adl-icon-btn adl-icon-btn--xs"
                                      onClick={() => onArchiveSession(sessionItem.session.id)}
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

      <section className="adl-leftbar__env">
        <TooltipSimple content={t.theme} placement="right">
          <button type="button" className="adl-env-btn" onClick={onCycleTheme} aria-label={t.theme}>
            <ThemeIcon mode={appInfo?.config.themeMode} />
            <span>{t.theme}</span>
          </button>
        </TooltipSimple>
        <TooltipSimple content={t.language} placement="right">
          <button
            type="button"
            className="adl-env-btn"
            onClick={() => onSelectLanguage(nextLanguage)}
            aria-label={`${t.language}: ${nextLanguage === "zh-CN" ? "中文" : "EN"}`}
          >
            <LanguageIcon language={language} />
            <span>{language === "zh-CN" ? "中文" : "EN"}</span>
          </button>
        </TooltipSimple>
      </section>

      {menuState ? (
        menuState.type === "workspace" ? (
          <SidebarContextMenu
            items={renderWorkspaceMenu(sidebarItems.find((item) => item.workspace.id === menuState.workspaceId)!.workspace)}
            x={menuState.x}
            y={menuState.y}
            onClose={() => setMenuState(undefined)}
          />
        ) : (
          <SidebarContextMenu
            items={renderSessionMenu(sessions.find((session) => session.id === menuState.sessionId)!)}
            x={menuState.x}
            y={menuState.y}
            onClose={() => setMenuState(undefined)}
          />
        )
      ) : null}

      <div className="adl-leftbar__resize-handle" onMouseDown={handleResizeMouseDown} role="separator" aria-orientation="vertical" aria-label="调整侧边栏宽度" />
    </aside>
  );
}
