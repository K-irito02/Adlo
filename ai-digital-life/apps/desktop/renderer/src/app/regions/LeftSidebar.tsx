import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppInfo,
  ConversationSessionRecord,
  RecentWorkspaceEntry,
  TaskCenterSnapshot
} from "@ai-digital-life/kernel";
import type { CopyDict, Locale } from "../copy";
import {
  IconArchive,
  IconChevronDown,
  IconChevronRight,
  IconFolderPlus,
  IconMonitor,
  IconMoon,
  IconMoreVertical,
  IconPin,
  IconPlug,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconSun
} from "../icons";
import { useUiStore } from "../ui-store";
import { TooltipSimple } from "../components/Tooltip";

export type SessionVisualStatus =
  | "processing"
  | "pending-approval"
  | "abnormal"
  | "completed"
  | "read";

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
  onOpenWorkspace: (path: string) => void;
  onTriggerCreateWorkspace: () => void;
  onCycleTheme: () => void;
  onSelectLanguage: (language: AppInfo["config"]["language"]) => void;
}

/**
 * Infer a visual status for a session by combining streaming, pending approvals
 * and last update heuristics. Proper persisted status lives on the backend and
 * will be wired in a future phase.
 */
function computeSessionStatus(
  session: ConversationSessionRecord,
  streamingRunId: string | undefined,
  hasPendingApproval: boolean
): SessionVisualStatus {
  if (streamingRunId && session.status === "active") return "processing";
  if (hasPendingApproval) return "pending-approval";
  if (session.status === "archived") return "read";
  if (Date.now() - session.updatedAt < 60_000) return "completed";
  return "read";
}

const STATUS_LABEL: Record<SessionVisualStatus, keyof CopyDict> = {
  processing: "statusProcessing",
  "pending-approval": "statusPendingApproval",
  abnormal: "statusAbnormal",
  completed: "statusCompleted",
  read: "statusRead"
};

