import { useSyncExternalStore } from 'react';
import { commandRegistry } from './commandRegistry';
import type { CommandMeta } from './defaultCommands';

export function useCommandRegistry(): CommandMeta[] {
  return useSyncExternalStore(
    (listener) => commandRegistry.subscribe(listener),
    () => commandRegistry.getAll(),
    () => commandRegistry.getAll(),
  );
}
