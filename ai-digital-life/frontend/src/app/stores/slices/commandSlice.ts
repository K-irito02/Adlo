/**
 * 命令切片
 * 管理命令历史和最新命令执行结果
 */
import type { CommandRunResult } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';

export interface CommandSlice {
  latestCommandRun?: CommandRunResult;
  commandHistory: string[];

  setLatestCommandRun: (result: CommandRunResult | undefined) => void;
  setCommandHistory: (history: string[]) => void;
  appendCommandToHistory: (command: string) => void;
  clearCommandState: () => void;
}

export const createCommandSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): CommandSlice => ({
  commandHistory: [],

  setLatestCommandRun: (result) => set({ latestCommandRun: result }),
  setCommandHistory: (history) => set({ commandHistory: history }),
  appendCommandToHistory: (command) =>
    set((state) => ({
      commandHistory: [...state.commandHistory, command].slice(-50),
    })),
  clearCommandState: () => set({ latestCommandRun: undefined, commandHistory: [] }),
});