function StatusLamp({ status, title }: { status: SessionVisualStatus; title: string }) {
  return (
    <span
      className={`adl-status-lamp adl-status-lamp--${status}`}
      role="img"
      aria-label={title}
    />
  );
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
  onOpenWorkspace,
  onTriggerCreateWorkspace,
  onCycleTheme,
  onSelectLanguage
}: LeftSidebarProps) {
  const { expandedSessionWorkspaces, toggleSessionWorkspace } = useUiStore();
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [pinned, setPinned] = useState<Record<string, boolean>>({});
  const [removed, setRemoved] = useState<Record<string, boolean>>({});

  const currentWorkspace = appInfo?.currentWorkspace;
  const hasApproval = (taskCenter?.pendingApprovals.length ?? 0) > 0;

  const groupedSessions = useMemo(() => {
    const active: ConversationSessionRecord[] = [];
    const archived: ConversationSessionRecord[] = [];
    for (const s of sessions) {
      if (s.status === "archived") archived.push(s);
      else active.push(s);
    }
    const filter = sessionFilter.trim().toLowerCase();
    const filterFn = (s: ConversationSessionRecord) =>
      filter ? s.title.toLowerCase().includes(filter) : true;
    return {
      active: active
        .filter(filterFn)
        .sort((a, b) => {
          const pa = pinned[a.id] ? 1 : 0;
          const pb = pinned[b.id] ? 1 : 0;
          if (pa !== pb) return pb - pa;
          return b.updatedAt - a.updatedAt;
        }),
      archived: archived.filter(filterFn)
    };
  }, [pinned, sessionFilter, sessions]);

  const workspaceEntries = useMemo(() => {
    const entries = [...recentWorkspaces];
    if (currentWorkspace && !entries.some((w) => w.path === currentWorkspace.path)) {
      entries.unshift({
        id: currentWorkspace.id,
        path: currentWorkspace.path,
        rootPath: currentWorkspace.rootPath,
        name: currentWorkspace.name,
        lastOpenedAt: currentWorkspace.lastOpenedAt ?? Date.now(),
        available: true
      });
    }
    const needle = workspaceFilter.trim().toLowerCase();
    return entries.filter((w) => !removed[w.path] && (needle ? w.name.toLowerCase().includes(needle) : true));
  }, [currentWorkspace, recentWorkspaces, removed, workspaceFilter]);

  const language = appInfo?.config.language ?? "zh-CN";

  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const cleanupDragRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (cleanupDragRef.current) { cleanupDragRef.current(); cleanupDragRef.current = null; }
    };
  }, []);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const shellBody = document.querySelector(".adl-shell__body");
      if (!shellBody) return;
      draggingRef.current = true;
      shellBody.classList.add("is-resizing");
      const startX = e.clientX;
      const root = document.documentElement;
      const startWidth = parseFloat(getComputedStyle(root).getPropertyValue("--leftbar-width")) || 248;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!draggingRef.current) return;
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          const delta = moveEvent.clientX - startX;
          const newWidth = Math.min(520, Math.max(180, startWidth + delta));
          root.style.setProperty("--leftbar-width", `${newWidth}px`);
        });
      };

      const cleanup = () => {
        draggingRef.current = false;
        shellBody.classList.remove("is-resizing");
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
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
    },
    []
  );

  return (
    <aside className="adl-leftbar" aria-label="Workspace and session navigator">
      {/* Region 5: Quick actions */}
      <section className="adl-leftbar__quick">
        <TooltipSimple content={`${t.quickSkills} · ${t.quickSkillsComingSoon}`} placement="right">
          <button
            type="button"
            className="adl-quick-btn"
            disabled
          >
            <IconSparkles size={16} decorative />
            <span className="adl-quick-btn__label">{t.quickSkills}</span>
          </button>
        </TooltipSimple>
        <TooltipSimple content={`${t.quickMcp} · ${t.quickSkillsComingSoon}`} placement="right">
          <button
            type="button"
            className="adl-quick-btn"
            disabled
          >
            <IconPlug size={16} decorative />
            <span className="adl-quick-btn__label">{t.quickMcp}</span>
            <span className="adl-status-lamp adl-status-lamp--read" aria-hidden="true" />
          </button>
        </TooltipSimple>
      </section>

      {/* Region 6: Workspace + session tabs */}
      <section className="adl-leftbar__nav" aria-label={t.workspaces}>
        <div className="adl-workspace-toolbar">
          <TooltipSimple content={t.workspaces} placement="right">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={() => {
                const allExpanded = workspaceEntries.every(
                  (w) => expandedSessionWorkspaces[w.path] ?? (currentWorkspace?.path === w.path)
                );
                workspaceEntries.forEach((w) => {
                  const shouldBeExpanded = !allExpanded;
                  if (shouldBeExpanded !== (expandedSessionWorkspaces[w.path] ?? (currentWorkspace?.path === w.path))) {
                    toggleSessionWorkspace(w.path);
                  }
                });
              }}
              aria-label={t.workspaces}
            >
              {workspaceEntries.every((w) => expandedSessionWorkspaces[w.path] ?? (currentWorkspace?.path === w.path)) ? (
                <IconChevronDown size={14} decorative />
              ) : (
                <IconChevronRight size={14} decorative />
              )}
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.quickNewWorkspace} placement="right">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={onTriggerCreateWorkspace}
              aria-label={t.quickNewWorkspace}
            >
              <IconPlus size={14} decorative />
            </button>
          </TooltipSimple>
        </div>

        <ul className="adl-workspace-list" role="tree">
          {workspaceEntries.length === 0 ? (
            <li className="adl-empty-hint">{t.workspaceEmpty}</li>
          ) : null}
          {workspaceEntries.map((workspace) => {
            const isCurrent = currentWorkspace?.path === workspace.path;
            const expanded = expandedSessionWorkspaces[workspace.path] ?? isCurrent;
            const workspaceSessions = isCurrent ? groupedSessions.active : [];
            const rollupStatus: SessionVisualStatus = expanded
              ? "read"
              : workspaceSessions.some((s) => computeSessionStatus(s, streamingActiveRunId, hasApproval) === "abnormal")
                ? "abnormal"
                : workspaceSessions.some((s) => computeSessionStatus(s, streamingActiveRunId, hasApproval) === "pending-approval")
                  ? "pending-approval"
                  : workspaceSessions.some((s) => computeSessionStatus(s, streamingActiveRunId, hasApproval) === "processing")
                    ? "processing"
                    : workspaceSessions.some((s) => computeSessionStatus(s, streamingActiveRunId, hasApproval) === "completed")
                      ? "completed"
                      : "read";

            return (
              <li key={workspace.path} className={`adl-workspace-item${isCurrent ? " is-current" : ""}`}>
                <div className="adl-workspace-row" role="treeitem" aria-expanded={expanded}>
                  <button
                    type="button"
                    className="adl-workspace-row__disclosure"
                    onClick={() => toggleSessionWorkspace(workspace.path)}
                    aria-label={expanded ? "Collapse" : "Expand"}
                  >
                    {expanded ? (
                      <IconChevronDown size={12} decorative />
                    ) : (
                      <IconChevronRight size={12} decorative />
                    )}
                  </button>
                  <TooltipSimple content={workspace.path} placement="right">
                    <button
                      type="button"
                      className="adl-workspace-row__label"
                      onClick={() => {
                        if (!isCurrent) onOpenWorkspace(workspace.path);
                      }}
                    >
                      {pinned[workspace.path] ? <IconPin size={12} decorative /> : null}
                      <span>{workspace.name}</span>
                      {!expanded ? (
                        <StatusLamp status={rollupStatus} title={t[STATUS_LABEL[rollupStatus]] as string} />
                      ) : null}
                    </button>
                  </TooltipSimple>
                  <div className="adl-workspace-row__actions">
                    <TooltipSimple content={pinned[workspace.path] ? t.sessionMenuUnpin : t.sessionMenuPin} placement="right">
                      <button
                        type="button"
                        className="adl-icon-btn adl-icon-btn--xs"
                        onClick={() =>
                          setPinned((prev) => ({ ...prev, [workspace.path]: !prev[workspace.path] }))
                        }
                        aria-label={pinned[workspace.path] ? t.sessionMenuUnpin : t.sessionMenuPin}
                      >
                        <IconPin size={12} decorative />
                      </button>
                    </TooltipSimple>
                    <TooltipSimple content={t.newSession} placement="right">
                      <button
                        type="button"
                        className="adl-icon-btn adl-icon-btn--xs"
                        onClick={() => isCurrent && onCreateSession()}
                        disabled={!isCurrent}
                        aria-label={t.newSession}
                      >
                        <IconPlus size={12} decorative />
                      </button>
                    </TooltipSimple>
                    <TooltipSimple content={t.sessionMenuRemove} placement="right">
                      <button
                        type="button"
                        className="adl-icon-btn adl-icon-btn--xs"
                        onClick={() => setRemoved((prev) => ({ ...prev, [workspace.path]: true }))}
                        aria-label={t.sessionMenuRemove}
                      >
                        <IconMoreVertical size={12} decorative />
                      </button>
                    </TooltipSimple>
                  </div>
                </div>

                {expanded && isCurrent ? (
                  <div className="adl-session-wrapper">
                    <div className="adl-leftbar__search adl-leftbar__search--nested">
                      <IconSearch size={12} decorative />
                      <input
                        type="search"
                        value={sessionFilter}
                        onChange={(event) => setSessionFilter(event.target.value)}
                        placeholder={t.sessionSearchPlaceholder}
                        aria-label={t.sessions}
                      />
                    </div>
                    <ul className="adl-session-list" role="group">
                      {workspaceSessions.length === 0 ? (
                        <li className="adl-empty-hint adl-empty-hint--nested">{t.sessionEmpty}</li>
                      ) : null}
                      {workspaceSessions.map((session) => {
                        const status = computeSessionStatus(session, streamingActiveRunId, hasApproval);
                        const statusLabel = t[STATUS_LABEL[status]] as string;
                        return (
                          <li key={session.id}>
                            <TooltipSimple content={session.title} placement="right">
                              <button
                                type="button"
                                className={`adl-session-item${session.id === activeSessionId ? " is-active" : ""}`}
                                onClick={() => onSelectSession(session.id)}
                              >
                                <StatusLamp status={status} title={statusLabel} />
                                <span className="adl-session-item__title">{session.title}</span>
                                <span className="adl-session-item__meta">
                                  {new Date(session.updatedAt).toLocaleString(locale, {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    month: "2-digit",
                                    day: "2-digit"
                                  })}
                                </span>
                              </button>
                            </TooltipSimple>
                          </li>
                        );
                      })}
                    </ul>

                    {groupedSessions.archived.length > 0 ? (
                      <details
                        className="adl-archive"
                        open={archiveOpen}
                        onToggle={(event) => setArchiveOpen(event.currentTarget.open)}
                      >
                        <summary>
                          <IconArchive size={12} decorative />
                          <span>{t.sessionMenuArchive}</span>
                          <span className="adl-badge">{groupedSessions.archived.length}</span>
                        </summary>
                        <ul>
                          {groupedSessions.archived.map((session) => (
                            <li key={session.id}>
                              <button
                                type="button"
                                className="adl-session-item adl-session-item--archived"
                                onClick={() => onSelectSession(session.id)}
                              >
                                <span>{session.title}</span>
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

      {/* Region 7: Environment controls */}
      <section className="adl-leftbar__env">
        <TooltipSimple content={t.theme} placement="right">
          <button
            type="button"
            className="adl-env-btn"
            onClick={onCycleTheme}
            aria-label={t.theme}
          >
            <ThemeIcon mode={appInfo?.config.themeMode} />
            <span>{t.theme}</span>
          </button>
        </TooltipSimple>
        <label className="adl-env-select">
          <span className="sr-only">{t.language}</span>
          <select
            value={language}
            onChange={(event) => onSelectLanguage(event.target.value as AppInfo["config"]["language"])}
            aria-label={t.language}
          >
            <option value="zh-CN">中文</option>
            <option value="en-US">EN</option>
          </select>
        </label>
      </section>
      <div className="adl-leftbar__resize-handle" onMouseDown={handleResizeMouseDown} role="separator" aria-orientation="vertical" aria-label="调整侧边栏宽度" />
    </aside>
  );
}
