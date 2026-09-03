import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';
import { IconDelete, IconFolderOpen, IconPin, IconPinOff } from '../../icons';

export interface SidebarMenuState {
  type: 'workspace';
  workspaceId: string;
  x: number;
  y: number;
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
  onRemoveWorkspace: (workspaceId: string) => void;
  onRevealWorkspace: (workspacePath: string) => void;
  onShowInRightPanels: (workspaceId: string) => void;
}

export function buildWorkspaceMenuItems(
  workspace: RecentWorkspaceEntry,
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
