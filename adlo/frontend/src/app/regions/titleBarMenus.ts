import type { CopyDict } from '../i18n/types';
import type { ToolId } from '../stores/types';
import { displayShortcut } from '../commands/defaultCommands';
import { isMacPlatform } from '../../shared/keybinds';
import { ZOOM_STEP } from '../hooks/useAppZoom';

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  separator?: boolean;
  action?: () => void;
  disabled?: boolean;
}

type Keybinds = Record<string, string | undefined>;

export function useFileMenuItems(
  t: CopyDict,
  keybinds: Keybinds,
  onTriggerCreateWorkspace: () => void,
  onOpenFolder: () => void,
  handleClose: () => void,
): MenuItem[] {
  return [
    {
      id: 'new-ws',
      label: t.menuNewWorkspace,
      shortcut: displayShortcut(keybinds, 'workspace.new'),
      action: onTriggerCreateWorkspace,
    },
    {
      id: 'open-folder',
      label: t.menuOpenFolder,
      shortcut: displayShortcut(keybinds, 'workspace.open'),
      action: onOpenFolder,
    },
    { id: 'sep-1', label: '', separator: true },
    // OS 级：窗口管理器直接消费，应用监听不到，保留字面量展示（macOS 为 ⌘Q）。
    {
      id: 'exit',
      label: t.menuExit,
      shortcut: isMacPlatform() ? '⌘Q' : 'Alt+F4',
      action: handleClose,
    },
  ];
}

export function useViewMenuItems(
  t: CopyDict,
  keybinds: Keybinds,
  zoomBy: (delta: number) => void,
  resetZoom: () => void,
  onOpenSettings: () => void,
  navigateRightTool: (tool: ToolId) => void,
): MenuItem[] {
  return [
    {
      id: 'open-files-panel',
      label: t.menuOpenFilePanel,
      shortcut: displayShortcut(keybinds, 'view.files'),
      action: () => navigateRightTool('files'),
    },
    {
      id: 'open-changes-panel',
      label: t.menuOpenChangesPanel,
      shortcut: displayShortcut(keybinds, 'view.changes'),
      action: () => navigateRightTool('changes'),
    },
    {
      id: 'open-browser-panel',
      label: t.menuOpenBrowserPanel,
      shortcut: displayShortcut(keybinds, 'view.browser'),
      action: () => navigateRightTool('browser'),
    },
    {
      id: 'open-terminal-panel',
      label: t.menuOpenTerminalPanel,
      shortcut: displayShortcut(keybinds, 'view.terminal'),
      action: () => navigateRightTool('terminal'),
    },
    { id: 'sep-1', label: '', separator: true },
    {
      id: 'zoom-in',
      label: t.menuZoomIn,
      shortcut: displayShortcut(keybinds, 'zoom.in'),
      action: () => zoomBy(ZOOM_STEP),
    },
    {
      id: 'zoom-out',
      label: t.menuZoomOut,
      shortcut: displayShortcut(keybinds, 'zoom.out'),
      action: () => zoomBy(-ZOOM_STEP),
    },
    {
      id: 'zoom-reset',
      label: t.menuResetZoom,
      shortcut: displayShortcut(keybinds, 'zoom.reset'),
      action: resetZoom,
    },
    { id: 'sep-2', label: '', separator: true },
    {
      id: 'settings',
      label: t.menuSettings,
      shortcut: displayShortcut(keybinds, 'settings.open'),
      action: onOpenSettings,
    },
  ];
}

export function useHelpMenuItems(
  t: CopyDict,
  keybinds: Keybinds,
  onOpenShortcuts: () => void,
): MenuItem[] {
  return [
    {
      id: 'shortcuts',
      label: t.menuShortcuts,
      shortcut: displayShortcut(keybinds, 'settings.shortcuts'),
      action: onOpenShortcuts,
    },
    { id: 'license', label: t.menuLicense, action: () => {} },
  ];
}
