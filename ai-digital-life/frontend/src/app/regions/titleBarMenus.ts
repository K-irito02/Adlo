import type { CopyDict } from '../i18n/types';
import type { ToolId } from '../stores/types';

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  separator?: boolean;
  action?: () => void;
  disabled?: boolean;
}

export function useFileMenuItems(
  t: CopyDict,
  onTriggerCreateWorkspace: () => void,
  onOpenFolder: () => void,
  handleClose: () => void,
  setActiveRightTool: (tool: ToolId) => void
): MenuItem[] {
  return [
    {
      id: 'new-ws',
      label: t.menuNewWorkspace,
      shortcut: 'Ctrl+N',
      action: onTriggerCreateWorkspace,
    },
    { id: 'open-folder', label: t.menuOpenFolder, shortcut: 'Ctrl+O', action: onOpenFolder },
    {
      id: 'new-terminal',
      label: t.menuNewTerminal,
      shortcut: 'Ctrl+Shift+`',
      action: () => setActiveRightTool('terminal'),
    },
    {
      id: 'new-browser',
      label: t.menuNewBrowser,
      action: () => setActiveRightTool('browser'),
    },
    {
      id: 'editor-window',
      label: t.menuOpenEditorWindow,
      action: () => setActiveRightTool('files'),
    },
    { id: 'sep-1', label: '', separator: true },
    { id: 'exit', label: t.menuExit, shortcut: 'Alt+F4', action: handleClose },
  ];
}

export function useViewMenuItems(
  t: CopyDict,
  zoomBy: (delta: number) => void,
  resetZoom: () => void,
  onOpenSettings: () => void,
  setActiveRightTool: (tool: ToolId) => void
): MenuItem[] {
  return [
    {
      id: 'diff-view',
      label: t.menuDiffView,
      action: () => setActiveRightTool('changes'),
    },
    {
      id: 'browser-view',
      label: t.menuBrowserView,
      action: () => setActiveRightTool('browser'),
    },
    {
      id: 'file-view',
      label: t.menuFileView,
      action: () => setActiveRightTool('files'),
    },
    {
      id: 'terminal-view',
      label: t.menuTerminalView,
      action: () => setActiveRightTool('terminal'),
    },
    { id: 'sep-1', label: '', separator: true },
    { id: 'zoom-in', label: t.menuZoomIn, shortcut: 'Ctrl++', action: () => zoomBy(0.1) },
    { id: 'zoom-out', label: t.menuZoomOut, shortcut: 'Ctrl+-', action: () => zoomBy(-0.1) },
    { id: 'zoom-reset', label: t.menuResetZoom, shortcut: 'Ctrl+0', action: resetZoom },
    { id: 'sep-2', label: '', separator: true },
    { id: 'settings', label: t.menuSettings, shortcut: 'Ctrl+,', action: onOpenSettings },
  ];
}

export function useHelpMenuItems(t: CopyDict, onOpenCommandPalette: () => void): MenuItem[] {
  return [
    {
      id: 'palette',
      label: t.menuCommandPalette,
      shortcut: 'Ctrl+Shift+P',
      action: onOpenCommandPalette,
    },
    { id: 'shortcuts', label: t.menuShortcuts, shortcut: 'Ctrl+K Ctrl+S', action: () => {} },
    { id: 'license', label: t.menuLicense, action: () => {} },
  ];
}
