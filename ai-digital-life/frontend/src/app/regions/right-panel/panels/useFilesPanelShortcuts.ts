import { useEffect, type RefObject } from 'react';
import { DEFAULT_COMMANDS } from '../../../commands/defaultCommands';
import { findMatchingCommand } from '../../../hooks/useKeyboardShortcuts';

const FILE_COMMAND_IDS = new Set(
  DEFAULT_COMMANDS.filter((c) => c.group === 'file').map((c) => c.id),
);

export interface FilesPanelShortcutDeps {
  panelRef: RefObject<HTMLDivElement | null>;
  selectedFilePath?: string;
  selectedAbsolutePath?: string;
  editorOptions: {
    wordWrapEnabled: boolean;
    setWordWrapEnabled: (v: boolean | ((p: boolean) => boolean)) => void;
    lineNumbersEnabled: boolean;
    setLineNumbersEnabled: (v: boolean | ((p: boolean) => boolean)) => void;
  };
  handleCopyPath: (value?: string) => void;
  keybinds: Record<string, string | undefined>;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export function useFilesPanelShortcuts(deps: FilesPanelShortcutDeps): void {
  const {
    panelRef,
    selectedFilePath,
    selectedAbsolutePath,
    editorOptions,
    handleCopyPath,
    keybinds,
  } = deps;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel || !(event.target instanceof Node) || !panel.contains(event.target)) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      const match = findMatchingCommand(event, DEFAULT_COMMANDS, keybinds);
      if (!match || !FILE_COMMAND_IDS.has(match.id)) {
        return;
      }
      event.preventDefault();
      switch (match.id) {
        case 'file.copy-relative':
          if (selectedFilePath) {
            handleCopyPath(selectedFilePath);
          }
          break;
        case 'file.copy-full':
          if (selectedAbsolutePath) {
            handleCopyPath(selectedAbsolutePath);
          }
          break;
        case 'file.toggle-word-wrap':
          editorOptions.setWordWrapEnabled((v) => !v);
          break;
        case 'file.toggle-line-numbers':
          editorOptions.setLineNumbersEnabled((v) => !v);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panelRef, selectedFilePath, selectedAbsolutePath, editorOptions, handleCopyPath, keybinds]);
}
