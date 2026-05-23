import React, { useEffect, useRef } from "react";
import type { ConversationSessionRecord, RecentWorkspaceEntry } from "@ai-digital-life/kernel";
import type { CopyDict } from "../../copy";
import { IconArchive, IconCheck, IconCheckCheck, IconCopy, IconDownload, IconFolder, IconFolderOpen, IconMail, IconPencil, IconPin, IconPinOff, IconTrash } from "../../icons";
import type { SessionVisualStatus, SidebarSessionItem } from "../../sidebarViewModel";

export type SidebarMenuState =
  | { type: "workspace"; workspaceId: string; x: number; y: number }
  | { type: "session"; sessionId: string; x: number; y: number };

export const STATUS_LABEL: Record<SessionVisualStatus, keyof CopyDict> = {
  processing: "statusProcessing",
  "pending-approval": "statusPendingApproval",
  abnormal: "statusAbnormal",
  completed: "statusCompleted",
  read: "statusRead"
};

const WORKSPACE_STATUS_ORDER: SessionVisualStatus[] = ["abnormal", "pending-approval", "processing", "completed", "read"];

export function StatusLamp({ status, title }: { status: SessionVisualStatus; title: string }) {
  return <span className={`adl-status-lamp adl-status-lamp--${status}`} role="img" aria-label={title} />;
}

export function WorkspaceDirectoryIcon({
  expanded,
  status,
  title
}: {
  expanded: boolean;
  status: SessionVisualStatus;
  title: string;
}) {
  if (expanded) {
    return (
      <span className="adl-workspace-row__kind adl-workspace-row__kind--expanded" aria-hidden="true">
        <IconFolderOpen size={12} decorative />
      </span>
    );
  }

  return (
    <span
      className={`adl-workspace-row__kind adl-workspace-row__kind--collapsed adl-workspace-row__kind--${status}`}
      role="img"
      aria-label={title}
    >
      <IconFolder size={12} decorative />
    </span>
  );
}

export function buildWorkspaceTooltip(t: CopyDict, counts: Record<SessionVisualStatus, number>): string {
  const parts = WORKSPACE_STATUS_ORDER.filter((status) => counts[status] > 0).map(
    (status) => `${t[STATUS_LABEL[status]]}: ${counts[status]}`
  );
  return parts.join(" · ") || (t[STATUS_LABEL.read] as string);
}

export async function exportSessionMarkdown(session: ConversationSessionRecord): Promise<void> {
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

export type SidebarMenuItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  action: () => void;
};

export function SidebarContextMenu({
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

export interface WorkspaceMenuCallbacks {
  onPinWorkspace: (workspaceId: string) => void;
  onUnpinWorkspace: (workspaceId: string) => void;
  onMarkAllSessionsRead: (sessionIds: string[]) => void;
  onArchiveAllSessions: () => void;
  onRemoveWorkspace: (workspaceId: string) => void;
  onRevealWorkspace: (workspacePath: string) => void;
  onShowInRightPanels: (workspaceId: string) => void;
}

export function buildWorkspaceMenuItems(
  workspace: RecentWorkspaceEntry,
  sessionIds: string[],
  t: CopyDict,
  callbacks: WorkspaceMenuCallbacks
): SidebarMenuItem[] {
  const items: SidebarMenuItem[] = [
    {
      id: "pin",
      label: workspace.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin,
      icon: workspace.isPinned ? <IconPinOff size={14} decorative /> : <IconPin size={14} decorative />,
      action: () => (workspace.isPinned ? callbacks.onUnpinWorkspace(workspace.id) : callbacks.onPinWorkspace(workspace.id))
    },
    {
      id: "mark-read",
      label: t.sessionMenuMarkRead,
      icon: <IconCheckCheck size={14} decorative />,
      action: () => callbacks.onMarkAllSessionsRead(sessionIds)
    },
    {
      id: "archive-all",
      label: t.sessionMenuArchive,
      icon: <IconArchive size={14} decorative />,
      action: () => callbacks.onArchiveAllSessions()
    },
    {
      id: "remove",
      label: t.sessionMenuRemove,
      icon: <IconTrash size={14} decorative />,
      action: () => callbacks.onRemoveWorkspace(workspace.id)
    },
    {
      id: "reveal",
      label: t.sessionMenuRevealFolder,
      icon: <IconFolderOpen size={14} decorative />,
      action: () => callbacks.onRevealWorkspace(workspace.path)
    }
  ];

  if (workspace.hiddenFromRightPanels && !workspace.removedFromSidebar) {
    items.push({
      id: "show-in-right-panels",
      label: t.showInRightPanels,
      icon: <IconFolderOpen size={14} decorative />,
      action: () => callbacks.onShowInRightPanels(workspace.id)
    });
  }

  return items;
}

export interface SessionMenuCallbacks {
  onRename: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onArchive: () => void;
  onCopyId: () => void;
  onExport: () => void;
  onPin: () => void;
  onUnpin: () => void;
  onDelete: () => void;
}

export function buildSessionMenuItems(
  sessionItem: SidebarSessionItem,
  t: CopyDict,
  callbacks: SessionMenuCallbacks
): SidebarMenuItem[] {
  const session = sessionItem.session;
  return [
    {
      id: "rename",
      label: t.sessionMenuRename,
      icon: <IconPencil size={14} decorative />,
      action: () => callbacks.onRename()
    },
    {
      id: "read-state",
      label: sessionItem.isUnread ? t.sessionMenuMarkRead : t.sessionMenuMarkUnread,
      icon: sessionItem.isUnread ? <IconCheck size={14} decorative /> : <IconMail size={14} decorative />,
      action: () =>
        sessionItem.isUnread ? callbacks.onMarkRead() : callbacks.onMarkUnread()
    },
    {
      id: "archive",
      label: t.sessionMenuArchive,
      icon: <IconArchive size={14} decorative />,
      action: () => callbacks.onArchive()
    },
    {
      id: "copy-id",
      label: t.sessionMenuCopyId,
      icon: <IconCopy size={14} decorative />,
      action: () => callbacks.onCopyId()
    },
    {
      id: "export",
      label: t.sessionMenuExport,
      icon: <IconDownload size={14} decorative />,
      action: () => callbacks.onExport()
    },
    {
      id: "pin",
      label: session.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin,
      icon: session.isPinned ? <IconPinOff size={14} decorative /> : <IconPin size={14} decorative />,
      action: () => (session.isPinned ? callbacks.onUnpin() : callbacks.onPin())
    },
    {
      id: "delete",
      label: t.sessionMenuDelete,
      icon: <IconTrash size={14} decorative />,
      danger: true,
      action: () => callbacks.onDelete()
    }
  ];
}
