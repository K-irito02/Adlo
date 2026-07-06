import { DEFAULT_COMMANDS, type CommandMeta } from './defaultCommands';

class CommandRegistry {
  private commands = new Map<string, CommandMeta>();
  private listeners = new Set<() => void>();
  private cachedList: CommandMeta[] = [];

  constructor() {
    this.register(DEFAULT_COMMANDS);
  }

  register(list: CommandMeta[]): void {
    for (const cmd of list) {
      this.commands.set(cmd.id, cmd);
    }
    this.cachedList = Array.from(this.commands.values());
    this.emit();
  }

  getAll(): CommandMeta[] {
    return this.cachedList;
  }

  getById(id: string): CommandMeta | undefined {
    return this.commands.get(id);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset(): void {
    this.commands.clear();
    this.cachedList = [];
    this.register(DEFAULT_COMMANDS);
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }
}

export const commandRegistry = new CommandRegistry();
