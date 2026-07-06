import { useEffect, useRef } from 'react';
import type { CommandMeta } from '../commands/defaultCommands';
import { recordKeybind, signatures } from '../../shared/keybinds';

export interface UseKeyCaptureArgs {
  activeId: string | null;
  commands: CommandMeta[];
  keybinds: Record<string, string | undefined>;
  onRecord: (id: string, keybind: string) => void;
  onConflict: (id: string, keybind: string, conflicts: CommandMeta[]) => void;
  onStop: () => void;
}

export function useKeyCapture(args: UseKeyCaptureArgs): void {
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    if (!args.activeId) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const current = argsRef.current;
      const activeId = current.activeId;
      if (!activeId) {
        return;
      }

      if (event.key === 'Escape') {
        current.onStop();
        return;
      }

      const hasModifier = event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;
      if (!hasModifier && (event.key === 'Backspace' || event.key === 'Delete')) {
        current.onRecord(activeId, 'none');
        return;
      }

      const kb = recordKeybind(event);
      if (kb === null) {
        return;
      }

      const pressedSigs = signatures(kb);
      const conflicts = current.commands.filter((cmd) => {
        if (cmd.id === activeId) {
          return false;
        }
        const otherKb = current.keybinds[cmd.id] ?? cmd.defaultKeybind;
        if (!otherKb || otherKb === 'none') {
          return false;
        }
        const otherSigs = signatures(otherKb);
        return otherSigs.some((sig) => pressedSigs.includes(sig));
      });

      if (conflicts.length > 0) {
        current.onConflict(activeId, kb, conflicts);
        return;
      }

      current.onRecord(activeId, kb);
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [args.activeId]);
}
