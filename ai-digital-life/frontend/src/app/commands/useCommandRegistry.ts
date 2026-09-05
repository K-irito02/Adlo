import { DEFAULT_COMMANDS, type CommandMeta } from './defaultCommands';

export function useCommandRegistry(): CommandMeta[] {
  return DEFAULT_COMMANDS;
}
