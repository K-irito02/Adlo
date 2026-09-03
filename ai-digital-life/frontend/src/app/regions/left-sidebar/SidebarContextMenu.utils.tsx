import type { ConversationSessionRecord, RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';
import {
  IconArchive,
  IconCheck,
  IconCheckCheck,
  IconCopy,
  IconDownload,
  IconFolderOpen,
  IconMail,
  IconPencil,
  IconPin,
  IconPinOff,
  IconDelete,
} from '../../icons';
import type { SessionVisualStatus, SidebarSessionItem } from '../../utils/sidebarViewModel';

export type SidebarMenuState =
  | { type: 'workspace'; workspaceId: string; x: number; y: number }
  | { type: 'session'; sessionId: string; x: number; y: number };

export const STATUS_LABEL: Record<SessionVisualStatus, keyof CopyDict> = {
  processing: 'statusProcessing',
  abnormal: 'statusAbnormal',
  completed: 'statusCompleted',
  read: 'statusRead',
};

const WORKSPACE_STATUS_ORDER: SessionVisualStatus[] = [
  'abnormal',
  'processing',
  'completed',
  'read',
];

export function buildWorkspaceTooltip(
  t: CopyDict,
  counts: Record<SessionVisualStatus, number>,
): string {
  const parts = WORKSPACE_STATUS_ORDER.filter((status) => counts[status] > 0).map(
    (status) => `${t[STATUS_LABEL[status]]}: ${counts[status]}`,
  );
  return parts.join(' · ') || (t[STATUS_LABEL.read] as string);
}

export async function exportSessionMarkdown(session: ConversationSessionRecord): Promise<void> {
  const result = await window.digitalLife.conversation.getSession(session.id);
  const messages = result.ok && result.data ? result.data.messages : [];
  const markdown = [
    `# ${session.title}`,
    '',
    `- Session ID: ${session.id}`,
    `- Updated: ${new Date(session.updatedAt).toISOString()}`,
    '',
  ];
  for (const message of messages) {
    markdown.push(`## ${message.role}`, '', message.content, '');
  }
  const blob = new Blob([markdown.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${session.title || session.id}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface SidebarMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  action: () => void;
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
  callbacks: WorkspaceMenuCallbacks,
): SidebarMenuItem[] {
  const items: SidebarMenuItem[] = [
    {
      id: 'pin',
      label: workspace.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin,
      icon: workspace.isPinned ? (
        <IconPinOff size={14} decorative />
      ) : (
        <IconPin size={14} decorative />
      ),
      action: () =>
        workspace.isPinned
          ? callbacks.onUnpinWorkspace(workspace.id)
          : callbacks.onPinWorkspace(workspace.id),
    },
    {
      id: 'mark-read',
      label: t.sessionMenuMarkRead,
      icon: <IconCheckCheck size={14} decorative />,
      action: () => callbacks.onMarkAllSessionsRead(sessionIds),
    },
    {
      id: 'archive-all',
      label: t.sessionMenuArchive,
      icon: <IconArchive size={14} decorative />,
      action: () => callbacks.onArchiveAllSessions(),
    },
    {
      id: 'remove',
      label: t.sessionMenuRemove,
      icon: <IconDelete size={14} decorative />,
      action: () => callbacks.onRemoveWorkspace(workspace.id),
    },
    {
      id: 'reveal',
      label: t.sessionMenuRevealFolder,
      icon: <IconFolderOpen size={14} decorative />,
      action: () => callbacks.onRevealWorkspace(workspace.path),
    },
  ];

  if (workspace.hiddenFromRightPanels && !workspace.removedFromSidebar) {
    items.push({
      id: 'show-in-right-panels',
      label: t.showInRightPanels,
      icon: <IconFolderOpen size={14} decorative />,
      action: () => callbacks.onShowInRightPanels(workspace.id),
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
  callbacks: SessionMenuCallbacks,
): SidebarMenuItem[] {
  const session = sessionItem.session;
  return [
    {
      id: 'rename',
      label: t.sessionMenuRename,
      icon: <IconPencil size={14} decorative />,
      action: () => callbacks.onRename(),
    },
    {
      id: 'read-state',
      label: sessionItem.isUnread ? t.sessionMenuMarkRead : t.sessionMenuMarkUnread,
      icon: sessionItem.isUnread ? (
        <IconCheck size={14} decorative />
      ) : (
        <IconMail size={14} decorative />
      ),
      action: () => (sessionItem.isUnread ? callbacks.onMarkRead() : callbacks.onMarkUnread()),
    },
    {
      id: 'archive',
      label: t.sessionMenuArchive,
      icon: <IconArchive size={14} decorative />,
      action: () => callbacks.onArchive(),
    },
    {
      id: 'copy-id',
      label: t.sessionMenuCopyId,
      icon: <IconCopy size={14} decorative />,
      action: () => callbacks.onCopyId(),
    },
    {
      id: 'export',
      label: t.sessionMenuExport,
      icon: <IconDownload size={14} decorative />,
      action: () => callbacks.onExport(),
    },
    {
      id: 'pin',
      label: session.isPinned ? t.sessionMenuUnpin : t.sessionMenuPin,
      icon: session.isPinned ? (
        <IconPinOff size={14} decorative />
      ) : (
        <IconPin size={14} decorative />
      ),
      action: () => (session.isPinned ? callbacks.onUnpin() : callbacks.onPin()),
    },
    {
      id: 'delete',
      label: t.sessionMenuDelete,
      icon: <IconDelete size={14} decorative />,
      danger: true,
      action: () => callbacks.onDelete(),
    },
  ];
}
