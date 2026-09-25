import { useEffect, type RefObject } from 'react';
import { DEFAULT_COMMANDS } from '../../../commands/defaultCommands';
import { findMatchingCommand } from '../../../hooks/useKeyboardShortcuts';

const FILE_COMMANDS = DEFAULT_COMMANDS.filter((c) => c.group === 'file');
const FILE_COMMAND_IDS = new Set(FILE_COMMANDS.map((c) => c.id));

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
  // CodeMirror 6 表面是 div + contenteditable（tagName 拦不住），一并排除，
  // 否则面板内编辑器里的 Alt+Z / Ctrl+Shift+C 会被面板动作吞掉。
  return (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, [contenteditable="true"], .cm-editor') !== null
  );
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
      // 只匹配 file 组命令：用户把 file 命令绑到全局 chord 上时，
      // 以 file 语义优先（菜单展示即此语义），不静默吞掉。
      const match = findMatchingCommand(event, FILE_COMMANDS, keybinds);
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
