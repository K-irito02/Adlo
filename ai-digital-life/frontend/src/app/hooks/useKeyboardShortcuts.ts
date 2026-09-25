import { useEffect } from 'react';
import { useAppStore } from '../stores/slicedStore';
import { DEFAULT_COMMANDS } from '../commands/defaultCommands';
import type { CommandMeta } from '../commands/defaultCommands';
import { normalizeKey, signatures, EMPTY_KEYBINDS } from '../../shared/keybinds';

export interface ActionCallbacks {
  openCreateWorkspaceDialog: () => void;
  openWorkspace: () => void;
  openSettings: () => void;
  openFilesView: () => void;
  openChangesView: () => void;
  openBrowserView: () => void;
  openTerminalView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

const COMMAND_HANDLERS: Record<string, (callbacks: ActionCallbacks) => void> = {
  'workspace.new': (cb) => cb.openCreateWorkspaceDialog(),
  'workspace.open': (cb) => cb.openWorkspace(),
  'settings.open': (cb) => cb.openSettings(),
  'view.files': (cb) => cb.openFilesView(),
  'view.changes': (cb) => cb.openChangesView(),
  'view.browser': (cb) => cb.openBrowserView(),
  'view.terminal': (cb) => cb.openTerminalView(),
  'zoom.in': (cb) => cb.zoomIn(),
  'zoom.out': (cb) => cb.zoomOut(),
  'zoom.reset': (cb) => cb.resetZoom(),
};

const GLOBAL_COMMANDS = DEFAULT_COMMANDS.filter((cmd) => cmd.group !== 'file');

export function findMatchingCommand(
  event: KeyboardEvent,
  commands: CommandMeta[],
  keybinds: Record<string, string | undefined>,
): CommandMeta | undefined {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const parts: string[] = [];
  if (isMac ? event.metaKey : event.ctrlKey) {
    parts.push('mod');
  }
  if (isMac ? event.ctrlKey : event.metaKey) {
    parts.push(isMac ? 'ctrl' : 'meta');
  }
  if (event.altKey) {
    parts.push('alt');
  }
  if (event.shiftKey) {
    parts.push('shift');
  }
  const keyName = normalizeKey(event.key);
  parts.push(keyName);
  const pressed = parts.slice().sort().join('+');

  return commands.find((cmd) => {
    const kb = keybinds[cmd.id] ?? cmd.defaultKeybind;
    if (!kb || kb === 'none') {
      return false;
    }
    const sigs = signatures(kb);
    return sigs.includes(pressed);
  });
}

export function useKeyboardShortcuts(callbacks: ActionCallbacks): void {
  const keybinds = useAppStore((s) => s.appInfo?.config?.keybinds ?? EMPTY_KEYBINDS);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const commands = GLOBAL_COMMANDS;
      const match = findMatchingCommand(event, commands, keybinds);
      if (!match) {
        return;
      }
      event.preventDefault();
      COMMAND_HANDLERS[match.id]?.(callbacks);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keybinds, callbacks]);
}
