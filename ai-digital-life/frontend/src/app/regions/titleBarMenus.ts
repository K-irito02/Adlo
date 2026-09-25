import type { CopyDict } from '../i18n/types';
import type { ToolId } from '../stores/types';
import { formatKeybind } from '../../shared/keybinds';
import { defaultKeybindOf } from '../commands/defaultCommands';

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  separator?: boolean;
  action?: () => void;
  disabled?: boolean;
}

type Keybinds = Record<string, string | undefined>;

function displayShortcut(keybinds: Keybinds, id: string): string | undefined {
  const raw = keybinds[id];
  if (raw === 'none') {
    return undefined;
  }
  return formatKeybind(raw ?? defaultKeybindOf(id) ?? 'none');
}

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
    // OS 级：窗口管理器直接消费 Alt+F4，应用监听不到，保留字面量展示。
    { id: 'exit', label: t.menuExit, shortcut: 'Alt+F4', action: handleClose },
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
      action: () => zoomBy(0.1),
    },
    {
      id: 'zoom-out',
      label: t.menuZoomOut,
      shortcut: displayShortcut(keybinds, 'zoom.out'),
      action: () => zoomBy(-0.1),
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

export function useHelpMenuItems(t: CopyDict, onOpenShortcuts: () => void): MenuItem[] {
  return [
    { id: 'shortcuts', label: t.menuShortcuts, action: onOpenShortcuts },
    { id: 'license', label: t.menuLicense, action: () => {} },
  ];
}
